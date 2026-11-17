'use client';
import {useEffect,useState} from 'react';
import {Button,Card} from '@heroui/react';
import GameManagementForm from './GameManagementForm';
interface Game {id:string;title:string;tagline:string|null;description:string|null;genre:string;status:string;visibility:string;revision_number:number|null;revision_status:string|null}
export default function PlatformGames(){
  const [games,setGames]=useState<Game[]>([]),[status,setStatus]=useState('Loading…');
  const [editing,setEditing]=useState<string|null>(null),[creating,setCreating]=useState(false);
  useEffect(()=>{let active=true;fetch('/api/manage/games',{cache:'no-store'}).then(async response=>{
    if(!response.ok)throw Error('Platform games unavailable or access denied');return response.json();
  }).then(data=>{if(active){setGames(data.games);setStatus('');}}).catch(()=>{if(active)setStatus('Platform games unavailable or access denied');});
  return()=>{active=false;};},[]);
  return <main className="mx-auto max-w-2xl px-4 py-12"><Card><Card.Header><Card.Title>Platform Games</Card.Title>
    <Card.Description>Slopboy-owned games managed by authorized administrators.</Card.Description></Card.Header>
    <Card.Content className="flex flex-col gap-4">{status&&<p role="status">{status}</p>}
      {!status&&<><Button onPress={()=>setCreating(!creating)}>New platform game</Button>
        {creating&&<GameManagementForm platform/>}
        {games.length===0&&<p>No platform games found.</p>}
        {games.map(game=><div key={game.id}><p>{game.title} · {game.status} · {game.visibility}</p>
          <p>{game.revision_number?`Revision ${game.revision_number} · ${game.revision_status}`:'No revisions'}</p>
          <Button variant="secondary" onPress={()=>setEditing(editing===game.id?null:game.id)}>Edit</Button>
          {editing===game.id&&<GameManagementForm key={game.id} gameId={game.id} platform existing={{title:game.title,tagline:game.tagline??'',description:game.description??'',genre:game.genre}}/>}
        </div>)}
      </>}
    </Card.Content></Card></main>;
}
