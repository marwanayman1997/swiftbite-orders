import { Router } from "express";
import { authenticate } from "../../lib/auth/guard.ts";
import { container } from "../../lib/di/container.ts";
import { TOKENS } from "../../lib/di/tokens.ts";
import { PresenceController } from "./controller/presence.controller.ts";
import { AgentController } from "./controller/agent.controller.ts";

export const agentRouter = Router();
const presenceController = container.resolve<PresenceController>(
  TOKENS.PresenceController,
);
const agentController = container.resolve<AgentController>(
  TOKENS.AgentController,
);

agentRouter.post(
  "/agents/presence/online",
  authenticate,
  presenceController.online,
);
agentRouter.post(
  "/agents/presence/offline",
  authenticate,
  presenceController.offline,
);
agentRouter.post(
  "/agents/presence/ping",
  authenticate,
  presenceController.ping,
);

agentRouter.get("/agents/tasks", authenticate, agentController.tasks);
agentRouter.get("/agents/earnings", authenticate, agentController.earnings);
