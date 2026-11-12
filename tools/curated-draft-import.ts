/**
 * Issue #27 Phase 2C: creates a REVIEWABLE SQL script for the three already-
 * attested, explicitly allowlisted pixel-v1 cartridges. Never opens a database
 * or executes SQL itself. Private drafts only; this is not publication approval.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {GAMES} from '../packages/catalog/src/index.ts';
import {SYSTEM_CURATOR_USER_ID} from '../packages/database/src/schema.ts';
import {attestCuratedRelease} from './attest-curated-revisions.ts';
import {immutableCuratedPath,prepareImmutableCuratedAssets}
  from './build-curated-immutable.ts';

const ROOT=resolve(import.meta.dirname,'..');
export const CURATED_IMPORT_REQUIRED_MIGRATION=3;
export const CURATED_STATIC_STORAGE_SCHEME='static-public-v1:';

export interface CuratedDraftImportRow{
  readonly game_id:string;
  readonly revision_id:string;
  readonly legacy_slug:string;
  readonly revision_number:1;
  readonly engine_id:'pixel-v1';
  readonly engine_version:'0.1.0';
  readonly device_profile:string;
  readonly manifest:Record<string,unknown>;
  readonly content_digest:string;
  readonly byte_size:number;
  readonly storage_key:string;
  readonly created_by:string;
  readonly artifact_path:string;
  readonly artifact_sha256:string;
  readonly artifact_byte_size:number;
  readonly artifact_mime_type:'application/octet-stream';
}

export interface CuratedDraftImportPlan{
  readonly schemaVersion:1;
  readonly requiredMigration:3;
  readonly publicationEligible:false;
  readonly writesToDatabase:false;
  readonly revisions:readonly CuratedDraftImportRow[];
}

/** Fails closed if the actual source, existing legacy .slop, or SHA-named copy
 * disagrees with the reviewed SHA-256 lock for any of the three known UUIDs. */
export async function planCuratedDraftImport(rootDir=ROOT):Promise<CuratedDraftImportPlan>{
  const [attested,immutable]=await Promise.all([
    attestCuratedRelease({rootDir,verifyBundled:true}),
    prepareImmutableCuratedAssets({rootDir,mode:'verify'})
  ]);
  if(attested.length!==GAMES.length||immutable.length!==GAMES.length){
    throw Error('Incomplete curated import evidence');
  }
  const revisions:CuratedDraftImportRow[]=attested.map(item=>{
    const source=immutable.find(a=>a.gameId===item.gameId&&a.revisionId===item.revisionId);
    if(!source||source.sha256!==item.contentDigest||source.byteSize!==item.byteSize||
      source.path!==immutableCuratedPath(item.contentDigest)||
      item.intendedStatus!=='draft'){
      throw Error('Unverified immutable cartridge delivery: '+item.legacySlug);
    }
    return {
      game_id:item.gameId,revision_id:item.revisionId,legacy_slug:item.legacySlug,
      revision_number:item.revisionNumber,
      engine_id:item.engineId,engine_version:item.engineVersion,
      device_profile:item.deviceProfile,manifest:item.manifest as unknown as Record<string,unknown>,
      content_digest:item.contentDigest,byte_size:item.byteSize,
      storage_key:CURATED_STATIC_STORAGE_SCHEME+source.path,
      created_by:item.createdBy,artifact_path:item.artifact.path,
      artifact_sha256:item.artifact.sha256,
      artifact_byte_size:item.artifact.byteSize,
      artifact_mime_type:item.artifact.mimeType
    };
  });
  return {schemaVersion:1,requiredMigration:CURATED_IMPORT_REQUIRED_MIGRATION,
    publicationEligible:false,writesToDatabase:false,revisions};
}

/**
 * Emits one fail-closed transaction. Every preexisting fixture must be a
 * system-owned PRIVATE DRAFT. Existing row conflicts are compared byte-for-
 * byte; ON CONFLICT never overwrites an attested revision or its artifact.
 *
 * IMPORTANT: return value is mutation SQL for an explicit separate approval
 * gate. This function never executes it or obtains database credentials.
 */
