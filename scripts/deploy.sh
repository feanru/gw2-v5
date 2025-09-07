#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.."; pwd)
TARGET=/var/www/gw2
RELEASE=${1:-$(git rev-parse --short HEAD)}
KEEP=${KEEP:-3}

cd "$ROOT"
npm run build

mkdir -p "$TARGET/releases/$RELEASE"
# Bundles are versioned in dist/<APP_VERSION>/ to avoid cache issues.
# Copy the entire dist tree so each release has its own assets.
cp -a dist/. "$TARGET/releases/$RELEASE/"
cp -a ./*.html "$TARGET/releases/$RELEASE/"
ln -sfn "$TARGET/releases/$RELEASE" "$TARGET/current"

cd "$TARGET/releases"
ls -1t | tail -n +$((KEEP+1)) | xargs -r rm -rf

npm --prefix "$ROOT" run check-integrity

# Purge CDN cache to force revalidation of assets
node "$ROOT/scripts/purge-cdn.js"
