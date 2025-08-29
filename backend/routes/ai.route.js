import express from "express";
import { extractKeywords, getMatches } from "../controllers/ai.controller.js";

const router = express.Router();

// extract keywords from user profile
router.post("/ai/extract-keywords", extractKeywords);

// GET /ai/match/:id?topk=# if different amount of matches desired (default 10)
router.get("/ai/match/:id", getMatches);
export default router;