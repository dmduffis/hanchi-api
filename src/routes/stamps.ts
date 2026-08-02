import { Router } from "express";
import {
  createStampHandler,
  deleteStampHandler,
  toggleStampHandler,
} from "../controllers/stampsController";
import { requireAuth } from "../middleware/auth";

export const stampsRouter = Router();

stampsRouter.post("/", requireAuth, createStampHandler);
stampsRouter.post("/toggle", requireAuth, toggleStampHandler);
stampsRouter.delete("/", requireAuth, deleteStampHandler);
