import { Router } from "express";
import { uploadMediaHandler } from "../controllers/mediaController";
import { requireAuth } from "../middleware/auth";

export const mediaRouter = Router();

// Body size is set globally in index.ts (15mb). Auth + handlers only here.
mediaRouter.use(requireAuth);
mediaRouter.post("/", uploadMediaHandler);
