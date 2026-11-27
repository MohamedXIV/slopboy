# Read-only Cloud Storage inventory audit (#36)

Use this operator-only offline audit to compare legacy, named and (on schema 012) managed metadata with a complete bounded object listing. It is intentionally not an API, cron, cleanup job, provider probe or authorization to delete. No application role grants or paid dependencies. The legacy exporter works on schemas 009–011, reads optional retry timestamps, and explicitly refuses schema 012 or later when the managed table exists. Use the complete managed exporter on schema 012+.

## Capture on the reviewed target

Confirm the database and private bucket belong to the exact same intended Neon branch/environment using the existing reviewed target binding. Do not copy credentials into chat, logs, repo, or exported files. Use the existing authorized operator's secure terminal; if the operator lacks read/list rights, stop rather than grant broader permissions. Never use the restricted application role for inventory. Keep both capture files outside the repo with restricted local permissions.

1. Export one complete bounded database snapshot using `psql -X -qAt -v ON_ERROR_STOP=1 -f tools/cloud-storage-inventory.sql > metadata.json` against the already selected operator connection. For schema 012 or later replace the filename with `tools/cloud-storage-inventory-managed.sql`; never combine two independent captures. Set the terminal/session time zone to UTC. This is a READ ONLY transaction. It exports private metadata and object keys but never payloads.
2. Record the UTC timestamp at the start of a complete storage listing. Export the provider's raw ListObjectsV2 JSON for prefix `backups/`, without a delimiter, continuation token or start-after. For an already configured compatible S3 CLI, use `aws s3api list-objects-v2 --bucket "$CLOUD_SAVE_BUCKET" --prefix backups/ --max-keys 1000 --no-paginate --output json --no-cli-pager > objects.json` with the already verified provider endpoint and operator credential context. Do not assume provider list access is available. If the output is truncated or the metadata limit exceeded, stop: this first audit supports at most 1000 objects/rows, not partial listings. No automatic additional requests.
3. Capture both within five minutes, ideally during an operator-reviewed quiet maintenance window. Run `node --experimental-strip-types tools/cloud-storage-audit.ts metadata.json objects.json <UTC-storage-capture-start>` (Node 22+). The report uses SHA-256 key references, not raw keys, account IDs or payloads. Keep even the report private. A malformed or incomplete capture is rejected, not treated as an empty inventory.

## Interpret the observations

- Ready size match means only existence and size in the observed listings, **not** content integrity or authorization.
- Ready missing or size mismatch is an integrity incident candidate. Investigate; never release quota or erase the metadata on this evidence.
- Pending recent: possible active write or retry. Do not act.
- Pending stale present/missing/size mismatch: review exact key, timestamps, live verified readback and current status under a future fencing protocol. Stale here means at least 15 minutes before both capture times, not proof an upload cannot finish.
- Orphan recent/stale: object without a metadata row in these captures, possibly an interrupted legacy upload or account/game cascade. Recheck target and inventory; never use the report alone as a deletion list.
- Retired present/missing/size mismatch: managed metadata is logically retired but its bytes are still reserved. Do not infer deletion, writer quiescence or reclaimable quota from an inventory observation. A retired missing object may still be recreated by a delayed writer. No automatic cleanup.
- Unexpected key: outside the exact application key grammar, even if under the same prefix. Escalate separately.

The captures are not a distributed atomic snapshot; listings can race with writes, and a matched size cannot prove the digest. No keys are automatically fetched, confirmed, expired, deleted, or released. No production capture was performed by this change. Next: operator-reviewed hosted inventory, provider verification, fenced reconciliation policy, and explicit approval for any destructive cleanup. Keep public rollout closed.
