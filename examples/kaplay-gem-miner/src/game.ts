import kaplay from 'kaplay';

export interface GemMinerHostContext {
  storage: {
    load(): string | null;
    save(value: string): void;
    erase(): void;
  };
}

export default function createGemMiner(kInit: typeof kaplay, canvas: HTMLCanvasElement, host?: GemMinerHostContext) {
  const k = kInit({
    canvas,
    width: 160,
    height: 144,
    scale: 1,
    pixelDensity: 1,
    maxFPS: 60,
    global: false,
    crisp: true,
    background: [220, 233, 177],
    touchToMouse: false,
    debug: false,
    loadingScreen: false,
  });

  const ink = [40, 72, 62];
  const muted = [100, 132, 104];
  const mid = [170, 194, 130];

  // Draw ground
  k.add([k.rect(160, 16), k.pos(0, 128), k.color(muted[0], muted[1], muted[2])]);

  // Miner player
  const player = k.add([k.rect(12, 12), k.pos(20, 116), k.color(ink[0], ink[1], ink[2])]);

  // Gem targets
  const gems = [
    k.add([k.rect(8, 8), k.pos(50, 60), k.color(mid[0], mid[1], mid[2])]),
    k.add([k.rect(8, 8), k.pos(90, 80), k.color(mid[0], mid[1], mid[2])]),
    k.add([k.rect(8, 8), k.pos(130, 45), k.color(mid[0], mid[1], mid[2])]),
  ];

  let held = new Set<string>();
  let score = 0;
  let highScore = 0;
  let updates = 0;
  let inputPackets = 0;
  let paused = false;

  // Restore saved highscore if available
  if (host?.storage) {
    const raw = host.storage.load();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.highScore === 'number') {
          highScore = parsed.highScore;
        }
      } catch {
        // Fall back to clean state
      }
    }
  }

  const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

  k.onUpdate(() => {
    if (paused) return;
    updates++;
    const dt = Math.min(k.dt(), 0.05);
    const speed = held.has('A') ? 120 : 75;

    const dx = (Number(held.has('RIGHT')) - Number(held.has('LEFT'))) * speed * dt;
    const dy = (Number(held.has('DOWN')) - Number(held.has('UP'))) * speed * dt;

    player.pos.x = clamp(player.pos.x + dx, 2, 146);
    player.pos.y = clamp(player.pos.y + dy, 10, 116);

    // Gem collection checks
    for (const gem of gems) {
      const dist = Math.hypot(player.pos.x - gem.pos.x, player.pos.y - gem.pos.y);
      if (dist < 10) {
        score += 100;
        gem.pos.x = 20 + Math.random() * 120;
        gem.pos.y = 20 + Math.random() * 90;

        if (score > highScore && host?.storage) {
          highScore = score;
          host.storage.save(JSON.stringify({ highScore }));
        }
      }
    }
  });

  return {
    setInput(keys: readonly string[]) {
      inputPackets++;
      held = new Set(keys);
    },
    getInputPackets() {
      return inputPackets;
    },
    getPlayerX() {
      return player.pos.x;
    },
    getPlayerY() {
      return player.pos.y;
    },
    getScore() {
      return score;
    },
    getHighScore() {
      return highScore;
    },
    getTicks() {
      return updates;
    },
    getAssetProgress() {
      return k.loadProgress();
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    restart() {
      paused = false;
      held.clear();
      player.pos.x = 20;
      player.pos.y = 116;
      score = 0;
    },
    stop() {
      k.quit();
    },
  };
}
