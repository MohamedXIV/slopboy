import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_DEFAULT_PAGE_SIZE,CATALOG_MAX_PAGE_SIZE,decodeCatalogCursor,
  encodeCatalogCursor,parseCatalogPage} from '../apps/web/server/catalog-contract.ts';
import {LIST_PUBLIC_GAMES_SQL,READ_VISIBLE_GAME_SQL} from '../apps/web/server/catalog-queries.ts';
import {LIST_OWNED_GAMES_SQL,READ_OWNED_REVISIONS_SQL,OWNER_GAMES_PAGE_SIZE,
  OWNER_REVISION_HISTORY_LIMIT} from '../apps/web/server/owner-revision-queries.ts';

const id='5b0edbf4-644d-43f4-9ad3-5506eacd05d3';
const other='f8067e25-7c16-4e9d-b496-69b1b8fe7ccc';
test('public keyset pagination uses a stable opaque timestamp + UUID cursor',()=>{
  const cursor={createdAt:'2026-11-12 15:05:06.123456+00',gameId:id};
  assert.deepEqual(decodeCatalogCursor(encodeCatalogCursor(cursor)),cursor);
  assert.equal(decodeCatalogCursor(''),null);
  assert.equal(decodeCatalogCursor('not base64'),null);
  assert.equal(decodeCatalogCursor('a'.repeat(201)),null);
  assert.equal(decodeCatalogCursor(Buffer.from(JSON.stringify(['invalid',other])).toString('base64url')),null);
  assert.equal(decodeCatalogCursor(Buffer.from(JSON.stringify(['2026-11-12 15:05:06+00','not-a-uuid'])).toString('base64url')),null);
});
test('catalog limits and malformed query parameters fail closed',()=>{
  const empty=parseCatalogPage(new URLSearchParams());
  assert.ok(empty.ok);
  if(empty.ok){assert.equal(empty.page.limit,CATALOG_DEFAULT_PAGE_SIZE);assert.equal(empty.page.cursor,null);}
  for(const bad of ['0','-1','1.5','25','100','abc','01','1; DROP TABLE games']){
    const got=parseCatalogPage(new URLSearchParams({limit:bad}));
    assert.equal(got.ok,false,bad);
  }
  assert.equal(parseCatalogPage(new URLSearchParams({limit:String(CATALOG_MAX_PAGE_SIZE)})).ok,true);
  assert.equal(parseCatalogPage(new URLSearchParams('limit=2&limit=3')).ok,false);
  assert.equal(parseCatalogPage(new URLSearchParams('cursor=')).ok,false);
  assert.equal(parseCatalogPage(new URLSearchParams('cursor=a&cursor=b')).ok,false);
  const c=encodeCatalogCursor({createdAt:'2026-11-12 15:05:06+00',gameId:id});
  const valid=parseCatalogPage(new URLSearchParams({limit:'3',cursor:c}));
  assert.equal(valid.ok,true);
  if(valid.ok)assert.deepEqual(valid.page.cursor,{createdAt:'2026-11-12 15:05:06+00',gameId:id});
});
test('all database catalog queries enforce server-side access checks',()=>{
  assert.match(LIST_PUBLIC_GAMES_SQL,/g\.visibility='public' AND g\.status='published' AND r\.status='published'/);
  assert.match(LIST_PUBLIC_GAMES_SQL,/r\.id=g\.current_published_revision_id/);
  assert.match(LIST_PUBLIC_GAMES_SQL,/ORDER BY g\.created_at DESC,g\.id DESC LIMIT \$3::int/);
  assert.match(READ_VISIBLE_GAME_SQL,/g\.id=\$1::uuid/);
  assert.match(READ_VISIBLE_GAME_SQL,/g\.owner_id=\$2::uuid/);
  assert.match(READ_VISIBLE_GAME_SQL,/EXISTS \(SELECT 1 FROM public\.users/);
  assert.doesNotMatch(READ_VISIBLE_GAME_SQL,/game_access/,'grants are not implemented or auto-trusted');
});

test('owner revision metadata is identity-scoped in SQL and never returns artifact locators',()=>{
  assert.match(READ_VISIBLE_GAME_SQL,/g\.owner_id=\$2::uuid/);
  assert.match(READ_VISIBLE_GAME_SQL,/r\.game_id=g\.id AND g\.owner_id=\$2::uuid/);
  assert.match(READ_VISIBLE_GAME_SQL,/p\.status='published'/);
  assert.match(READ_VISIBLE_GAME_SQL,/ORDER BY r\.revision_number DESC/);
  assert.match(READ_VISIBLE_GAME_SQL,/EXISTS \(SELECT 1 FROM public\.users/);

  assert.match(LIST_OWNED_GAMES_SQL,/g\.owner_id=\$1::uuid/);
  assert.match(LIST_OWNED_GAMES_SQL,/FROM public\.game_revisions WHERE game_id=g\.id/);
  assert.match(LIST_OWNED_GAMES_SQL,/ORDER BY revision_number DESC,id DESC LIMIT 1/);
  assert.match(READ_OWNED_REVISIONS_SQL,/g\.id=\$1::uuid AND g\.owner_id=\$2::uuid/);
  assert.match(READ_OWNED_REVISIONS_SQL,/EXISTS \(SELECT 1 FROM public\.users u WHERE u\.id=\$2::uuid\)/);
  assert.match(READ_OWNED_REVISIONS_SQL,/ORDER BY r\.revision_number DESC NULLS LAST/);
  assert.equal(OWNER_GAMES_PAGE_SIZE,50);
  assert.equal(OWNER_REVISION_HISTORY_LIMIT,50);
  for(const sql of [READ_VISIBLE_GAME_SQL,LIST_OWNED_GAMES_SQL,READ_OWNED_REVISIONS_SQL]){
    assert.doesNotMatch(sql,/storage_key|artifact|entrypoint|source|game_access/i);
  }
});
