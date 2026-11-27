'use client';
import {useEffect,useState} from 'react';
import type {PlayableGame} from '@slopboy/catalog';
import V2DevicePlayer from './V2DevicePlayer';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
/** Resolve once before mounting; never rebind a running save store to another account.
 * Offline/guest play retains the original guest lane. Reopen to select an account lane. */
export default function AccountScopedPlayer({game,managedSyncAvailable}:{game:PlayableGame;managedSyncAvailable:boolean}){
  const [account,setAccount]=useState<string|null|undefined>(managedSyncAvailable?undefined:null);
  useEffect(()=>{
    if(!managedSyncAvailable)return;
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>{controller.abort();setAccount(null);},5000);
    void (async()=>{
      let next:string|null=null;
      try{
        const response=await fetch('/api/account/cloud-sync',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
        if(response.ok){
          const value:unknown=await response.json();
          if(value&&typeof value==='object'&&'accountId' in value&&typeof value.accountId==='string'&&UUID.test(value.accountId))next=value.accountId;
        }
      }catch{/* Keep local guest play available. */}
      finally{window.clearTimeout(timeout);if(!controller.signal.aborted)setAccount(next);}
    })();
    return()=>{controller.abort();window.clearTimeout(timeout);};
  },[managedSyncAvailable,game.gameId]);
  if(managedSyncAvailable&&account===undefined)return <p role="status">Opening local saves…</p>;
  return <V2DevicePlayer key={game.gameId+':'+(account??'guest')} game={game} managedSyncAvailable={managedSyncAvailable} saveAccountId={account??null}/>;
}
