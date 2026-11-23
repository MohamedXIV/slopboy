# Cloud save backups

Issue #36 starts with an explicit backup of the current local autosave for
playable public cartridges using the Slopboy 1000 compatibility save format
(schema 1). It retains the existing IndexedDB reader and UUID-based slot.
The Library offers upload and listing when `CLOUD_SAVE_BACKUPS_ENABLED=1`.
Both actions require a verified account with an activated Slopboy profile. This slice accepts PostgreSQL-compatible UTF-8 text without NUL bytes. Launch a cartridge first to migrate any legacy-only save that the Library cannot resolve. Listing only returns
metadata. Restore, deletion, conflict resolution and automatic sync are future
work. Offline gameplay and local backups do not depend on this feature.

## Disposable database only

On a disposable PostgreSQL database, apply migrations through version 008.
This Draft prototypes payload storage in PostgreSQL. ADR-002 requires private object storage for cloud save payloads. Keep this migration and feature flag off hosted environments until the storage design is reconciled. To validate the privilege boundary locally, grant a disposable restricted role execution on these two functions:

```sql
GRANT EXECUTE ON FUNCTION public.list_cloud_save_backups(uuid,uuid),
  public.create_cloud_save_backup(uuid,uuid,text) TO slopboy_test_web;
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
