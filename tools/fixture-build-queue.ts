import {executePsql,type DatabaseConnectionConfig} from '../packages/database/src/migrator.ts';
import {produceFixtureArtifact,type FixtureResult} from './fixture-build-worker.ts';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function uuidLiteral(value: string) {
  if (!uuid.test(value)) throw new Error('Expected a UUID');
  return `'${value.toLowerCase()}'::uuid`;
}

async function query(config: DatabaseConnectionConfig, sql: string) {
  return (await executePsql(config,{sql})).stdout.trim();
}

export async function enqueueFixture(config: DatabaseConnectionConfig, key: string) {
  const request = uuidLiteral(key);
  await query(config,`INSERT INTO public.fixture_build_jobs(request_key,fixture)
    VALUES (${request},'trusted-fixture-v1') ON CONFLICT(request_key) DO NOTHING`);
  return fixtureStatus(config,key);
}

export async function fixtureStatus(config: DatabaseConnectionConfig, key: string) {
  const row = await query(config,`SELECT json_build_object('id',id,'status',status,'attempts',attempts,
    'sha256',artifact_sha256,'error',error_code) FROM public.fixture_build_jobs
    WHERE request_key=${uuidLiteral(key)}`);
  return row ? JSON.parse(row) as {id:string; status:string; attempts:number; sha256:string|null; error:string|null} : null;
}

export async function claimFixture(config: DatabaseConnectionConfig) {
  const row = await query(config,'SELECT id,lease FROM public.claim_fixture_build_job()');
  if (!row) return null;
  const [id,lease] = row.split('|');
  return {id,lease:lease || null};
}

export async function finishFixture(config: DatabaseConnectionConfig, id: string, lease: string, result: FixtureResult) {
  const outcome = result.status === 'ready'
    ? `status='ready',artifact=decode('${result.bytes.toString('hex')}','hex'),error_code=NULL`
    : `status=CASE WHEN attempts=3 THEN 'failed' ELSE 'queued' END,error_code='${result.code}'`;
  const row = await query(config,`WITH completed AS (
    UPDATE public.fixture_build_jobs SET ${outcome},lease=NULL,lease_until=NULL
    WHERE id=${uuidLiteral(id)} AND lease=${uuidLiteral(lease)}
      AND status='running' AND lease_until>clock_timestamp()
    RETURNING status,artifact_sha256
  ) SELECT json_build_object('status',status,'sha256',artifact_sha256) FROM completed`);
  return row ? JSON.parse(row) as {status:string; sha256:string|null} : null;
}

export async function runNextFixtureBuild(config: DatabaseConnectionConfig, produce = produceFixtureArtifact) {
  const job = await claimFixture(config);
  if (!job) return {status:'idle'};
  if (!job.lease) return {id:job.id,status:'failed',error:'LEASE_EXPIRED'};
  const result = await produce().catch((): FixtureResult => ({status:'failed',code:'CRASH'}));
  const completion = await finishFixture(config,job.id,job.lease,result);
  return {id:job.id,status:completion?.status ?? 'lease_lost',sha256:completion?.sha256 ?? null};
}
