/**
 * Small dependency-free Chrome DevTools Protocol runner for security smoke tests.
 * Runs a single browser page using real wall-clock time; virtual time breaks
 * some iframe/Worker task scheduling and must not be used for these tests.
 */
import {spawn,spawnSync, type ChildProcess} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function chromeBinary():string{
  for(const bin of ['google-chrome','chromium','chromium-browser']){
    if(spawnSync('which',[bin],{encoding:'utf8'}).status===0)return bin;
  }
  throw Error('Chrome/Chromium binary not available on this runner');
}
interface CdpResponse { id?:number; sessionId?:string; result?:Record<string,unknown>; error?:{message:string} }
export async function openChromePage(url:string,profile:string){
  const process=spawn(chromeBinary(),[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-extensions','--disable-background-networking','--no-first-run',
    '--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,
    'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  let stderr='';
  let launchError='';
  process.stderr?.on('data',data=>{stderr=(stderr+String(data)).slice(-2000);});
  process.on('error',error=>{launchError=error.message;});
  let socket:WebSocket|undefined;
  try{
    let endpoint:string|undefined;
    // Chrome on shared CI hosts may need more than 9s to initialize its
    // sandbox/profile. Bound the startup by wall time and preserve diagnostics.
    const deadline=Date.now()+30000;
    while(Date.now()<deadline){
      if(launchError)throw Error('Chrome launch failed: '+launchError);
      if(process.exitCode!==null)throw Error('Chrome exited before DevTools opened: '+stderr);
      try{
        const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/);
        if(/^\d+$/.test(lines[0]) && lines[1]?.startsWith('/devtools/browser/')){
          endpoint='ws://127.0.0.1:'+lines[0]+lines[1];break;
        }
      }catch{}
      await sleep(50);
    }
    if(!endpoint)throw Error('Chrome DevTools socket did not become ready within 30s: '+(stderr||'no Chrome diagnostics'));
    socket=new WebSocket(endpoint);
    await new Promise<void>((resolve,reject)=>{
      socket!.addEventListener('open',()=>resolve(),{once:true});
      socket!.addEventListener('error',()=>reject(Error('Chrome WebSocket failed')),{once:true});
    });
    const pending=new Map<number,{resolve:(v:Record<string,unknown>)=>void;reject:(e:Error)=>void}>();
    let sequence=0;
    socket.addEventListener('message',e=>{
      let packet:CdpResponse;
      try{packet=JSON.parse(String(e.data)) as CdpResponse;}catch{return;}
      if(typeof packet.id!=='number')return;
      const task=pending.get(packet.id);
      if(!task)return;
      pending.delete(packet.id);
      if(packet.error)task.reject(Error('CDP '+packet.error.message));
      else task.resolve(packet.result||{});
    });
    const send=(method:string,params:Record<string,unknown>={},sessionId?:string)=>new Promise<Record<string,unknown>>((resolve,reject)=>{
      const id=++sequence;
      pending.set(id,{resolve,reject});
      socket!.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
    const created=await send('Target.createTarget',{url});
    const targetId=created.targetId;
    if(typeof targetId!=='string')throw Error('Chrome did not create browser page');
    const attached=await send('Target.attachToTarget',{targetId,flatten:true});
    const sessionId=attached.sessionId;
    if(typeof sessionId!=='string')throw Error('Chrome did not attach browser page');
    const validatedSessionId=sessionId;
    await send('Runtime.enable',{},validatedSessionId);
    async function evaluate(expression:string):Promise<unknown>{
      const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:false},validatedSessionId);
      const result=response.result as Record<string,unknown>|undefined;
      if(!result||!('value' in result))return null;
      return result.value;
    }
    async function setViewport(width:number,height:number){
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<240||height<240)
        throw Error('Invalid Chrome viewport');
      await send('Emulation.setDeviceMetricsOverride',
        {width,height,deviceScaleFactor:1,mobile:width<=760},validatedSessionId);
    }
    async function setOffline(value:boolean){
      await send('Network.enable',{},validatedSessionId);
      await send('Network.emulateNetworkConditions',{offline:value,latency:0,
        downloadThroughput:0,uploadThroughput:0},validatedSessionId);
    }
    return {evaluate,setViewport,setOffline,close:()=>{
      socket?.close();
      process.kill('SIGTERM');
    }};
  }catch(e){
    socket?.close();
    process.kill('SIGTERM');
    throw e;
  }
}
