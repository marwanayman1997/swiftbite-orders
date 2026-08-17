export class WsNoTokenError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "WsNoTokenError";
  }
}

export class WsInvalidTokenError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "WsInvalidTokenError";
  }
}

// Emitted as a "ws_error" event immediately before the server disconnects a
// socket that attempted to subscribe to a channel outside its allowed set —
// documented in system-design.md §7 "Close codes" so clients can distinguish
// this from a network drop and avoid auto-resubscribing to the same channel.
export const WS_CLOSE_CODE = {
  UNAUTHORIZED_CHANNEL: "unauthorized_channel",
} as const;
