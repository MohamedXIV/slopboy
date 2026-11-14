import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameMetadata} from '../apps/web/server/game-management-contract.ts';

test('game metadata accepts bounded presentation fields only',()=>{
  assert.deepEqual(parseGameMetadata({title:'  New game ',tagline:' Fun ',description:'',genre:'Puzzle'}),
    {title:'New game',tagline:'Fun',description:null,genre:'Puzzle'});
  for(const value of [null,{}, {title:' ',genre:'Puzzle'}, {title:'x',genre:'fake'},
    {title:'x',genre:'Puzzle',ownerId:'attacker'}, {title:'x'.repeat(81),genre:'Puzzle'},
    {title:'x',genre:'Puzzle',description:'x'.repeat(2001)}]){
    assert.equal(parseGameMetadata(value),null);
  }
});
