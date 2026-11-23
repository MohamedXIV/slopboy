'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Button} from '@heroui/react';
import {listOfflineGames,type InstalledGame} from './offline-install';
import {listLocalSaveGameIds} from './local-save-discovery';
import LocalGameSaves from './LocalGameSaves';
import CloudGameBackups from './CloudGameBackups';
import {getBrowserHistory,formatActiveTime,type GameHistory} from './library-history';
import V2CartridgeArt from './V2CartridgeArt';
import {useV2Theme} from './V2AppShell';
import {listLocalSnapshots,saveLocalSnapshot,restoreLocalSnapshot,deleteLocalSnapshot,LOCAL_SNAPSHOT_SLOTS,
  type LocalSnapshot} from './local-save-slots';
import OfflineInstallControl from './OfflineInstallControl';
import './v2-library.css';

type PublicGame={gameId:string;title:string;genre:string;description:string;playable:boolean};
type CatalogRow={id:string;title:string;genre:string;description:string|null};
export default function V2GameLibrary({cloudBackupsEnabled}:{cloudBackupsEnabled:boolean}){
  const [games,setGames]=useState<PublicGame[]>([]),[offline,setOffline]=useState<InstalledGame[]>([]);
  const [savedIds,setSavedIds]=useState<string[]>([]),[myGames,setMyGames]=useState<CatalogRow[]|null|undefined>(undefined);
  const [offlineState,setOfflineState]=useState('Checking installed games…');
  const [saveState,setSaveState]=useState('Checking local saves…');
  const [catalogState,setCatalogState]=useState('Loading public games…'),[libraryError,setLibraryError]=useState('');
  const [cursor,setCursor]=useState<string|null>(null);
  const [history,setHistory]=useState<Record<string,GameHistory>>({});
  const [snapshots,setSnapshots]=useState<Record<string,LocalSnapshot[]>>({});
  const [openSaves,setOpenSaves]=useState<string|null>(null);
  const [pending,setPending]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const {theme}=useV2Theme();
  async function loadCatalog(next?:string){
    try{
      const response=await fetch('/api/games?limit=24'+(next?'&cursor='+encodeURIComponent(next):''),{cache:'no-store'});
      if(!response.ok)throw Error();
      const data=await response.json() as {games:CatalogRow[];nextCursor:string|null};
      const results=await Promise.all(data.games.map(async item=>{
        let playable=false;try{playable=(await fetch('/api/public-games/'+item.id,{cache:'no-store'})).ok;}catch{}
        return {gameId:item.id,title:item.title,genre:item.genre,description:item.description??'',playable};
      }));
      setGames(previous=>next?[...previous,...results]:results);setCursor(data.nextCursor);setCatalogState('');
    }catch{setCatalogState('Public catalog is unavailable. Please try again later.');}
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
  async function refreshOffline(){
    try{setOffline(await listOfflineGames());setOfflineState('');}
    catch{setOfflineState('Offline installation status is unavailable.');}
  }
  useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;void loadCatalog();void refreshLibrary();
    listLocalSaveGameIds().then(ids=>{if(active){setSavedIds(ids);setSaveState('');}})
      .catch(()=>{if(active)setSaveState('Local save status is unavailable.');});
    listOfflineGames().then(items=>{if(active){setOffline(items);setOfflineState('');}})
      .catch(()=>{if(active)setOfflineState('Offline installation status is unavailable.');});
  });return()=>{active=false;};},[]);
  useEffect(()=>{
    const handle=requestAnimationFrame(()=>{
      const records:Record<string,GameHistory>={};
      for(const game of games)records[game.gameId]=getBrowserHistory(game.gameId);
      setHistory(records);
    });
    return()=>cancelAnimationFrame(handle);
  },[games]);
  async function expandSaves(gameId:string){
    if(openSaves===gameId){setOpenSaves(null);return;}
    setOpenSaves(gameId);setNotice('');
    try{
      const available=await listLocalSnapshots(gameId);
      setSnapshots(prev=>({...prev,[gameId]:available}));
    }catch{setNotice('Local saves are unavailable in this browser.');}
  }
  async function withSlots(gameId:string,op:()=>Promise<unknown>,success:string){
    setPending(gameId);setNotice('');
    try{
      await op();
      const refreshed=await listLocalSnapshots(gameId);
      setSnapshots(prev=>({...prev,[gameId]:refreshed}));
      setNotice(success);
    }catch(error){setNotice(error instanceof Error?error.message:'Unable to access local saves.');}
    finally{setPending(null);}
  }
  return <main className="v2-library" data-v2-theme={theme}>
    <div className="v2-library-inner">
      <div className="v2-library-intro">
        <div><p className="v2-library-eyebrow">YOUR CARTRIDGE SHELF / FIRST COLLECTION</p>
        <h1>Pick a world.<br/><em>Insert a cartridge.</em></h1>
        <p>Discover reviewed public games. Play history and local saves stay on this device.</p></div>
        <div className="v2-cloud-state"><strong>Cloud saves</strong>
          {cloudBackupsEnabled ? <><span>Manual backups</span>
            <p>Open Local saves on a cartridge to back up your autosave or list backups. Sign-in required.</p>
            <small>10 MiB per account</small></> :
            <><span>Unavailable</span><p>Local saves are available offline.</p></>}
        </div>
      </div>
      <section aria-labelledby="shelf-heading" className="v2-shelf">
        <div className="v2-shelf-heading"><h2 id="shelf-heading">Available cartridges <span>{games.length} games</span></h2><span>Click any cartridge to insert &amp; play</span></div>
        {catalogState&&<p role="status">{catalogState}</p>}
        {!catalogState&&games.length===0&&<p>No public games are available yet.</p>}
        <div className="v2-cart-grid">{games.map((game,index)=>{
          const record=history[game.gameId];const active=record&&record.launches>0;
          return <article key={game.gameId} className="v2-library-game">
            <Link className="v2-cartridge-link" href={(game.playable?'/play/':'/games/')+game.gameId} aria-label={(game.playable?'Insert ':'View ')+game.title+' cartridge'}>
              <V2CartridgeArt id={game.gameId} title={game.title} emblem={'◆'} index={index}/>
            </Link>
            <div className="v2-library-card-details"><div className="v2-library-title"><h3>{game.title}</h3><span>{game.genre}</span></div>
              <p>{game.description}</p>
              <div className="v2-library-history">
                <div><span>Played</span><strong>{active?formatActiveTime(record.activeMs):'Not yet'}</strong></div>
                <div><span>Last played</span><strong>{active&&record.lastPlayedAt?new Date(record.lastPlayedAt).toLocaleDateString():'Never'}</strong></div>
                <div><span>Main story</span><strong>Not tracked</strong></div>
              </div>
              <div className="v2-library-actions">
                {game.playable?<><Link className="v2-library-play" href={'/play/'+game.gameId}>↧ Insert &amp; play</Link><OfflineInstallControl gameId={game.gameId} onChanged={()=>void refreshOffline()}/></>:<Link href={'/games/'+game.gameId}>Game details</Link>}
                <Button size="sm" variant="secondary" onPress={()=>void addGame(game.gameId)}>Add to My Library</Button>
                <Button className="sb-control" size="sm" variant="secondary" onPress={()=>void expandSaves(game.gameId)}
                  aria-expanded={openSaves===game.gameId} aria-controls={'v2-save-'+game.gameId}>Local saves</Button>
              </div>
              {openSaves===game.gameId&&<div id={'v2-save-'+game.gameId} className="v2-local-saves">
                <div className="v2-local-save-head"><strong>Offline backup slots</strong><span>{snapshots[game.gameId]?.length??0} / {LOCAL_SNAPSHOT_SLOTS}</span></div>
                <p>These are local IndexedDB snapshots, not cloud saves. Clearing browser storage may erase them.</p>
                {cloudBackupsEnabled && game.playable && <CloudGameBackups gameId={game.gameId}/>}
                <Button className="sb-control sb-control-primary" size="sm" variant="primary" isDisabled={pending===game.gameId}
                  onPress={()=>void withSlots(game.gameId,()=>saveLocalSnapshot(game.gameId),'Local snapshot saved.')}>
                  Back up current save
                </Button>
                {(snapshots[game.gameId]??[]).map(slot=><div className="v2-local-slot" key={slot.slot}>
                  <div><strong>Slot {slot.slot}</strong><small>{new Date(slot.createdAt).toLocaleString()} · {slot.bytes} bytes</small></div>
                  <Button size="sm" variant="secondary" isDisabled={pending===game.gameId}
                    onPress={()=>{if(window.confirm('Replace the current autosave with this local snapshot?'))
                      void withSlots(game.gameId,()=>restoreLocalSnapshot(game.gameId,slot.slot),'Autosave restored. Launch the game to load it.');}}>
                    Restore
                  </Button>
                  <Button className="sb-control" size="sm" variant="tertiary" isDisabled={pending===game.gameId}
                    onPress={()=>{if(window.confirm('Delete this local backup?'))
                      void withSlots(game.gameId,()=>deleteLocalSnapshot(game.gameId,slot.slot),'Local backup deleted.');}}>
                    Delete
                  </Button>
                </div>)}
              </div>}
            </div>
          </article>;
        })}</div>
        {cursor&&<Button variant="secondary" onPress={()=>void loadCatalog(cursor)}>Load more</Button>}
      </section>
      <section aria-labelledby="account-library"><h2 id="account-library">My Library</h2>
        {libraryError&&<p role="status">{libraryError}</p>}
        {myGames===undefined?(!libraryError&&<p>Loading your account library…</p>):
          myGames===null?<p><Link href="/auth/sign-in">Sign in</Link> to view your account library.</p>:
          myGames.length===0?<p>Your library is empty.</p>:<ul>{myGames.map(game=><li key={game.id}><Link href={'/games/'+game.id}>{game.title}</Link></li>)}</ul>}
      </section>
      <section aria-labelledby="device-library"><h2 id="device-library">Installed on this device</h2>
        {offlineState&&<p role="status">{offlineState}</p>}
        {!offlineState&&offline.length===0&&<p>No games are installed on this device.</p>}
        <ul>{offline.map(item=><li key={item.gameId}>
          <a href={'/play/'+item.gameId} data-testid={'installed-link-'+item.gameId}>{item.title}</a>
          <LocalGameSaves gameId={item.gameId} showInstall={!games.some(game=>game.gameId===item.gameId&&game.playable)} onInstallChanged={()=>void refreshOffline()}/></li>)}</ul>
        {saveState&&<p role="status">{saveState}</p>}
        {savedIds.filter(id=>!offline.some(item=>item.gameId===id)&&!games.some(game=>game.gameId===id)).map(id=><div key={id}>
          <p>Local save · {id}</p><LocalGameSaves gameId={id} onInstallChanged={()=>void refreshOffline()}/></div>)}
      </section>
      {notice&&<p role="status" className="v2-library-notice">{notice}</p>}
    </div>
  </main>;
}
