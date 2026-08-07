import type { Request, Response, NextFunction } from "express";

function isPayloadTooLarge(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: string; status?: number; statusCode?: number };
  return (
    e.type === "entity.too.large" ||
    e.status === 413 ||
    e.statusCode === 413
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err);
  if (isPayloadTooLarge(err)) {
    res.status(413).json({
      error: "Photo is too large. Try a smaller image.",
      code: "payload_too_large",
    });
    return;
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}
