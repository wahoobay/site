#!/usr/bin/env bash
# Deploy the built site (dist/) to one environment. Requires BUCKET, DISTRIBUTION_ID, KVS_ARN.
# Usage: scripts/deploy.sh staging|prod
set -euo pipefail
ENV_NAME="${1:?usage: deploy.sh staging|prod}"
: "${BUCKET:?}" "${DISTRIBUTION_ID:?}" "${KVS_ARN:?}"
test -f dist/index.html || { echo "dist/ is missing; run npm run build first" >&2; exit 1; }

# Staging must never be indexable: write its robots.txt into the build output BEFORE the syncs, so the
# production file is never served from staging, not even briefly or after a failed later step.
if [ "$ENV_NAME" = "staging" ]; then
  # The CloudFront router fails open when the key-value store has no `auth` key, so refuse to publish
  # anything until the password gate provably exists (production has no Basic auth, so no check there).
  AUTH_KEYS="$(aws cloudfront-keyvaluestore list-keys --kvs-arn "$KVS_ARN" --query "Items[?Key=='auth'] | length(@)" --output text)"
  if [ "${AUTH_KEYS:-0}" -lt 1 ] 2>/dev/null; then
    echo "staging KVS has no auth key; refusing to publish an unprotected staging (see the README recipe \"Rotate the staging password\")" >&2
    exit 1
  fi
  printf 'User-agent: *\nDisallow: /\n' > dist/robots.txt
fi

# Long-lived assets first (excluding the short-lived document types), then the documents. Both passes
# delete what the build no longer produces (sync only deletes within its own filters), so a removed page is gone.
aws s3 sync dist "s3://$BUCKET" --delete --only-show-errors \
  --exclude '*.html' --exclude '*.xml' --exclude '*.txt' --exclude '*.json' \
  --cache-control 'public, max-age=86400'
aws s3 sync dist "s3://$BUCKET" --delete --only-show-errors \
  --exclude '*' --include '*.html' --include '*.xml' --include '*.txt' --include '*.json' \
  --cache-control 'public, max-age=300'

KVS_ARN="$KVS_ARN" node scripts/sync-redirects.mjs
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*' --query 'Invalidation.Id' --output text
