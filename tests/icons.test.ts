import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {makeIcon} from '../tools/build-icons.ts';
test('both PWA icons have valid PNG signatures, sizes, scanlines and deterministic bytes',()=>{
 for(const size of [192,512] as const){
  const a=makeIcon(size),b=makeIcon(size);
  assert.deepEqual(a,b);
  assert.equal(a.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(a.toString('ascii',12,16),'IHDR');
  assert.equal(a.readUInt32BE(16),size);
  assert.equal(a.readUInt32BE(20),size);
  assert.equal(a[25],6);
  const position=8+12+13;
  const length=a.readUInt32BE(position);
  assert.equal(a.toString('ascii',position+4,position+8),'IDAT');
  const data=inflateSync(a.subarray(position+8,position+8+length));
  assert.equal(data.byteLength,size*(size*4+1));
 }
});
