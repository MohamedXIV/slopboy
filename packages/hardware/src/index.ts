/** Single versioned source of truth for the validator, SDK and future runtime. */
export type InputName = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'A' | 'B' | 'START' | 'SELECT';
export interface HardwareProfile {
  readonly id: string;
  readonly version: string;
  readonly display: { readonly width: number; readonly height: number; readonly indexedColors: number };
  readonly input: { readonly buttons: readonly InputName[] };
  readonly audio: { readonly voices: number };
  readonly budgets: {
    readonly compressedBytes: number;
    readonly extractedBytes: number;
    readonly codeBytes: number;
    readonly saveBytes: number;
    readonly maxFiles: number;
  };
}
export const SLOPBOY_1000 = {
  id: 'slopboy-1000', version: '0.1.0',
  display: { width: 160, height: 144, indexedColors: 4 },
  input: { buttons: ['UP','DOWN','LEFT','RIGHT','A','B','START','SELECT'] },
  audio: { voices: 4 },
  budgets: { compressedBytes: 512*1024, extractedBytes: 2*1024*1024, codeBytes: 64*1024, saveBytes: 8*1024, maxFiles: 16 }
} as const satisfies HardwareProfile;
const profiles: Readonly<Record<string, HardwareProfile>> = {[SLOPBOY_1000.id]: SLOPBOY_1000};
export function getHardware(id: string, version: string): HardwareProfile | undefined {
  const profile = profiles[id];
  return profile?.version === version ? profile : undefined;
}
