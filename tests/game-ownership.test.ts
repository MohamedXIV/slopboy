import test from 'node:test';
import assert from 'node:assert/strict';
import {PLATFORM_OWNER_ID,canManageGame,canManagePlatformGames} from '../apps/web/server/game-ownership.ts';

test('only an authenticated admin manages platform games; users manage only their own',()=>{
  const player={id:'player-a',role:'player'} as const;
  const other={id:'player-b',role:'creator'} as const;
  const admin={id:'admin',role:'admin'} as const;
  const system={id:PLATFORM_OWNER_ID,role:'system'} as const;
  assert.equal(canManageGame(null,PLATFORM_OWNER_ID),false);
  assert.equal(canManageGame(player,PLATFORM_OWNER_ID),false);
  assert.equal(canManageGame(system,PLATFORM_OWNER_ID),false);
  assert.equal(canManageGame(admin,PLATFORM_OWNER_ID),true);
  assert.equal(canManageGame(player,player.id),true);
  assert.equal(canManageGame(other,player.id),false);
  assert.equal(canManageGame(admin,player.id),false);
  assert.equal(canManagePlatformGames({id:PLATFORM_OWNER_ID,role:'admin'}),false);
});
