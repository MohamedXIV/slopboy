import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openChromePage } from './chrome-cdp.ts';
import { startNextTestServer } from './next-test-server.ts';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function main() {
  const profile = await mkdtemp(join(tmpdir(), 'slopboy-kaplay-host-'));
  const server = await startNextTestServer();
  let browser: Awaited<ReturnType<typeof openChromePage>> | undefined;
  try {
    browser = await openChromePage('http://127.0.0.1:' + server.port + '/labs/kaplay-host', join(profile, 'chrome'));
    const evaluate = browser.evaluate;
    let ready = false;
    const deadline = Date.now() + 24000;
    while (Date.now() < deadline) {
      const state = JSON.parse(String(await evaluate("JSON.stringify({state:document.querySelector('[data-testid=kaplay-host-state]')?.textContent,frames:Number(document.querySelector('[data-testid=kaplay-host-frames]')?.textContent||0),error:document.querySelector('[role=alert]')?.textContent})")));
      if (state.error) throw Error('Host adapter error: ' + state.error);
      if (state.state === 'running' && state.frames >= 10) { ready = true; break; }
      await sleep(220);
    }
    if (!ready) throw Error('HostSession / KAPLAY adapter did not produce enough frames');

    const evidence = JSON.parse(String(await evaluate(`JSON.stringify((() => {
      const c = document.querySelector('.kaplay-host-stage canvas');
      const f = document.querySelector('.kaplay-host-sandbox iframe');
      if (!c || !f) throw Error('Missing KAPLAY host elements');
      const data = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const colors = new Set();
      for (let i=0;i<data.length;i+=4) colors.add(data[i]+','+data[i+1]+','+data[i+2]);
      const main = c.getBoundingClientRect();
      const raw = f.getBoundingClientRect();
      const noOverlap = raw.right <= main.left || raw.left >= main.right ||
        raw.bottom <= main.top || raw.top >= main.bottom;
      return {width:c.width,height:c.height,colors:colors.size,
        sandbox:f.getAttribute('sandbox'),opaque:f.contentDocument===null,
        csp:f.srcdoc.includes("connect-src 'none'"),geometry:raw.width>=160,
        rawOpacity:getComputedStyle(f).opacity, noOverlap};
    })())`)));
    if (evidence.width !== 160 || evidence.height !== 144 ||
        evidence.colors < 2 || evidence.colors > 4 || evidence.sandbox !== 'allow-scripts' ||
        !evidence.opaque || !evidence.csp || !evidence.geometry ||
        evidence.rawOpacity !== '1' || !evidence.noOverlap) {
      throw Error('KAPLAY HostSession browser security/display evidence failed: ' + JSON.stringify(evidence));
    }

    const before = String(await evaluate("document.querySelector('.kaplay-host-stage canvas').toDataURL()"));
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true})); true");
    await sleep(1500);
    await evaluate("window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true})); true");
    const after = String(await evaluate("document.querySelector('.kaplay-host-stage canvas').toDataURL()"));
    if (before === after) throw Error('Real KAPLAY Gem Miner framebuffer did not respond to host keyboard input');

    const fps = Number(await evaluate("document.querySelector('[data-testid=kaplay-host-fps]').textContent"));
    if (!Number.isFinite(fps) || fps < 10) throw Error('Unexpectedly low or unavailable measured presentation FPS: '+fps);
    console.log('Gem Miner through HostSession real Chromium smoke PASSED', {...evidence, measuredFps:fps});
  } finally {
    browser?.close();
    await server.stop();
    await sleep(400);
    await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 150 }).catch(() => {});
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
