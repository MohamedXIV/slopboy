import type { GameContext, GameModule } from '@slopboy/sdk';

export interface BouncyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  score: number;
}

let state: BouncyState = {
  x: 70,
  y: 60,
  vx: 1.5,
  vy: 1.2,
  score: 0,
};

const game: GameModule = {
  init(ctx: GameContext) {
    const saved = ctx.storage.load();
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.score === 'number') {
          state.score = parsed.score;
        }
      } catch {
        // Fall back to clean state
      }
    }
  },

  update(ctx: GameContext, dt: number) {
    const s = state;

    if (ctx.input.down('LEFT')) s.x -= 2;
    if (ctx.input.down('RIGHT')) s.x += 2;
    if (ctx.input.down('UP')) s.y -= 2;
    if (ctx.input.down('DOWN')) s.y += 2;

    if (ctx.input.pressed('A')) {
      s.score += 10;
      ctx.storage.save(JSON.stringify({ score: s.score }));
    }

    if (ctx.input.pressed('B')) {
      s.score = 0;
      ctx.storage.erase();
    }

    s.x += s.vx;
    s.y += s.vy;

    // Bounce off 160x144 logical display bounds
    if (s.x <= 4 || s.x >= 148) s.vx *= -1;
    if (s.y <= 4 || s.y >= 132) s.vy *= -1;

    s.x = Math.max(4, Math.min(148, s.x));
    s.y = Math.max(4, Math.min(132, s.y));
  },

  draw(ctx: GameContext) {
    const s = state;
    // Clear display to lightest shade (0)
    ctx.screen.clear(0);

    // Draw border
    ctx.screen.rect(0, 0, 160, 2, 3);
    ctx.screen.rect(0, 142, 160, 2, 3);
    ctx.screen.rect(0, 0, 2, 144, 3);
    ctx.screen.rect(158, 0, 2, 144, 3);

    // Draw bouncy player square
    ctx.screen.rect(Math.trunc(s.x), Math.trunc(s.y), 8, 8, 2);
    ctx.screen.pixel(Math.trunc(s.x) + 2, Math.trunc(s.y) + 2, 0);
    ctx.screen.pixel(Math.trunc(s.x) + 5, Math.trunc(s.y) + 2, 0);
  },
};

export default game;
