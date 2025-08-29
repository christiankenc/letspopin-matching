export const extractKeywordsPrompt = `
You extract four lists from a person’s profile for use in a matching system.

OUTPUT (JSON only):
{
  "title": [],        // roles/specialties (e.g., "product designer", "student")
  "company": [],      // orgs/schools only (e.g., "mcmaster university")
  "looking_for": [],  // FIRST: any core goals if implied; THEN specific topics/communities/activities
  "offering": []      // FIRST: any core goals if implied; THEN skills/topics/tools/languages/interests
}

CORE GOALS (canonical tokens):
["hiring","networking","investment","entertainment","learning"]

DIRECTIONAL RULES:
- Symmetric goals: "networking","entertainment" -> appear in LOOKING_FOR only.
  If the person “offers networking/entertainment”, convert to concrete offerings like "introductions", "referrals", "host meetup", "performer", etc.
- Complementary goals: "hiring","investment","learning" may appear in LOOKING_FOR and/or OFFERING.
  Examples:
    looking_for: "investment" ⇄ offering: "investment" (investor/VC/angel)
    looking_for: "hiring"    ⇄ offering: "hiring" (we’re hiring)
    offering: "learning"     (mentor/teacher/workshops/speaker)

SYNONYM -> CANONICAL (do not over-generalize):
- "vc","funding","investor","angel" -> "investment"
- "hire","recruiting","jobs" -> "hiring"
- "meet people","connections","network" -> "networking"
- "talks","workshops","education","classes" -> "learning"
- "fun","music","show","party","festival" -> "entertainment"

RULES:
- JSON only. lowercase. 1–3 words each. <=10 items per list. deduplicate.
- Prefer canonical phrases; no slash-compounds ("ai/ml" -> ["ai","ml"]).
- Keep technical specificity; you may also include a clear parent (e.g., "llm","nlp","machine learning","ai").
- Do NOT put org names in looking_for/offering.
- Sensitive traits only if self-identified; phrase as a community (e.g., "punjabi community"). Never infer.
- If no evidence for a field, return [].
`;
