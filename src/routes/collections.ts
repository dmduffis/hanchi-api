import { Router } from "express";
import {
  addItemHandler,
  createCollectionHandler,
  deleteCollectionHandler,
  followCollectionHandler,
  getBySlugHandler,
  getCollectionHandler,
  listFollowingHandler,
  listMyCollectionsHandler,
  membershipHandler,
  removeItemHandler,
  smartSaveHandler,
  unfollowCollectionHandler,
  updateCollectionHandler,
} from "../controllers/collectionsController";
import { requireAuth } from "../middleware/auth";

export const collectionsRouter = Router();

collectionsRouter.use(requireAuth);

collectionsRouter.get("/", listMyCollectionsHandler);
collectionsRouter.post("/", createCollectionHandler);
collectionsRouter.get("/membership", membershipHandler);
collectionsRouter.post("/save", smartSaveHandler);
collectionsRouter.get("/following", listFollowingHandler);
collectionsRouter.get("/by-slug/:shareSlug", getBySlugHandler);

collectionsRouter.get("/:id", getCollectionHandler);
collectionsRouter.patch("/:id", updateCollectionHandler);
collectionsRouter.delete("/:id", deleteCollectionHandler);
collectionsRouter.post("/:id/items", addItemHandler);
collectionsRouter.delete("/:id/items", removeItemHandler);
collectionsRouter.post("/:id/follow", followCollectionHandler);
collectionsRouter.delete("/:id/follow", unfollowCollectionHandler);
