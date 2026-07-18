"use strict";

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

function safeKey(key) {
  const value = String(key || "");
  if (!/^[a-z0-9][a-z0-9/_-]{0,500}$/i.test(value) || value.includes("..") || value.startsWith("/")) {
    throw Object.assign(new Error("Ongeldige storage key."), { status: 500 });
  }
  return value;
}

class LocalObjectStorage {
  constructor(root) {
    this.root = path.resolve(root);
  }

  resolve(key) {
    const target = path.resolve(this.root, safeKey(key));
    if (!target.startsWith(`${this.root}${path.sep}`)) throw Object.assign(new Error("Ongeldige storage key."), { status: 500 });
    return target;
  }

  async put(key, content) {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, target);
  }

  async get(key) {
    try { return await fs.readFile(this.resolve(key)); }
    catch (error) {
      if (error && error.code === "ENOENT") throw Object.assign(new Error("Bestand niet gevonden in object storage."), { status: 404 });
      throw error;
    }
  }

  async delete(key) {
    await fs.unlink(this.resolve(key)).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }

  async list() {
    const results = [];
    const walk = async (directory, prefix = "") => {
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") return; throw error; }
      for (const entry of entries) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
        else if (!entry.name.endsWith(".tmp")) results.push(safeKey(relative));
      }
    };
    await walk(this.root);
    return results;
  }

  async close() {}
}

class S3ObjectStorage {
  constructor(config) {
    const { S3Client } = require("@aws-sdk/client-s3");
    this.commands = require("@aws-sdk/client-s3");
    this.bucket = config.objectStorageBucket;
    this.client = new S3Client({
      region: config.objectStorageRegion,
      endpoint: config.objectStorageEndpoint || undefined,
      forcePathStyle: Boolean(config.objectStorageForcePathStyle),
      credentials: config.objectStorageAccessKeyId ? { accessKeyId: config.objectStorageAccessKeyId, secretAccessKey: config.objectStorageSecretAccessKey } : undefined
    });
  }

  async put(key, content, metadata = {}) {
    await this.client.send(new this.commands.PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: content, ContentType: metadata.mimeType, Metadata: metadata.sha256 ? { sha256: metadata.sha256 } : undefined }));
  }

  async get(key) {
    try {
      const response = await this.client.send(new this.commands.GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error && (error.name === "NoSuchKey" || error.$metadata && error.$metadata.httpStatusCode === 404)) throw Object.assign(new Error("Bestand niet gevonden in object storage."), { status: 404 });
      throw error;
    }
  }

  async delete(key) {
    await this.client.send(new this.commands.DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }

  async list() {
    const keys = [];
    let ContinuationToken;
    do {
      const response = await this.client.send(new this.commands.ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken }));
      for (const item of response.Contents || []) if (item.Key) keys.push(safeKey(item.Key));
      ContinuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return keys;
  }

  async close() { this.client.destroy(); }
}

function createObjectStorage(config) {
  if (config.objectStorageProvider === "s3") return new S3ObjectStorage(config);
  return new LocalObjectStorage(config.objectStorageRoot);
}

module.exports = { LocalObjectStorage, S3ObjectStorage, createObjectStorage, safeKey };
