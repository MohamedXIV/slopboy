/** Dependency-free deterministic PNG icons for the installable Slopboy PWA. */
import {deflateSync} from 'node:zlib';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const COLORS={background:[14,25,27],shell:[214,236,162],bezel:[37,70,55],lcd:[174,200,130],buttons:[223,121,96]} as const;
type RGB=readonly [number,number,number];
function rounded(x:number,y:number,x0:number,y0:number,x1:number,y1:number,r:number):boolean {
  const cx=Math.max(x0+r,Math.min(x,x1-r)),cy=Math.max(y0+r,Math.min(y,y1-r));
  return (x-cx)**2+(y-cy)**2<=r*r;
}
function colorAt(x:number,y:number):RGB{
  if(!rounded(x,y,55,55,457,457,100))return COLORS.background;
  let color:RGB=COLORS.shell;
  if(rounded(x,y,133,125,380,370,45))color=COLORS.bezel;
  if(rounded(x,y,171,159,342,279,14))color=COLORS.lcd;
  if(rounded(x,y,197,294,254,314,6)||rounded(x,y,212,276,239,332,6))color=COLORS.shell;
  if((x-307)**2+(y-307)**2<17*17||(x-343)**2+(y-330)**2<12*12)color=COLORS.buttons;
  for(const [x0,y0,x1,y1] of [[200,182,308,198],[200,182,218,226],[200,218,308,236],[290,218,308,259],[200,244,308,260]]){
    if(x>=x0&&x<x1&&y>=y0&&y<y1)color=COLORS.bezel;
  }
  return color;
}
function crc32(bytes:Uint8Array):number{
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function chunk(name:string,body:Buffer):Buffer{
  const type=Buffer.from(name,'ascii');
  const out=Buffer.alloc(body.length+12);
  out.writeUInt32BE(body.length,0);
  type.copy(out,4);body.copy(out,8);
  out.writeUInt32BE(crc32(out.subarray(4,8+body.length)),8+body.length);
  return out;
}
export function makeIcon(size:192|512):Buffer {
  const stride=size*4+1;
  const pixels=Buffer.alloc(stride*size);
  for(let y=0;y<size;y++){
    const row=y*stride;pixels[row]=0;
    for(let x=0;x<size;x++){
      const [r,g,b]=colorAt((x+.5)*512/size,(y+.5)*512/size);
      const o=row+1+x*4;
      pixels[o]=r;pixels[o+1]=g;pixels[o+2]=b;pixels[o+3]=255;
    }
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels,{level:9})),chunk('IEND',Buffer.alloc(0))
  ]);
}
export async function buildIcons():Promise<void>{
  const folder=resolve(import.meta.dirname,'../apps/web/public/icons');
  await mkdir(folder,{recursive:true});
  for(const size of [192,512] as const){
    await writeFile(resolve(folder,`slopboy-${size}.png`),makeIcon(size));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  buildIcons().catch(error=>{console.error(error);process.exitCode=1;});
}
