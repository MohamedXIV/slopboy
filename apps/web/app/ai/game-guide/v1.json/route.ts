import {getGameGuideContract} from '../../../../lib/ai/game-guide.ts';

export function GET(): Response {
  return Response.json(getGameGuideContract(), {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
