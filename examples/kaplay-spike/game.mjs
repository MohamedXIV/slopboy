/**
 * Orbit Dodge: a genuine first-party KAPLAY cartridge source, not a DOM/CSS
 * animation. Only a vetted source fixture may be included in this spike build.
 */
export default function createOrbitDodge(kaplay, canvas) {
  const k = kaplay({
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
  });
  const ink = [40, 72, 62];
  const muted = [100, 132, 104];
  const mid = [170, 194, 130];
  k.add([k.rect(160, 12), k.pos(0, 132), k.color(...muted)]);
  for (let i = 0; i < 5; i++) {
    k.add([k.rect(10, 4), k.pos(10 + i * 30, 21 + i % 2 * 12), k.color(...mid)]);
  }
  const player = k.add([k.rect(13, 13), k.pos(24, 103), k.color(...ink)]);
  const satellite = k.add([k.rect(12, 12), k.pos(80, 40), k.color(...muted)]);
  const beacon = k.add([k.rect(8, 8), k.pos(115, 90), k.color(...ink)]);
  let held = new Set();
  let elapsed = 0;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 0.05);
    elapsed += dt;
    const speed = held.has("A") ? 115 : 76;
    const x = (Number(held.has("RIGHT")) - Number(held.has("LEFT"))) * speed * dt;
    const y = (Number(held.has("DOWN")) - Number(held.has("UP"))) * speed * dt;
    player.pos.x = clamp(player.pos.x + x, 0, 147);
    player.pos.y = clamp(player.pos.y + y, 13, 119);
    satellite.pos.x = 80 + Math.sin(elapsed * 1.9) * 49;
    satellite.pos.y = 42 + Math.cos(elapsed * 2.6) * 22;
    beacon.pos.x = 107 + Math.sin(elapsed * 3.3) * 14;
  });
  return {
    setInput(keys) { held = new Set(keys); },
    getPlayerX() { return player.pos.x; },
    stop() { k.quit(); },
  };
}
