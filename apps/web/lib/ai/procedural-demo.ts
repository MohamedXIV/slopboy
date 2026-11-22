/** Fixed, reviewed demo module, loaded as text into the opaque game worker. */
export const PROCEDURAL_DEMO = `
let x = 8, y = 8;
export default {
  init({storage}) {
    try {
      const saved = JSON.parse(storage.load());
      if (Array.isArray(saved) && saved.length === 2 &&
          saved.every((n) => Number.isInteger(n) && n >= 1 && n <= 8)) [x, y] = saved;
    } catch {}
  },
  update({input, audio, storage}) {
    const dx = Number(input.pressed('RIGHT')) - Number(input.pressed('LEFT'));
    const dy = Number(input.pressed('DOWN')) - Number(input.pressed('UP'));
    if (dx || dy) {
      x = Math.min(8, Math.max(1, x + dx));
      y = Math.min(8, Math.max(1, y + dy));
      audio?.tone(48 + x + y);
    }
    if (input.pressed('A')) {
      storage.save(JSON.stringify([x, y]));
      audio?.tone(72);
    }
  },
  draw({screen}) {
    screen.clear(0);
    for (let row = 1; row <= 8; row++) {
      for (let column = 1; column <= 8; column++) {
        screen.rect(column * 16 + 4, row * 14 + 6, 9, 8, (column + row) % 2 + 1);
      }
    }
    screen.rect(x * 16 + 2, y * 14 + 4, 13, 12, 3);
  },
};
`;
