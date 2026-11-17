import {Card} from '@heroui/react';
import {notFound} from 'next/navigation';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '../../../../lib/auth/server';
import {readPlayableGame} from '../../../../server/playable-catalog';
import {readVisibleCatalogGame,catalogDatabaseConfigured} from '../../../../server/catalog-data';
import {V2ActionLink} from '../../../../components/v2/V2RouteControls';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const metadata={title:'Game details · Slopboy',robots:{index:false,follow:false}};

/** Metadata only. No arbitrary build or draft is executed on this route. */
export default async function GameDetails({params}:{params:Promise<{gameId:string}>}){
  const {gameId}=await params;
  if(!isGameUuid(gameId))notFound();
  if(!catalogDatabaseConfigured())return <main className="mx-auto max-w-2xl px-4 py-12">
    <Card><Card.Header><Card.Title>Catalog unavailable</Card.Title>
      <Card.Description>Database-backed game details are not configured here.</Card.Description>
    </Card.Header><Card.Footer>
      <V2ActionLink href="/library" variant="secondary">Back to cartridges</V2ActionLink>
    </Card.Footer></Card>
  </main>;
  const session=await currentSubject();
  let game;
  try{game=await readVisibleCatalogGame(gameId,session?.emailVerified?session.id:null);}
  catch{return <main className="mx-auto max-w-2xl px-4 py-12"><h1>Catalog unavailable</h1><p>Please try again later.</p></main>;}
  if(!game)notFound();
  const playable=await readPlayableGame(gameId).catch(()=>null);
  return <main className="mx-auto max-w-2xl px-4 py-12">
    <Card>
      <Card.Header><Card.Title>{game.title}</Card.Title>
        <Card.Description>{game.tagline??'Game metadata'}</Card.Description>
      </Card.Header>
      <Card.Content>
        <p>{game.description??'No description yet.'}</p>
        <p className="text-sm text-muted">{game.genre} · {game.ownerKind==='platform'?'Slopboy-owned · ':game.isOwner?'Your game · ':''}{game.status} · {game.visibility}</p>
        <p className="text-sm text-muted">{game.revisionId?(game.isOwner?'Latest revision: ':'Published revision: ')+game.revisionId+(game.revisionStatus?' · '+game.revisionStatus:''):'No revision available'}</p>
        <p className="text-xs text-muted">No executable draft or unreviewed cartridge is loaded on this page.</p>
      </Card.Content>
      <Card.Footer>{playable&&<V2ActionLink href={`/play/${playable.gameId}`} variant="primary">Play</V2ActionLink>}<V2ActionLink href="/library" variant="secondary">Back to cartridges</V2ActionLink></Card.Footer>
    </Card>
  </main>;
}
