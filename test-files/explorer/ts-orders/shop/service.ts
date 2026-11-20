import { Money } from "./money";
import { Order } from "./order";
import { Store } from "./store";

/** Checks orders out through a Store (constructor injection). */
export class Service {
  constructor(private readonly store: Store) {}

  checkout(order: Order): Money {
    order.markPaid();
    this.store.save(order);
    return order.total;
  }
}
