import type { Id, TableNames } from "../convex/_generated/dataModel";

/** Early shape check only. Convex still performs authoritative ID and tenant validation. */
export function parseConvexId<T extends TableNames>(value: unknown): Id<T> | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value as Id<T> : null;
}
