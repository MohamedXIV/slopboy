import type { GameModule } from '@slopboy/sdk';
// Author-owned game code. DO NOT execute until the sandbox security milestone.
let playerX = 72;
let dropX = 32;
let dropY = 0;
let score = 0;
const game: GameModule = {
  update(ctx, dt) {
    const speed = 70 * Math.min(dt, 0.05);
    if (ctx.input.down('LEFT')) playerX = Math.max(0, playerX - speed);
    if (ctx.input.down('RIGHT')) playerX = Math.min(144, playerX + speed);
    dropY += 40 * Math.min(dt, 0.05);
    if (dropY >= 130) {
      if (dropX >= playerX - 4 && dropX <= playerX + 16) score += 1;
      dropX = (dropX + 37 + score * 11) % 150;
      dropY = 0;
    }
  },
  draw(ctx) {
    ctx.screen.clear(0);
    ctx.screen.rect(0, 138, 160, 6, 1);
    ctx.screen.rect(playerX, 130, 16, 5, 3);
    ctx.screen.rect(dropX, dropY, 5, 5, 2);
    for (let i=0;i<Math.min(score,20);i++) ctx.screen.pixel(2+i*6,3,3);
  }
};
export default game;
