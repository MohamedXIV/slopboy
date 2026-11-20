import assert from 'node:assert/strict';
import test from 'node:test';
import {LIST_SOURCE_HISTORY_SQL, READ_SOURCE_REVISION_SQL,
  sourceHistoryItems, sourceHistoryPage} from '../apps/web/server/source-history-queries.ts';

test('history list returns only revision metadata; source text is never in the list query or response', () => {
  assert.doesNotMatch(LIST_SOURCE_HISTORY_SQL, /source_text/i);
  assert.match(LIST_SOURCE_HISTORY_SQL, /ORDER BY d\.created_at DESC,d\.id DESC LIMIT 51/i);
  assert.match(LIST_SOURCE_HISTORY_SQL, /ORDER BY d\.created_at DESC NULLS LAST,d\.id DESC NULLS LAST\s*$/i,
    'the result must also be ordered after the lateral join so the first item is the latest');
  assert.deepEqual(sourceHistoryItems([
    {id: 'rev-2', language: 'typescript', source_digest: 'abc', created_at: '2026-11-20', engine_manifest: {}},
    {id: 'rev-1', language: 'javascript', source_digest: null, created_at: '2026-11-19', engine_manifest: null},
  ]), [
    {id: 'rev-2', language: 'typescript', checksum: 'abc', createdAt: '2026-11-20', validated: true},
    {id: 'rev-1', language: 'javascript', checksum: null, createdAt: '2026-11-19', validated: false},
  ]);
});

test('history query applies owner/admin, exact UUID, private-draft visibility and account guards', () => {
  for (const sql of [LIST_SOURCE_HISTORY_SQL, READ_SOURCE_REVISION_SQL]) {
    assert.match(sql, /g\.id=\$2::uuid/);
    assert.match(sql, /actor\.id=\$1::uuid/);
    assert.match(sql, /g\.owner_id=actor\.id/);
    assert.match(sql, /actor\.role='admin'/);
    assert.match(sql, /actor\.role<>'system'/);
    assert.match(sql, /g\.visibility='private'/);
    assert.match(sql, /g\.status='draft'/);
  }
  assert.match(READ_SOURCE_REVISION_SQL, /d\.id=\$4::uuid/);
  assert.match(READ_SOURCE_REVISION_SQL, /d\.game_id=g\.id/);
});


test('history returns a cursor only when an older row exists', () => {
  const rows = Array.from({length: 51}, (_, index) => ({
    id: String(index), language: 'typescript', source_digest: null, created_at: '2026-11-20',
    engine_manifest: null,
  }));
  const page = sourceHistoryPage(rows);
  assert.equal(page.revisions.length, 50);
  assert.equal(page.nextBefore, '49');
  assert.equal(sourceHistoryPage(rows.slice(50)).nextBefore, null);
});
