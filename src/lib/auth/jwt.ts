import jwt from "jsonwebtoken";
import { env } from "../config/env.ts";

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  restaurantId?: number;
  restaurantRole?: string;
  branchIds?: number[];
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwt.accessSecret) as JwtPayload;
}
