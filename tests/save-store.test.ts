import test from 'node:test';
import assert from 'node:assert/strict';
import {createSaveService,slotKey,validSave,type SaveDriver} from '../packages/runtime/src/save-store.ts';
import {SLOPBOY_1000} from '../packages/hardware/src/index.ts';
test('local save namespace is scoped to hardware, version and cartridge',()=>{
 assert.equal(slotKey('circuit-slide',SLOPBOY_1000),'save-v1:slopboy-1000@0.1.0:circuit-slide');
 assert.notEqual(slotKey('circuit-slide',SLOPBOY_1000),slotKey('star-patrol',SLOPBOY_1000));
 assert.throws(()=>slotKey('../escape',SLOPBOY_1000));
});
test('local save bytes are limited by hardware, not code point length',()=>{
 assert.equal(validSave('a'.repeat(8192),SLOPBOY_1000),true);
 assert.equal(validSave('🍉'.repeat(2049),SLOPBOY_1000),false);
 assert.equal(validSave('a'.repeat(8193),SLOPBOY_1000),false);
 assert.equal(validSave(null,SLOPBOY_1000),true);
 assert.equal(validSave({coins:100},SLOPBOY_1000),false);
});
test('game save reads/writes only its own slot and may erase it',async()=>{
 const db=new Map<string,unknown>();
 const driver:SaveDriver={
  get:async key=>db.get(key),
  put:async(key,value)=>{db.set(key,value);},
  delete:async key=>{db.delete(key);}
 };
 const a=createSaveService(driver,SLOPBOY_1000,'circuit-slide');
 const b=createSaveService(driver,SLOPBOY_1000,'star-patrol');
 assert.equal(await a.read(),null);
 await a.write('{"tiles":[1,2,3]}');
 assert.equal(await a.read(),'{"tiles":[1,2,3]}');
 assert.equal(await b.read(),null);
 await assert.rejects(a.write('x'.repeat(8193)),/budget/);
 await b.write('another save');
 await a.write(null);
 assert.equal(await a.read(),null);
 assert.equal(await b.read(),'another save');
});
test('invalid persisted save data fails closed without forwarding to game',async()=>{
 const driver:SaveDriver={get:async()=>({admin:true}),put:async()=>{},delete:async()=>{}};
 assert.equal(await createSaveService(driver,SLOPBOY_1000,'tiny-catcher').read(),null);
});
