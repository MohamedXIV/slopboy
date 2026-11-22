import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '@/lib/auth/server';
import StagedProject from '@/components/ai/StagedProject';

export const dynamic = 'force-dynamic';

export default async function ArtifactsPage({params}: {params: Promise<{gameId:string}>}) {
  if (process.env.STAGED_ARTIFACTS_ENABLED !== '1') notFound();
  if (!(await currentSubject())?.emailVerified) redirect('/auth/sign-in');
  const {gameId} = await params;
  if (!isGameUuid(gameId)) notFound();
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-12">
    <Link className="underline" href={`/manage/${gameId}`}>Back to Manage</Link>
    <h1 className="text-3xl font-bold">Private project files</h1>
    <StagedProject gameId={gameId}/>
  </main>;
}
