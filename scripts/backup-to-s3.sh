#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${HR_BACKUP_BUCKET:?HR_BACKUP_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
backup_file="/tmp/climature-${timestamp}.dump"
destination="s3://${HR_BACKUP_BUCKET}/${HR_BACKUP_PREFIX:-postgres}/climature-${timestamp}.dump"
object_destination="s3://${HR_BACKUP_BUCKET}/${HR_BACKUP_PREFIX:-postgres}/objects/${timestamp}"
object_archive="/tmp/climature-objects-${timestamp}.tar.gz"

trap 'rm -f "$backup_file" "$object_archive"' EXIT
pg_dump --format=custom --compress=9 --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
aws s3 cp "$backup_file" "$destination" --only-show-errors --sse AES256

case "${OBJECT_STORAGE_PROVIDER:-local}" in
  s3)
    : "${OBJECT_STORAGE_BUCKET:?OBJECT_STORAGE_BUCKET is required for S3 object backup}"
    aws s3 sync "s3://${OBJECT_STORAGE_BUCKET}/" "${object_destination}/" --only-show-errors --sse AES256
    ;;
  local)
    : "${OBJECT_STORAGE_ROOT:?OBJECT_STORAGE_ROOT is required for local object backup}"
    test -d "$OBJECT_STORAGE_ROOT"
    tar -C "$OBJECT_STORAGE_ROOT" -czf "$object_archive" .
    aws s3 cp "$object_archive" "${object_destination}.tar.gz" --only-show-errors --sse AES256
    ;;
  *)
    echo "Unsupported OBJECT_STORAGE_PROVIDER" >&2
    exit 1
    ;;
esac

echo "Database- en objectback-up voltooid: ${timestamp}"
