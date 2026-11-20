/** Real Next.js and Chromium smoke for the dev-only AI clipboard handoff boundary. */
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openChromePage} from './chrome-cdp.ts';
import {startNextTestServer} from './next-test-server.ts';

const sleep = (duration: number) => new Promise<void>(resolve => setTimeout(resolve, duration));

async function main() {
  const server = await startNextTestServer(undefined, {database: false});
  const profile = await mkdtemp(join(tmpdir(), 'slopboy-ai-handoff-'));
  let browser: Awaited<ReturnType<typeof openChromePage>> | undefined;
  try {
    const importResponse = await fetch(server.url + '/import');
    assert.equal(importResponse.status, 200);
    assert.match(await importResponse.text(), /Bring your game to Slopboy/);

    const gameId = 'b9e52a74-17b0-4214-aa77-36210f237a91';
    const history = await fetch(server.url + `/api/manage/games/${gameId}/source-history`);
    assert.equal(history.status, 401, 'history must not reveal source to a guest');
    assert.match(history.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(await history.json(), {error: 'UNAUTHENTICATED'});
    const legacyRead = await fetch(server.url + `/api/manage/games/${gameId}/source-history?revision=${gameId}`);
    assert.equal(legacyRead.status, 401, 'single historical source must not leak to a guest');

    const originOnly = await fetch(server.url + '/api/manage/source', {method: 'POST',
      headers: {'Content-Type': 'application/json', Origin: server.url}, body: '{}'});
    assert.equal(originOnly.status, 403, 'an ambiguous proxy-origin mutation must fail closed');
    const create = await fetch(server.url + '/api/manage/source', {method: 'POST',
      headers: {'Content-Type': 'application/json', Origin: server.url,
        'Sec-Fetch-Site': 'same-origin'}, body: '{}'});
    assert.equal(create.status, 401, 'private source save must require a verified account');

    if (process.argv.includes('--http-only')) {
      console.log('AI handoff HTTP and guest-authorization smoke passed; Chromium was not run.');
      return;
    }

    browser = await openChromePage(server.url + '/import', profile);
    let ready = false;
    for (let i = 0; i < 70; i++) {
      ready = Boolean(await browser.evaluate(`Boolean(document.querySelector('textarea[placeholder*="import kaplay"]') &&
        Array.from(document.querySelectorAll('button')).some(button => button.textContent?.includes('Paste from Clipboard')))`));
      if (ready) break;
      await sleep(150);
    }
    assert.equal(ready, true, 'a manual source field and explicit clipboard button must render');
    const initial = await browser.evaluate(`JSON.stringify({
      value: document.querySelector('textarea[placeholder*="import kaplay"]')?.value,
      disabled: document.querySelector('textarea[placeholder*="import kaplay"]')?.disabled,
      preview: document.body.textContent?.includes('Preview is not available yet'),
      save: document.body.textContent?.includes('Save private draft')
    })`);
    assert.deepEqual(JSON.parse(String(initial)), {value: '', disabled: false, preview: true, save: true},
      'source must not be auto-read, preview must stay disabled and manual paste must be available');
    console.log('AI clipboard handoff browser + guest authorization smoke passed.');
  } finally {
    browser?.close();
    await server.stop();
    await rm(profile, {recursive: true, force: true});
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
