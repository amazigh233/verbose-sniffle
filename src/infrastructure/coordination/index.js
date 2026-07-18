"use strict";

class MemoryCoordinationStore {
  constructor() { this.values = new Map(); }
  item(key) {
    const item = this.values.get(key);
    if (item && item.expiresAt > Date.now()) return item;
    if (item) this.values.delete(key);
    return null;
  }
  async getJson(key) { const item = this.item(key); return item ? item.value : null; }
  async setJson(key, value, ttlMs) { this.values.set(key, { value, expiresAt: Date.now() + ttlMs }); }
  async delete(key) { this.values.delete(key); }
  async increment(key, ttlMs) {
    const current = this.item(key);
    const count = current ? Number(current.value) + 1 : 1;
    this.values.set(key, { value: count, expiresAt: current ? current.expiresAt : Date.now() + ttlMs });
    return count;
  }
  async health() { return true; }
  async close() { this.values.clear(); }
}

class RedisCoordinationStore {
  constructor(url) {
    const { createClient } = require("redis");
    this.client = createClient({ url });
    this.client.on("error", () => {});
    this.connecting = null;
  }
  async ready() {
    if (this.client.isReady) return;
    if (!this.connecting) this.connecting = this.client.connect().finally(() => { this.connecting = null; });
    await this.connecting;
  }
  async getJson(key) { await this.ready(); const value = await this.client.get(key); return value ? JSON.parse(value) : null; }
  async setJson(key, value, ttlMs) { await this.ready(); await this.client.set(key, JSON.stringify(value), { PX: ttlMs }); }
  async delete(key) { await this.ready(); await this.client.del(key); }
  async increment(key, ttlMs) {
    await this.ready();
    return Number(await this.client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return n", { keys: [key], arguments: [String(ttlMs)] }));
  }
  async health() { await this.ready(); return await this.client.ping() === "PONG"; }
  async close() { if (this.client.isOpen) await this.client.quit(); }
}

function createCoordinationStore(config) {
  return config.redisUrl ? new RedisCoordinationStore(config.redisUrl) : new MemoryCoordinationStore();
}

module.exports = { MemoryCoordinationStore, RedisCoordinationStore, createCoordinationStore };
