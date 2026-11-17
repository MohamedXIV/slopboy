/** The seeded, non-login principal owns games managed on Slopboy's behalf. */
export const PLATFORM_OWNER_ID='00000000-0000-4000-a000-000000000001';

export type GameActor={readonly id:string;readonly role:'player'|'creator'|'admin'|'system'};

/** Actors must come from a verified session and a persisted database profile. */
export function canManagePlatformGames(actor:GameActor|null):boolean{
  return actor?.role==='admin'&&actor.id!==PLATFORM_OWNER_ID;
}

/** Administrators manage platform games, not other users' private games. */
export function canManageGame(actor:GameActor|null,ownerId:string):boolean{
  if(!actor||actor.role==='system')return false;
  if(ownerId===PLATFORM_OWNER_ID)return canManagePlatformGames(actor);
  return actor.id===ownerId;
}
