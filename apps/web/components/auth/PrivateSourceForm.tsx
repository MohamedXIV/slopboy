'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Alert, Button, Card, Input, Label, ListBox, Select, TextArea, TextField} from '@heroui/react';

import {PRIVATE_SOURCE_TEMPLATE as template, PRIVATE_SOURCE_LIMIT} from '@slopboy/cartridge/private-source-template';

type Diagnostic = {message: string; line?: number; column?: number};
type Stored = {id: string; checksum: string | null; source: string; language: string};

export default function PrivateSourceForm({gameId}: {gameId?: string}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [engine, setEngine] = useState<string>(gameId ? template.id : '');
  const [language, setLanguage] = useState('typescript');
  const [source, setSource] = useState('');
  const [ready, setReady] = useState(!gameId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [stored, setStored] = useState<Stored | null>(null);
  const submission = useRef<{payload: string; id: string} | null>(null);
  const endpoint = gameId ? '/api/manage/games/'+encodeURIComponent(gameId)+'/source' : '/api/manage/source';

  useEffect(() => {
    if (!gameId) return;
    const controller = new AbortController();
    fetch(endpoint, {cache: 'no-store', signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw Error();
        const {draft} = await response.json() as {draft: Stored | null};
        if (controller.signal.aborted) return;
        if (draft) {
          setSource(draft.source);
          setLanguage(draft.language);
          setStored(draft);
        }
        setReady(true);
      })
      .catch(() => { if (!controller.signal.aborted) setMessage('Private source storage is unavailable.'); });
    return () => controller.abort();
  }, [endpoint, gameId]);

  function changed() {
    setMessage('');
    setDiagnostics([]);
    submission.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready) return;
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'save' ? 'save' : 'validate';
    const payload = {content: {engine, version: template.version, language, source},
      ...(gameId ? {} : {metadata: {title, description, genre: 'Other'}})};
    const serialized = JSON.stringify(payload);
    setBusy(true);
    setMessage('');
    setDiagnostics([]);
    try {
      if (intent === 'save' && submission.current?.payload !== serialized)
        submission.current = {payload: serialized, id: crypto.randomUUID()};
      const response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...payload, intent, submission: intent === 'save' ? submission.current?.id : undefined})});
      const data = await response.json();
      if (response.status === 422) {
        setDiagnostics(data.diagnostics);
        return;
      }
      if (!response.ok) {
        const errors: Record<string, string> = {
          INVALID_METADATA: 'Enter a title and shorten the description if needed.',
          SOURCE_QUOTA: 'Source storage or hourly submission limit reached.',
          UNAUTHENTICATED: 'Sign in again to continue.',
          FORBIDDEN: 'A verified Slopboy profile is required.',
          NOT_FOUND: 'This private draft is unavailable for editing.',
          SUBMISSION_CONFLICT: 'This submission changed. Edit the draft and try again.',
        };
        setMessage(errors[data.error] ?? 'Unable to save or validate right now. Try again.');
        return;
      }
      if (intent === 'validate') {
        setMessage('Source checks passed. Save to keep this private draft.');
      } else if (gameId) {
        setStored({id: data.revisionId, checksum: data.checksum, source, language});
        setMessage('Private source revision saved.');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setMessage('Unable to complete the request. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Card variant="secondary">
    <Card.Header>
      <Card.Title>{gameId ? 'Private source draft' : 'New Game · Paste Code'}</Card.Title>
      <Card.Description>Save one game module privately. Build, preview and publication require separate approval.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
        {!gameId && <>
          <TextField isRequired isDisabled={busy}><Label>Title</Label>
            <Input value={title} maxLength={80} onChange={e => {setTitle(e.target.value); changed();}}/>
          </TextField>
          <TextField isDisabled={busy}><Label>Description</Label>
            <TextArea value={description} maxLength={2000} onChange={e => {setDescription(e.target.value); changed();}}/>
          </TextField>
        </>}
        <Select fullWidth isRequired isDisabled={!ready || busy} placeholder="Choose an engine"
          value={engine || null} onChange={value => {setEngine(String(value ?? '')); changed();}}>
          <Label>Engine template</Label>
          <Select.Trigger><Select.Value/><Select.Indicator/></Select.Trigger>
          <Select.Popover><ListBox>
            <ListBox.Item id={template.id} textValue={`KAPLAY ${template.version} · source only`}>
              KAPLAY {template.version} · source only
            </ListBox.Item>
          </ListBox></Select.Popover>
        </Select>
        <Select fullWidth isDisabled={!ready || busy} value={language}
          onChange={value => {setLanguage(String(value)); changed();}}>
          <Label>Language</Label><Select.Trigger><Select.Value/><Select.Indicator/></Select.Trigger>
          <Select.Popover><ListBox>
            <ListBox.Item id="typescript" textValue="TypeScript">TypeScript</ListBox.Item>
            <ListBox.Item id="javascript" textValue="JavaScript">JavaScript</ListBox.Item>
          </ListBox></Select.Popover>
        </Select>
        <TextField isRequired isDisabled={!ready || busy}><Label>Source code</Label>
          <TextArea className="font-mono" rows={12} maxLength={PRIVATE_SOURCE_LIMIT} value={source}
            onChange={e => {setSource(e.target.value); changed();}}/>
        </TextField>
        {diagnostics.length > 0 && <Alert status="danger"><Alert.Indicator/><Alert.Content>
          <Alert.Title>Rejected by validation</Alert.Title>
          <ul>{diagnostics.map((item, i) => <li key={i}>
            {item.line ? `Line ${item.line}, column ${item.column}: ` : ''}{item.message}
          </li>)}</ul>
        </Alert.Content></Alert>}
        {message && <p role="status">{message}</p>}
        {stored && <div className="break-all text-sm">
          <p>{stored.checksum ? 'Stored · source checks passed' : 'Stored · legacy unvalidated source'}</p>
          <p>Source revision {stored.id}</p>
          {stored.checksum && <p>SHA-256 {stored.checksum}</p>}
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" value="validate" variant="secondary" isDisabled={!ready || busy || !engine}>Validate</Button>
          <Button type="submit" value="save" variant="primary" isDisabled={!ready || busy || !engine}>Save private draft</Button>
        </div>
      </form>
    </Card.Content>
  </Card>;
}
