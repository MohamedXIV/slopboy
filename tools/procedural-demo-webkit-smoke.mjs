import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath || !isAbsolute(modulePath)) throw new Error('Set PLAYWRIGHT_MODULE to a local Playwright index.mjs');
const {webkit} = await import(pathToFileURL(modulePath).href);
import {startNextTestServer} from './next-test-server.ts';
const browser = await webkit.launch({headless:true});
let server;
try {
 server = await startNextTestServer(undefined,{database:false});
 const ctx = await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addInitScript(() => {
  window.probe={tones:0,closed:0};
  const start=OscillatorNode.prototype.start;
  OscillatorNode.prototype.start=function(...args){window.probe.tones++;return start.apply(this,args)};
  const close=AudioContext.prototype.close;
  AudioContext.prototype.close=function(...args){window.probe.closed++;return close.apply(this,args)};
 });
 const p = await ctx.newPage();
 await p.goto(server.url+'/labs/procedural');
 await ctx.setOffline(true);
 await p.waitForFunction(()=>navigator.onLine===false);
 const click = async n=>p.getByRole('button',{name:n,exact:true}).click();
 await click('Start demo');
 await p.getByText('Running',{exact:true}).waitFor({timeout:7000});
 assert.equal(await p.locator('iframe').evaluate(f=>f.contentDocument===null),true);
 const pixel = (x,y)=>p.waitForFunction(([x,y])=>document.querySelector('canvas').getContext('2d').getImageData(x,y,1,1).data[0]===32,[x,y]);
 await pixel(131,117);
 await click('Left');
 await pixel(115,117);
 await p.waitForFunction(()=>window.probe.tones===1);
 await click('Save position');
 await p.waitForFunction(()=>localStorage.getItem('slopboy-procedural-lab-v1')==='[7,8]'&&window.probe.tones===2);
 await click('Mute');
 await click('Up');
 await pixel(115,103);
 assert.equal(await p.evaluate(()=>window.probe.tones),2);
 await click('Stop demo');
 await p.waitForFunction(()=>window.probe.closed===1&&!document.querySelector('iframe'));
 await click('Start demo');
 await pixel(115,117);
 await click('Stop demo');
 console.log('WebKit '+browser.version()+' passed offline input, opaque iframe, Web Audio, mute, local save, teardown and restart');
} finally {
 await browser.close(); await server?.stop();
}
