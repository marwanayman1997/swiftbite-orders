import { RabbitMQClient } from "../../pkg/messaging/rabbitmq/rabbitmq.client.ts";
import { env } from "../config/env.ts";

export const messageBroker = new RabbitMQClient({ url: env.rabbitmq.url });
