import {ENGINE_REGISTRY} from './engine-registry.ts';

export const PRIVATE_SOURCE_LIMIT = 65_536;
export const PRIVATE_SOURCE_TEMPLATE = {
  id: 'kaplay', version: ENGINE_REGISTRY.kaplay.version, adapterProtocol: ENGINE_REGISTRY.kaplay.adapterProtocol,
  deviceProfile: 'slopboy-1000',
} as const;
