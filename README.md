# AI Event Matchmaking Engine

Suggest high value, less awkward connections at events by extracting profile tags, embedding them, scoring mutual fit, and returning a ranked list plus an endpoint to summarize **core networking goals** across attendees.

**Stack:** Node/Express • MySQL • Google GenAI (Gemini + text‑embedding‑004). Embedding has a **hash‑based fallback** so the system still works offline/dev.

---

## Features
- Keyword extraction -> `{ title[], company[], looking_for[], offering[] }`
- Embedding per side (offering/looking) and persistence
- Matching = directional cosine (needs <-> offers) + Jaccard overlap + tiny title boost
- MMR re ranking for diversity in top‑K
- Core goal tally (hiring, networking, investment, entertainment, learning)

## Project Structure
```
controllers/ai.controller.js       # extractKeywords, getMatches, getGoalsCount
routes/ai.route.js                 # POST /ai/extract-keywords, GET /ai/match/:id, GET /ai/get-count
utils/embeddings.js                # text-embedding-004 + hash fallback, l2norm, meanVec
utils/geminiExtract.js             # prompt/schema + fallback to salvage JSON
utils/helper.js                    # tallyCoreGoalsPeople with synonyms
utils/metrics.js                   # cosine, jaccard
utils/profileVectors.js            # ensureVectors: compute & persist missing vectors
utils/rerank.js                    # pairScore + mmrRerank
utils/tags.js                      # ensureTagsShape, parseJson, overlap
db.js                              # MySQL pool + helpers
schema.sql                         # DB DDL (see fix note below)
server.js                          # Express bootstrap
```

## Requirements
- Node 18+
- MySQL 8+
- Google GenAI key (`GEMINI_API_KEY`)

## Environment
Create `.env` (or export env vars):
```
GEMINI_API_KEY=your-google-genai-key
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=secret
DB_NAME=eventdb
PORT=3000
```

## Database Setup
1) Create DB (UTF8MB4):
```sql
CREATE DATABASE IF NOT EXISTS eventdb CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```
2) Apply `schema.sql`. **Fix** the `profiles` DDL if needed (missing comma + trailing comma):
```sql
CREATE TABLE IF NOT EXISTS profiles (
  id                  CHAR(36) PRIMARY KEY,
  name                VARCHAR(255),
  url                 VARCHAR(512) NOT NULL,
  headline            TEXT,
  about               LONGTEXT,
  followers           INT NULL,
  total_experience    INT NULL,
  completeness_score  DOUBLE NULL,
  social_score        DOUBLE NULL,
  total_score         DOUBLE NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_profiles_url (url),
  title_tags          JSON,
  company_tags        JSON,
  looking_tags        JSON,
  offering_tags       JSON,
  offering_vec        JSON,
  looking_vec         JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Works only once people have gotten their keywords extracted (people have submitted their profile)**

## Run
```bash
npm install
npm run dev    # or: node server.js
# Server: http://localhost:3000
```

## API

### 1) Extract Keywords
**POST** `/api/ai/extract-keywords`  
Body (one of): `{ "id": "UUID" }` or `{ "text": "raw text" }`  
Returns normalized tags; persists when `id` is provided.

### 2) Get Matches
**GET** `/api/ai/match/:id?topk=10`  
Computes directional fit + Jaccard + MMR (0.8). Returns `{ id,name,headline,score,reasons[] }`.

### 3) Core Goal Counts
**GET** `/api/ai/get-count`  
Counts unique people per canonical goal on both sides (looking/offering).

## How Matching Works (short)
1) Extraction -> normalized `{title, company, looking_for, offering}` (schema + fallback)  
2) Embedding -> intent prefixed tags -> mean pooled L2 norm vectors  
3) Scoring -> cosine(M.need, C.offer) & cosine(C.need, M.offer) + Jaccard need/offer overlap + title boost  
4) Diversification -> MMR (`0.8*relevance − (1−0.8)*maxSimToPicked`), with a balanced similarity vector
