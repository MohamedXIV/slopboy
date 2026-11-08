'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Button} from '@heroui/react';
import {GAMES} from '@slopboy/catalog';
import {getBrowserHistory,formatActiveTime,type GameHistory} from './library-history';
import V2CartridgeArt from './V2CartridgeArt';
import {useV2Theme} from './V2AppShell';
import {listLocalSnapshots,saveLocalSnapshot,restoreLocalSnapshot,deleteLocalSnapshot,LOCAL_SNAPSHOT_SLOTS,
  type LocalSnapshot} from './local-save-slots';
import './v2-library.css';

export default function V2GameLibrary(){
  const [history,setHistory]=useState<Record<string,GameHistory>>({});
  const [snapshots,setSnapshots]=useState<Record<string,LocalSnapshot[]>>({});
  const [openSaves,setOpenSaves]=useState<string|null>(null);
  const [pending,setPending]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const {theme}=useV2Theme();
  useEffect(()=>{
    const handle=requestAnimationFrame(()=>{
      const records:Record<string,GameHistory>={};
      for(const game of GAMES)records[game.gameId]=getBrowserHistory(game.gameId);
      setHistory(records);
    });
    return()=>cancelAnimationFrame(handle);
  },[]);
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
        <p>Three curated games are playable offline in the current experimental player. Your play history and game backups stay on this device.</p></div>
        <div className="v2-cloud-state"><strong>Cloud saves</strong><span>Not connected</span>
          <p>Account sync is planned with a small per-player quota. Nothing uploads without sign-in and your permission.</p>
          <small>Proposed allowance: 10 MiB / account</small>
        </div>
      </div>
      <section aria-labelledby="shelf-heading" className="v2-shelf">
        <div className="v2-shelf-heading"><h2 id="shelf-heading">Available cartridges <span>{GAMES.length} games</span></h2><span>Click any cartridge to insert &amp; play</span></div>
        <div className="v2-cart-grid">{GAMES.map((game,index)=>{
          const record=history[game.gameId];const active=record&&record.launches>0;
          return <article key={game.gameId} className="v2-library-game">
            <Link className="v2-cartridge-link" href={'/v2/play/'+game.gameId} aria-label={'Insert '+game.title+' cartridge'}>
              <V2CartridgeArt id={game.legacySlug} title={game.title} emblem={game.artwork.emblem} index={index}/>
            </Link>
            <div className="v2-library-card-details"><div className="v2-library-title"><h3>{game.title}</h3><span>{game.genre}</span></div>
              <p>{game.description}</p>
              <div className="v2-library-history">
                <div><span>Played</span><strong>{active?formatActiveTime(record.activeMs):'Not yet'}</strong></div>
                <div><span>Last played</span><strong>{active&&record.lastPlayedAt?new Date(record.lastPlayedAt).toLocaleDateString():'Never'}</strong></div>
                <div><span>Main story</span><strong>{game.mainStory&&record?.story&&record.story.total===game.mainStory.milestoneCount
                    ?`${record.story.completed} / ${record.story.total} milestones`:'Not tracked'}</strong></div>
              </div>
              <div className="v2-library-actions">
                <Link className="v2-library-play" href={'/v2/play/'+game.gameId}>↧ Insert &amp; play</Link>
                <Button className="sb-control" size="sm" variant="secondary" onPress={()=>void expandSaves(game.gameId)}
                  aria-expanded={openSaves===game.gameId} aria-controls={'v2-save-'+game.gameId}>Local saves</Button>
              </div>
              {openSaves===game.gameId&&<div id={'v2-save-'+game.gameId} className="v2-local-saves">
                <div className="v2-local-save-head"><strong>Offline backup slots</strong><span>{snapshots[game.gameId]?.length??0} / {LOCAL_SNAPSHOT_SLOTS}</span></div>
                <p>These are local IndexedDB snapshots, not cloud saves. Clearing browser storage may erase them.</p>
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
      </section>
      {notice&&<p role="status" className="v2-library-notice">{notice}</p>}
    </div>
  </main>;
}
