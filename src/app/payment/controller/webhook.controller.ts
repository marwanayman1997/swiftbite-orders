import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { KashierWebhookService } from "../service/kashier-webhook.service.ts";
import { logger } from "../../../lib/logger/logger.ts";

@injectable()
export class WebhookController {
  constructor(
    @inject(TOKENS.KashierWebhookService)
    private readonly kashierWebhookService: KashierWebhookService,
  ) {}

  // Always resolves to 200 for anything past signature verification —
  // duplicates ack cleanly, and Kashier stops retrying (business-logic/payments.md §3).
  handle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.params.provider !== "kashier") {
        return res.status(404).json({ error: "Unknown payment provider" });
      }

      const signature = req.header("x-kashier-signature") ?? "";
      await this.kashierWebhookService.process(req.body, signature);
      res.status(200).json({ received: true });
    } catch (err: any) {
      if (err?.statusCode === 401) {
        logger.error("Kashier webhook signature invalid", {
          correlationId: req.correlationId,
        });
        return res.status(401).json({ error: err.message });
      }
      next(err);
    }
  };
}
