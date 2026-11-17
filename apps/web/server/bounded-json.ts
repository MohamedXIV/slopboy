/** Read at most maxBytes even for chunked requests without a Content-Length. */
export async function readBoundedJson(request:Request,maxBytes:number):Promise<unknown>{
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes))throw Error('INVALID_INPUT');
  if(!request.body)throw Error('INVALID_INPUT');
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Error('INVALID_INPUT');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;
}
