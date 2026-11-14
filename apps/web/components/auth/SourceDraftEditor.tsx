'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Button,Card,Label,TextArea,TextField} from '@heroui/react';
export default function SourceDraftEditor({gameId}:{gameId:string}){
  const [source,setSource]=useState(''),[language,setLanguage]=useState('typescript');
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{const controller=new AbortController();
    fetch('/api/manage/games/'+encodeURIComponent(gameId)+'/source',{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error();return response.json();})
      .then(data=>{if(data.draft){setSource(data.draft.source);setLanguage(data.draft.language);}setReady(true);})
      .catch(()=>{if(!controller.signal.aborted)setMessage('Private source storage is unavailable.');});
    return()=>controller.abort();
  },[gameId]);
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');
    try{const response=await fetch('/api/manage/games/'+encodeURIComponent(gameId)+'/source',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,language})});
      if(!response.ok)throw Error();setMessage('Private source draft saved.');
    }catch{setMessage('Unable to save private source draft.');}finally{setBusy(false);}}
  return <Card variant="secondary"><Card.Header><Card.Title>Private source draft</Card.Title>
    <Card.Description>Source is stored as data. Build, preview, play, and publication require separate safety review and are unavailable here.</Card.Description></Card.Header>
    <Card.Content><form className="flex flex-col gap-3" onSubmit={submit}>
      <label>Language <select value={language} onChange={event=>setLanguage(event.target.value)} disabled={!ready}>
        <option value="typescript">TypeScript</option><option value="javascript">JavaScript</option></select></label>
      <TextField><Label>Source</Label><TextArea rows={12} value={source} onChange={event=>setSource(event.target.value)} disabled={!ready}/></TextField>
      <Button type="submit" isDisabled={!ready||busy} isPending={busy}>Save source draft</Button>
      {message&&<p role="status">{message}</p>}
    </form></Card.Content></Card>;
}
