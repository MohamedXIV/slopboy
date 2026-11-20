import ImportGameForm from '../../../components/ai/ImportGameForm';

export const metadata = {title: 'Import a game from AI · Slopboy'};

export default function ImportGamePage() {
  return <main className="mx-auto max-w-3xl px-4 py-12">
    <div className="mb-8 space-y-3">
      <p className="text-sm font-semibold tracking-widest uppercase">AI → Slopboy</p>
      <h1 className="text-3xl font-bold">Bring your game to Slopboy</h1>
      <p>Got a game from ChatGPT or Claude? Copy its single <code>src/game.ts</code> or
        <code> src/game.js</code> module, then paste it here. No GitHub account needed.</p>
      <p className="text-sm">Use the pinned Slopboy KAPLAY game template in your AI chat.
        The AI guide will link back here once both draft features are integrated.</p>
    </div>
    <ImportGameForm/>
  </main>;
}
