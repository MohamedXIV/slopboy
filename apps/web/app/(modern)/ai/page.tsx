import type {Metadata} from 'next';
import AIGameBuilder from '../../../components/ai/AIGameBuilder';
import './ai.css';

export const metadata: Metadata = {
  title: 'Make a game with AI · Slopboy',
  description: 'Tell ChatGPT or Claude your Slopboy game idea. No genre knowledge or connector required.',
};

export default function AIGamePage() {
  return <main className="sb-ai-page">
    <div className="sb-ai-layout">
      <div className="sb-ai-heading">
        <span className="sb-ai-kicker">SLOPBOY 1000 / GAME IDEAS WELCOME</span>
        <h1>Got a game idea?<br/><em>Let&apos;s make it real.</em></h1>
        <p>No game-dev experience needed. Describe the game you wish existed, and take the idea to your favorite AI assistant.</p>
      </div>
      <AIGameBuilder/>
      <section className="sb-ai-explainer" aria-label="How it works">
        <article><span>01 / IMAGINE</span><h2>Just tell the story.</h2><p>A character, a strange mechanic, or something you want to play with friends. Picking a Genre is optional.</p></article>
        <article><span>02 / BUILD</span><h2>AI gets the rules.</h2><p>The prompt points ChatGPT or Claude to Slopboy&apos;s real device specs, pinned game template and safety limits.</p></article>
        <article><span>03 / KEEP IT YOURS</span><h2>Share when it&apos;s ready.</h2><p>Generated code is not automatically uploaded or playable. Private draft, safe preview and friend sharing have separate gates.</p></article>
      </section>
    </div>
  </main>;
}
