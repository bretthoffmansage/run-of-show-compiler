/**
 * Stable identity for a master entry. Identity is the *slot* (date + start
 * time) so different sources describing the same moment land on the same
 * entry — and when they disagree about its title, speaker or anything else,
 * that disagreement compiles as a red-marked conflict instead of silently
 * forking into duplicate entries. Untimed content falls back to a content
 * slug. A retitled session keeps its identity: the title change shows up as
 * a (pink) change, not a new entry.
 */
export function entryKeyFor(fields: ReadonlyArray<{ key: string; value: string }>): string {
  const get = (key: string) => fields.find(field => field.key === key)?.value?.trim() ?? "";
  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const date = get("date");
  const start = get("start_time");
  if (date || start) return `${date || "nodate"}_${start || "notime"}`.slice(0, 200);
  const title = slug(get("title")) || slug(get("script")).slice(0, 40) || slug(get("production_note")).slice(0, 40) || "entry";
  return `nodate_notime_${title}`.slice(0, 200);
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
