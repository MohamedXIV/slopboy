import type { GameModule } from '@slopboy/sdk';
// Entirely cartridge-owned shooter. The host knows nothing about enemy, shots or score.
interface Shot { x:number; y:number }
interface Enemy { x:number; y:number }
let playerX=76;
let shots:Shot[]=[];
let enemies:Enemy[]=[];
let tick=0;
let points=0;
let cooldown=0;
let invulnerable=0;
let lost=false;
const reset=()=>{
  playerX=76;shots=[];enemies=[];tick=0;points=0;cooldown=0;invulnerable=0;lost=false;
};
const game: GameModule = {
  init(){reset();},
  update(ctx,dt){
    if(ctx.input.pressed('START'))reset();
    if(lost)return;
    const step=Math.min(Math.max(dt,0),0.05);
    if(ctx.input.down('LEFT'))playerX=Math.max(6,playerX-92*step);
    if(ctx.input.down('RIGHT'))playerX=Math.min(148,playerX+92*step);
    cooldown=Math.max(0,cooldown-step);
    if(ctx.input.down('A')&&cooldown===0){
      shots.push({x:playerX+3,y:117});
      cooldown=0.18;
    }
    tick+=step;
    if(enemies.length<6 && tick>0.55){
      tick=0;
      enemies.push({x:8+((points*47+enemies.length*31+23)%137),y:6});
    }
    for(const shot of shots)shot.y-=112*step;
    for(const enemy of enemies)enemy.y+=(29+Math.min(points*2,35))*step;
    for(const shot of shots){
      for(const enemy of enemies){
        if(Math.abs(shot.x-enemy.x)<8 && Math.abs(shot.y-enemy.y)<8){
          shot.y=-50;enemy.y=-50;points++;
        }
      }
    }
    shots=shots.filter(shot=>shot.y>-10);
    enemies=enemies.filter(enemy=>enemy.y>-10);
    for(const enemy of enemies){
      if(enemy.y>126 && Math.abs(enemy.x-playerX)<13)lost=true;
      if(enemy.y>138)lost=true;
    }
  },
  draw(ctx){
    ctx.screen.clear(0);
    for(let i=0;i<25;i++){
      const x=(i*43+13)%160;
      const y=(i*61+27)%144;
      ctx.screen.pixel(x,y,1);
    }
    for(let i=0;i<Math.min(points,20);i++)ctx.screen.rect(4+i*7,3,4,3,3);
    ctx.screen.rect(0,136,160,3,1);
    for(const shot of shots)ctx.screen.rect(shot.x,shot.y,2,7,3);
    for(const enemy of enemies){
      ctx.screen.rect(enemy.x-5,enemy.y,14,5,2);
      ctx.screen.rect(enemy.x-2,enemy.y+5,8,3,3);
    }
    if(!lost){
      ctx.screen.rect(playerX-4,123,16,7,3);
      ctx.screen.rect(playerX,119,8,5,2);
    }else{
      ctx.screen.rect(22,54,116,40,2);
      for(let i=0;i<7;i++)ctx.screen.rect(31+i*15,64,9,17,3);
    }
  }
};
export default game;
