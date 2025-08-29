import { extractKeywordsPrompt } from "../utils/prompts.js";
import { ensureTagsShape } from "../utils/tags.js";

/* Extract structured tags from an arbitrary payload using Gemini. */
export async function callGeminiExtract(ai, payload) {
  // JSON Schema we want the model to adhere to. This keeps outputs predictable
  // each key must be an array of strings, and all four keys are required
  const schema = {
    type: "object",
    properties: {
      title: { type: "array", items: { type: "string" } },
      company: { type: "array", items: { type: "string" } },
      looking_for: { type: "array", items: { type: "string" } },
      offering: { type: "array", items: { type: "string" } },
    },
    required: ["title", "company", "looking_for", "offering"],
  };

  // schema-constrained JSON
  try {
    // ask the model for JSON only, with the above schema and low temperature
    // to reduce variability. We also pass a system instruction that frames
    // how to extract keywords, and the user content is the raw payload
    const resp = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      generationConfig: {
        temperature: 0.2,
        response_mime_type: "application/json", // tell the model/tooling we want JSON
        response_schema: schema, // constrain the shape if supported
      },
      systemInstruction: extractKeywordsPrompt,
      contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
    });

    // different SDKs/runtime versions expose text in slightly different places
    // try the common ones: response.text(), text, etc...
    const raw = (resp?.response?.text?.() ?? resp?.text ?? "")
      .toString()
      .trim();

    // ff we somehow got no body back, bail to the fallback path
    if (!raw) throw new Error("Empty model response");

    // parse the JSON; if it parses, normalize it to our expected tag shape
    return ensureTagsShape(JSON.parse(raw));
  } catch {
    // plain text -> salvage JSON
    const prompt = `${extractKeywordsPrompt}
Return JSON only, no prose.

INPUT:
${JSON.stringify(payload)}`;

    // call again without schema/mime constraints. Keep the temperature low
    const resp = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      generationConfig: { temperature: 0.2 },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    // pull out the text similarly to the primary path
    let raw = (resp?.response?.text?.() ?? resp?.text ?? "").toString().trim();

    // if the model wrapped JSON in code fences (```json ... ```), strip them
    raw = raw
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    // if extra noise/prose sneaks in, grab the last {...} block greedily
    // this helps when the response includes explanation text around JSON
    const match = raw.match(/\{[\s\S]*\}$/);

    // parse either the captured JSON object or the whole string if it’s clean
    return ensureTagsShape(JSON.parse(match ? match[0] : raw));
  }
}
