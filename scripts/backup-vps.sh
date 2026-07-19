#!/bin/sh
set -eu

cd /opt/climature
mkdir -p backups

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
database_target="backups/climature-${stamp}.sql.gz"
objects_target="backups/climature-objects-${stamp}.tar.gz"
config_target="backups/climature-config-${stamp}.env"

docker compose --file compose.prod.yml exec -T db \
  pg_dump --clean --if-exists --no-owner --username climature --dbname climature \
  | gzip -9 > "$database_target"

docker run --rm \
  --env BACKUP_NAME="$(basename "$objects_target")" \
  --env HOST_UID="$(id -u)" \
  --env HOST_GID="$(id -g)" \
  --volume climature_object_data:/data:ro \
  --volume /opt/climature/backups:/backup \
  caddy:2-alpine \
  sh -c 'tar -C /data -czf "/backup/$BACKUP_NAME" . && chown "$HOST_UID:$HOST_GID" "/backup/$BACKUP_NAME" && chmod 600 "/backup/$BACKUP_NAME"'

cp .env "$config_target"
chmod 600 "$database_target" "$objects_target" "$config_target"

gzip -t "$database_target"
tar -tzf "$objects_target" >/dev/null

find backups -type f \( \
  -name 'climature-*.sql.gz' -o \
  -name 'climature-objects-*.tar.gz' -o \
  -name 'climature-config-*.env' \
\) -mtime +14 -delete
