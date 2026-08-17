import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export function correlationId(req: Request, res: Response, next: NextFunction) {
  const id = req.header("X-CorrelationId") || uuidv4();
  req.correlationId = id;
  res.setHeader("X-CorrelationId", id);
  next();
}
