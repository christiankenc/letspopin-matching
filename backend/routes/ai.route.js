import express from "express";
import {
  extractKeywords,
  getGoalsCount,
  getMatches,
} from "../controllers/ai.controller.js";

const router = express.Router();

// extract keywords from user profile
router.post("/ai/extract-keywords", extractKeywords);

// GET /ai/match/:id?topk=# if different amount of matches desired (default 10)
router.get("/ai/match/:id", getMatches);

// get count for visuals
router.get("/ai/get-count", getGoalsCount);
export default router;
