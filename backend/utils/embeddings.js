import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const EMBED_DIM = 768; // text-embedding-004 output dim

// cached singleton instance of the GoogleGenAI client.
// avoids re-creating a client for every call.
let _genAI = null;
function getGenAI() {
  if (!_genAI) _genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _genAI;
}

/**
 * L2-normalize a vector *in place* and return the same array reference. This scales the vector so its Euclidean length is 1 */
export function l2norm(arr) {
  let s = 0;

  // sum of squares
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];

  // norm (length) of the vector; default to 1 to avoid division by zero
  s = Math.sqrt(s) || 1;

  // divide each component by the norm to get unit length
  for (let i = 0; i < arr.length; i++) arr[i] /= s;

  return arr;
}

/* Cheap deterministic hash-based embedding fallback.*/
export function hashEmbedOne(text) {
  // start with a zero vector of the desired size
  const v = new Array(EMBED_DIM).fill(0);
  const t = (text || "").toLowerCase();

  // consider character n-grams of length 3 to 5
  for (let n = 3; n <= 5; n++) {
    for (let i = 0; i <= t.length - n; i++) {
      const g = t.slice(i, i + n);

      // two simple rolling has accumulators with different bases
      let h1 = 0,
        h2 = 0;
      for (let j = 0; j < g.length; j++) {
        // >>> 0 forces unsigned 32-bit integer arithmetic
        h1 = (h1 * 131 + g.charCodeAt(j)) >>> 0;
        h2 = (h2 * 137 + g.charCodeAt(j)) >>> 0;
      }

      // map has to a bucket and increment its count
      v[(h1 + h2) % EMBED_DIM] += 1;
    }
  }

  // normalize to unit length so magnitudes are comparable
  return l2norm(v);
}

/* Compute the mean (elementwise average) of a list of vectors and normalize. */
export function meanVec(vecs) {
  if (!vecs.length) return new Array(EMBED_DIM).fill(0);

  // sum elementwise across all vectors
  const out = new Array(EMBED_DIM).fill(0);
  for (const v of vecs) for (let i = 0; i < EMBED_DIM; i++) out[i] += v[i] || 0;

  // divide by count to get the mean
  for (let i = 0; i < EMBED_DIM; i++) out[i] /= vecs.length;

  // normalize for consistency
  return l2norm(out);
}

/* Embed a batch of texts using Gemini embeddings when available; otherwise, fall back to the deterministic hash embedding above. */
export async function embedTextBatch(texts) {
  // normalize and filter out empty inputs
  const items = (texts || []).map((t) => (t || "").trim()).filter(Boolean);
  if (!items.length) return [];
  try {
    // request embeddings from Gemini for a batch of inputs
    // different SDK versions accept different shapes; here we pass
    // an array of "contents" objects
    const resp = await getGenAI().models.embedContent({
      model: "text-embedding-004",
      contents: items.map((txt) => ({ role: "user", parts: [{ text: txt }] })),
    });

    // response shape normalization
    // depending on SDK/runtime, the embeddings may be under different keys
    // we probe a few common locations so the code is resilient
    const embeddings =
      resp?.embeddings ?? resp?.data ?? resp?.responses ?? resp ?? [];

    const out = [];
    for (const e of embeddings) {
      // usually you'll see e.embedding.values or e.values as an array of numbers
      const vals =
        e?.embedding?.values || e?.values || (Array.isArray(e) ? e : null);

      // if we found a numeric array, copy/slice to the target dim and normalize
      if (Array.isArray(vals)) out.push(l2norm(vals.slice(0, EMBED_DIM)));
    }

    // if the number of vectors doesn't match inputs, treat as an unexpected shape
    if (out.length === items.length) return out;

    // shape didn't match: fall back to deterministic has embeddings
    return items.map(hashEmbedOne);
  } catch {
    // network errors, missing API key, rate limits, etc...
    // fallback keeps the app functional in dev/offline scenarios
    return items.map(hashEmbedOne); // offline/dev fallback
  }
}
