'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Button, Card, Label, ListBox, Select, TextArea, TextField} from '@heroui/react';
import {PRIVATE_SOURCE_LIMIT} from '@slopboy/cartridge/private-source-template';
import {existingGameSourceRequest, reuseSubmission,
  type PendingSubmission, type SourceLanguage} from '../../lib/ai/source-import';

type RevisionSummary = {id: string; language: string; checksum: string | null;
  createdAt: string; validated: boolean};
type RevisionSource = RevisionSummary & {source: string};

const errorMessage: Record<string, string> = {
  UNAUTHENTICATED: 'Sign in again to see your private revisions.',
  FORBIDDEN: 'A verified Slopboy account is required.',
  NOT_FOUND: 'This private game or revision is not available to your account.',
  DATABASE_UNAVAILABLE: 'Private history is not available on this environment yet.',
  PRIVATE_STORAGE_UNAVAILABLE: 'Source storage is not ready yet.',
  SOURCE_QUOTA: 'You reached the private source storage or hourly save limit.',
  REJECTED_BY_VALIDATION: 'Your edited code did not pass source checks.',
};

export default function SourceHistory({gameId}: {gameId: string}) {
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RevisionSource | null>(null);
  const [source, setSource] = useState('');
  const [language, setLanguage] = useState<SourceLanguage>('typescript');
  const [notice, setNotice] = useState('');
  const [diagnostics, setDiagnostics] = useState<{message: string; line?: number; column?: number}[]>([]);
  const pendingSave = useRef<PendingSubmission | null>(null);
  const endpoint = `/api/manage/games/${encodeURIComponent(gameId)}/source-history`;

  const refresh = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    try {
      const response = await fetch(endpoint, {cache: 'no-store', signal});
      const data = await response.json() as {error?: string; revisions?: RevisionSummary[]};
      if (signal?.aborted) return false;
      if (!response.ok || !Array.isArray(data.revisions)) {
        setNotice(errorMessage[data.error ?? ''] ?? 'Could not load your private versions.');
        return false;
      }
      setRevisions(data.revisions);
      return true;
    } catch {
      if (!signal?.aborted) setNotice('History could not be loaded. Try again later.');
      return false;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    // Defer the async state transition until after the effect's setup phase.
    const timer = window.setTimeout(() => {void refresh(controller.signal);}, 0);
    return () => {window.clearTimeout(timer); controller.abort();};
  }, [refresh]);

  async function loadRevision(revisionId: string) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setDiagnostics([]);
    try {
      // Only a revision UUID travels in the URL, never its code.
      const response = await fetch(`${endpoint}?revision=${encodeURIComponent(revisionId)}`,
        {cache: 'no-store'});
      const data = await response.json() as {error?: string; revision?: RevisionSource};
      if (!response.ok || !data.revision || data.revision.id !== revisionId ||
          typeof data.revision.source !== 'string' ||
          !['typescript', 'javascript'].includes(data.revision.language)) {
        setNotice(errorMessage[data.error ?? ''] ?? 'This version could not be loaded.');
        return;
      }
      setSelected(data.revision);
      setSource(data.revision.source);
      setLanguage(data.revision.language as SourceLanguage);
      pendingSave.current = null;
      setNotice(data.revision.validated
        ? 'Version loaded as editable text. Saving creates a new revision, not an overwrite.'
        : 'Legacy unvalidated source loaded. It must pass current checks before another save.');
    } catch {
      setNotice('Could not load the selected version. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAsNewVersion() {
    if (busy || !selected || !source.trim()) return;
    const unchangedPayload = JSON.stringify(existingGameSourceRequest(language, source, 'save'));
    pendingSave.current = reuseSubmission(pendingSave.current, unchangedPayload, () => crypto.randomUUID());
    const request = existingGameSourceRequest(language, source, 'save', pendingSave.current.id);
    setBusy(true);
    setNotice('');
    setDiagnostics([]);
    try {
      const response = await fetch(`/api/manage/games/${encodeURIComponent(gameId)}/source`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(request),
      });
      const data = await response.json() as {error?: string; diagnostics?: typeof diagnostics; revisionId?: string};
      if (response.status === 422) {
        setDiagnostics(Array.isArray(data.diagnostics) ? data.diagnostics : []);
        setNotice('Source checks rejected this version. Make changes and try again.');
      } else if (!response.ok) {
        setNotice(errorMessage[data.error ?? ''] ?? 'Unable to save a new version. Try again.');
      } else if (data.revisionId) {
        const id = data.revisionId;
        const refreshed = await refresh();
        setNotice(refreshed ? `Saved a new private source revision: ${id}`
          : `Save confirmed (${id}), but the history list could not be refreshed.`);
        if (refreshed) {setSelected(null); setSource(''); pendingSave.current = null;}
      } else {
        setNotice('The save response was incomplete. Check history before retrying.');
      }
    } catch {
      setNotice('The save could not be confirmed. Retrying the same code reuses its submission ID.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-6">
    <Alert status="warning"><Alert.Indicator/><Alert.Content>
      <Alert.Title>Source only · Preview disabled</Alert.Title>
      Your revisions are private source text. None of them can be built, run, shared or published here yet.
    </Alert.Content></Alert>
    <Card variant="secondary"><Card.Header><Card.Title>Latest 50 stored versions</Card.Title>
      <Card.Description>Newest first · each save keeps the earlier version unchanged</Card.Description>
    </Card.Header><Card.Content>
      {loading ? <p role="status">Loading private versions…</p> : revisions.length === 0
        ? <p>No source versions available for this private game.</p>
        : <ol className="space-y-3">{revisions.map((revision, index) =>
          <li key={revision.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{index === 0 ? 'Latest · ' : ''}{revision.language} ·
                  {revision.validated ? ' source-checked' : ' legacy unvalidated'}</p>
                <p className="break-all text-xs">Revision {revision.id}</p>
                <p className="text-xs">{revision.createdAt}</p>
                {revision.checksum && <p className="break-all text-xs">SHA-256 {revision.checksum}</p>}
              </div>
              <Button type="button" variant="secondary" size="sm" isDisabled={busy}
                onPress={() => void loadRevision(revision.id)}>Load into editor</Button>
            </div>
          </li>)}</ol>}
    </Card.Content></Card>
    {selected && <Card variant="secondary"><Card.Header>
      <Card.Title>Save as a new version</Card.Title>
      <Card.Description>Editing a copy of {selected.id}. The original is never overwritten.</Card.Description>
    </Card.Header><Card.Content><div className="space-y-4">
      <Select fullWidth isDisabled={busy} value={language} onChange={value => {
        if (value === 'typescript' || value === 'javascript') {
          setLanguage(value); pendingSave.current = null; setDiagnostics([]);
        }
      }}><Label>Language</Label><Select.Trigger><Select.Value/><Select.Indicator/></Select.Trigger>
        <Select.Popover><ListBox>
          <ListBox.Item id="typescript" textValue="TypeScript">TypeScript</ListBox.Item>
          <ListBox.Item id="javascript" textValue="JavaScript">JavaScript</ListBox.Item>
        </ListBox></Select.Popover>
      </Select>
      <TextField isRequired isDisabled={busy}><Label>Editable source text</Label>
        <TextArea className="font-mono" rows={15} maxLength={PRIVATE_SOURCE_LIMIT} value={source}
          onChange={event => {setSource(event.target.value); pendingSave.current = null;
            setDiagnostics([]); setNotice('');}}/>
      </TextField>
      {diagnostics.length > 0 && <Alert status="danger"><Alert.Indicator/><Alert.Content>
        <Alert.Title>Source checks found issues</Alert.Title>
        <ul>{diagnostics.map((item, index) => <li key={index}>
          {item.line ? `Line ${item.line}${item.column ? `:${item.column}` : ''}: ` : ''}{item.message}
        </li>)}</ul>
      </Alert.Content></Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" isDisabled={busy || !source.trim()}
          onPress={() => void saveAsNewVersion()}>Save as a new version</Button>
        <Button type="button" variant="secondary" isDisabled={busy}
          onPress={() => {setSelected(null); setSource(''); setNotice(''); pendingSave.current = null;}}>
          Cancel
        </Button>
      </div>
    </div></Card.Content></Card>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </div>;
}
