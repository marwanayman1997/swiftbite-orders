import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { env } from "../config/env.ts";
import { verifyAccessToken } from "../auth/jwt.ts";
import {
  extractToken,
  deriveAllowedChannels,
  isChannelAllowed,
} from "./ws-auth.ts";
import {
  WsInvalidTokenError,
  WsNoTokenError,
  WS_CLOSE_CODE,
} from "./errors.ts";
import { toMs } from "../../pkg/utils/time.ts";

export function attachWsServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: "/ws",
    pingInterval: toMs(env.ws.heartbeatSec, "s"),
  });

  const pubClient = new Redis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password || undefined,
  });
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) return next(new WsNoTokenError());

    try {
      const user = verifyAccessToken(token);
      socket.data.user = user;
      socket.data.allowed = deriveAllowedChannels(user);
      next();
    } catch {
      next(new WsInvalidTokenError());
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.emit("hello", { allowedChannels: socket.data.allowed });

    socket.on(
      "subscribe",
      async (
        channel: string,
        ack?: (res: { ok: boolean; error?: string }) => void,
      ) => {
        const allowed = await isChannelAllowed(
          socket.data.user,
          socket.data.allowed,
          channel,
        );
        if (!allowed) {
          ack?.({ ok: false, error: "not permitted" });
          socket.emit("ws_error", {
            code: WS_CLOSE_CODE.UNAUTHORIZED_CHANNEL,
            message: "Unauthorized channel subscription",
          });
          socket.disconnect(true);
          return;
        }
        socket.join(channel);
        socket.emit("subscribed", { channel });
        ack?.({ ok: true });
      },
    );

    socket.on("unsubscribe", (channel: string) => {
      socket.leave(channel);
    });
  });

  return io;
}
