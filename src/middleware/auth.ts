import type { Request, Response, NextFunction } from "express";

import { ensureAppUser } from "../lib/ensureAppUser";
import { getSupabaseAdmin } from "../lib/supabase";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail?: string;
}

/**
 * Require a valid Supabase access token (`Authorization: Bearer …`).
 * Provisions the Prisma User (and may claim seed-user data) on first request.
 *
 * Local escape hatch: set ALLOW_STUB_AUTH=1 to accept `x-user-id` /
 * DEV_DEFAULT_USER_ID when no Bearer token is present. Never enable on Railway.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("authorization")?.trim() ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const token = match?.[1]?.trim();

    if (token) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        res.status(401).json({ error: "Invalid or expired session" });
        return;
      }

      const appUser = await ensureAppUser(data.user);
      const authed = req as AuthenticatedRequest;
      authed.userId = appUser.id;
      authed.userEmail = appUser.email;
      next();
      return;
    }

    const allowStub = process.env.ALLOW_STUB_AUTH === "1";
    if (allowStub) {
      const headerId = req.header("x-user-id")?.trim();
      const fallback = process.env.DEV_DEFAULT_USER_ID?.trim();
      const userId = headerId || fallback;
      if (userId) {
        (req as AuthenticatedRequest).userId = userId;
        next();
        return;
      }
    }

    res.status(401).json({
      error: "Missing Authorization Bearer token",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("SUPABASE_URL") || message.includes("SUPABASE_SECRET")) {
      res.status(503).json({
        error: "Server auth is not configured. Try again in a moment.",
      });
      return;
    }
    next(err);
  }
}

/** @deprecated Use requireAuth */
export const stubAuth = requireAuth;
