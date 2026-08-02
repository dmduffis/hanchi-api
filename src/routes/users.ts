import { Router } from "express";
import { listUserJournalHandler } from "../controllers/journalController";
import { listUserFavoritesHandler } from "../controllers/favoritesController";
import { listUserStampsHandler } from "../controllers/stampsController";
import { getMeHandler, updateMeHandler } from "../controllers/usersController";
import { requireAuth } from "../middleware/auth";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, getMeHandler);
usersRouter.patch("/me", requireAuth, updateMeHandler);
usersRouter.get("/:id/stamps", requireAuth, listUserStampsHandler);
usersRouter.get("/:id/journal", requireAuth, listUserJournalHandler);
usersRouter.get("/:id/favorites", requireAuth, listUserFavoritesHandler);
