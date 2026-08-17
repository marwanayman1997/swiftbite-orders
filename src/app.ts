import express, { type Express } from "express";
import { routes } from "./routes.ts";
import { errorHandler } from "./lib/error/errorHandler.ts";
import { correlationId } from "./lib/correlation/correlationId.ts";
import { resolveRegion } from "./lib/sharding/region-resolver.ts";
import cookieParser from "cookie-parser";
import { env } from "./lib/config/env.ts";
import cors from "cors";
import helmet from "helmet";

export function createApp(): Express {
  const app: Express = express();
  app.use(helmet());
  app.use(cors({ origin: env.cors.origins, credentials: true }));
  app.set("query parser", "extended");
  app.use(express.json());
  app.use(cookieParser());
  app.use(correlationId);
  app.use(resolveRegion);
  app.use("/api", routes);
  app.use(errorHandler);

  return app;
}
