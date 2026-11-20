import { Order } from "./order";

/** Keeps orders. storage/memStore.ts implements it. */
export interface Store {
  save(order: Order): void;
  find(id: string): Order | undefined;
}
