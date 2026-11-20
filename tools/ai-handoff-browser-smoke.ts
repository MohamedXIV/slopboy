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
    const importHtml = await importResponse.text();
    assert.match(importHtml, /Bring your game to Slopboy/);
    assert.match(importHtml, /spellcheck="false"/i, 'private code must not use enhanced spell checking');
    assert.doesNotMatch(importHtml, /maxlength="65536"/i,
      'the browser must not silently truncate source before showing size diagnostics');

    const gameId = 'b9e52a74-17b0-4214-aa77-36210f237a91';
    const management = await fetch(server.url + `/manage/${gameId}`);
    assert.equal(management.status, 200);
    assert.match(await management.text(), /Private source version history/);
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
    await browser.setViewport(390, 844);
    const mobile = await browser.evaluate(`JSON.stringify({
      width: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth
    })`);
    assert.deepEqual(JSON.parse(String(mobile)), {width: 390, overflow: false});

    await browser.evaluate(`(() => {
      Object.defineProperty(navigator.clipboard, 'readText', {
        configurable: true, value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError'))
      });
      Array.from(document.querySelectorAll('button')).find(button =>
        button.textContent?.includes('Paste from Clipboard')).click();
    })()`);
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await browser.evaluate(`document.body.textContent.includes('Clipboard permission was denied')`)) break;
      await sleep(100);
    }
    assert.equal(await browser.evaluate(`document.body.textContent.includes('Clipboard permission was denied')`), true);

    const sourceField = 'textarea[placeholder*="import kaplay"]';
    await browser.evaluate(`(() => {
      const source = document.querySelector(${JSON.stringify(sourceField)});
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(source, '<div>Inert QA source</div>');
      source.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
    assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(sourceField)}).value`), '<div>Inert QA source</div>');
    assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('div')).some(e => e.textContent === 'Inert QA source')`), false);

    await browser.setViewport(1280, 900);
    await browser.evaluate(`location.href = '/ai'`);
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await browser.evaluate(`Boolean(document.querySelector('a[href="/import"]'))`)) break;
      await sleep(100);
    }
    assert.equal(await browser.evaluate('window.innerWidth'), 1280);
    assert.equal(await browser.evaluate(`document.querySelector('#sb-ai-genre').value`), '');
    await browser.evaluate(`(() => {
      window.slopboyOutbound = [];
      window.open = url => {window.slopboyOutbound.push(url); return null;};
    })()`);
    let providerButtonsReady = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      providerButtonsReady = Boolean(await browser.evaluate(`(() => {
        const idea = document.querySelector('#sb-ai-builder textarea') ?? document.querySelector('textarea');
        const value = 'A tiny arcade puzzle ' + ${attempt};
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(idea, value);
        idea.dispatchEvent(new Event('input', {bubbles: true}));
        return Array.from(document.querySelectorAll('button')).some(button =>
          button.textContent?.includes('Open in ChatGPT') && !button.disabled);
      })()`));
      if (providerButtonsReady) break;
      await sleep(100);
    }
    assert.ok(providerButtonsReady, 'An idea without Genre enables the provider actions');
    await browser.evaluate(`(() => {
      for (const provider of ['ChatGPT', 'Claude']) {
        Array.from(document.querySelectorAll('button')).find(button =>
          button.textContent?.includes('Open in ' + provider)).click();
      }
    })()`);
    const urls = await browser.evaluate('window.slopboyOutbound') as string[];
    assert.equal(urls.length, 2);
    assert.deepEqual(urls.map(url => new URL(url).hostname), ['chatgpt.com', 'claude.ai']);
    for (const url of urls) assert.ok(new URL(url).searchParams.get('q')?.includes(server.url + '/import'));
    console.log('AI clipboard handoff browser + guest authorization smoke passed.');
  } finally {
    browser?.close();
    await server.stop();
    await rm(profile, {recursive: true, force: true});
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
