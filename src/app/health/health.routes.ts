import { Router, type Request, type Response } from "express";
import { pingAll } from "../../lib/knex/knex.ts";

export const healthRouter: Router = Router();

healthRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    await pingAll();
    res.status(200).send("OK");
  } catch (error) {
    res.status(500).send({ message: "Database is currently down" });
  }
});
