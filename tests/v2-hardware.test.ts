import test from 'node:test';
import assert from 'node:assert/strict';
import {V2_DEVICE_1000,V2_LCD_PALETTES,V2_SHELLS,V2_DEVICE_FAMILIES,validateHardwareProfile,matchesCartridgeRequirements} from '../packages/hardware/src/v2.ts';
test('new hardware profile is internally consistent and engine-independent',()=>{
  assert.doesNotThrow(()=>validateHardwareProfile(V2_DEVICE_1000));
  assert.equal(V2_DEVICE_1000.display.width,160);
  assert.equal(V2_DEVICE_1000.display.indexedColors,4);
  assert.deepEqual(V2_DEVICE_FAMILIES.filter(x=>x.status==='active').map(x=>x.id),['vertical-slab']);
});
test('cosmetic skins never mutate device capabilities',()=>{
  for(const palette of Object.values(V2_LCD_PALETTES)){
    assert.equal(palette.colors.length,V2_DEVICE_1000.display.indexedColors);
    for(const color of palette.colors)assert.match(color,/^#[a-fA-F0-9]{6}$/);
  }
  assert.equal(Object.values(V2_SHELLS).length,4);
  assert.equal(V2_DEVICE_1000.limits.saveBytes,8192);
});
test('capability matching rejects larger screens or unowned buttons',()=>{
  const requirements={display:{width:160,height:144,indexedColors:4},buttons:['A','LEFT']};
  assert.equal(matchesCartridgeRequirements(V2_DEVICE_1000,requirements),true);
  assert.equal(matchesCartridgeRequirements(V2_DEVICE_1000,{...requirements,buttons:['L1']}),false);
  assert.equal(matchesCartridgeRequirements(V2_DEVICE_1000,{...requirements,display:{...requirements.display,indexedColors:16}}),false);
  assert.equal(matchesCartridgeRequirements(V2_DEVICE_1000,{...requirements,display:{...requirements.display,width:320}}),false);
});
test('invalid hardware limits fail closed',()=>{
  assert.throws(()=>validateHardwareProfile({...V2_DEVICE_1000,display:{...V2_DEVICE_1000.display,indexedColors:0}}),/display/);
  assert.throws(()=>validateHardwareProfile({...V2_DEVICE_1000,inputs:['A','A']}),/input/);
  assert.throws(()=>validateHardwareProfile({...V2_DEVICE_1000,limits:{...V2_DEVICE_1000.limits,saveBytes:0}}),/budgets/);
});
