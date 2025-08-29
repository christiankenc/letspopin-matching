import { embedTextBatch, meanVec } from "../utils/embeddings.js";
import { parseJson } from "../utils/tags.js";

/* Ensure vectors exist for a profile row; if missing, compute from tags and persist. */
export async function ensureVectors(conn, profile) {
  // parse any stored vectors, if invalid/missing JSON, default to `null` so we can detect "missing vector" by checking `.length`
  let offering_vec = parseJson(profile.offering_vec, null);
  let looking_vec = parseJson(profile.looking_vec, null);

  // parse tag lists, if invalid/missing, default to [] so length checks are safe
  const offering_tags = parseJson(profile.offering_tags, []);
  const looking_tags = parseJson(profile.looking_tags, []);

  // track whether we actually computed anything new (to avoid unnecessary UPDATEs).
  let dirty = false;

  // if the "offering" vector is missing but we have tags:
  // - embed each tag (prefixed to give the model a hint about intent),
  // - then average the tag vectors to a single profile vector
  if (!offering_vec?.length && offering_tags.length) {
    const vs = await embedTextBatch(offering_tags.map((t) => `offering: ${t}`));
    offering_vec = meanVec(vs);
    dirty = true;
  }

  // same idea for the "looking" side.
  if (!looking_vec?.length && looking_tags.length) {
    const vs = await embedTextBatch(looking_tags.map((t) => `looking: ${t}`));
    looking_vec = meanVec(vs);
    dirty = true;
  }

  // persist only if:
  // - we have an ID to update, and
  // - we actually computed a new vector (dirty === true).
  if (
    profile.id &&
    dirty &&
    ((offering_vec && offering_vec.length) ||
      (looking_vec && looking_vec.length))
  ) {
    await conn.execute(
      `UPDATE profiles SET offering_vec=?, looking_vec=? WHERE id=?`,
      [
        JSON.stringify(offering_vec || []), // store arrays as JSON strings
        JSON.stringify(looking_vec || []),
        profile.id,
      ]
    );
  }

  // always return arrays (never null) so callers don't have to null-check
  return { offering_vec: offering_vec || [], looking_vec: looking_vec || [] };
}
