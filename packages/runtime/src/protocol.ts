/** Pure validation of the only costly untrusted payload: a video frame. */
export function validateFrame(value: unknown, width: number, height: number, colors: number): value is Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength!==width*height || value.byteLength>512*512) return false;
  for(let i=0;i<value.length;i++) if(value[i]>=colors)return false;
  return true;
}
export const LCD_PALETTE = ['#b8cc8f','#96ad70','#557c58','#254637'] as const;
export function rasterizeFrame(pixels:Uint8Array, width:number,height:number,palette:readonly string[]):ImageData{
  if(!validateFrame(pixels,width,height,palette.length))throw Error('Invalid frame');
  const frame=new ImageData(width,height);
  const rgb=palette.map(color=>[parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)]);
  for(let i=0;i<pixels.length;i++){
    const color=rgb[pixels[i]];
    frame.data[i*4]=color[0];frame.data[i*4+1]=color[1];frame.data[i*4+2]=color[2];frame.data[i*4+3]=255;
  }
  return frame;
}
