export const CONTRACT_VERSION = 6 as const;
export const SCHEMA_VERSION = 5 as const;
export const ENGINE_VERSION = "0.7.0-l07" as const;
export const CONTENT_VERSION = "valmorne-l05-v1" as const;
export const UI_VERSION = "0.8.1-l08b" as const;
export const PRNG_VERSION = "xorshift32-v1" as const;

export type ContractVersion = typeof CONTRACT_VERSION;
export type SchemaVersion = typeof SCHEMA_VERSION;
export type EngineVersion = string;
export type ContentVersion = string;
