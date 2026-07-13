#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${HR_BACKUP_BUCKET:?HR_BACKUP_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
backup_file="/tmp/climature-${timestamp}.dump"
destination="s3://${HR_BACKUP_BUCKET}/${HR_BACKUP_PREFIX:-postgres}/climature-${timestamp}.dump"

trap 'rm -f "$backup_file"' EXIT
pg_dump --format=custom --compress=9 --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
aws s3 cp "$backup_file" "$destination" --only-show-errors --sse AES256
echo "Versleutelde databaseback-up voltooid: ${timestamp}"
