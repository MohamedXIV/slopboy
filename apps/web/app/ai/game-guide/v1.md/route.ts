import {getGameGuideMarkdown} from '../../../../lib/ai/game-guide.ts';

export function GET(): Response {
  return new Response(getGameGuideMarkdown(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
