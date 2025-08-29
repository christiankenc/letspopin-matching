/** Normalize a string list:
 *  - lowercases, trims, collapses internal whitespace to single spaces
 *  - keeps only 1–3 word phrases, total length <= 40 characters
 *  - removes duplicates (stable order) and caps the list at 12 items
 */
function normList(arr) {
  // if the input isn’t an array, normalize to an empty list
  if (!Array.isArray(arr)) return [];

  const cleaned = arr
    // coerce each item to string, lowercase, trim, and collapse whitespace
    .map((s) => String(s).toLowerCase().trim().replace(/\s+/g, " "))
    // drop empty strings (after trimming)
    .filter(Boolean)
    // keep only phrases with up to 3 space-delimited tokens
    .filter((s) => s.split(" ").length <= 3)
    // keep only reasonably short phrases
    .filter((s) => s.length <= 40);

  // de-duplicate while preserving first-seen order, then cap at 12
  return Array.from(new Set(cleaned)).slice(0, 12);
}

// ensure the four required tag arrays exist and are normalized
export function ensureTagsShape(obj = {}) {
  return {
    // each field is normalized via normList; defaults to [] if missing
    title: normList(obj.title || []),
    company: normList(obj.company || []),
    looking_for: normList(obj.looking_for || []),
    offering: normList(obj.offering || []),
  };
}

// safe JSON parser that returns `def` on null/undefined/parse error
export function parseJson(v, def = []) {
  // treat null/undefined as “use the default”
  if (v == null) return def;

  // if it’s already an array, accept it as-is (no JSON parse needed)
  if (Array.isArray(v)) return v;

  // otherwise, try to parse; on failure, fall back to default
  try {
    return JSON.parse(v);
  } catch {
    return def;
  }
}

// return array of unique items present in both A and B (intersection)
// - output preserves A’s first-seen order
export function overlap(A = [], B = []) {
  const b = new Set(B);
  // de-dup A first (stable), then keep only those also in B
  return [...new Set(A)].filter((x) => b.has(x));
}
