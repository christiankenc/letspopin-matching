import { GoogleGenAI } from "@google/genai";
import { withConnection, query } from "../db.js";
import { ensureTagsShape, parseJson, overlap } from "../utils/tags.js";
import { cosine, jaccard } from "../utils/metrics.js";
import { pairScore, mmrRerank } from "../utils/rerank.js";
import { callGeminiExtract } from "../utils/geminiExtract.js";
import { ensureVectors } from "../utils/profileVectors.js";
import { tallyCoreGoalsPeople } from "../utils/helper.js";
import { meanVec } from "../utils/embeddings.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** GET/POST /api/ai/extract-keywords
 *  Body: { id?: string (UUID), text?: string }
 *  - If text provided, extracts from text only (no DB).
 *  - Else loads profile + edu/exp from DB, extracts tags, and persists tags.
 */
export const extractKeywords = async (req, res) => {
  // get id, or text from req
  const { id, text } = req.body || {};

  // ensure that there's an input
  if (!id && !text)
    return res.status(400).json({ message: "Provide 'id' or 'text'." });

  // try catch block to handle errors
  try {
    // build payload for the model
    const payload = await (async () => {
      // if it's a text block
      if (text) {
        return { headline: "", about: text, education: [], experience: [] };
      }

      // otherwise check id from database
      return withConnection(async (conn) => {
        // select the profile with the given id
        const [[profile]] = await conn.execute(
          `SELECT id, headline, about FROM profiles WHERE id=? LIMIT 1`,
          [id]
        );

        // check if it exists
        if (!profile) throw new Error("Profile not found");

        // get education from id
        const [edu] = await conn.execute(
          `SELECT title, degree, duration FROM education WHERE profile_id=? LIMIT 8`,
          [id]
        );

        // get experience from id
        const [exp] = await conn.execute(
          `SELECT title, company, duration, description FROM experience WHERE profile_id=? LIMIT 12`,
          [id]
        );

        // return json formatted payload
        return {
          headline: profile.headline || "",
          about: profile.about || "",
          education: Array.isArray(edu) ? edu : [],
          experience: Array.isArray(exp) ? exp : [],
        };
      });
    })();

    // ensure the four required tag arrays exist and are normalized
    const tags = ensureTagsShape(await callGeminiExtract(ai, payload));

    // persist tags if we have an id
    if (id) {
      // update profiles tags
      await query(
        `UPDATE profiles
         SET title_tags=?, company_tags=?, looking_tags=?, offering_tags=? WHERE id=?`,
        [
          JSON.stringify(tags.title),
          JSON.stringify(tags.company),
          JSON.stringify(tags.looking_for),
          JSON.stringify(tags.offering),
          id,
        ]
      );
    }

    // return extracted tags if successful
    res.json({ id: id || null, tags });
  } catch (error) {
    // otherwise return error
    res
      .status(500)
      .json({ message: "Failed to extract keywords", error: error.message });
  }
};

/** GET /api/ai/match/:id?topk=10
 *  Load "me" (by id), ensure vectors, score all others, MMR diversify, return top K.
 */
