#!/usr/bin/env bash
# Copy this template into a fresh project directory.
#   ./scripts/new-project.sh ../my-new-app "My New App"
set -euo pipefail

dest=${1:?usage: new-project.sh <dest-dir> [app name]}
name=${2:-$(basename "$dest")}
src=$(cd "$(dirname "$0")/.." && pwd)

if [ -e "$dest" ]; then
  echo "error: $dest already exists" >&2
  exit 1
fi

mkdir -p "$dest"
# Everything except build output, installs, local env and VCS state.
tar -C "$src" \
  --exclude=node_modules --exclude=.next --exclude=.git --exclude=.vercel \
  --exclude='.env' --exclude='.env.local' --exclude='*.tsbuildinfo' \
  -cf - . | tar -C "$dest" -xf -

slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')
sed -i.bak "s/\"name\": \"agent-ui-template\"/\"name\": \"$slug\"/" "$dest/package.json"
sed -i.bak "s/name: \"Agent UI\"/name: \"$name\"/" "$dest/src/config/app.ts"
rm -f "$dest/package.json.bak" "$dest/src/config/app.ts.bak"
cp "$dest/.env.example" "$dest/.env.local"

echo "Created $dest ($name)"
echo "Next: cd $dest && pnpm install && edit .env.local && pnpm dev"
