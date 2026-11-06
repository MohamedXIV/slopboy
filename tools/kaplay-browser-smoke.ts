import {createServer} from "node:http";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {join,resolve,extname,sep} from "node:path";
import {tmpdir} from "node:os";
import {openChromePage} from "./chrome-cdp.ts";

const sleep = (ms:number) => new Promise<void>(r=>setTimeout(r,ms));
const root = resolve("apps/web/out");
const mime:Record<string,string> = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json",
  ".png":"image/png", ".woff2":"font/woff2"
};
async function main() {
  const profile = await mkdtemp(join(tmpdir(), "slopboy-kaplay-"));
  const server = createServer(async(req,res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
      const candidate = pathname.endsWith("/") ? pathname + "index.html" : pathname;
      const safe = resolve(root, "." + candidate);
      if (!safe.startsWith(root + sep)) {res.writeHead(403).end();return;}
      const path = extname(safe) ? safe : safe + ".html";
      const content = await readFile(path);
      res.writeHead(200, {"content-type":mime[extname(path)] || "application/octet-stream","cache-control":"no-store"});
      res.end(content);
    } catch {res.writeHead(404).end("Not Found");}
  });
  await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
  const port=(server.address() as {port:number}).port;
  let browser:Awaited<ReturnType<typeof openChromePage>>|undefined;
  try {
    browser = await openChromePage("http://127.0.0.1:"+port+"/v2/spikes/kaplay",join(profile,"chrome"));
    const evaluate=browser.evaluate;
    let ready=false;
    const deadline=Date.now()+20000;
    while (Date.now()<deadline) {
      const state=JSON.parse(String(await evaluate("JSON.stringify({status:document.querySelector('[data-testid=kaplay-status]')?.textContent,error:document.querySelector('[role=alert]')?.textContent,frames:Number(document.querySelector('[data-testid=kaplay-frames]')?.textContent||0)})")));
      if (state.status==="error") throw Error("KAPLAY spike error: "+state.error);
      if (state.status==="running" && state.frames >= 10) {ready=true;break;}
      await sleep(200);
    }
    if (!ready) throw Error("KAPLAY sandbox failed to produce real frames");
    const evidence=JSON.parse(String(await evaluate("JSON.stringify((()=>{const c=document.querySelector('.kaplay-display-wrap canvas');const f=document.querySelector('.kaplay-display-wrap iframe');const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const unique=new Set();for(let i=0;i<data.length;i+=4)unique.add(data[i]+','+data[i+1]+','+data[i+2]);return {width:c.width,height:c.height,colors:unique.size,sandbox:f.getAttribute('sandbox'),isolated:f.contentDocument===null,hasCsp:f.srcdoc.includes(\"connect-src 'none'\"),visibleRenderer:getComputedStyle(f).opacity==='1'&&f.getBoundingClientRect().width>=160}})())")));
    if (evidence.width!==160 || evidence.height!==144 || evidence.colors<2 || evidence.colors>4) {
      throw Error("Indexed framebuffer mismatch "+JSON.stringify(evidence));
    }
    if (evidence.sandbox!=="allow-scripts" || !evidence.isolated || !evidence.hasCsp || !evidence.visibleRenderer) {
      throw Error("Opaque-origin/CSP gate failed "+JSON.stringify(evidence));
    }
    const initialX=Number(await evaluate("document.querySelector('[data-testid=kaplay-player-x]').textContent"));
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));true");
    await sleep(2400);
    const pressedEvidence = await evaluate("JSON.stringify({ticks:document.querySelector('[data-testid=kaplay-ticks]')?.textContent,inputs:document.querySelector('[data-testid=kaplay-input-count]')?.textContent,packets:document.querySelector('[data-testid=kaplay-input-packets]')?.textContent,active:document.querySelector('[data-testid=kaplay-active-input-ticks]')?.textContent})");
    await evaluate("window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true}));true");
    await sleep(250);
    const finalX=Number(await evaluate("document.querySelector('[data-testid=kaplay-player-x]').textContent"));
    if (finalX < initialX + 15) {
      const debug = await evaluate("JSON.stringify({ticks:document.querySelector('[data-testid=kaplay-ticks]')?.textContent,inputs:document.querySelector('[data-testid=kaplay-input-count]')?.textContent,assets:document.querySelector('[data-testid=kaplay-asset-progress]')?.textContent})");
      throw Error("Real KAPLAY game ignored keyboard input: "+initialX+" -> "+finalX+" / "+debug+" / during press "+pressedEvidence);
    }
    const screenshotBefore=String(await evaluate("document.querySelector('.kaplay-display-wrap canvas').toDataURL()"));
    await evaluate("document.querySelector('#kaplay-palette').value='amber';document.querySelector('#kaplay-palette').dispatchEvent(new Event('change',{bubbles:true}));true");
    await sleep(450);
    const screenshotAfter=String(await evaluate("document.querySelector('.kaplay-display-wrap canvas').toDataURL()"));
    if (screenshotBefore===screenshotAfter) throw Error("LCD display not repainted after palette selection");
    const ms=Number(await evaluate("document.querySelector('[data-testid=kaplay-capture]').textContent.replace(' ms','')"));
    if (!Number.isFinite(ms) || ms>150) throw Error("Per-frame readback exceeded generous spike diagnostic budget: "+ms);
    console.log("KAPLAY real Chromium spike PASSED", {evidence,initialX,finalX,captureMs:ms});
  } finally {
    browser?.close();
    await new Promise<void>(done=>server.close(()=>done()));
    await sleep(400);
    await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:150}).catch(()=>{});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
