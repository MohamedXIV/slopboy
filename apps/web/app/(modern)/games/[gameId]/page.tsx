import {Card} from '@heroui/react';
import {notFound} from 'next/navigation';
import {isGameUuid} from '@slopboy/catalog';
import {currentSubject} from '../../../../lib/auth/server';
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
  const game=await readVisibleCatalogGame(gameId,session?.emailVerified?session.id:null).catch(()=>null);
  if(!game)notFound();
  return <main className="mx-auto max-w-2xl px-4 py-12">
    <Card>
      <Card.Header><Card.Title>{game.title}</Card.Title>
        <Card.Description>{game.tagline??'Game metadata'}</Card.Description>
      </Card.Header>
      <Card.Content>
        <p>{game.description??'No description yet.'}</p>
        <p className="text-sm text-muted">{game.genre} · {game.isOwner?'Your game · ':''}{game.status} · {game.visibility}</p>
        <p className="text-sm text-muted">{game.revisionId?'Revision metadata available':'No published revision available'}</p>
        <p className="text-xs text-muted">No executable draft or unreviewed cartridge is loaded on this page.</p>
      </Card.Content>
      <Card.Footer><V2ActionLink href="/library" variant="secondary">Back to cartridges</V2ActionLink></Card.Footer>
    </Card>
  </main>;
}
