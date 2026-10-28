/**
 * Stable identity for a master entry, derived from its extracted fields so a
 * re-extraction of unchanged content maps to the same entry and produces no
 * duplicate proposals. A renamed session intentionally becomes a new entry;
 * cross-source duplicate matching stays a reviewable signal, not an auto-merge.
 */
export function entryKeyFor(fields: ReadonlyArray<{ key: string; value: string }>): string {
  const get = (key: string) => fields.find(field => field.key === key)?.value?.trim() ?? "";
  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const title = slug(get("title")) || slug(get("script")).slice(0, 40) || slug(get("production_note")).slice(0, 40) || "entry";
  const date = get("date") || "nodate";
  const start = get("start_time") || "notime";
  return `${date}_${start}_${title}`.slice(0, 200);
}

/** Disambiguate repeated keys within one extraction batch (e.g. two untimed "Break" rows). */
export function uniqueEntryKeys(keys: string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map(key => {
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? key : `${key}-${count + 1}`.slice(0, 200);
  });
}
