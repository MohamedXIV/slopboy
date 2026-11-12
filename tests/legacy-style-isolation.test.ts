import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('only minimal reset stays in the app root; old V1 presentation is scoped to /legacy',async()=>{
  const root=await readFile(new URL('../apps/web/app/globals.css',import.meta.url),'utf8');
  const legacy=await readFile(new URL('../apps/web/app/legacy/legacy.css',import.meta.url),'utf8');
  assert.match(root,/@import "tailwindcss"/);
  for(const selector of ['.hero{','.console{','.topbar{','h1{','footer{']){
    assert.ok(!root.includes(selector),'Unscoped V1 selector leaked into modern root: '+selector);
  }
  for(const selector of ['.hero{','.console{','.topbar{','h1{','footer{']){
    assert.ok(legacy.includes('.slopboy-legacy '+selector),'Lost V1 presentation: '+selector);
  }
  assert.ok(legacy.includes('@media(max-width:500px)'));
});
