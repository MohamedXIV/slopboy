/** Disposable PostgreSQL fixtures for the actual Next runtime smoke tests.
 * All publication changes here are confined to the temporary local cluster. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {migrateUp,executePsql} from '../packages/database/src/migrator.ts';
import {planCuratedDraftImport,buildCuratedDraftImportSql} from './curated-draft-import.ts';
import {GAMES} from '../packages/catalog/src/index.ts';
const run=promisify(execFile);
export const BROWSER_RUNTIME_FIXTURE={gameId:'c260881a-647d-43c1-bf24-81e7a5902908',
  revisionId:'7400f98c-e2f8-49a9-9c40-400923705580',title:'Late-arriving approved fixture',reviewedCartridgeSlug:'tiny-catcher'};
export async function startTestDatabase(port:number){
  const root=process.env.SLOPBOY_PG_BIN_DIR?null:'/usr/lib/postgresql';
  const versions=root?await readdir(root).catch(()=>[]):[];
  const latest=versions.filter(v=>/^\d+$/.test(v)).sort((a,b)=>Number(b)-Number(a))[0];
  const bin=process.env.SLOPBOY_PG_BIN_DIR??(latest?join(root!,latest,'bin'):null);
  if(!bin)throw Error('PostgreSQL binaries required for database-backed runtime tests');
  const directory=await mkdtemp(join(tmpdir(),'slopboy-runtime-db-')),data=join(directory,'data');
  const privateBytes=gzipSync(randomBytes(96)),privateDigest=createHash('sha256').update(privateBytes).digest('hex');
  const privateFile=resolve('apps/web/private/cartridges/by-sha256',privateDigest+'.slop');
  const env={...process.env,PATH:bin+':'+process.env.PATH};
  const config={host:directory,port,user:'slopboy_test',database:'postgres'};
  let started=false,privateFileCreated=false;
  try{
    await writeFile(privateFile,privateBytes,{flag:'wx'});
    privateFileCreated=true;
    await run(join(bin,'initdb'),['-D',data,'-A','trust','-U','slopboy_test','--no-locale','-E','UTF8'],{env});
    await run(join(bin,'pg_ctl'),['-D',data,'-o',`-k ${directory} -p ${port} -c listen_addresses=`, '-l',join(directory,'postgres.log'),'start'],{env});started=true;
    const previous=process.env.PATH;process.env.PATH=env.PATH;
    try{
      await migrateUp(config,resolve('packages/database/migrations'));
      await executePsql(config,{sql:buildCuratedDraftImportSql(await planCuratedDraftImport())});
      await executePsql(config,{sql:`
        UPDATE game_revisions SET status='published' WHERE id IN (${GAMES.map(g=>`'${g.revisionId}'`).join(',')});
        UPDATE games SET visibility='public',status='published',current_published_revision_id=CASE id
          ${GAMES.map(g=>`WHEN '${g.gameId}'::uuid THEN '${g.revisionId}'::uuid`).join('\n')} END
          WHERE id IN (${GAMES.map(g=>`'${g.gameId}'`).join(',')});
        INSERT INTO games(id,owner_id,title,genre) SELECT '${BROWSER_RUNTIME_FIXTURE.gameId}',owner_id,'${BROWSER_RUNTIME_FIXTURE.title}',genre
          FROM games WHERE id='${GAMES[0].gameId}';
        INSERT INTO game_revisions(id,game_id,revision_number,engine_id,engine_version,device_profile,manifest,content_digest,storage_key,byte_size,status,created_by)
          SELECT '${BROWSER_RUNTIME_FIXTURE.revisionId}','${BROWSER_RUNTIME_FIXTURE.gameId}',1,engine_id,engine_version,device_profile,manifest,content_digest,storage_key,byte_size,'published',created_by
          FROM game_revisions WHERE id='${GAMES[0].revisionId}';
        INSERT INTO cartridge_artifacts(revision_id,artifact_type,path,sha256,byte_size,mime_type,storage_key)
          SELECT '${BROWSER_RUNTIME_FIXTURE.revisionId}',artifact_type,path,sha256,byte_size,mime_type,storage_key
          FROM cartridge_artifacts WHERE revision_id='${GAMES[0].revisionId}';
        INSERT INTO games(id,owner_id,title,genre) SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner_id,'Private draft','Puzzle'
          FROM games WHERE id='${GAMES[0].gameId}';
        INSERT INTO game_revisions(id,game_id,revision_number,engine_id,engine_version,device_profile,manifest,content_digest,storage_key,byte_size,status,created_by)
          SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,engine_id,engine_version,device_profile,manifest,
            '${privateDigest}','static-public-v1:/cartridges/by-sha256/${privateDigest}.slop',${privateBytes.byteLength},'draft',created_by
          FROM game_revisions WHERE id='${GAMES[0].revisionId}';
        INSERT INTO cartridge_artifacts(revision_id,artifact_type,path,sha256,byte_size,mime_type,storage_key)
          VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bundle','private.slop','${privateDigest}',${privateBytes.byteLength},'application/octet-stream',
            'static-public-v1:/cartridges/by-sha256/${privateDigest}.slop');
        UPDATE games SET visibility='public',status='published',current_published_revision_id='${BROWSER_RUNTIME_FIXTURE.revisionId}'
          WHERE id='${BROWSER_RUNTIME_FIXTURE.gameId}';
        CREATE ROLE slopboy_runtime LOGIN;
        GRANT SELECT(id,owner_id,title,tagline,description,genre,visibility,status,created_at,updated_at,current_published_revision_id)
          ON public.games TO slopboy_runtime;
        GRANT SELECT(id,game_id,status,engine_id,engine_version,device_profile) ON public.game_revisions TO slopboy_runtime;
        GRANT SELECT(id) ON public.users TO slopboy_runtime;
        GRANT SELECT ON public.published_playable_games TO slopboy_runtime;
      `});
    }finally{process.env.PATH=previous;}
    let stopped=false;
    const adminSql=async(sql:string)=>{await run(join(bin,'psql'),['-X','-q','-v','ON_ERROR_STOP=1',
      '-h',directory,'-p',String(port),'-U','slopboy_test','postgres','-c',sql],{env});};
    return {privateDigest,
      setViewAccess:async(enabled:boolean)=>adminSql(`${enabled?'GRANT SELECT ON':'REVOKE SELECT ON'} public.published_playable_games ${enabled?'TO':'FROM'} slopboy_runtime`),
      setPrivatePublished:async(published:boolean)=>adminSql(published?`
        UPDATE game_revisions SET status='published' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        UPDATE games SET visibility='public',status='published',current_published_revision_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`:`
        UPDATE games SET visibility='private',status='draft',current_published_revision_id=NULL WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        UPDATE game_revisions SET status='draft' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';`),
      env:{DATABASE_URL:'postgresql://fixture:fixture@db.sql-test.invalid/fixture',
      SLOPBOY_TEST_SOCKET:directory,SLOPBOY_TEST_PG_PORT:String(port),SLOPBOY_TEST_PSQL:join(bin,'psql'),
      NODE_OPTIONS:`${process.env.NODE_OPTIONS??''} --import=${resolve('tools/test-neon-fetch.mjs')}`.trim()},
      stop:async()=>{if(stopped)return;stopped=true;try{await run(join(bin,'pg_ctl'),['-D',data,'stop','-m','immediate'],{env});}
        finally{await rm(directory,{recursive:true,force:true});await rm(privateFile,{force:true});}}};
  }catch(error){if(started)await run(join(bin,'pg_ctl'),['-D',data,'stop','-m','immediate'],{env}).catch(()=>{});await rm(directory,{recursive:true,force:true});if(privateFileCreated)await rm(privateFile,{force:true});throw error;}
}
