import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {inspectPrivateSource} from '@slopboy/cartridge';
import {PRIVATE_SOURCE_TEMPLATE} from '@slopboy/cartridge/private-source-template';

const formats: Readonly<Record<string, string>> = Object.freeze({
  ts: 'text/typescript', js: 'text/javascript', png: 'image/png', jpg: 'image/jpeg', wav: 'audio/wav',
});
const maxProject = 2 * 1024 * 1024;
const sourcePath = /^src\/[a-z0-9][a-z0-9_-]{0,47}\.(?:ts|js)$/;
const assetPath = /^assets\/[a-z0-9][a-z0-9_-]{0,47}\.(?:png|jpg|wav)$/;

export type ProjectFile = {path: string; mime: string; bytes: number; sha256: string};
export type ProjectManifest = NonNullable<ReturnType<typeof parseUploadManifest>>;

export function parseUploadManifest(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1) return null;
  const files = (raw as {files?: unknown}).files;
  if (!Array.isArray(files) || files.length < 1 || files.length > 16) return null;

  const seen = new Set<string>();
  const parsed: ProjectFile[] = [];
  let entrypoint = '';
  let total = 0;
  for (const item of files) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 4) return null;
    const {path, mime, bytes, sha256} = item;
    if (typeof path !== 'string' || seen.has(path) || (!sourcePath.test(path) && !assetPath.test(path))) return null;
    const extension = path.slice(path.lastIndexOf('.') + 1);
    if (mime !== formats[extension] || !Number.isSafeInteger(bytes) || bytes < 1 ||
        bytes > (sourcePath.test(path) ? 65536 : 524288) ||
        typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null;
    if (path === 'src/game.ts' || path === 'src/game.js') {
      if (entrypoint) return null;
      entrypoint = path;
    }
    total += bytes;
    seen.add(path);
    parsed.push({path,mime,bytes,sha256});
  }
  if (!entrypoint || total > maxProject) return null;
  parsed.sort((a,b) => a.path.localeCompare(b.path));
  const {id,version,adapterProtocol,deviceProfile} = PRIVATE_SOURCE_TEMPLATE;
  return {schemaVersion: 1, engine: {id,version,adapterProtocol}, deviceProfile, entrypoint, files: parsed};
}

export function validateArtifactBytes(manifest: ProjectManifest, file: ProjectFile, bytes: Buffer) {
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) return false;
  if (sourcePath.test(file.path)) {
    const source = bytes.toString('utf8');
    if (!Buffer.from(source).equals(bytes)) return false;
    const localImports = new Set(manifest.files.filter(f => f.path !== file.path && sourcePath.test(f.path))
      .map(f => './' + f.path.slice(4)));
    return inspectPrivateSource({
      engine: manifest.engine.id, version: manifest.engine.version,
      language: file.path.endsWith('.ts') ? 'typescript' : 'javascript', source,
    }, {path: file.path, localImports, entrypoint: file.path === manifest.entrypoint}).ok;
  }
  if (file.mime === 'image/png') return bytes.length >= 33 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) &&
    bytes.readUInt32BE(8) === 13 && bytes.subarray(12,16).toString() === 'IHDR' &&
    bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 2048 &&
    bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 2048;
  if (file.mime === 'image/jpeg') return bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8 &&
    bytes.readUInt16BE(bytes.length-2) === 0xffd9;
  return file.mime === 'audio/wav' && bytes.length >= 44 && bytes.subarray(0,4).toString() === 'RIFF' &&
    bytes.readUInt32LE(4) === bytes.length - 8 && bytes.subarray(8,12).toString() === 'WAVE';
}

type Action = 'read' | 'upload';
export function issueArtifactTicket(secret: string, action: Action, actor: string, stage: string, path: string, expires: number) {
  const signature = createHmac('sha256',secret).update(JSON.stringify([action,actor,stage,path,expires])).digest('hex');
  return `${expires}.${signature}`;
}
export function verifyArtifactTicket(secret: string, token: string | null, action: Action, actor: string, stage: string,
  path: string, now = Math.floor(Date.now()/1000)) {
  if (!token || !/^\d{1,12}\.[a-f0-9]{64}$/.test(token)) return false;
  const expiration = Number(token.split('.')[0]);
  if (expiration <= now) return false;
  const expected = issueArtifactTicket(secret,action,actor,stage,path,expiration);
  return expected.length === token.length && timingSafeEqual(Buffer.from(expected),Buffer.from(token));
}
