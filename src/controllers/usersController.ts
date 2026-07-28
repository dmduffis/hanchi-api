import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  normalizeCultures,
  normalizeIntents,
} from "../lib/userPrefs";

function mapUser(user: {
  id: string;
  email: string;
  displayName: string;
  intents: string[];
  cultures: string[];
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    intents: user.intents ?? [],
    cultures: user.cultures ?? [],
  };
}

/** GET /users/me */
export async function getMeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(mapUser(user));
  } catch (err) {
    next(err);
  }
}

/** PATCH /users/me — body: { intents?, cultures? } */
export async function updateMeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const data: { intents?: string[]; cultures?: string[] } = {};

    if ("intents" in (req.body ?? {})) {
      const intents = normalizeIntents(req.body.intents);
      if (intents === null) {
        res.status(400).json({
          error:
            "intents must be an array of explore, home, learn, and/or bite",
        });
        return;
      }
      data.intents = intents;
    } else if ("intent" in (req.body ?? {})) {
      // Legacy single-intent clients
      const intent = req.body.intent;
      if (intent === null) {
        data.intents = [];
      } else {
        const intents = normalizeIntents([intent]);
        if (intents === null) {
          res.status(400).json({
            error:
              "intent must be one of: explore, home, learn, bite",
          });
          return;
        }
        data.intents = intents;
      }
    }

    if ("cultures" in (req.body ?? {})) {
      const cultures = normalizeCultures(req.body.cultures);
      if (cultures === null) {
        res.status(400).json({
          error:
            "cultures must be an array of 0–2 ISO country codes",
        });
        return;
      }
      data.cultures = cultures;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Provide intents and/or cultures" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    res.json(mapUser(user));
  } catch (err) {
    next(err);
  }
}
