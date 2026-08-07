import { Router } from "express";
import {
  createJournalHandler,
  deleteJournalHandler,
  updateJournalHandler,
} from "../controllers/journalController";
import { requireAuth } from "../middleware/auth";

export const journalRouter = Router();

journalRouter.post("/", requireAuth, createJournalHandler);
journalRouter.patch("/:id", requireAuth, updateJournalHandler);
journalRouter.delete("/:id", requireAuth, deleteJournalHandler);
