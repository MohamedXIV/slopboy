'use client';

import {useCallback,useEffect,useState} from 'react';
import {Button,Card} from '@heroui/react';

type Project = {id:string; finalizedAt:string|null; expiresAt:string};
type ManifestFile = {path:string;mime:string;bytes:number;sha256:string};
type Stage = Project & {manifest:{files:ManifestFile[]}; tickets:Record<string,string>};
const formats: Record<string,string> = {
  ts:'text/typescript',js:'text/javascript',png:'image/png',jpg:'image/jpeg',wav:'audio/wav',
};
const errors: Record<string,string> = {
  UNAVAILABLE:'Private staging is unavailable.', UNAUTHENTICATED:'Sign in again.',
  QUOTA:'Your private project storage limit has been reached.', EXPIRED:'This upload expired. Start a new upload.',
  NOT_FOUND:'This private project is unavailable to your account.',
  INVALID_ARTIFACT:'A file failed source, format or checksum checks.',
  INVALID_INPUT:'Select a game.ts or game.js entrypoint and supported files with unique lowercase names.',
  PROCEDURAL_SOURCE_REQUIRED:'New projects use source files. Generate your visuals and sound in code.',
  INCOMPLETE:'Upload all declared files before finalizing.',
};

export default function StagedProject({gameId}:{gameId:string}) {
  const endpoint = `/api/manage/games/${gameId}/staged-artifacts`;
  const [projects,setProjects] = useState<Project[]>([]);
  const [files,setFiles] = useState<File[]>([]);
  const [key,setKey] = useState('');
  const [selected,setSelected] = useState<Stage|null>(null);
  const [busy,setBusy] = useState(false);
  const acceptsStoredMedia = selected?.manifest.files.some(file => file.path.startsWith('assets/')) ?? false;
  const [notice,setNotice] = useState('');

  const request = useCallback(async <T,>(url:string, init?:RequestInit):Promise<T> => {
    const response = await fetch(url,{cache:'no-store',...init});
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] ?? 'The request could not be completed.');
    return data;
  },[]);
  const refresh = useCallback(async () => {
    const result = await request<{projects:Project[]}>(endpoint);
    setProjects(result.projects);
  },[endpoint,request]);

  useEffect(() => {
    const controller = new AbortController();
    void request<{projects:Project[]}>(endpoint,{signal:controller.signal})
      .then(result => {if (!controller.signal.aborted) setProjects(result.projects);})
      .catch(error => {if (!controller.signal.aborted) setNotice(error.message);});
    return () => controller.abort();
  },[endpoint,request]);

  const projectUrl = (id:string) => `${endpoint}?project=${id}`;
  const fileUrl = (id:string,path:string) => `${projectUrl(id)}&file=${encodeURIComponent(path)}`;

  async function run(task:() => Promise<void>) {
    setNotice('');
    setBusy(true);
    try { await task(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  async function upload() {
    if (files.length < 1 || files.length > 16 || files.some(file => file.size > 524288) ||
        files.reduce((sum,file) => sum+file.size,0)>2097152) {
      setNotice('Choose 1–16 files, at most 512 KiB each and 2 MiB total.');
      return;
    }
    await run(async () => {
      const uploads = await Promise.all(files.map(async file => {
        const ext = file.name.split('.').at(-1) ?? '';
        const mime = formats[ext];
        if (!mime || (!acceptsStoredMedia && ext !== 'ts' && ext !== 'js'))
          throw new Error('Choose .ts or .js files for new projects.');
        const path = (ext==='ts'||ext==='js' ? 'src/' : 'assets/')+file.name;
        const digest = await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
        const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
        return {file,path,mime,bytes:file.size,sha256};
      }));
      const submission = key || crypto.randomUUID();
      setKey(submission);
      const stage = selected
        ? await request<Stage>(projectUrl(selected.id))
        : await request<Stage>(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({key:submission,manifest:{files:uploads.map(({path,mime,bytes,sha256})=>({path,mime,bytes,sha256}))}})});
      setSelected(stage);
      for (const {file,path,mime} of uploads) {
        const ticket = stage.tickets[path];
        if (!ticket) throw new Error('This file was not declared when the project was staged.');
        await request(fileUrl(stage.id,path),{method:'PUT',headers:{'Content-Type':mime,'X-Slopboy-Artifact-Ticket':ticket},body:file});
      }
      setNotice('Files uploaded. Select Finalize revision when ready.');
      await refresh();
    });
  }

  async function download(path:string) {
    if (!selected) return;
    await run(async () => {
      const stage = await request<Stage>(projectUrl(selected.id));
      const result = await fetch(fileUrl(stage.id,path),{cache:'no-store',
        headers:{'X-Slopboy-Artifact-Ticket':stage.tickets[path]}});
      if (!result.ok) throw new Error('This artifact could not be downloaded.');
      const url = URL.createObjectURL(await result.blob());
      const link = document.createElement('a');
      link.href=url;
      link.download=path.split('/').at(-1) ?? 'private-file';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    });
  }

  return <Card variant="secondary"><Card.Content className="space-y-4">
    <p>Upload source for a private revision. Generate your visuals and sound in code. Build and play are unavailable here.</p>
    <div className="flex flex-wrap gap-2">
      <Button isDisabled={busy} onPress={() => {setSelected(null);setKey('');setNotice('');}}>New project</Button>
      {projects.map(project => <Button key={project.id} isDisabled={busy} variant="secondary"
        onPress={() => void run(async () => setSelected(await request<Stage>(projectUrl(project.id))))}>
        {project.finalizedAt ? 'Revision' : 'Staging'} {project.id.slice(0,8)}
      </Button>)}
    </div>
    {selected && <p className="break-all">{selected.finalizedAt ? 'Revision' : 'Project'} {selected.id}</p>}
    {selected?.finalizedAt ? <ul>{selected.manifest.files.map(file => <li key={file.path}>
      <Button variant="secondary" isDisabled={busy} onPress={() => void download(file.path)}>Download {file.path}</Button>
    </li>)}</ul> : <>
      <label className="block">{acceptsStoredMedia ? 'Declared files for this existing project' : 'Source files (.ts or .js)'}
        <input className="block w-full" type="file" multiple accept={acceptsStoredMedia ? ".ts,.js,.png,.jpg,.wav" : ".ts,.js"}
          disabled={busy} onChange={event => {setFiles(Array.from(event.target.files ?? []));setKey('');}}/>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={busy||files.length===0} onPress={() => void upload()}>Upload files</Button>
        {selected && <Button variant="secondary" isDisabled={busy} onPress={() => void run(async () => {
          const stage = await request<Stage>(projectUrl(selected.id),{method:'POST'});
          setSelected(stage);setNotice('Private revision finalized.');await refresh();
        })}>Finalize revision</Button>}
      </div>
    </>}
    <p role="status">{notice}</p>
  </Card.Content></Card>;
}
