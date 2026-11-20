export type GamePromptOptions = {
  idea: string;
  genre?: string;
  difficulty?: string;
};

export type ChatProvider = 'chatgpt' | 'claude';

/** A free-form idea is enough; Genre is deliberately not a mandatory input. */
export function buildLaunchPrompt(options: GamePromptOptions, guideUrl: string): string {
  const idea = options.idea.trim();
  if (!idea) throw new Error('Please describe your game idea first.');
  const lines = [
    'Help me turn this idea into a small original game for the Slopboy 1000.',
    `My game idea: ${idea}`,
  ];
  if (options.genre?.trim()) lines.push(`Optional style/Genre preference: ${options.genre.trim()}.`);
  if (options.difficulty?.trim()) lines.push(`Optional challenge preference: ${options.difficulty.trim()}.`);
  lines.push(
    `Official Slopboy v1 AI game guide: ${guideUrl}`,
    'Please read the guide if available. If you cannot open it, tell me so and ask me to paste it.',
    'You can infer a suitable Genre from my idea; do not require me to pick one.',
    'Use the maintained Slopboy framework cartridge template; do not make a generic HTML game.',
    'When finished, give me the complete src/game.ts in a copyable code block and clear Slopboy handoff instructions. Do not claim a link has auto-imported or saved my source.',
    'Be honest about experimental engines and validation. Do not claim my game is uploaded, playable, shared or published.',
  );
  return lines.join('\n');
}

export function buildFullPrompt(options: GamePromptOptions, guideUrl: string, fullGuide: string): string {
  return `${buildLaunchPrompt(options, guideUrl)}\n\n--- OFFICIAL GAME GUIDE ---\n\n${fullGuide.trim()}`;
}

export function buildProviderUrl(provider: ChatProvider, prompt: string): string {
  const base = provider === 'chatgpt' ? 'https://chatgpt.com/' : 'https://claude.ai/new';
  return `${base}?q=${encodeURIComponent(prompt)}`;
}
