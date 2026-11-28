# Managed autosave device discovery

Read-only endpoint `/api/account/games/[gameId]/cloud-autosave-devices` returns only the authenticated QA account's transactional streams, with count and latest timestamp. Expected account header required. No new grants or activation. Existing device-scoped list and exact read support later explicit restore from a selected device; restore UI must never use the selected source device as the local upload destination. Migration 015 introduces one restricted function, with reversible schema-only rollback. Current device identity remains local and stable.
