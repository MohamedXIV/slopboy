import Link from 'next/link';
import {notFound, redirect} from 'next/navigation';
import {isGameUuid} from '@slopboy/catalog';
import SourceHistory from '../../../../../components/ai/SourceHistory';
import {currentSubject} from '../../../../../lib/auth/server';

export const dynamic = 'force-dynamic';
export const metadata = {title: 'Private source history · Slopboy'};

export default async function GameSourceHistory({params}: {params: Promise<{gameId: string}>}) {
  const actor = await currentSubject();
  if (!actor?.emailVerified) redirect('/dashboard');
  const {gameId} = await params;
  if (!isGameUuid(gameId)) notFound();
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
    <div>
      <p className="text-sm font-semibold tracking-widest uppercase">Private game</p>
      <h1 className="text-3xl font-bold">Source version history</h1>
      <p>View earlier versions, load one into the editor, and explicitly save it as a new revision.
        Older revisions remain unchanged.</p>
      <Link href="/dashboard" className="text-sm underline">Back to My Games</Link>
    </div>
    <SourceHistory gameId={gameId}/>
  </main>;
}
