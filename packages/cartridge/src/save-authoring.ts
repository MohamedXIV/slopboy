import {SAVE_MODES} from '../../runtime/src/save-capabilities.ts';

/** Additive authoring guidance, not an execution or publication capability grant. */
export const SAVE_AUTHORING_CONTRACT={
  manifestField:'saveCapabilities',
  modes:SAVE_MODES,
  schemaVersion:{requiredForSaveEnabled:true,forbiddenForNone:true,min:1,max:9999},
  missingDeclaration:'unknown-legacy',
  inferFromGenre:false,
  reviewedProgressAdapter:'pixel-v1',
  manualCapture:{method:'serialize',restoreMethod:'init',synchronous:true,sideEffectFree:true},
  kaplay:'experimental-host-storage-only',
  privateSourceImport:'no-custom-save-capability-selection',
  cloud:{hostOwned:true,optIn:true,publicAvailability:false,automaticUpload:false},
} as const;

export const SAVE_AUTHORING_GUIDELINES=[
  'Declare saveCapabilities only in a supported reviewed manifest workflow: none (no persistence), persistent-data (settings/high scores, not progress), auto, manual, or manual-and-auto. Never infer a mode from genre.',
  'Every save-enabled mode requires an explicit integer schemaVersion from 1 to 9999; none forbids schemaVersion. If legacy saveSchemaVersion is present it must agree. Missing declaration means unknown legacy behavior.',
  'Reviewed pixel-v1 progress games may use ctx.storage.load() in init(ctx) and ctx.storage.save(string) for autosave at meaningful state changes, not each frame.',
  'For reviewed pixel-v1 manual or manual-and-auto, implement synchronous side-effect-free serialize(ctx): string returning CURRENT state, and restore ctx.storage.load() in init(ctx). Never write or erase storage during serialize, or copy an old autosave as manual capture.',
  'Keep schemaVersion unchanged only for compatible payloads; incompatible schemas require explicit reviewed migration. Do not invent provenance, erase historical saves, or treat local progress as authoritative global currency.',
  'KAPLAY host storage is experimental and does not implement the reviewed pixel-v1 named progress/manual capture contract. Phaser and PixiJS adapters remain planned. Never invent lifecycle hooks or claim support from a manifest declaration alone.',
  'The current source-only private import builds its manifest from the pinned template; it does not let creators choose custom saveCapabilities. Do not promise a custom progress-save workflow from pasted code.',
  'Cloud backups are host-owned, opt-in, and not publicly available. Never call cloud endpoints or storage services from game code, handle account credentials, upload per frame, or claim a cloud save succeeded without host confirmation.',
] as const;
