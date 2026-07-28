import { Router } from "express";
import { listUserJournalHandler } from "../controllers/journalController";
import { listUserFavoritesHandler } from "../controllers/favoritesController";
import { listUserStampsHandler } from "../controllers/stampsController";
import { getMeHandler, updateMeHandler } from "../controllers/usersController";
import { stubAuth } from "../middleware/auth";

export const usersRouter = Router();

usersRouter.get("/me", stubAuth, getMeHandler);
usersRouter.patch("/me", stubAuth, updateMeHandler);
usersRouter.get("/:id/stamps", stubAuth, listUserStampsHandler);
usersRouter.get("/:id/journal", stubAuth, listUserJournalHandler);
usersRouter.get("/:id/favorites", stubAuth, listUserFavoritesHandler);
