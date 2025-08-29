import { cosine } from "./metrics.js";

/**
 * Pair score for two profiles using:
 *  - Harmonic mean of *directional* cosine similarities (cos1, cos2)
 *    to reward mutual alignment (both must be > 0 to count)
 *  - A small bonus for tag overlap (via Jaccard averages)
 *
 * Intuition:
 * - If A->B is high but B->A is low, harmonic mean stays modest,
 *   encouraging pairs that like each other in both directions
 * - Jaccard bonus helps sparse/tag-driven matches without overpowering
 *   the vector signal (capped and lightly weighted)
 */
export function pairScore({ cos1, cos2, j1, j2 }) {
  // harmonic mean, but only when both directions are positively aligned
  // if either cosine is <= 0, treat as no alignment (h = 0)
  const hraw = cos1 > 0 && cos2 > 0 ? (2 * cos1 * cos2) / (cos1 + cos2) : 0;
  const h = Math.max(hraw, 0.05 * Math.max(cos1, cos2)); // tiny one-way floor

  // average the two Jaccard overlaps
  const jAvg = (j1 + j2) / 2;

  // convert a small Jaccard range [0..0.2] into a 0..1 boost
  // values beyond 0.2 saturate at 1, and negatives clamp to 0
  // this intentionally treats small overlaps as a "nudge", not a driver
  const jBoost = Math.min(0.2, Math.max(0, jAvg)) / 0.2; // 0..1

  // final blend: mostly driven by harmonic-mean cosine (85%),
  // with a modest 15% contribution from the tag-overlap boost
  return 0.85 * h + 0.15 * jBoost;
}

/**
 * MMR (Maximal Marginal Relevance) diversity re-ranker
 *
 * Re-scores a list of candidates by balancing:
 *   - relevance (their original `score`)
 *   - diversity (penalize similarity to already-picked items)
 */
export function mmrRerank(scored, lamb = 0.8, topk = 10) {
  const picked = [];
  const rest = [...scored]; // work on a copy so we don't mutate the caller's array

  // greedy selection until we exhaust candidates or hit k items
  while (rest.length && picked.length < topk) {
    let best = null;
    let bestVal = -Infinity;

    for (const c of rest) {
      if (!picked.length) {
        // first pick: just take the highest relevance
        if (c.score > bestVal) {
          best = c;
          bestVal = c.score;
        }
      } else {
        // compute similarity to the *closest* already-picked item
        const maxSim = Math.max(
          ...picked.map((p) =>
            cosine(c.offering_vec || [], p.offering_vec || [])
          )
        );

        // MMR objective: balance relevance vs. redundancy
        const val = lamb * c.score - (1 - lamb) * maxSim;

        if (val > bestVal) {
          best = c;
          bestVal = val;
        }
      }
    }

    // move the chosen candidate from `rest` to `picked`
    picked.push(best);
    rest.splice(rest.indexOf(best), 1);
  }

  return picked;
}
