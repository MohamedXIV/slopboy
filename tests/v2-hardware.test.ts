import test from 'node:test';
import assert from 'node:assert/strict';
import {V2_DEVICE_1000,V2_LCD_PALETTES,V2_SHELLS,V2_DEVICE_FAMILIES,validateHardwareProfile,matchesCartridgeRequirements} from '../packages/hardware/src/v2.ts';

test('V2 emulates resolution and indexed colors only',()=>{
  assert.doesNotThrow(()=>validateHardwareProfile(V2_DEVICE_1000));
  assert.deepEqual(V2_DEVICE_1000.display,{width:160,height:144,indexedColors:4});
  assert.deepEqual(V2_DEVICE_FAMILIES.filter(x=>x.status==='active').map(x=>x.id),['vertical-slab']);
  assert.equal('limits' in V2_DEVICE_1000,false);
  assert.equal('audio' in V2_DEVICE_1000,false);
  assert.equal('targetFramesPerSecond' in V2_DEVICE_1000.display,false);
});
test('cosmetics do not change display resolution or palette depth',()=>{
  for(const palette of Object.values(V2_LCD_PALETTES)){
    assert.equal(palette.colors.length,V2_DEVICE_1000.display.indexedColors);
    for(const color of palette.colors)assert.match(color,/^#[a-fA-F0-9]{6}$/);
  }
  assert.equal(Object.values(V2_SHELLS).length,4);
  assert.deepEqual(V2_DEVICE_1000.display,{width:160,height:144,indexedColors:4});
});
test('compatibility is display-only; controls are input-mapping metadata',()=>{
  const requirements={display:{width:160,height:144,indexedColors:4}};
  assert.equal(matchesCartridgeRequirements(V2_DEVICE_1000,requirements),true);
  assert.equal(matchesCartridgeRequirements(V2_DEVICE_1000,{display:{...requirements.display,indexedColors:2}}),true);
  assert.equal(matchesCartridgeRequirements(V2_DEVICE_1000,{display:{...requirements.display,indexedColors:16}}),false);
  assert.equal(matchesCartridgeRequirements(V2_DEVICE_1000,{display:{...requirements.display,width:320}}),false);
});
test('invalid display capabilities and duplicate control mapping are rejected',()=>{
  assert.throws(()=>validateHardwareProfile({...V2_DEVICE_1000,display:{...V2_DEVICE_1000.display,indexedColors:0}}),/display/);
  assert.throws(()=>validateHardwareProfile({...V2_DEVICE_1000,display:{...V2_DEVICE_1000.display,height:-1}}),/display/);
  assert.throws(()=>validateHardwareProfile({...V2_DEVICE_1000,inputs:['A','A']}),/input/);
});
