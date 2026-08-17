import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt.ts";
import { NotAuthenticated } from "./errors.ts";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.access_token;
  if (!token) {
    throw NotAuthenticated;
  }

  req.user = verifyAccessToken(token);
  next();
}
