'use client';

import {useState} from 'react';
import {Button,Label,TextArea,TextField} from '@heroui/react';
import {
  buildFullPrompt,
  buildLaunchPrompt,
  buildProviderUrl,
  type ChatProvider,
  type GamePromptOptions,
} from '../../lib/ai/game-prompt.ts';
import {GAME_IMPORT_PATH,getGameGuideMarkdown} from '../../lib/ai/game-guide.ts';

const GENRES = [
  ['','No preference — surprise me'],
  ['Arcade','Arcade'],
  ['Puzzle','Puzzle'],
  ['Platformer','Platformer'],
  ['Adventure','Adventure'],
  ['Racing','Racing'],
  ['Strategy','Strategy'],
  ['Other','Something else'],
] as const;

const DIFFICULTIES = [
  ['','Let the AI decide'],
  ['Relaxed','Relaxed'],
  ['Balanced','Balanced'],
  ['Challenging','Challenging'],
] as const;

export default function AIGameBuilder() {
  const [idea, setIdea] = useState('');
  const [genre, setGenre] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');

  const options: GamePromptOptions = {idea, genre, difficulty};
  const ready = Boolean(idea.trim());

  function openIn(provider: ChatProvider) {
    if (!ready) return;
    const guideUrl = `${window.location.origin}/ai/game-guide/v1.md`;
    const prompt = buildLaunchPrompt(options, guideUrl);
    // The outbound prompt contains the user's idea only after this explicit click.
    window.open(buildProviderUrl(provider, prompt), '_blank', 'noopener,noreferrer');
    setStatus(`Opened ${provider === 'chatgpt' ? 'ChatGPT' : 'Claude'} in a new tab. If the prompt does not appear, use Copy full prompt.`);
  }

  async function copyFullPrompt() {
    if (!ready) return;
    const guideUrl = `${window.location.origin}/ai/game-guide/v1.md`;
    try {
      // Local version of the same guide avoids losing clipboard user activation to a fetch.
      await navigator.clipboard.writeText(buildFullPrompt(options, guideUrl, getGameGuideMarkdown()));
      setStatus('Copied full game-building prompt and device guide. Paste it into any AI chat.');
    } catch {
      setStatus('Clipboard access was denied. Open the Markdown guide and copy it manually.');
    }
  }

  return <section className="sb-ai-builder" aria-label="Build your AI game prompt">
    <div className="sb-ai-builder-main">
      <div className="sb-ai-form-head"><span className="sb-ai-step">YOUR IDEA</span><span className="sb-ai-step-tag">NO GENRE REQUIRED</span></div>
      <TextField className="sb-ai-idea-field" name="game-idea" isRequired>
        <Label>What game do you want to make?</Label>
        <TextArea rows={6} maxLength={1000} value={idea} onChange={event=>{setIdea(event.target.value);setStatus('');}}
          placeholder="A tiny co-op game where two astronauts have to repair a spaceship before the oxygen runs out…" />
      </TextField>
      <p className="sb-ai-field-hint">Write naturally, in any language. One sentence is plenty. <span>{idea.length}/1000</span></p>
      <div className="sb-ai-options">
        <label className="sb-ai-option-label" htmlFor="sb-ai-genre">
          <span>Genre <small>Optional</small></span>
          <select id="sb-ai-genre" value={genre} onChange={event=>setGenre(event.target.value)}>
            {GENRES.map(([value,label])=><option value={value} key={value||'none'}>{label}</option>)}
          </select>
        </label>
        <label className="sb-ai-option-label" htmlFor="sb-ai-difficulty">
          <span>Difficulty <small>Optional</small></span>
          <select id="sb-ai-difficulty" value={difficulty} onChange={event=>setDifficulty(event.target.value)}>
            {DIFFICULTIES.map(([value,label])=><option value={value} key={value||'none'}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="sb-ai-prompt-actions">
        <Button variant="primary" className="sb-ai-copy-button" type="button" onPress={()=>void copyFullPrompt()} isDisabled={!ready}>
          Copy full prompt <span aria-hidden="true">↗</span>
        </Button>
        <Button variant="secondary" type="button" onPress={()=>openIn('chatgpt')} isDisabled={!ready}>Open in ChatGPT</Button>
        <Button variant="secondary" type="button" onPress={()=>openIn('claude')} isDisabled={!ready}>Open in Claude</Button>
      </div>
      <div className="sb-ai-builder-foot">
        <a href={GAME_IMPORT_PATH}>Import generated source</a>
        <a href="/ai/game-guide/v1.md" target="_blank" rel="noopener noreferrer">View as Markdown ↗</a>
        <a href="/ai/game-guide/v1.json" target="_blank" rel="noopener noreferrer">Machine-readable JSON ↗</a>
      </div>
      <p className="sb-ai-status" role="status" aria-live="polite">{status}</p>
    </div>
    <aside className="sb-ai-device" aria-label="Target device">
      <div className="sb-ai-device-top"><span>TARGET DEVICE</span><span className="sb-ai-active">● ACTIVE PROFILE</span></div>
      <div className="sb-ai-device-screen"><span className="sb-ai-device-brand">SLOPBOY <small>1000</small></span><div className="sb-ai-screen-art"><span className="sb-ai-pixel-moon"/><span className="sb-ai-pixel-hill"/><span className="sb-ai-pixel-sprite">✦</span></div><small>160 × 144 · 4 INDEXED COLORS</small></div>
      <div className="sb-ai-device-controls"><span>↑ ↓ ← →</span><span>A · B</span><span>START · SELECT</span></div>
      <p>One pocket-sized screen, lots of possibilities. The AI gets the real controls and display limits automatically.</p>
      <div className="sb-ai-device-caution">KAPLAY is experimental. Generating code does not make a playable game or publish it to friends.</div>
    </aside>
    <div className="sb-ai-privacy">No account or OAuth required to prepare a prompt. Clicking an AI button sends your idea to that service; nothing is submitted to Slopboy.</div>
  </section>;
}
