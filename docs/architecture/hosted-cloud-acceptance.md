# Hosted cloud save acceptance (#36)

Scope: canonical Production, admin-only QA, reviewed Circuit Slide (Pixel-v1, schema 1). No public rollout or cleanup authorization. Use ordinary game UI and real sessions. Do not copy cookies, tokens, passwords, save payloads or private object keys into issue comments.

## Deployment prerequisite

- Verify canonical deployment is READY at the approved main commit; migrations 009/010 are applied with exact checksums, restricted web-role EXECUTE only, public EXECUTE and direct table CRUD denied.
- Confirm private bucket and exact target binding; all cloud flags are explicitly enabled for the intended QA target. Do not change role or storage credentials to make a test pass.
- As of deployment dpl_A5zvBBRFjaGbi8w8nnrAJNtjn5gK, the production alias was READY at ecd869c1e1e653a672f82ce46ef84e864da6779a; named metadata and object prefix were empty on inspection. Authenticated acceptance was not run.

## Guest gate (operator CLI)

Run `pnpm security:cloud-hosted` from the repository with Node 22+ and an internet connection. No account or bypass token required. It sends five denied requests to the canonical origin, including an invalid empty-object upload, never a valid save. Verify exact JSON error and private/no-store/nosniff headers. A Vercel HTML authentication page, disabled flag, redirect or network failure fails the probe. This is not authenticated acceptance.

## Account A — real storage and restore

1. In browser A sign in to the existing verified admin account, open [Circuit Slide](https://slopboy.vercel.app/play/3ce74eec-ca3c-484b-8d16-2af4840c539b), open **Game saves**, and start a new game. Play until a local autosave is acknowledged; open **Autosaves → Backup** on the chosen save and give it a unique name. Use that immutable backup for retries.
2. Open **Cloud → List cloud saves**. Verify account usage and select the named backup under **Back up a local save → Back up to cloud**. Expect “Cloud backup saved.” (201) and the new metadata row. Upload the same immutable backup again; expect “This snapshot is already backed up.” (200), one row, unchanged account usage.
3. In a second browser/profile B with no existing Slopboy local saves, sign into the same admin account. Open the game and list cloud saves. Verify the identical backup is listed. Select **Restore**, choose a unique local name and **Keep both**. Expect the active local save to remain unchanged and a separate copy in Manual saves. Select the backup again, choose another unique local name and **Restore & play**. Verify actual restored puzzle progress, not just a success message. Reload and confirm the new active playthrough persists. Do not overwrite or delete the original.
4. With a second, separately created and verified normal player account (not admin), open the game in a separate browser profile. List and attempt restore by the known QA backup UUID if the operator has it in their local test context; the named API must return 404 without metadata or payload. A guest must be denied 401. Never grant admin permissions just to run this check. The normal-player check proves the current QA role gate; cross-admin ownership tests require separately approved test identities and are not implied by it.

## Offline-to-online and storage audit

In an isolated test browser, use DevTools Network Offline after the game has loaded. Keep playing until local autosave acknowledges, create a named immutable backup, then attempt cloud upload while offline. Expect a clear failure and no synced claim; local play and saved data must remain available. Restore network and refresh the cloud list, then retry the exact same named backup. If the server reports pending, wait at least 60 seconds and retry the same bytes without renaming. Expect one ready record, matching usage and no additional storage object for that digest. This exercises offline recovery, not necessarily a server-side write/confirm interruption; a controlled interrupted-acknowledgment fixture remains separate.

After the test, inspect metadata and the private storage inventory using the existing read-only audit. Expected ready records correspond to successful distinct uploads, with matching sizes. Actual restore via the authenticated API exercises verified digest readback. Do not treat size match alone as integrity. No cleanup or deletion without separate operator approval.

## Record evidence

Record commit/deployment ID, browser versions, test timestamps, HTTP status and error codes, before/after counts and bytes, and each step as pass/fail/not-run. Do not include any credentials or payloads. Leave #36 open if any required hosted step is blocked. Keep admin-only QA until reconciliation and wider abuse safeguards are separately accepted.
