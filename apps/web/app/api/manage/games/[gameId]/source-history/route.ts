import {NextRequest, NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '../../../../../../lib/auth/server';
import {PLATFORM_OWNER_ID} from '../../../../../../server/game-ownership';
import {LIST_SOURCE_HISTORY_SQL, READ_SOURCE_REVISION_SQL, sourceHistoryItems,
  type SourceHistoryRow} from '../../../../../../server/source-history-queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
const failure = (error: string, status: number) => NextResponse.json({error}, {status, headers});

/** Never use this read endpoint to compile, execute, preview or publish source. */
export async function GET(request: NextRequest, {params}: {params: Promise<{gameId: string}>}) {
  const actor = await currentSubject();
  if (!actor) return failure('UNAUTHENTICATED', 401);
  if (!actor.emailVerified) return failure('FORBIDDEN', 403);
  const {gameId} = await params;
  if (!isGameUuid(gameId)) return failure('NOT_FOUND', 404);
  const revisionId = request.nextUrl.searchParams.get('revision');
  if (revisionId !== null && !isGameUuid(revisionId)) return failure('NOT_FOUND', 404);
  if (!process.env.DATABASE_URL) return failure('DATABASE_UNAVAILABLE', 503);

  try {
    const sql = neon(process.env.DATABASE_URL);
    if (revisionId) {
      const rows = await sql.query(READ_SOURCE_REVISION_SQL,
        [actor.id, gameId, PLATFORM_OWNER_ID, revisionId]);
      if (!rows.length) return failure('NOT_FOUND', 404);
      const row = rows[0];
      return NextResponse.json({revision: {
        id: row.id, language: row.language, source: row.source_text,
        checksum: row.source_digest, createdAt: row.created_at,
        validated: row.engine_manifest !== null,
      }}, {headers});
    }
    const rows = await sql.query(LIST_SOURCE_HISTORY_SQL, [actor.id, gameId, PLATFORM_OWNER_ID]);
    if (!rows.length) return failure('NOT_FOUND', 404);
    return NextResponse.json({revisions: sourceHistoryItems(rows as SourceHistoryRow[])}, {headers});
  } catch {
    // Never leak private SQL/source/database provider errors to the browser or logs.
    return failure('DATABASE_UNAVAILABLE', 503);
  }
}
