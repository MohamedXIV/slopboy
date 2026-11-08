/** Execute the real Next.js production runtime for CI's HTTP and Chromium tests.
 * No static HTML emulator, no Vercel SDK and no external credentials.
 */
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {resolve} from 'node:path';

const sleep=(duration:number)=>new Promise<void>(r=>setTimeout(r,duration));
export const BROWSER_RUNTIME_FIXTURE={
  gameId:'c260881a-647d-43c1-bf24-81e7a5902908',
  revisionId:'7400f98c-e2f8-49a9-9c40-400923705580',
  title:'Late-arriving approved fixture',reviewedCartridgeSlug:'tiny-catcher'
};
async function freePort():Promise<number>{
  return new Promise((resolvePort,reject)=>{
    const server=createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string'){server.close();reject(Error('Cannot allocate port'));return;}
      server.close(()=>resolvePort(address.port));
    });
  });
}
export async function startNextTestServer(){
  const port=await freePort();
  const executable=resolve('apps/web/node_modules/next/dist/bin/next');
  const child=spawn(process.execPath,[executable,'start','--hostname','127.0.0.1','--port',String(port)],
    {cwd:resolve('apps/web'),env:{...process.env,
      SLOPBOY_RUNTIME_FIXTURES_JSON:JSON.stringify([BROWSER_RUNTIME_FIXTURE])},stdio:['ignore','pipe','pipe']});
  let errors='';
  child.stdout?.on('data',chunk=>{errors=(errors+String(chunk)).slice(-6500);});
  child.stderr?.on('data',chunk=>{errors=(errors+String(chunk)).slice(-6500);});
  const url='http://127.0.0.1:'+port;
  try{
    const deadline=Date.now()+50000;
    while(Date.now()<deadline){
      if(child.exitCode!==null)throw Error('Next runtime exited prematurely: '+errors);
      try{
        const response=await fetch(url+'/',{signal:AbortSignal.timeout(2500)});
        if(response.ok&&response.headers.get('content-type')?.includes('text/html'))
          return {port,url,stop:()=>stopNextServer(child)};
      }catch{/* Service may still be booting. */}
      await sleep(180);
    }
    throw Error('Next production server did not respond: '+errors);
  }catch(error){child.kill('SIGTERM');throw error;}
}
async function stopNextServer(child:ChildProcess):Promise<void>{
  if(child.exitCode!==null)return;
  await new Promise<void>(resolveStop=>{
    const hard=globalThis.setTimeout(()=>{child.kill('SIGKILL');resolveStop();},3000);
    child.once('exit',()=>{clearTimeout(hard);resolveStop();});
    child.kill('SIGTERM');
  });
}
