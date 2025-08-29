import { parseJson } from "./tags.js";

// canonical set of “core goals” we care about
// everything we tally will be mapped into one of these buckets (or ignored)
const CORE_GOALS = [
  "hiring",
  "networking",
  "investment",
  "entertainment",
  "learning",
];

// simple synonym map -> maps common variants to a core goal
// keys must MATCH exactly after lowercasing/trim (see normalizeCoreGoal)
const GOAL_ALIASES = new Map([
  // hiring
  ["hire", "hiring"],
  ["recruit", "hiring"],
  ["recruiting", "hiring"],
  ["job", "hiring"],
  ["jobs", "hiring"],
  // networking
  ["network", "networking"],
  ["connections", "networking"],
  ["meet people", "networking"],
  ["mingle", "networking"],
  // investment
  ["investor", "investment"],
  ["investors", "investment"],
  ["investment", "investment"],
  ["funding", "investment"],
  ["fund", "investment"],
  ["vc", "investment"],
  ["venture capital", "investment"],
  ["angel", "investment"],
  // entertainment
  ["fun", "entertainment"],
  ["party", "entertainment"],
  ["music", "entertainment"],
  ["show", "entertainment"],
  // learning
  ["learn", "learning"],
  ["learning", "learning"],
  ["education", "learning"],
  ["talks", "learning"],
  ["workshops", "learning"],
  ["lecture", "learning"],
  ["classes", "learning"],
  ["mentor", "learning"],
  ["mentoring", "learning"],
]);

/* Normalize a single tag to a core goal string or null if not recognized */
function normalizeCoreGoal(s) {
  const t = String(s || "")
    .toLowerCase()
    .trim();
  const aliased = GOAL_ALIASES.get(t) || t;
  return CORE_GOALS.includes(aliased) ? aliased : null;
}

/** Count unique people per core goal. Returns:
 * {
 *   looking: { hiring: n, networking: n, investment: n, entertainment: n, learning: n },
 *   offering: { ... }
 * }
 *
 * Notes:
 * - A person counted at most once per goal (even if repeated)
 * - Uses synonyms via normalizeCoreGoal()
 */
export function tallyCoreGoalsPeople(rows) {
  // prepare a Set of person IDs for each goal, separately for "looking" and "offering"
  // using Sets guarantees uniqueness per goal
  const lookSets = Object.fromEntries(CORE_GOALS.map((g) => [g, new Set()]));
  const offSets = Object.fromEntries(CORE_GOALS.map((g) => [g, new Set()]));

  for (const r of rows) {
    const id = r.id; // person identifier used for uniqueness

    // parse tags; parseJson handles null/undefined/invalid JSON and returns []
    const look = parseJson(r.looking_tags, []);
    const offr = parseJson(r.offering_tags, []);

    // for each "looking" tag, map to a core goal and record the person id
    for (const tag of look) {
      const g = normalizeCoreGoal(tag);
      if (g) lookSets[g].add(id);
    }

    // same for "offering" tags
    for (const tag of offr) {
      const g = normalizeCoreGoal(tag);
      if (g) offSets[g].add(id);
    }
  }

  // convert Sets -> counts for the final result objects
  const looking = Object.fromEntries(
    CORE_GOALS.map((g) => [g, lookSets[g].size])
  );
  const offering = Object.fromEntries(
    CORE_GOALS.map((g) => [g, offSets[g].size])
  );

  return { looking, offering };
}
