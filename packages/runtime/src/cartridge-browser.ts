import type { HardwareProfile } from '../../hardware/src/index.ts';

export interface BrowserCartridge {
  readonly format: 'slopboy-cartridge-v0';
  readonly manifest: {readonly id:string;readonly title:string;readonly hardware:{readonly id:string;readonly version:string}};
  readonly code: string;
}

/** Downloads only a known first-party public cartridge path; limits gzip inflation. */
export async function loadBundledCartridge(path: string, hardware: HardwareProfile): Promise<BrowserCartridge> {
  if (!/^\/cartridges\/[a-z0-9-]+\.slop$/.test(path)) throw Error('Invalid cartridge path');
  const response = await fetch(path, {credentials:'omit', redirect:'error', cache:'no-store'});
  if (!response.ok || !response.body) throw Error('Cartridge unavailable');
  const compressed = new Uint8Array(await response.arrayBuffer());
  if (compressed.byteLength < 2 || compressed.byteLength > hardware.budgets.compressedBytes) throw Error('Cartridge too large');
  if (typeof DecompressionStream === 'undefined') throw Error('This browser does not support cartridge decompression');
  const byteCopy = Uint8Array.from(compressed);
  const stream = new Blob([byteCopy]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length>hardware.budgets.extractedBytes) throw Error('Cartridge decompression budget exceeded');
      chunks.push(value);
    }
  } finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);
  let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const candidate: unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))throw Error('Invalid cartridge');
  const obj = candidate as Record<string,unknown>;
  if(obj.format!=='slopboy-cartridge-v0'||!obj.manifest||typeof obj.manifest!=='object')throw Error('Unknown cartridge format');
  const manifest=obj.manifest as Record<string,unknown>;
  const target=manifest.hardware as Record<string,unknown>|undefined;
  if(!target||target.id!==hardware.id||target.version!==hardware.version)throw Error('Incompatible hardware');
  if(typeof obj.code!=='string'||new TextEncoder().encode(obj.code).byteLength>hardware.budgets.codeBytes)throw Error('Invalid game code');
  if(typeof manifest.title!=='string'||typeof manifest.id!=='string')throw Error('Missing metadata');
  return obj as unknown as BrowserCartridge;
}
