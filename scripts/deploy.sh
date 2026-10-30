#!/usr/bin/env bash
# Deploy the built site (dist/) to one environment. Requires BUCKET, DISTRIBUTION_ID, KVS_ARN.
# Usage: scripts/deploy.sh staging|prod
set -euo pipefail
ENV_NAME="${1:?usage: deploy.sh staging|prod}"
: "${BUCKET:?}" "${DISTRIBUTION_ID:?}" "${KVS_ARN:?}"
test -f dist/index.html || { echo "dist/ is missing; run npm run build first" >&2; exit 1; }

# Long-lived assets first (excluding the short-lived document types), then the documents. Both passes
# delete what the build no longer produces (sync only deletes within its own filters), so a removed page is gone.
aws s3 sync dist "s3://$BUCKET" --delete --only-show-errors \
  --exclude '*.html' --exclude '*.xml' --exclude '*.txt' --exclude '*.json' \
  --cache-control 'public, max-age=86400'
aws s3 sync dist "s3://$BUCKET" --delete --only-show-errors \
  --exclude '*' --include '*.html' --include '*.xml' --include '*.txt' --include '*.json' \
  --cache-control 'public, max-age=300'

if [ "$ENV_NAME" = "staging" ]; then
  printf 'User-agent: *\nDisallow: /\n' | aws s3 cp - "s3://$BUCKET/robots.txt" \
    --content-type 'text/plain; charset=utf-8' --cache-control 'public, max-age=300' --only-show-errors
fi

KVS_ARN="$KVS_ARN" node scripts/sync-redirects.mjs
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*' --query 'Invalidation.Id' --output text
