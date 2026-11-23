# Cloud save backups

Issue #36 starts with an explicit backup of the current local autosave for
playable public cartridges using the Slopboy 1000 compatibility save format
(schema 1). It retains the existing IndexedDB reader and UUID-based slot.
The Library offers upload and listing when `CLOUD_SAVE_BACKUPS_ENABLED=1`.
Both actions require a verified application account. Listing only returns
metadata. Restore, deletion, conflict resolution and automatic sync are future
work. Offline gameplay and local backups do not depend on this feature.

## Database rollout

On a disposable PostgreSQL database, apply migrations through version 008.
For a hosted dev test, apply 008 only with separate authorization and grant
the existing restricted web role execution on these two functions:

```sql
GRANT EXECUTE ON FUNCTION public.list_cloud_save_backups(uuid,uuid),
  public.create_cloud_save_backup(uuid,uuid,text) TO slopboy_web_preview;
```

Keep the backup table inaccessible to the web role. The security-definer
functions accept the account selected by the server from verified Neon Auth.
The upload route checks same-origin requests, and both routes verify that the
game is playable. A transaction lock serializes each account's writes before
checking the 10 MiB account cap and five snapshots per game. Each payload is
limited to 256 KiB. Replaying the same save returns its existing backup.
Local saves are never overwritten by this flow.

Disable the flag to roll back the feature without deleting backup records.
The down migration drops the table and deletes those records, so use it
against disposable data or only after an authorized retention decision.
