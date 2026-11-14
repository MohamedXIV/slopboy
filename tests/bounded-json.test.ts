import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedJson} from '../apps/web/server/bounded-json.ts';

test('bounded JSON rejects oversized chunked requests and malformed UTF-8',async()=>{
  const chunked=new Request('http://localhost/',{method:'POST',body:new ReadableStream({
    start(controller){controller.enqueue(new TextEncoder().encode('1234'));controller.enqueue(new TextEncoder().encode('5678'));controller.close();}
  }),duplex:'half'} as RequestInit);
  await assert.rejects(()=>readBoundedJson(chunked,7));
  const invalid=new Request('http://localhost/',{method:'POST',body:new Uint8Array([0xff])});
  await assert.rejects(()=>readBoundedJson(invalid,8));
  const valid=new Request('http://localhost/',{method:'POST',body:'{"x":1}'});
  assert.deepEqual(await readBoundedJson(valid,16),{x:1});
});
