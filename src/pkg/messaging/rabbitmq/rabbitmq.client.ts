import amqp, {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import type {
  BrokerTopology,
  IMessageBroker,
  MessageHandler,
} from "../message-broker.interface.ts";
import type { RabbitMQClientOptions } from "./rabbitmq.types.ts";

// Wraps amqp-connection-manager: auto-reconnect, publish buffering while
// disconnected, and topology re-declaration on every (re)connect all come
// from the library itself — no hand-rolled backoff loop here.
export class RabbitMQClient implements IMessageBroker {
  private readonly connection: AmqpConnectionManager;
  private readonly channel: ChannelWrapper;
  private topology: BrokerTopology = {};

  constructor(options: RabbitMQClientOptions) {
    this.connection = amqp.connect([options.url]);
    this.connection.on("connect", () => {
      console.log("[rabbitmq] connected");
    });
    this.connection.on("disconnect", (params) => {
      console.error("[rabbitmq] disconnected:", params.err?.message);
    });

    this.channel = this.connection.createChannel({
      setup: (ch: ConfirmChannel) => this.applyTopology(ch),
    });
  }

  async connect(): Promise<void> {
    await this.channel.waitForConnect();
  }

  async declareTopology(topology: BrokerTopology): Promise<void> {
    this.topology = topology;
    await this.channel.addSetup((ch: ConfirmChannel) => this.applyTopology(ch));
  }

  private async applyTopology(ch: ConfirmChannel): Promise<void> {
    for (const exchange of this.topology.exchanges ?? []) {
      await ch.assertExchange(exchange.name, exchange.type, {
        durable: exchange.durable ?? true,
      });
    }
    for (const queue of this.topology.queues ?? []) {
      await ch.assertQueue(queue.name, {
        durable: queue.durable ?? true,
        arguments: queue.deadLetterExchange
          ? { "x-dead-letter-exchange": queue.deadLetterExchange }
          : undefined,
      });
    }
    for (const binding of this.topology.bindings ?? []) {
      await ch.bindQueue(binding.queue, binding.exchange, binding.pattern);
    }
  }

  async consume(
    queue: string,
    prefetch: number,
    handler: MessageHandler,
  ): Promise<void> {
    await this.channel.addSetup(async (ch: ConfirmChannel) => {
      await ch.prefetch(prefetch);
      await ch.consume(queue, async (msg: ConsumeMessage | null) => {
        if (!msg) return;
        try {
          const content = JSON.parse(msg.content.toString("utf-8"));
          await handler({
            content,
            routingKey: msg.fields.routingKey,
            redelivered: msg.fields.redelivered,
          });
          ch.ack(msg);
        } catch (err) {
          console.error("[rabbitmq] handler failed, nacking to DLQ:", err);
          ch.nack(msg, false, false);
        }
      });
    });
  }

  async publish(
    exchange: string,
    routingKey: string,
    payload: unknown,
  ): Promise<void> {
    await this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true },
    );
  }

  async close(): Promise<void> {
    await this.channel.close();
    await this.connection.close();
  }
}
