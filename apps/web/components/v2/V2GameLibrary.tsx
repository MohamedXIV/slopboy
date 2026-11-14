'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Button,Card} from '@heroui/react';
import {listOfflineGames,type InstalledGame} from './offline-install';
import V2CartridgeArt from './V2CartridgeArt';
import LocalGameSaves from './LocalGameSaves';
import {listLocalSaveGameIds} from './local-save-discovery';
import OfflineInstallControl from './OfflineInstallControl';
import './v2-library.css';

type Game={id:string;title:string;description:string|null;genre:string};
export default function V2GameLibrary(){
  const [games,setGames]=useState<Game[]>([]),[offline,setOffline]=useState<InstalledGame[]>([]);
  const [cursor,setCursor]=useState<string|null>(null),[state,setState]=useState('Loading public games…');
  const [offlineState,setOfflineState]=useState('Checking this device…');
  const [savedIds,setSavedIds]=useState<string[]>([]);
  const [myGames,setMyGames]=useState<Game[]|null>(null),[libraryError,setLibraryError]=useState('');
  async function load(next?:string){
    try{
      const response=await fetch('/api/games?limit=24'+(next?'&cursor='+encodeURIComponent(next):''),{cache:'no-store'});
      if(!response.ok)throw Error('Catalog unavailable');
      const data=await response.json() as {games:Game[];nextCursor:string|null};
      setGames(previous=>next?[...previous,...data.games]:data.games);setCursor(data.nextCursor);setState('');
    }catch{setState('Public catalog is unavailable. Please try again later.');}
  }
  async function refreshLibrary(){
    try{const response=await fetch('/api/account/library',{cache:'no-store'});
      if(response.status===401){setMyGames(null);return;}
      if(!response.ok)throw Error();const data=await response.json();setMyGames(data.games);setLibraryError('');
    }catch{setLibraryError('Account library unavailable.');}
  }
  async function addGame(gameId:string){
    try{const response=await fetch('/api/account/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId})});
      if(response.status===401){setLibraryError('Sign in to add games to your library.');return;}
      if(!response.ok)throw Error();await refreshLibrary();
    }catch{setLibraryError('Could not add game to your library.');}
  }
  useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;void load();void refreshLibrary();
    listLocalSaveGameIds().then(ids=>{if(active)setSavedIds(ids);}).catch(()=>{});
    listOfflineGames().then(items=>{if(active){setOffline(items);setOfflineState('');}})
      .catch(()=>{if(active)setOfflineState('Offline installation status is unavailable.');});});
    return()=>{active=false;};},[]);
  return <main className="v2-library"><div className="v2-library-inner">
    <h1>Game library</h1><p>Discover reviewed public games and find games installed on this device.</p>
    <section aria-labelledby="public-games"><h2 id="public-games">Public games</h2>
      {state&&<p role="status">{state}</p>}
      {!state&&games.length===0&&<p>No public games are available yet.</p>}
      <div className="v2-cart-grid">{games.map((game,index)=><Card key={game.id}>
        <V2CartridgeArt id={game.id} title={game.title} emblem="◆" index={index}/>
        <Card.Header><Card.Title>{game.title}</Card.Title><Card.Description>{game.genre} · {game.description??' '}</Card.Description></Card.Header>
        <Card.Footer><Link href={'/games/'+game.id}>View game</Link><Button size="sm" onPress={()=>void addGame(game.id)}>Add to My Library</Button><OfflineInstallControl gameId={game.id}/></Card.Footer>
      </Card>)}</div>
      {cursor&&<Button variant="secondary" onPress={()=>void load(cursor)}>Load more</Button>}
    </section>
    <section aria-labelledby="my-games"><h2 id="my-games">My Library</h2>
      {libraryError&&<p role="status">{libraryError}</p>}
      {myGames===null?<p><Link href="/auth/sign-in">Sign in</Link> to view your account library.</p>:
        myGames.length===0?<p>Your library is empty.</p>:<ul>{myGames.map(game=><li key={game.id}><Link href={'/games/'+game.id}>{game.title}</Link></li>)}</ul>}
    </section>
    <section aria-labelledby="local-games"><h2 id="local-games">Installed on this device</h2>
      {offlineState&&<p role="status">{offlineState}</p>}
      {!offlineState&&offline.length===0&&<p>No games are installed on this device.</p>}
      <ul>{offline.map(game=><li key={game.gameId}><a href={'/play/'+game.gameId}>{game.title}</a><LocalGameSaves gameId={game.gameId}/></li>)}</ul>
      <p>Local saves stay on this device.</p>
      {savedIds.filter(id=>!offline.some(game=>game.gameId===id)).map(id=><div key={id}>
        <p>Local save · {id}</p><LocalGameSaves gameId={id}/></div>)}
    </section>
  </div></main>;
}
