import { coreClientGet } from "./core-client.ts";

export interface CoreCustomerAddress {
  id: number;
  userId: number;
  lat: number;
  lng: number;
  addressText: string;
  city: string;
  country: string;
  building: string | null;
  apartmentNumber: string | null;
  label: string;
}

// Not cached — low reuse, must always be fresh for the delivery snapshot.
export async function getCustomerAddress(
  id: number,
): Promise<CoreCustomerAddress> {
  return coreClientGet<CoreCustomerAddress>(
    `/api/customer/addresses/internal/${id}`,
  );
}
