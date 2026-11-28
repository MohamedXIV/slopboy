'use client';

export type SaveUiSound = 'open' | 'close' | 'tap' | 'save' | 'load' | 'warn' | 'delete';

const MUTE_STORAGE_KEY = 'slopboy:save-ui-sfx-muted';

let audioContext: AudioContext | null = null;
let cachedMuted: boolean | null = null;

function readMutedPreference(): boolean {
  if (cachedMuted !== null) return cachedMuted;
  if (typeof window === 'undefined') return false;
  try {
    cachedMuted = window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    cachedMuted = false;
  }
  return cachedMuted;
}

export function isSaveUiMuted(): boolean {
  return readMutedPreference();
}

export function setSaveUiMuted(muted: boolean): boolean {
  cachedMuted = muted;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      /* Storage denial never blocks UI interaction. */
    }
  }
  if (!muted) playSaveUiSound('tap');
  return muted;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext || audioContext.state === 'closed') {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => {});
  }
  return audioContext;
}

interface ToneStep {
  freq: number;
  endFreq?: number;
  start: number;
  duration: number;
  gain: number;
  type: OscillatorType;
}

const RECIPES: Record<SaveUiSound, readonly ToneStep[]> = {
  tap: [
    {freq: 580, endFreq: 420, start: 0, duration: 0.04, gain: 0.055, type: 'triangle'},
  ],
  open: [
    {freq: 440, start: 0, duration: 0.06, gain: 0.05, type: 'triangle'},
    {freq: 660, start: 0.05, duration: 0.09, gain: 0.055, type: 'triangle'},
  ],
  close: [
    {freq: 520, start: 0, duration: 0.05, gain: 0.045, type: 'triangle'},
    {freq: 360, start: 0.04, duration: 0.08, gain: 0.045, type: 'triangle'},
  ],
  save: [
    {freq: 523.25, start: 0, duration: 0.055, gain: 0.06, type: 'triangle'},
    {freq: 659.25, start: 0.05, duration: 0.06, gain: 0.06, type: 'triangle'},
    {freq: 783.99, start: 0.1, duration: 0.11, gain: 0.065, type: 'sine'},
  ],
  load: [
    {freq: 392, start: 0, duration: 0.06, gain: 0.055, type: 'triangle'},
    {freq: 523.25, start: 0.055, duration: 0.065, gain: 0.06, type: 'triangle'},
    {freq: 659.25, start: 0.11, duration: 0.12, gain: 0.06, type: 'sine'},
  ],
  warn: [
    {freq: 280, endFreq: 240, start: 0, duration: 0.07, gain: 0.055, type: 'triangle'},
    {freq: 220, endFreq: 190, start: 0.08, duration: 0.08, gain: 0.05, type: 'triangle'},
  ],
  delete: [
    {freq: 260, endFreq: 145, start: 0, duration: 0.12, gain: 0.06, type: 'triangle'},
  ],
};

/** Procedural Web Audio UI SFX inspired by Slopboy's handheld labs; safe offline and muteable. */
export function playSaveUiSound(kind: SaveUiSound): void {
  if (readMutedPreference()) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (const step of RECIPES[kind]) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step.type;
      const t0 = now + step.start;
      const t1 = t0 + step.duration;
      osc.frequency.setValueAtTime(step.freq, t0);
      if (step.endFreq) osc.frequency.exponentialRampToValueAtTime(step.endFreq, t1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(step.gain, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain).connect(ctx.destination);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(t0);
      osc.stop(t1 + 0.01);
    } catch {
      /* Ignore audio node errors on restricted browsers. */
    }
  }
}
