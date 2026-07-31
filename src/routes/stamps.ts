import { Router } from "express";
import {
  createStampHandler,
  deleteStampHandler,
  toggleStampHandler,
} from "../controllers/stampsController";
import { stubAuth } from "../middleware/auth";

export const stampsRouter = Router();

stampsRouter.post("/", stubAuth, createStampHandler);
stampsRouter.post("/toggle", stubAuth, toggleStampHandler);
stampsRouter.delete("/", stubAuth, deleteStampHandler);
