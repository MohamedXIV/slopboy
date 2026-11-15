import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_DEFAULT_PAGE_SIZE,CATALOG_MAX_PAGE_SIZE,decodeCatalogCursor,
  encodeCatalogCursor,parseCatalogPage} from '../apps/web/server/catalog-contract.ts';
import {LIST_PUBLIC_GAMES_SQL,READ_VISIBLE_GAME_SQL} from '../apps/web/server/catalog-queries.ts';

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
