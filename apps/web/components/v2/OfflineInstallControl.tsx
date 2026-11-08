'use client';

import {useEffect,useState} from 'react';
import {Button} from '@heroui/react';
import {installOfflineGame,listOfflineGames,removeOfflineGame} from './offline-install';
import './offline-install.css';

/** Explicit per-game install/remove. Never deletes guest progress, backup or history. */
export default function OfflineInstallControl({gameId}:{gameId:string}){
  const [installed,setInstalled]=useState(false);
  const [busy,setBusy]=useState(true);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    let live=true;
    listOfflineGames().then(games=>{
      if(live)setInstalled(games.some(item=>item.gameId===gameId));
    }).catch(error=>{
      if(live)setNotice(error instanceof Error?error.message:'Offline installation unavailable.');
    }).finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[gameId]);
  const toggle=async()=>{
    setBusy(true);setNotice('');
    try{
      if(installed){await removeOfflineGame(gameId);setInstalled(false);setNotice('Offline copy removed. Local saves kept.');}
      else{await installOfflineGame(gameId);setInstalled(true);setNotice('Installed for offline play.');}
    }catch(error){setNotice(error instanceof Error?error.message:'Offline operation failed.');}
    finally{setBusy(false);}
  };
  return <span className="sb-offline-control">
    <Button size="sm" variant="secondary" className="sb-control" isDisabled={busy}
      onPress={()=>void toggle()} aria-label={installed?'Remove offline game':'Install game for offline play'}
      data-testid={'offline-game-'+gameId}>
      {busy?'Preparing…':installed?'Remove offline':'Install offline'}
    </Button>
    {notice&&<span className="sb-offline-notice" role="status">{notice}</span>}
  </span>;
}
