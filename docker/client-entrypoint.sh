#!/bin/sh
set -e
# When client_node_modules volume is empty, bind mount overrides with host dir or empty volume.
# Populate node_modules in container so we get Linux rollup/vite binaries.
if [ ! -d /app/node_modules/.pnpm ] || [ -z "$(ls -A /app/node_modules/.pnpm 2>/dev/null)" ]; then
  echo "Client node_modules empty or missing, running pnpm install..."
  pnpm install --frozen-lockfile
fi
exec "$@"
