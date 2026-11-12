export type ScreenFxPreset = 'clean' | 'lcd' | 'phosphor' | 'custom';
export type ScreenRefresh = 'native' | '30' | '20';
export type ScreenFxLevel =
  | 'pixelGrid'
  | 'glow'
  | 'scanlines'
  | 'ghosting'
  | 'curvature'
  | 'glass'
  | 'noise'
  | 'vignette';

export interface ScreenFxLevelMeta {
  readonly key: ScreenFxLevel;
  readonly label: string;
  readonly hint: string;
  readonly group: 'matrix' | 'optics';
}

export const SCREEN_FX_LEVELS: readonly ScreenFxLevelMeta[] = [
  { key: 'pixelGrid', label: 'Pixel matrix', hint: 'Subpixel aperture grid & cell relief', group: 'matrix' },
  { key: 'glow', label: 'Phosphor glow', hint: 'Multi-tap halation bloom on bright pixels', group: 'optics' },
  { key: 'scanlines', label: 'Scanlines', hint: 'Luminance-adaptive horizontal beam lines', group: 'matrix' },
  { key: 'ghosting', label: 'Pixel persistence', hint: 'Temporal response trail & afterglow', group: 'matrix' },
  { key: 'curvature', label: 'Screen curvature', hint: 'Barrel lens geometry & recessed corner mask', group: 'optics' },
  { key: 'glass', label: 'Glass reflections', hint: 'Curved canopy specular sheen & bounce', group: 'optics' },
  { key: 'noise', label: 'Static grain', hint: 'Subtle analog signal shimmer', group: 'optics' },
  { key: 'vignette', label: 'Edge shading', hint: 'Recessed bezel perimeter falloff', group: 'optics' }
];

export type ScreenFxSettings = Readonly<{
  enabled: boolean;
  preset: ScreenFxPreset;
  refresh: ScreenRefresh;
  pixelGrid: number;
  glow: number;
  scanlines: number;
  ghosting: number;
  curvature: number;
  glass: number;
  noise: number;
  vignette: number;
}>;

export interface ScreenFxPresetMeta {
  readonly id: Exclude<ScreenFxPreset, 'custom'>;
  readonly label: string;
  readonly badge: string;
  readonly description: string;
}

export const SCREEN_FX_PRESET_META: Readonly<Record<Exclude<ScreenFxPreset, 'custom'>, ScreenFxPresetMeta>> = {
  clean: {
    id: 'clean',
    label: 'Clean Pixels',
    badge: 'RAW 1:1',
    description: 'Bit-exact nearest-neighbor pixels with zero optical post-processing.'
  },
  lcd: {
    id: 'lcd',
    label: 'Classic LCD',
    badge: 'DOT MATRIX',
    description: 'Crisp pocket dot-matrix grid, subtle cell relief, and anti-reflective glass.'
  },
  phosphor: {
    id: 'phosphor',
    label: 'Phosphor Terminal',
    badge: 'CRT GLOW',
    description: 'Luminous halation bloom, beam scanlines, persistence trail, and curved glass.'
  }
};

export const SCREEN_FX_STORAGE_KEY = 'slopboy:v2:screen-fx:v1';

export const SCREEN_FX_PRESETS: Readonly<Record<Exclude<ScreenFxPreset, 'custom'>, ScreenFxSettings>> = {
  clean: {
    enabled: true,
    preset: 'clean',
    refresh: 'native',
    pixelGrid: 0,
    glow: 0,
    scanlines: 0,
    ghosting: 0,
    curvature: 0,
    glass: 0,
    noise: 0,
    vignette: 0
  },
  lcd: {
    enabled: true,
    preset: 'lcd',
    refresh: 'native',
    pixelGrid: 48,
    glow: 6,
    scanlines: 0,
    ghosting: 10,
    curvature: 0,
    glass: 18,
    noise: 0,
    vignette: 14
  },
  phosphor: {
    enabled: true,
    preset: 'phosphor',
    refresh: 'native',
    pixelGrid: 16,
    glow: 58,
    scanlines: 34,
    ghosting: 30,
    curvature: 22,
    glass: 34,
    noise: 8,
    vignette: 38
  }
};

export const DEFAULT_SCREEN_FX = SCREEN_FX_PRESETS.lcd;

const clampFx = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0);

export function sanitizeScreenFx(input: unknown): ScreenFxSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return DEFAULT_SCREEN_FX;
  const value = input as Record<string, unknown>;
  const preset: ScreenFxPreset = ['clean', 'lcd', 'phosphor', 'custom'].includes(String(value.preset))
    ? (value.preset as ScreenFxPreset)
    : 'custom';
  const refresh: ScreenRefresh = ['native', '30', '20'].includes(String(value.refresh))
    ? (value.refresh as ScreenRefresh)
    : 'native';
  const result: Record<string, unknown> = {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    preset,
    refresh
  };
  for (const { key } of SCREEN_FX_LEVELS) {
    result[key] = typeof value[key] === 'number' ? clampFx(value[key] as number) : DEFAULT_SCREEN_FX[key];
  }
  return result as ScreenFxSettings;
}

export function isScreenFxActive(config: ScreenFxSettings): boolean {
  return config.enabled && (config.refresh !== 'native' || SCREEN_FX_LEVELS.some(({ key }) => config[key] > 0));
}

export function editScreenFx(config: ScreenFxSettings, key: ScreenFxLevel, value: number): ScreenFxSettings {
  return { ...config, enabled: true, preset: 'custom', [key]: clampFx(value) };
}

export function countActiveScreenFx(config: ScreenFxSettings): number {
  if (!config.enabled) return 0;
  return SCREEN_FX_LEVELS.filter(({ key }) => config[key] > 0).length;
}
