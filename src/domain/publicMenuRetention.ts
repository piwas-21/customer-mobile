import { z } from 'zod';
import {
  DIRECTORY_CLOCK_SKEW_MS,
  DIRECTORY_MAX_TENANTS,
  environmentSchema,
  parseDirectory,
  type Directory,
} from '../core/directory';
export const publicMenuRetentionSchema = z
  .strictObject({
    environment: environmentSchema,
    publishedAt: z.iso.datetime(),
    tenantIds: z.array(z.uuid()).max(DIRECTORY_MAX_TENANTS),
  })
  .refine((value) => new Set(value.tenantIds).size === value.tenantIds.length);
export type PublicMenuRetention = z.infer<typeof publicMenuRetentionSchema>;
export function menuRetentionHasValidDate(policy: PublicMenuRetention, now: number) {
  return Date.parse(policy.publishedAt) <= now + DIRECTORY_CLOCK_SKEW_MS;
}
export function menuRetentionFromDirectory(directory: Directory, now: number): PublicMenuRetention {
  const current = parseDirectory(directory, directory.environment, now);
  return {
    environment: current.environment,
    publishedAt: current.publishedAt,
    tenantIds: current.tenants
      .filter((tenant) => tenant.status !== 'disabled' && tenant.contractVersions.includes(1))
      .map((tenant) => tenant.id)
      .sort(),
  };
}
export function latestMenuRetention(
  first: PublicMenuRetention | undefined,
  second: PublicMenuRetention | undefined,
): PublicMenuRetention | undefined {
  if (!first) return second;
  if (!second) return first;
  if (first.environment !== second.environment) throw new Error('Menu environment changed');
  const difference = Date.parse(first.publishedAt) - Date.parse(second.publishedAt);
  if (difference > 0) return first;
  if (difference < 0) return second;
  // Conflicting observations of one publication may tighten, never widen, the saved-menu set.
  return {
    ...first,
    tenantIds: first.tenantIds.filter((id) => second.tenantIds.includes(id)).sort(),
  };
}
export function menuIsRetained(policy: PublicMenuRetention | undefined, tenantId: string) {
  return !policy || policy.tenantIds.includes(tenantId);
}
