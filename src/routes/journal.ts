import { Router } from "express";
import { createJournalHandler } from "../controllers/journalController";
import { requireAuth } from "../middleware/auth";

export const journalRouter = Router();

journalRouter.post("/", requireAuth, createJournalHandler);