export const getMatches = async (req, res) => {
  // get id from parameters
  const id = req.params.id;

  // get top k of matches from params if given, otherwise top 10
  const topk = Math.max(1, Math.min(50, Number(req.query.topk) || 10));

  // try catch block to handle errors
  try {
    const results = await withConnection(async (conn) => {
      // load "me" passed-in id's data
      const [[me]] = await conn.execute(
        `SELECT id, name, headline, title_tags, company_tags, looking_tags, offering_tags, looking_vec, offering_vec
         FROM profiles WHERE id=? LIMIT 1`,
        [id]
      );

      // check if profile with given id exists
      if (!me) {
        res.status(404).json({ message: "Profile not found" });
        return null;
      }

      // get "me" tags for matching (title, company, looking_for, offering)
      const me_title = parseJson(me.title_tags, []);
      const me_company = parseJson(me.company_tags, []);
      const me_looking = parseJson(me.looking_tags, []);
      const me_offering = parseJson(me.offering_tags, []);

      // get vectors of tags (embeddings) used for cosine similarity comparison
      const { offering_vec: meOffer, looking_vec: meNeed } =
        await ensureVectors(conn, me);

      // load the rest of the candidates for potential matches
      const [candRows] = await conn.execute(
        `SELECT id, name, headline, title_tags, company_tags, looking_tags, offering_tags, looking_vec, offering_vec
        FROM profiles WHERE id <> ?`,
        [id]
      );

      // score each candidate
      const scored = [];
      for (const c of candRows) {
        const c_title = parseJson(c.title_tags, []);
        const c_company = parseJson(c.company_tags, []);
        const c_look = parseJson(c.looking_tags, []);
        const c_offr = parseJson(c.offering_tags, []);
        const { offering_vec: cOffer, looking_vec: cNeed } =
          await ensureVectors(conn, c);
        const profileVec = meanVec([cOffer, cNeed]); // balanced view

        // directional cosines: meNeed vs cOffer, cNeed vs meOffer
        const cos1 =
          meNeed.length && cOffer.length ? cosine(meNeed, cOffer) : 0;
        const cos2 =
          cNeed.length && meOffer.length ? cosine(cNeed, meOffer) : 0;

        // how much of what you’re looking for overlaps with what the counterparty offers
        const j1 = jaccard(me_looking, c_offr);

        // how much of what the counterparty is looking for overlaps with what you offer
        const j2 = jaccard(c_look, me_offering);

        // calculate base score
        const base = pairScore({ cos1, cos2, j1, j2 });

        // boosts if there's similarity in titles
        const titleOverlap = overlap(me_title, c_title).length > 0;
        const score = base + (titleOverlap ? 0.02 : 0);

        // readable reasons
        const reasons = [];

        const needOfferOverlap = overlap(me_looking, c_offr);
        if (needOfferOverlap.length)
          reasons.push(
            `matches what you're seeking: ${needOfferOverlap
              .slice(0, 3)
              .join(", ")}`
          );

        const theyNeed = overlap(c_look, me_offering);
        if (theyNeed.length)
          reasons.push(
            `you can help them with: ${theyNeed.slice(0, 3).join(", ")}`
          );

        const mutualTopics = overlap(me_offering, c_offr);
        if (mutualTopics.length)
          reasons.push(`shared topics: ${mutualTopics.slice(0, 3).join(", ")}`);

        const sharedTitles = overlap(me_title, c_title);
        if (sharedTitles.length)
          reasons.push(`similar roles: ${sharedTitles.slice(0, 2).join(", ")}`);

        const sharedCompanies = overlap(me_company, c_company);
        if (sharedCompanies.length)
          reasons.push(
            `shared orgs: ${sharedCompanies.slice(0, 2).join(", ")}`
          );

        if (!reasons.length && (j1 > 0 || j2 > 0))
          reasons.push("overlapping tags (need/offer)");

        if (!reasons.length && (cos1 > 0.45 || cos2 > 0.45)) {
          const which =
            cos1 >= cos2
              ? "their offering ~ your needs"
              : "your offering ~ their needs";
          reasons.push(
            `strong semantic fit (${which}: ${Math.max(cos1, cos2).toFixed(2)})`
          );
        }

        // push each candidate to scored array
        scored.push({
          id: c.id,
          name: c.name,
          headline: c.headline,
          score,
          offering_vec: profileVec, // MMR uses this similarity handle
          reasons,
        });
      }

      // sorts all items by score descending (most relevant first).
      scored.sort((a, b) => b.score - a.score);

      // MMR selects items iteratively to balance:
      // Relevance to the query (high score),
      // Novelty/Diversity vs. what’s already been picked (low similarity to selected items)
      const mmr = mmrRerank(scored.slice(0, 200), 0.8, topk);

      // order them to descending orders
      return mmr.map(({ id, name, headline, score, reasons }) => ({
        id,
        name,
        headline,
        score,
        reasons,
      }));
    });

    // if we get results, then send results
    if (results) res.json({ query: id, results });
  } catch (error) {
    res.status(500).json({ message: "match failed", error: error.message });
  }
};

export const getGoalsCount = async (req, res) => {
  try {
    await withConnection(async (conn) => {
      // load all users
      const [candRows] = await conn.execute(
        `SELECT id, name, headline, title_tags, company_tags, looking_tags, offering_tags, looking_vec, offering_vec
        FROM profiles`
      );

      // get the count for our core goals
      const core_goal_counts = tallyCoreGoalsPeople(candRows);

      // send response
      res.json(core_goal_counts);
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
