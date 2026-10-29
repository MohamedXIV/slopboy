/**
 * Browser isolation regression via the Chrome installed on ubuntu-latest.
 * No third-party dependencies, no submitted code or online services.
 */
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SANDBOX_DOCUMENT} from '../packages/runtime/src/sandbox-document.ts';

const FIXTURES=[{"id":"regular","behavior":"frame","expected":2,"code":"export default {update(){},draw(ctx){ctx.screen.clear(2)}};"},{"id":"spoofed-frame","behavior":"frame","expected":1,"code":"postMessage({type:'frame',pixels:new Uint8Array(16).fill(3)});export default {update(){},draw(ctx){ctx.screen.clear(1)}};"},{"id":"spoofed-ready","behavior":"timeout-init","code":"postMessage({type:'ready'});export default {init(){while(true){}},update(){},draw(){}};"},{"id":"infinite-update","behavior":"timeout-frame","code":"export default {update(){while(true){}},draw(ctx){ctx.screen.clear(0)}};"},{"id":"palette","behavior":"shade-rejection","code":"export default {update(){},draw(ctx){ctx.screen.clear(4)}};"},{"id":"network","behavior":"frame","expected":1,"code":"let blocked=false;export default {init(){fetch('data:text/plain,hi').then(()=>{},()=>{blocked=true})},update(){},draw(ctx){ctx.screen.clear(blocked?1:3)}};"}];
const BROWSER_SCRIPT="\nconst fixtures=JSON.parse(document.getElementById('fixtures').textContent);\nconst source=atob(document.getElementById('sandbox').textContent);\nconst results=new Map();\nconst diagnostics=[];\nwindow.addEventListener('error',event=>diagnostics.push('parent-error:'+event.message));\nfunction finish(id,pass,message){\n  if(results.has(id))return;\n  results.set(id,{pass,message});\n  document.getElementById('results').textContent=JSON.stringify([...results.entries()]);\n  if(results.size===fixtures.length)document.documentElement.dataset.result=[...results.values()].every(x=>x.pass)?'pass':'fail';\n}\nwindow.addEventListener('message',event=>{\n  diagnostics.push('message:'+event.origin+':'+String(event.data?.type));\n  if(event.origin!=='null')return;\n  const iframe=[...document.querySelectorAll('iframe')].find(x=>x.contentWindow===event.source);\n  if(!iframe)return;\n  const fixture=fixtures.find(x=>x.id===iframe.dataset.fixture);\n  if(!fixture||results.has(fixture.id))return;\n  const msg=event.data;\n  if(!msg||msg.scope!=='slopboy-v1')return;\n  const key='slopboy-smoke-'+fixture.id;\n  function send(type,fields={}){iframe.contentWindow.postMessage({scope:'slopboy-v1',key,type,...fields},'*');}\n  if(msg.type==='boot'){send('load',{code:fixture.code,width:4,height:4,shades:4,save:null});return;}\n  if(msg.key!==key)return;\n  if(msg.type==='ready'){\n    if(fixture.behavior==='timeout-init'){finish(fixture.id,false,'spoofed init readiness');return;}\n    send('tick',{dt:0.016,down:[],pressed:[]});\n  }else if(msg.type==='frame'){\n    if(fixture.behavior!=='frame'){finish(fixture.id,false,'unexpected frame');return;}\n    const px=msg.pixels;\n    const success=px instanceof Uint8Array&&px.length===16&&[...px].every(v=>v===fixture.expected);\n    finish(fixture.id,success,success?'correct frame':'unexpected pixels');\n    send('stop');\n  }else if(msg.type==='error'){\n    const expected=fixture.behavior==='timeout-init'?'Game initialization timeout':\n      fixture.behavior==='timeout-frame'?'Game frame timeout':\n      fixture.behavior==='shade-rejection'?'Invalid pixel shade':null;\n    const success=Boolean(expected&&String(msg.reason).includes(expected));\n    finish(fixture.id,success,'error='+msg.reason);\n  }\n});\nfor(const fixture of fixtures){\n  const iframe=document.createElement('iframe');\n  iframe.setAttribute('sandbox','allow-scripts');\n  iframe.setAttribute('referrerpolicy','no-referrer');\n  iframe.dataset.fixture=fixture.id;\n  iframe.srcdoc=source;\n  iframe.addEventListener('load',()=>diagnostics.push('load:'+fixture.id));\n  document.body.append(iframe);\n}\nsetTimeout(()=>{\n  for(const fixture of fixtures)if(!results.has(fixture.id))finish(fixture.id,false,'no response:'+diagnostics.join('|').slice(0,500));\n},6500);\n";
function chooseChrome():string{
  for(const bin of ['google-chrome','chromium','chromium-browser']){
    const available=spawnSync('which',[bin],{encoding:'utf8'});
    if(available.status===0)return bin;
  }
  throw Error('A headless Chromium binary is required');
}
async function run():Promise<void>{
  const folder=await mkdtemp(join(tmpdir(),'slopboy-browser-'));
  try{
    const file=join(folder,'index.html');
    const javascript=join(folder,'test.js');
    const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'
      +'<pre id="results">pending</pre>'
      +'<script id="fixtures" type="application/json">'+JSON.stringify(FIXTURES)+'</script>'
      +'<script id="sandbox" type="text/plain">'+Buffer.from(SANDBOX_DOCUMENT,'utf8').toString('base64')+'</script>'
      +'<script src="test.js"></script></body></html>';
    await writeFile(file,html);
    await writeFile(javascript,BROWSER_SCRIPT);
    const browser=spawnSync(chooseChrome(),[
      '--headless=new','--no-sandbox','--disable-gpu','--no-first-run',
      '--disable-extensions','--disable-background-networking','--virtual-time-budget=9500',
      '--dump-dom','file://'+file
    ],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
    const output=browser.stdout||'';
    const passed=output.includes('data-result="pass"');
    const report=(output.match(/<pre id="results">([\s\S]*?)<\/pre>/)||[])[1]||'(missing report)';
    console.log('Chromium sandbox regression:',report.replace(/&quot;/g,'"').slice(0,4000));
    if(browser.error||browser.status!==0||!passed)throw Error(
      'Browser regression failed; status='+browser.status+
      ', error='+String(browser.error||'none')+
      ', stderr='+(browser.stderr||'').slice(-1500)
    );
  }finally{await rm(folder,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
