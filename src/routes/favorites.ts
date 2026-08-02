import { Router } from "express";
import {
  createFavoriteHandler,
  deleteFavoriteHandler,
  toggleFavoriteHandler,
} from "../controllers/favoritesController";
import { requireAuth } from "../middleware/auth";

export const favoritesRouter = Router();

favoritesRouter.post("/", requireAuth, createFavoriteHandler);
favoritesRouter.post("/toggle", requireAuth, toggleFavoriteHandler);
favoritesRouter.delete("/", requireAuth, deleteFavoriteHandler);
