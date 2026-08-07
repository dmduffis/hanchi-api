import { Router } from "express";
import {
  createJournalHandler,
  deleteJournalHandler,
} from "../controllers/journalController";
import { requireAuth } from "../middleware/auth";

export const journalRouter = Router();

journalRouter.post("/", requireAuth, createJournalHandler);
journalRouter.delete("/:id", requireAuth, deleteJournalHandler);
