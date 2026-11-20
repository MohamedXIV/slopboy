'use client';

import {useRef, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Alert, Button, Card, Input, Label, ListBox, Select, TextArea, TextField} from '@heroui/react';
import {PRIVATE_SOURCE_LIMIT, PRIVATE_SOURCE_TEMPLATE} from '@slopboy/cartridge/private-source-template';
import {isGameUuid} from '@slopboy/catalog';
import {newGameSourceRequest, normalizePastedSource, reuseSubmission,
  type PendingSubmission, type SourceIntent, type SourceLanguage} from '../../lib/ai/source-import';

type Diagnostic = {message: string; line?: number; column?: number};
const errors: Record<string, string> = {
  INVALID_METADATA: 'Add a title (up to 80 characters) and shorten the description if needed.',
  REJECTED_BY_VALIDATION: 'Your code needs changes before it can be saved.',
  SOURCE_QUOTA: 'Source storage or the hourly submission limit has been reached.',
  UNAUTHENTICATED: 'Sign in to Slopboy before saving your private game.',
  FORBIDDEN: 'Verify your Slopboy account email before saving.',
  INVALID_ORIGIN: 'This request was blocked by the site security checks. Reload and try again.',
  SUBMISSION_CONFLICT: 'The save request changed. Edit the source before trying again.',
  PRIVATE_STORAGE_UNAVAILABLE: 'Private storage is not available on this environment yet.',
};

export default function ImportGameForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<SourceLanguage>('typescript');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const pendingSave = useRef<PendingSubmission | null>(null);

  function clearFeedback() {
    setNotice('');
    setDiagnostics([]);
    pendingSave.current = null;
  }

  async function pasteFromClipboard() {
    if (busy) return;
    if (!navigator.clipboard?.readText) {
      setNotice('Clipboard access is unavailable. Use your browser Paste command in the source box.');
      return;
    }
    try {
      // Deliberately only inside this click handler; no auto-read on mount.
      const copied = await navigator.clipboard.readText();
      if (!copied) {
        setNotice('Clipboard is empty. Copy the game code from your AI chat first.');
        return;
      }
      const normalized = normalizePastedSource(copied);
      clearFeedback();
      setSource(normalized.source);
      if (normalized.language) setLanguage(normalized.language);
      setNotice(normalized.warning ?? 'Code pasted. Review it, then validate or save your private draft.');
    } catch {
      setNotice('Clipboard permission was denied. Click the source box and paste manually instead.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const intent: SourceIntent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'save'
      ? 'save' : 'validate';
    const unchangedPayload = JSON.stringify(newGameSourceRequest(title, description, language, source, 'save'));
    if (intent === 'save')
      pendingSave.current = reuseSubmission(pendingSave.current, unchangedPayload, () => crypto.randomUUID());
    const request = newGameSourceRequest(title, description, language, source, intent,
      intent === 'save' ? pendingSave.current?.id : undefined);
    setBusy(true);
    setNotice('');
    setDiagnostics([]);
    try {
      const response = await fetch('/api/manage/source', {method: 'POST',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify(request)});
      const result = await response.json() as {
        error?: string; diagnostics?: Diagnostic[]; gameId?: string;
      };
      if (response.status === 422) {
        setDiagnostics(Array.isArray(result.diagnostics) ? result.diagnostics : []);
        setNotice('Code validation failed. Fix these problems and try again.');
      } else if (!response.ok) {
        setNotice(errors[result.error ?? ''] ?? 'Unable to complete the request right now. Try again.');
      } else if (intent === 'validate') {
        setNotice('Source checks passed. Save explicitly to keep it as a private draft.');
      } else if (result.gameId && isGameUuid(result.gameId)) {
        router.push(`/manage/${result.gameId}/history`);
      } else {
        setNotice('Save returned an unexpected result. Check your dashboard before trying again.');
      }
    } catch {
      setNotice('Could not reach Slopboy. You can retry the same save without losing the source.');
    } finally {
      setBusy(false);
    }
  }

  return <Card variant="secondary">
    <Card.Header><Card.Title>Save a private source draft</Card.Title>
      <Card.Description>Source only · KAPLAY {PRIVATE_SOURCE_TEMPLATE.version} · Slopboy 1000</Card.Description>
    </Card.Header>
    <Card.Content>
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
        <Alert status="warning"><Alert.Indicator/><Alert.Content>
          <Alert.Title>Preview is not available yet</Alert.Title>
          Saving stores source text privately. It does not run, build, publish or share the game.
        </Alert.Content></Alert>
        <TextField isRequired isDisabled={busy}><Label>Game title</Label>
          <Input value={title} maxLength={80} placeholder="My little game"
            onChange={event => {setTitle(event.target.value); clearFeedback();}}/>
        </TextField>
        <TextField isDisabled={busy}><Label>Description (optional)</Label>
          <TextArea value={description} maxLength={2000}
            onChange={event => {setDescription(event.target.value); clearFeedback();}}/>
        </TextField>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Paste one <code>.ts</code> or <code>.js</code> game module.</p>
          <Button type="button" variant="secondary" isDisabled={busy} onPress={pasteFromClipboard}>
            Paste from Clipboard
          </Button>
        </div>
        <Select fullWidth isDisabled={busy} value={language} onChange={value => {
          if (value === 'typescript' || value === 'javascript') {setLanguage(value); clearFeedback();}
        }}><Label>Language</Label><Select.Trigger><Select.Value/><Select.Indicator/></Select.Trigger>
          <Select.Popover><ListBox>
            <ListBox.Item id="typescript" textValue="TypeScript">TypeScript</ListBox.Item>
            <ListBox.Item id="javascript" textValue="JavaScript">JavaScript</ListBox.Item>
          </ListBox></Select.Popover>
        </Select>
        <TextField isRequired isDisabled={busy}><Label>Game code</Label>
          <TextArea className="font-mono" rows={16} maxLength={PRIVATE_SOURCE_LIMIT}
            placeholder="import kaplay from 'kaplay'; …" value={source}
            onChange={event => {setSource(event.target.value); clearFeedback();}}/>
        </TextField>
        {diagnostics.length > 0 && <Alert status="danger"><Alert.Indicator/><Alert.Content>
          <Alert.Title>Source checks found issues</Alert.Title>
          <ul>{diagnostics.map((item, index) => <li key={index}>
            {item.line ? `Line ${item.line}${item.column ? `:${item.column}` : ''}: ` : ''}{item.message}
          </li>)}</ul>
        </Alert.Content></Alert>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" value="validate" variant="secondary" isDisabled={busy || !source.trim()}>
            Check source
          </Button>
          <Button type="submit" value="save" variant="primary" isDisabled={busy || !source.trim()}>
            Save private draft
          </Button>
        </div>
        <p className="text-xs">Your game code stays in this form until you click Check or Save.
          Saving requires a signed-in, verified Slopboy account.</p>
      </form>
    </Card.Content>
  </Card>;
}
