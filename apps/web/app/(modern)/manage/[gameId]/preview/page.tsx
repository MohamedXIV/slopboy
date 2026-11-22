import Link from 'next/link';
import {notFound} from 'next/navigation';
import ProceduralDemo from '@/components/v2/ProceduralDemo';
import {currentSubject} from '@/lib/auth/server';
import {readTrustedPreviewGame} from '@/server/game-management';
import {trustedOwnerPreview, trustedOwnerPreviewEnabled} from '@/server/trusted-owner-preview';

export const dynamic = 'force-dynamic';
export const metadata = {title:'Trusted preview · Slopboy',robots:{index:false,follow:false}};

export default async function TrustedPreviewPage({params}:{params:Promise<{gameId:string}>}) {
  if (!trustedOwnerPreviewEnabled()) notFound();
  const {gameId} = await params;
  const game = await trustedOwnerPreview(true,await currentSubject(),gameId,readTrustedPreviewGame);
  if (!game) notFound();

  return <main className="mx-auto max-w-xl space-y-4 px-4 py-12">
    <Link className="underline" href="/dashboard">Back to My Games</Link>
    <h1 className="text-3xl font-bold">{game.title}</h1>
    <p>This preview runs a built-in demo. Your draft code stays saved privately.</p>
    <ProceduralDemo key={game.saveKey} saveKey={game.saveKey}/>
  </main>;
}
