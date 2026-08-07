import "dotenv/config";
import cors from "cors";
import express from "express";
import { adminRouter } from "./routes/admin";
import { communitiesRouter } from "./routes/communities";
import { favoritesRouter } from "./routes/favorites";
import { collectionsRouter } from "./routes/collections";
import { journalRouter } from "./routes/journal";
import { mediaRouter } from "./routes/media";
import { poisRouter } from "./routes/pois";
import { routesRouter } from "./routes/routes";
import { searchRouter } from "./routes/search";
import { stampsRouter } from "./routes/stamps";
import { usersRouter } from "./routes/users";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
// Base64 JPEG payloads: binary limit + ~33% encoding + JSON wrapper.
// Keep well above client compressed size; still capped by media handler.
app.use(express.json({ limit: "15mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hanchi-api" });
});

app.use("/communities", communitiesRouter);
app.use("/pois", poisRouter);
app.use("/stamps", stampsRouter);
app.use("/favorites", favoritesRouter);
app.use("/collections", collectionsRouter);
app.use("/journal", journalRouter);
app.use("/media", mediaRouter);
app.use("/users", usersRouter);
app.use("/routes", routesRouter);
app.use("/search", searchRouter);
app.use("/admin", adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, "0.0.0.0", () => {
  console.log(`hanchi-api listening on http://0.0.0.0:${port}`);
});
