import Link from 'next/link';
import {notFound} from 'next/navigation';
import {GAMES,getCatalogGame} from '@slopboy/catalog';
import V2DevicePlayer from '../../../../components/v2/V2DevicePlayer';

export function generateStaticParams(){return GAMES.map(game=>({game:game.id}));}
export default async function V2GamePage({params}:{params:Promise<{game:string}>}){
  const {game:id}=await params;
  if(!getCatalogGame(id))notFound();
  return <V2DevicePlayer key={id} gameId={id}/>;
}
