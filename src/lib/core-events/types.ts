export interface CoreEventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: T;
}

export type CoreEventHandler<T = unknown> = (payload: T) => Promise<void>;
