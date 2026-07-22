import { z } from 'zod';

// Configuration module contracts (CONF-01; ACTION-PLAN 2.4). The three-level
// settings model (architecture.md §Localization): every setting declares which
// of the three levels — system / client / user — may hold a value, resolved
// user → client → system (most specific wins). CONF-01 ships the SYSTEM level
// only; per-client and per-user land in CONF-02/03.

export const settingLevelSchema = z.enum(['system', 'client', 'user']);

// A setting's catalog descriptor: the contract CONF-02/03 layer onto. `default`
// and effective values are heterogeneous (string, enum, array, …), so they are
// carried as unknown — the authoritative validator is the server-side catalog.
export const configSettingDescriptorSchema = z.object({
  key: z.string(),
  levels: z.array(settingLevelSchema).min(1),
  default: z.unknown(),
  description: z.string(),
});

export const configCatalogResponseSchema = z.object({
  settings: z.array(configSettingDescriptorSchema),
});

// Effective settings for the caller: key → resolved value. CONF-01 resolves the
// system level only.
export const configEffectiveResponseSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
});

// Write payload — a single value, validated server-side against the setting's
// catalog schema (unknown key or bad value → 400/404, never a silent fallback).
export const setSettingRequestSchema = z.object({
  value: z.unknown(),
});

export const settingValueResponseSchema = z.object({
  key: z.string(),
  level: settingLevelSchema,
  value: z.unknown(),
});

export type SettingLevel = z.infer<typeof settingLevelSchema>;
export type ConfigSettingDescriptor = z.infer<typeof configSettingDescriptorSchema>;
export type ConfigCatalogResponse = z.infer<typeof configCatalogResponseSchema>;
export type ConfigEffectiveResponse = z.infer<typeof configEffectiveResponseSchema>;
export type SetSettingRequest = z.infer<typeof setSettingRequestSchema>;
export type SettingValueResponse = z.infer<typeof settingValueResponseSchema>;
