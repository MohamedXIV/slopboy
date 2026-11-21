import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const scripts = {
  artifact: `const {gzipSync}=require('node:zlib');
const fixture = JSON.stringify({schemaVersion:1,kind:'trusted-build-fixture',files:[{path:'example.txt',text:'Slopboy fixture v1\\n'}]});
process.stdout.write(gzipSync(fixture,{level:9}));`,
  crash: 'process.exit(3)',
  timeout: 'setInterval(() => {}, 1000)',
  output_limit: 'process.stdout.write(Buffer.alloc(70000))',
} as const;

const maxOutput = 64 * 1024;
export type FixtureFailure = 'CRASH' | 'TIMEOUT' | 'OUTPUT_LIMIT';
export type FixtureResult =
  | {status:'ready'; bytes:Buffer; sha256:string}
  | {status:'failed'; code:FixtureFailure};

/** Supervisor for repo-owned fixtures. This process boundary is not a sandbox. */
export function runTrustedFixtureChild(fixture: keyof typeof scripts, timeoutMs: number): Promise<FixtureResult> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['-e', scripts[fixture]], {
      env:{}, stdio:['ignore','pipe','ignore'],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: FixtureFailure | undefined;
    const stop = (code: FixtureFailure) => {
      failure ??= code;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop('TIMEOUT'),timeoutMs);
    child.on('error', () => {failure ??= 'CRASH';});
    child.stdout.on('data', (chunk: Buffer) => {
      if (failure) return;
      size += chunk.length;
      if (size > maxOutput) stop('OUTPUT_LIMIT');
      else chunks.push(chunk);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure || code !== 0 || size === 0) {
        resolve({status:'failed',code:failure ?? 'CRASH'});
        return;
      }
      const bytes = Buffer.concat(chunks,size);
      resolve({status:'ready',bytes,sha256:createHash('sha256').update(bytes).digest('hex')});
    });
  });
}

export function produceFixtureArtifact() {
  return runTrustedFixtureChild('artifact',5000);
}
