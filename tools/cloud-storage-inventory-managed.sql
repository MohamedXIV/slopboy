-- Operator-only metadata export. Run on the reviewed matching DB target.
-- No writes, payloads, access grants or automatic repair. One MVCC snapshot.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH inventory AS (
 SELECT 'legacy' AS lane,id,account_id,game_id,storage_key,byte_size,digest,status,
        b.created_at,b.ready_at,to_jsonb(b)->>'last_attempt_at' AS last_attempt_at,NULL::timestamptz AS retired_at
 FROM public.cloud_save_backups b
 UNION ALL
 SELECT 'named',n.id,n.account_id,n.game_id,n.storage_key,n.byte_size,n.digest,n.status,
        n.created_at,n.ready_at,to_jsonb(n)->>'last_attempt_at',NULL::timestamptz
 FROM public.named_cloud_snapshots n
 UNION ALL
 SELECT 'managed',m.id,m.account_id,m.game_id,m.storage_key,m.byte_size,m.digest,m.status,
        m.created_at,m.ready_at,to_jsonb(m)->>'last_attempt_at',m.retired_at
 FROM public.managed_auto_snapshots m WHERE m.storage_key IS NOT NULL
), bounded AS (
 SELECT * FROM inventory ORDER BY storage_key LIMIT 1001
)
SELECT jsonb_build_object('capturedAt',statement_timestamp(),'complete',count(*)<=1000,'managedIncluded',true,
 'transactionalRows',(SELECT count(*) FROM public.managed_auto_snapshots WHERE storage_key IS NULL),
 'transactionalBytes',(SELECT coalesce(sum(byte_size),0) FROM public.managed_auto_snapshots WHERE storage_key IS NULL),
 'rows',coalesce(jsonb_agg(jsonb_build_object(
 'lane',lane,'id',id,'accountId',account_id,'gameId',game_id,'key',storage_key,
 'bytes',byte_size,'digest',digest,'status',status,'createdAt',created_at,
 'readyAt',ready_at,'lastAttemptAt',last_attempt_at,'retiredAt',retired_at) ORDER BY storage_key),'[]'::jsonb))
FROM bounded;
COMMIT;
