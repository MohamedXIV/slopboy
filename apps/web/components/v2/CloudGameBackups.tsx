'use client';

import {useState} from 'react';
import Link from 'next/link';
import {Button} from '@heroui/react';
import {getCatalogGame} from '@slopboy/catalog';
import {SLOPBOY_1000} from '@slopboy/hardware';
import {browserSaveDriver,createGameSaveService} from '@slopboy/runtime/save-store';

type Backup = {id:string;createdAt:string;bytes:number};
type BackupList = {backups:Backup[];usedBytes:number};

export default function CloudGameBackups({gameId}:{gameId:string}) {
  const [list,setList] = useState<BackupList|null>(null);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [signIn,setSignIn] = useState(false);

  async function request(create:boolean) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setSignIn(false);
    try {
      let options:RequestInit = {cache:'no-store'};
      if (create) {
        const identity = getCatalogGame(gameId) ?? {gameId};
        const save = await createGameSaveService(browserSaveDriver,SLOPBOY_1000,identity).read();
        if (save === null) {
          setNotice('No local autosave yet. Play and save first.');
          return;
        }
        options = {...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({save})};
      }
      const response = await fetch(`/api/account/games/${encodeURIComponent(gameId)}/cloud-backups`,options);
      if (!response.ok) {
        setList(null);
        setSignIn(response.status === 401);
        setNotice(response.status === 401 ? 'Sign in to use cloud backups.'
          : response.status === 409 ? 'Cloud backup limit reached.'
          : 'Cloud backups unavailable.');
        return;
      }
      const data = await response.json() as BackupList;
      if (!Array.isArray(data.backups) || typeof data.usedBytes !== 'number') throw Error('Invalid backup response');
      setList(data);
      if (create) setNotice(response.status === 201 ? 'Cloud backup saved.' : 'This save is already backed up.');
    } catch {
      setList(null);
      setNotice('Cloud backups unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>void request(false)}>List cloud backups</Button>
      <Button size="sm" variant="secondary" isDisabled={busy} onPress={()=>void request(true)}>Back up autosave to cloud</Button>
    </div>
    {list && <div>
      <p>{list.backups.length} / 5 cloud backups · {(list.usedBytes/1024).toLocaleString(undefined,{maximumFractionDigits:1})} KiB / 10 MiB account storage</p>
      <ul>{list.backups.map(backup=><li key={backup.id}>
        <time dateTime={backup.createdAt}>{new Date(backup.createdAt).toLocaleString()}</time>
        {' · '}{backup.bytes.toLocaleString()} bytes
      </li>)}</ul>
    </div>}
    {notice && <p role="status">{notice} {signIn && <Link className="underline" href="/auth/sign-in">Sign in</Link>}</p>}
  </div>;
}
