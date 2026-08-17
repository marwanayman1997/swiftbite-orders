import type { Server } from "socket.io";
import { container } from "../di/container.ts";
import { TOKENS } from "../di/tokens.ts";

// Resolved lazily on each call rather than constructor-injected: app.ts/routes.ts
// eagerly build the whole DI graph at import time (before server.ts creates the
// http.Server and attaches socket.io), so TOKENS.WsServer isn't registered yet
// when services are constructed. By the time any request actually calls publish(),
// server.ts has long since registered it. See container.ts's WsServer comment.
export function publish(
  channel: string,
  event: string,
  payload: unknown,
): void {
  try {
    const io = container.resolve<Server>(TOKENS.WsServer);
    io.to(channel).emit(event, payload);
  } catch {
    // Best-effort fan-out only (system-design.md §11: "Redis down -> WS
    // pub/sub paused, sockets stay open") — must never break the write path.
  }
}