export function buildCuratedDraftImportSql(plan:CuratedDraftImportPlan):string{
  if(plan.schemaVersion!==1||plan.requiredMigration!==CURATED_IMPORT_REQUIRED_MIGRATION||
    plan.publicationEligible!==false||plan.writesToDatabase!==false||
    plan.revisions.length!==GAMES.length)throw Error('Invalid private draft import plan');
  const games=new Set<string>();
  const revisions=new Set<string>();
  for(const row of plan.revisions){
    const fixture=GAMES.find(g=>g.gameId===row.game_id&&g.revisionId===row.revision_id&&
      g.legacySlug===row.legacy_slug);
    if(!fixture||games.has(row.game_id)||revisions.has(row.revision_id)||
      row.revision_number!==1||row.engine_id!=='pixel-v1'||row.engine_version!=='0.1.0'||
      row.device_profile!==fixture.hardware.id||row.created_by!==SYSTEM_CURATOR_USER_ID||
      !/^[0-9a-f]{64}$/.test(row.content_digest)||
      row.content_digest!==row.artifact_sha256||
      !Number.isSafeInteger(row.byte_size)||row.byte_size<=0||
      row.artifact_byte_size!==row.byte_size||
      row.artifact_path!==row.legacy_slug+'.slop'||
      row.artifact_mime_type!=='application/octet-stream'||
      row.storage_key!==CURATED_STATIC_STORAGE_SCHEME+immutableCuratedPath(row.content_digest)){
      throw Error('Invalid curated draft import row');
    }
    games.add(row.game_id);revisions.add(row.revision_id);
  }
  // SQL-quote the full JSON payload, never interpolate individual identifiers.
  // Rows are already derived from reviewed, byte-verified local artifacts.
  const dataLiteral="'"+JSON.stringify(plan.revisions).replaceAll("'","''")+"'";
  return [
    '-- Issue #27: explicitly gated PRIVATE DRAFT import (never auto-run).',
    '-- Requires checked-in migration 003, reviewed static artifacts and a backup.',
    'BEGIN;',
    "SET LOCAL lock_timeout = '3s';",
    "SET LOCAL statement_timeout = '20s';",
    'SELECT pg_advisory_xact_lock(27027, 2);',
    'DO $curated_import$',
    'DECLARE item RECORD;',
    'BEGIN',
    "  IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE version=3 AND name='versioned_installations') THEN",
    "    RAISE EXCEPTION 'Curated import requires applied migration 003' USING ERRCODE='23514';",
    '  END IF;',
    '  FOR item IN',
    '    SELECT * FROM jsonb_to_recordset('+dataLiteral+'::jsonb) AS rows(',
    '      game_id uuid,revision_id uuid,legacy_slug text,revision_number integer,',
    '      engine_id text,engine_version text,device_profile text,manifest jsonb,',
    '      content_digest text,byte_size integer,storage_key text,created_by uuid,',
    '      artifact_path text,artifact_sha256 text,artifact_byte_size integer,',
    '      artifact_mime_type text)',
    '  LOOP',
    '    IF NOT EXISTS (SELECT 1 FROM public.games g WHERE g.id=item.game_id',
    "       AND g.owner_id=item.created_by AND g.legacy_slug=item.legacy_slug",
    "       AND g.visibility='private' AND g.status='draft'",
    '       AND g.current_published_revision_id IS NULL) THEN',
    "      RAISE EXCEPTION 'Curated game changed owner or release state: %',item.game_id USING ERRCODE='23514';",
    '    END IF;',
    '    -- Lock the game row against concurrent promotion during the import.',
    '    PERFORM 1 FROM public.games WHERE id=item.game_id FOR UPDATE;',
    '    INSERT INTO public.game_revisions',
    '      (id,game_id,revision_number,release_version,engine_id,engine_version,',
    '       device_profile,manifest,content_digest,storage_key,byte_size,status,created_by)',
    '    VALUES (item.revision_id,item.game_id,item.revision_number,NULL,item.engine_id,',
    '      item.engine_version,item.device_profile,item.manifest,item.content_digest,',
    "      item.storage_key,item.byte_size,'draft',item.created_by)",
    '    ON CONFLICT (id) DO NOTHING;',
    '    IF NOT EXISTS (SELECT 1 FROM public.game_revisions r',
    '      WHERE r.id=item.revision_id AND r.game_id=item.game_id',
    '        AND r.revision_number=item.revision_number AND r.release_version IS NULL',
    '        AND r.engine_id=item.engine_id AND r.engine_version=item.engine_version',
    '        AND r.device_profile=item.device_profile AND r.manifest=item.manifest',
    '        AND r.content_digest=item.content_digest AND r.storage_key=item.storage_key',
    "        AND r.byte_size=item.byte_size AND r.status='draft' AND r.created_by=item.created_by) THEN",
    "      RAISE EXCEPTION 'Conflicting immutable curated revision: %',item.revision_id USING ERRCODE='23514';",
    '    END IF;',
    '    INSERT INTO public.cartridge_artifacts',
    '      (revision_id,artifact_type,path,sha256,byte_size,mime_type,storage_key)',
    "    VALUES (item.revision_id,'bundle',item.artifact_path,item.artifact_sha256,",
    '      item.artifact_byte_size,item.artifact_mime_type,item.storage_key)',
    '    ON CONFLICT (revision_id,path) DO NOTHING;',
    '    IF (SELECT count(*) FROM public.cartridge_artifacts WHERE revision_id=item.revision_id)<>1',
    '      OR NOT EXISTS (SELECT 1 FROM public.cartridge_artifacts a',
    "        WHERE a.revision_id=item.revision_id AND a.artifact_type='bundle'",
    '          AND a.path=item.artifact_path AND a.sha256=item.artifact_sha256',
    '          AND a.byte_size=item.artifact_byte_size',
    '          AND a.mime_type=item.artifact_mime_type',
    '          AND a.storage_key=item.storage_key) THEN',
    "      RAISE EXCEPTION 'Conflicting or extra curated cartridge artifacts: %',item.revision_id USING ERRCODE='23514';",
    '    END IF;',
    '  END LOOP;',
    'END',
    '$curated_import$;',
    'COMMIT;',
    ''
  ].join('\n');
}

async function main():Promise<void>{
  const args=process.argv.slice(2);
  if(args.length!==1||!['--plan','--sql'].includes(args[0])){
    throw Error('Usage: curated-draft-import.ts --plan|--sql (never executes SQL)');
  }
  const plan=await planCuratedDraftImport();
  if(args[0]==='--plan')console.log(JSON.stringify(plan,null,2));
  else process.stdout.write(buildCuratedDraftImportSql(plan));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
