'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Button,Card,Input,Label,TextField} from '@heroui/react';
import SourceDraftEditor from './SourceDraftEditor';

type Metadata={title:string;tagline:string;description:string;genre:string};
const initial:Metadata={title:'',tagline:'',description:'',genre:'Other'};
export default function GameManagementForm({gameId,platform=false,existing}:{gameId?:string;platform?:boolean;existing?:Metadata}){
  const router=useRouter();
  const [fields,setFields]=useState<Metadata>(existing??initial);
  const [loading,setLoading]=useState(Boolean(gameId&&!existing));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [revisions,setRevisions]=useState<{id:string;number:number;status:string}[]>([]);
  useEffect(()=>{
    if(!gameId)return;
    const controller=new AbortController();
    fetch('/api/manage/games/'+encodeURIComponent(gameId),{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('Game unavailable');return response.json();})
      .then(({game})=>{setRevisions(game.revisions);setFields({title:game.title,tagline:game.tagline??'',description:game.description??'',genre:game.genre});setLoading(false);})
      .catch(()=>{if(!controller.signal.aborted){setError('Game unavailable');setLoading(false);}});
    return()=>controller.abort();
  },[gameId,existing]);
  async function submit(event:FormEvent){
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try{
      const response=await fetch(gameId?'/api/manage/games/'+encodeURIComponent(gameId):'/api/manage/games',{
        method:gameId?'PATCH':'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(gameId?fields:{metadata:fields,platform})});
      if(!response.ok)throw Error('Unable to save the game. Check your permissions and try again.');
      const data=await response.json();
      if(platform)window.location.reload();
      else{router.push('/games/'+data.game.id);router.refresh();}
    }catch(e){setError(e instanceof Error?e.message:'Unable to save game');}finally{setBusy(false);}
  }
  if(loading)return <p>Loading game…</p>;
  if(error==='Game unavailable')return <p role="alert">{error}</p>;
  return <Card><Card.Header><Card.Title>{gameId?'Edit game':'Create private game'}</Card.Title>
    <Card.Description>Only private draft metadata can be edited. Reviewed releases require a separate review; unreviewed drafts cannot be played.</Card.Description></Card.Header>
    <Card.Content><form onSubmit={submit} className="flex flex-col gap-4">
      <TextField isRequired><Label>Title</Label><Input value={fields.title} maxLength={80} onChange={e=>setFields({...fields,title:e.target.value})}/></TextField>
      <TextField><Label>Tagline</Label><Input value={fields.tagline} maxLength={160} onChange={e=>setFields({...fields,tagline:e.target.value})}/></TextField>
      <TextField><Label>Description</Label><Input value={fields.description} maxLength={2000} onChange={e=>setFields({...fields,description:e.target.value})}/></TextField>
      <label>Genre <select value={fields.genre} onChange={e=>setFields({...fields,genre:e.target.value})}>
        {['Arcade','Shooter','Puzzle','Action','Adventure','Strategy','Other'].map(genre=><option key={genre}>{genre}</option>)}
      </select></label>
      {error&&<p role="alert">{error}</p>}
      <Button type="submit" variant="primary" isPending={busy} isDisabled={busy}>{gameId?'Save changes':'Create game'}</Button>
    </form>{gameId&&<section><h2>Revisions</h2>{revisions.length===0?<p>No revisions yet.</p>:
      <ul>{revisions.map(revision=><li key={revision.id}>Revision {revision.number} · {revision.status} · {revision.id}</li>)}</ul>}
    </section>}{gameId&&<SourceDraftEditor gameId={gameId}/>}</Card.Content></Card>;
}
