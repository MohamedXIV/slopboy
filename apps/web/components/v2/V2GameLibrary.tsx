'use client';

import {useEffect,useState,type CSSProperties} from 'react';
import Link from 'next/link';
import {Button} from '@heroui/react';
import {GAMES} from '@slopboy/catalog';
import {getBrowserHistory,formatActiveTime,type GameHistory} from './library-history';
import {makeCartridgeAppearance} from './cartridge-cover';
import {listLocalSnapshots,saveLocalSnapshot,restoreLocalSnapshot,deleteLocalSnapshot,LOCAL_SNAPSHOT_SLOTS,
  type LocalSnapshot} from './local-save-slots';
import './v2-library.css';

const THEME_KEY='slopboy:v2:theme';
type Theme='dark'|'light';
function CartridgeArt({id,title,emblem,index}:{id:string;title:string;emblem:string;index:number}){
  const art=makeCartridgeAppearance(id);
  const vars={
    '--cart-primary':art.primary,'--cart-secondary':art.secondary,'--cart-highlight':art.highlight
  } as CSSProperties;
  return <div className="v2-cart-shell" style={vars} aria-label={'Procedural cartridge artwork for '+title}>
    <div className="v2-cart-grip" aria-hidden="true"><i/><i/><i/><i/><i/></div>
    <div className="v2-cart-label">
      <span className="v2-cart-serial">SLOPBOY / CARTRIDGE {String(index+1).padStart(3,'0')}</span>
      <svg className="v2-cart-artwork" viewBox="0 0 320 190" role="img" aria-label={'Generated '+title+' cover'}>
        <rect width="320" height="190" fill={art.secondary}/>
        {Array.from({length:art.stripes},(_,i)=><path key={i} d={`M${-80+i*60},0 l180,190`}
          stroke={art.primary} strokeWidth={16+(i%3)*13} opacity={.72}/>)}
        <circle cx={art.accentX*3.2} cy={art.accentY*1.9} r="68" fill={art.highlight} opacity=".3"/>
        <rect x="0" y="140" width="320" height="50" fill={art.secondary} opacity=".72"/>
        <text x="160" y="112" fill={art.highlight} fontFamily="ui-monospace, monospace" fontWeight="900"
          fontSize="74" dominantBaseline="middle" textAnchor="middle">{emblem}</text>
      </svg>
      <div className="v2-cart-title"><strong>{title}</strong><span>PLAY / SERIES 1000</span></div>
    </div>
    <div className="v2-cart-contacts" aria-hidden="true">{Array.from({length:9},(_,i)=><i key={i}/>)}</div>
  </div>;
}
export default function V2GameLibrary(){
  const [history,setHistory]=useState<Record<string,GameHistory>>({});
  const [snapshots,setSnapshots]=useState<Record<string,LocalSnapshot[]>>({});
  const [openSaves,setOpenSaves]=useState<string|null>(null);
  const [pending,setPending]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const [theme,setTheme]=useState<Theme>('dark');
  useEffect(()=>{
    const handle=requestAnimationFrame(()=>{
      const records:Record<string,GameHistory>={};
      for(const game of GAMES)records[game.id]=getBrowserHistory(game.id);
      setHistory(records);
      try{if(localStorage.getItem(THEME_KEY)==='light')setTheme('light');}catch{/* optional */}
    });
    return()=>cancelAnimationFrame(handle);
  },[]);
  const changeTheme=()=>{
    const next=theme==='dark'?'light':'dark';setTheme(next);
    try{localStorage.setItem(THEME_KEY,next);}catch{/* optional */}
  };
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
    <header className="v2-library-header">
      <Link href="/v2" className="v2-library-logo">SLOPBOY <span>2.0</span></Link>
      <nav aria-label="Library navigation"><span>MY COLLECTION / LOCAL-FIRST</span>
        <Button size="sm" variant="secondary" onPress={changeTheme} aria-label="Toggle light and dark theme">
          {theme==='dark'?'☀ Light':'☾ Dark'}
        </Button>
      </nav>
    </header>
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
          const record=history[game.id];const active=record&&record.launches>0;
          return <article key={game.id} className="v2-library-game">
            <Link className="v2-cartridge-link" href={'/v2/play/'+game.id} aria-label={'Insert '+game.title+' cartridge'}>
              <CartridgeArt id={game.id} title={game.title} emblem={game.artwork.emblem} index={index}/>
            </Link>
            <div className="v2-library-card-details"><div className="v2-library-title"><h3>{game.title}</h3><span>{game.genre}</span></div>
              <p>{game.description}</p>
              <div className="v2-library-history">
                <div><span>Played</span><strong>{active?formatActiveTime(record.activeMs):'Not yet'}</strong></div>
                <div><span>Last played</span><strong>{active&&record.lastPlayedAt?new Date(record.lastPlayedAt).toLocaleDateString():'Never'}</strong></div>
                <div><span>Main story</span><strong>{record?.story?`${record.story.completed} / ${record.story.total} milestones`:'Not tracked'}</strong></div>
              </div>
              <div className="v2-library-actions">
                <Link className="v2-library-play" href={'/v2/play/'+game.id}>↧ Insert &amp; play</Link>
                <Button size="sm" variant="secondary" onPress={()=>void expandSaves(game.id)}
                  aria-expanded={openSaves===game.id} aria-controls={'v2-save-'+game.id}>Local saves</Button>
              </div>
              {openSaves===game.id&&<div id={'v2-save-'+game.id} className="v2-local-saves">
                <div className="v2-local-save-head"><strong>Offline backup slots</strong><span>{snapshots[game.id]?.length??0} / {LOCAL_SNAPSHOT_SLOTS}</span></div>
                <p>These are local IndexedDB snapshots, not cloud saves. Clearing browser storage may erase them.</p>
                <Button size="sm" variant="primary" isDisabled={pending===game.id}
                  onPress={()=>void withSlots(game.id,()=>saveLocalSnapshot(game.id),'Local snapshot saved.')}>
                  Back up current save
                </Button>
                {(snapshots[game.id]??[]).map(slot=><div className="v2-local-slot" key={slot.slot}>
                  <div><strong>Slot {slot.slot}</strong><small>{new Date(slot.createdAt).toLocaleString()} · {slot.bytes} bytes</small></div>
                  <Button size="sm" variant="secondary" isDisabled={pending===game.id}
                    onPress={()=>{if(window.confirm('Replace the current autosave with this local snapshot?'))
                      void withSlots(game.id,()=>restoreLocalSnapshot(game.id,slot.slot),'Autosave restored. Launch the game to load it.');}}>
                    Restore
                  </Button>
                  <Button size="sm" variant="tertiary" isDisabled={pending===game.id}
                    onPress={()=>{if(window.confirm('Delete this local backup?'))
                      void withSlots(game.id,()=>deleteLocalSnapshot(game.id,slot.slot),'Local backup deleted.');}}>
                    Delete
                  </Button>
                </div>)}
              </div>}
            </div>
          </article>;
        })}</div>
      </section>
      {notice&&<p role="status" className="v2-library-notice">{notice}</p>}
      <footer className="v2-library-footer"><Link href="/v2">← Device gallery</Link><span>Guest library · offline playable · cloud sync not yet enabled</span></footer>
    </div>
  </main>;
}
