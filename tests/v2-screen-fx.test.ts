import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SCREEN_FX,SCREEN_FX_PRESETS,SCREEN_FX_LEVELS,sanitizeScreenFx,isScreenFxActive,editScreenFx}
  from '../apps/web/components/v2/screen-fx-config.ts';

test('clean is bit-exact passthrough; LCD and phosphor have distinct adjustable visuals',()=>{
  assert.equal(isScreenFxActive(SCREEN_FX_PRESETS.clean),false);
  assert.equal(isScreenFxActive(SCREEN_FX_PRESETS.lcd),true);
  assert.equal(isScreenFxActive(SCREEN_FX_PRESETS.phosphor),true);
  assert.equal(SCREEN_FX_LEVELS.length,8);
  assert.equal(DEFAULT_SCREEN_FX.refresh,'native');
});
test('screen effects do not impose game simulation FPS',()=>{
  assert.equal(isScreenFxActive({...SCREEN_FX_PRESETS.clean,refresh:'20'}),true);
  assert.equal(sanitizeScreenFx({enabled:false,refresh:'20'}).refresh,'20');
  assert.equal(isScreenFxActive({...SCREEN_FX_PRESETS.phosphor,enabled:false}),false);
});
test('stored settings are validated and do not leak unsafe/corrupt values',()=>{
  const restored=sanitizeScreenFx({enabled:false,preset:'phosphor',refresh:'30',glow:500,noise:-20,glass:NaN});
  assert.equal(restored.enabled,false);
  assert.equal(restored.glow,100);
  assert.equal(restored.noise,0);
  assert.equal(restored.glass,0);
  assert.equal(restored.refresh,'30');
  assert.equal(sanitizeScreenFx({preset:'bogus',refresh:'banana'}).refresh,'native');
  assert.deepEqual(sanitizeScreenFx(null),DEFAULT_SCREEN_FX);
  assert.equal(editScreenFx(SCREEN_FX_PRESETS.lcd,'ghosting',101).ghosting,100);
  assert.equal(editScreenFx(SCREEN_FX_PRESETS.lcd,'ghosting',3).preset,'custom');
});
