'use client';
import {useState} from 'react';

export const CREATOR_PROMPT = [
  'Create an original game for Slopboy 1000 using the official TypeScript GameModule SDK.',
  'Only edit creations/my-first-game/manifest.json and creations/my-first-game/src/game.ts.',
  'The screen is 160x144, palette indices are 0-3, and the supported buttons are UP, DOWN, LEFT, RIGHT, A, B, START, SELECT.',
  'Use only type imports from @slopboy/sdk; no DOM, fetch, network, eval or external runtime packages.',
  'Implement update(context, dt), draw(context), and optionally init(context).',
  'Stay under 64 KiB of compiled JS. Do not grant global coins or assume achievements are trusted.',
  'Provide simple player instructions and do not claim validation succeeded unless you ran it.',
  'I will run pnpm creator:check my-first-game and share JSON errors for you to fix.'
].join('\n');

export default function CopyCreatorPrompt(){
  const [copied,setCopied]=useState(false);
  return <div className="creator-prompt">
    <div className="creator-prompt-heading"><strong>Prompt for ChatGPT / Claude</strong>
      <button type="button" onClick={async()=>{
        try{await navigator.clipboard.writeText(CREATOR_PROMPT);setCopied(true);}catch{setCopied(false);}
      }}>{copied?'Copied ✓':'Copy prompt'}</button>
    </div>
    <pre>{CREATOR_PROMPT}</pre>
  </div>;
}
