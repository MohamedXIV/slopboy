import type { GameModule, GameContext } from '@slopboy/sdk';
// Sliding 3x3 number puzzle. Arrows move the empty slot; A/Start reshuffles.
const SIZE=3;
let tiles:number[]=[1,2,3,4,5,6,7,8,0];
let blank=8;
let solved=false;
let seed=7109;
const next=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
const move=(dx:number,dy:number)=>{
  const x=blank%SIZE,y=Math.floor(blank/SIZE);
  const nx=x+dx,ny=y+dy;
  if(nx<0||ny<0||nx>=SIZE||ny>=SIZE)return false;
  const target=ny*SIZE+nx;
  tiles[blank]=tiles[target];tiles[target]=0;blank=target;
  return true;
};
const checkSolved=()=>tiles.every((tile,i)=>tile===(i+1)%9);
const scramble=()=>{
  tiles=[1,2,3,4,5,6,7,8,0];blank=8;solved=false;
  let last=-1;
  for(let i=0;i<55;i++){
    const directions:[[number,number],[number,number],[number,number],[number,number]]=[[0,-1],[0,1],[-1,0],[1,0]];
    const pick=next()%4;
    if((pick^1)===last)continue;
    if(move(directions[pick][0],directions[pick][1]))last=pick;
  }
  if(checkSolved())move(0,-1);
};
const remember=(ctx:GameContext)=>ctx.storage.save(JSON.stringify({version:1,tiles,seed}));
const restore=(ctx:GameContext):boolean=>{
  const text=ctx.storage.load();
  if(!text)return false;
  try {
    const data=JSON.parse(text);
    if(!data||data.version!==1||!Array.isArray(data.tiles)||data.tiles.length!==9)return false;
    if(new Set(data.tiles).size!==9||data.tiles.some((v:unknown)=>!Number.isInteger(v)||(v as number)<0||(v as number)>8))return false;
    if(!Number.isInteger(data.seed)||data.seed<0||data.seed>0xffffffff)return false;
    tiles=[...data.tiles];blank=tiles.indexOf(0);seed=data.seed;solved=checkSolved();
    return true;
  }catch{return false;}
};
const game:GameModule={
  init(ctx){if(!restore(ctx)){scramble();remember(ctx);}},
  update(ctx){
    if(ctx.input.pressed('A')||ctx.input.pressed('START')){scramble();remember(ctx);return;}
    if(solved)return;
    let moved=false;
    if(ctx.input.pressed('UP'))moved=move(0,-1);
    else if(ctx.input.pressed('DOWN'))moved=move(0,1);
    else if(ctx.input.pressed('LEFT'))moved=move(-1,0);
    else if(ctx.input.pressed('RIGHT'))moved=move(1,0);
    if(moved){solved=checkSolved();remember(ctx);}
  },
  draw(ctx){
    ctx.screen.clear(0);
    ctx.screen.rect(12,11,136,122,1);
    const side=38,offsetX=23,offsetY=16;
    for(let i=0;i<tiles.length;i++){
      const value=tiles[i];
      const x=offsetX+(i%SIZE)*side,y=offsetY+Math.floor(i/SIZE)*side;
      if(value===0){ctx.screen.rect(x+3,y+3,32,32,0);continue;}
      ctx.screen.rect(x+1,y+1,35,35,2);
      ctx.screen.rect(x+4,y+4,29,29,3);
      const bits=value;
      for(let bit=0;bit<4;bit++){
        ctx.screen.rect(x+7+bit*6,y+9,4,19,(bits&(1<<bit))?0:2);
      }
      ctx.screen.rect(x+7,y+30,23,2,1);
    }
    if(solved){
      ctx.screen.rect(14,137,132,5,3);
    } else {
      ctx.screen.rect(14,137,132,3,1);
    }
  }
};
export default game;
