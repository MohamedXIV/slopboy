/** Execute the real Next.js production runtime for CI's HTTP and Chromium tests.
 * No static HTML emulator, no Vercel SDK and no external credentials.
 */
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {resolve} from 'node:path';

const sleep=(duration:number)=>new Promise<void>(r=>setTimeout(r,duration));
import {startTestDatabase,BROWSER_RUNTIME_FIXTURE,MANUAL_SAVE_FIXTURE} from './next-test-database.ts';
export {BROWSER_RUNTIME_FIXTURE,MANUAL_SAVE_FIXTURE};
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
export async function startNextTestServer(requestedPort?:number,options:{database?:boolean}={}){
  const port=requestedPort??await freePort();
  // Each cluster listens only on its private Unix socket, so no TCP port is bound.
  const database=options.database===false?null:await startTestDatabase(5432);
  const executable=resolve('apps/web/node_modules/next/dist/bin/next');
  const child=spawn(process.execPath,[executable,'start','--hostname','127.0.0.1','--port',String(port)],
    {cwd:resolve('apps/web'),env:{...process.env,NEON_AUTH_BASE_URL:'',NEON_AUTH_COOKIE_SECRET:'',
      DATABASE_URL:'',...database?.env},stdio:['ignore','pipe','pipe']});
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
          return {port,url,privateDigest:database?.privateDigest,setViewAccess:database?.setViewAccess,
            setPrivatePublished:database?.setPrivatePublished,publishManualFixture:database?.publishManualFixture,logs:()=>errors,stop:async()=>{await stopNextServer(child);await database?.stop();}};
      }catch{/* Service may still be booting. */}
      await sleep(180);
    }
    throw Error('Next production server did not respond: '+errors);
  }catch(error){child.kill('SIGTERM');await database?.stop();throw error;}
}
async function stopNextServer(child:ChildProcess):Promise<void>{
  if(child.exitCode!==null)return;
  await new Promise<void>(resolveStop=>{
    const hard=globalThis.setTimeout(()=>{child.kill('SIGKILL');resolveStop();},3000);
    child.once('exit',()=>{clearTimeout(hard);resolveStop();});
    child.kill('SIGTERM');
  });
}
