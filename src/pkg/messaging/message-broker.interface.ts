export interface TopologyExchange {
  name: string;
  type: "topic" | "direct" | "fanout";
  durable?: boolean;
}

export interface TopologyQueue {
  name: string;
  durable?: boolean;
  deadLetterExchange?: string;
}

export interface TopologyBinding {
  exchange: string;
  queue: string;
  pattern: string;
}

export interface BrokerTopology {
  exchanges?: TopologyExchange[];
  queues?: TopologyQueue[];
  bindings?: TopologyBinding[];
}

export interface BrokerMessage<T = unknown> {
  content: T;
  routingKey: string;
  redelivered: boolean;
}

export type MessageHandler<T = unknown> = (
  message: BrokerMessage<T>,
) => Promise<void>;

export interface IMessageBroker {
  connect(): Promise<void>;
  consume(
    queue: string,
    prefetch: number,
    handler: MessageHandler,
  ): Promise<void>;
  close(): Promise<void>;
  declareTopology(topology: BrokerTopology): Promise<void>;
  publish(
    exchange: string,
    routingKey: string,
    payload: unknown,
  ): Promise<void>;
}
