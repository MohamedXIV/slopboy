export const CLOUD_SAVE_MAX_BYTES = 256 * 1024;
export const CLOUD_SAVE_REQUEST_MAX_BYTES = CLOUD_SAVE_MAX_BYTES * 6 + 32;

export function parseCloudSave(input:unknown):string|null {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !('save' in input)) return null;
  const save = input.save;
  if (typeof save !== 'string' || save.includes('\0') ||
      new TextEncoder().encode(save).length > CLOUD_SAVE_MAX_BYTES) return null;
  return save;
}
