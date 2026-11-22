import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
import {openChromePage} from './chrome-cdp.ts';
import {startNextTestServer} from './next-test-server.ts';

const server = await startNextTestServer(undefined,{database:false});
const profile = await mkdtemp('/tmp/slopboy-procedural-browser-');
let chrome: Awaited<ReturnType<typeof openChromePage>> | undefined;
try {
  const initScript = `(() => {
    window.probe={tones:0,closed:0,dropped:0};
    window.addEventListener('message', event => {
      if (window.dropDemoFrames &&
          event.source === document.querySelector('iframe[title="Procedural game sandbox"]')?.contentWindow &&
          event.data?.scope === 'slopboy-v1' && event.data.type === 'frame') {
        window.probe.dropped++;
        event.stopImmediatePropagation();
      }
    }, true);
    const start=OscillatorNode.prototype.start;
    OscillatorNode.prototype.start=function(...args){window.probe.tones++;return start.apply(this,args)};
    const close=AudioContext.prototype.close;
    AudioContext.prototype.close=function(...args){window.probe.closed++;return close.apply(this,args)};
  })()`;
  const page = chrome = await openChromePage(server.url+'/labs/procedural',profile,initScript);
  async function until(expression:string) {
    for (let n=0;n<50;n++) {
      if (await page.evaluate(expression)) return;
      await wait(100);
    }
    throw new Error('Timed out waiting for: '+expression+'; '+await page.evaluate("JSON.stringify({probe:window.probe,status:document.querySelector('[role=status]')?.textContent})"));
  }
  const click = (label:string) => page.evaluate(
    `[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)})?.click()`,true);
  const pixel = (x:number,y:number) =>
    `document.querySelector('canvas')?.getContext('2d').getImageData(${x},${y},1,1).data[0]===32`;

  await until("document.readyState==='complete' && Boolean(document.querySelector('canvas'))");
  await page.setOffline(true);
  await until('navigator.onLine===false');
  for (let attempt=0; attempt<25; attempt++) {
    if (await page.evaluate('!!document.querySelector("iframe[title=\\"Procedural game sandbox\\"]")')) break;
    await click('Start demo');
    await wait(120);
  }
  await until("document.querySelector('[role=status]')?.textContent.includes('Running')");
  await until(pixel(131,117));
  await click('Left');
  await until(pixel(115,117));
  await until('window.probe.tones===1');
  await click('Save position');
  await click('Stop demo');
  await until("document.querySelector('[role=status]')?.textContent.includes('Stopped')");
  await until("localStorage.getItem('slopboy-procedural-lab-v1')==='[7,8]'");
  await until('window.probe.tones===2');
  await click('Start demo');
  await until(pixel(115,117));

  await click('Mute');
  await click('Up');
  await until(pixel(115,103));
  assert.equal(await page.evaluate('window.probe.tones'),2);
  await click('Unmute');
  await click('Right');
  await until(pixel(131,103));
  await until('window.probe.tones===3');

  await click('Stop demo');
  await until("document.querySelector('[role=status]')?.textContent.includes('Stopped')");
  assert.equal(await page.evaluate('document.querySelectorAll("iframe[title=\\"Procedural game sandbox\\"]").length'),0);
  assert.equal(await page.evaluate('window.probe.closed'),2);
  await click('Start demo');
  await until(pixel(115,117));
  await page.evaluate('window.dropDemoFrames = true');
  await until('window.probe.dropped >= 1');
  await until("document.querySelector('[role=status]')?.textContent.includes('Sandbox timed out')");
  assert.equal(await page.evaluate("document.querySelector('iframe')===null"),true);
  assert.equal(await page.evaluate('window.probe.closed'),3);
  assert.equal(await page.evaluate("localStorage.getItem('slopboy-procedural-lab-v1')"),'[7,8]');
  await page.evaluate('window.dropDemoFrames = false');
  await click('Start demo');
  await until(pixel(115,117));
  await click('Stop demo');
  await until('window.probe.closed===4');
  console.log('Procedural Chromium demo passed offline pixels, input, synthesized audio, mute, save, teardown and restart.');
} finally {
  chrome?.close();
  await server.stop();
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:100});
}
