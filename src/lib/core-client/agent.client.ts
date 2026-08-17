import { coreClientGet } from "./core-client.ts";

export interface CoreAgent {
  id: number;
  name: string;
  phone: string;
}

// Not cached — low reuse, agent identity display data only.
export async function getAgent(id: number): Promise<CoreAgent> {
  return coreClientGet<CoreAgent>(`/api/user/internal/agents/${id}`);
}
