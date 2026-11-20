import { Order } from "../shop/order";
import { Store } from "../shop/store";

/** An in-memory Store. */
export class MemStore implements Store {
  private readonly orders = new Map<string, Order>();

  save(order: Order): void {
    this.orders.set(order.id, order);
  }

  find(id: string): Order | undefined {
    return this.orders.get(id);
  }
}

/** A factory function: a consumer that is not a class. */
export function newStore(): MemStore {
  return new MemStore();
}
