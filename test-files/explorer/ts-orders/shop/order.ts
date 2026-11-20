// Start here: Explore Classes From Here on this file lights Status, Line and
// Order. Order extends Entity; its fields lead out to Line, Money and Status.
import { Entity } from "./entity";
import { Money } from "./money";

export enum Status {
  Open,
  Paid,
}

export class Line {
  sku = "";
  price: Money = new Money();
}

export class Order extends Entity {
  lines: Line[] = [];
  total: Money = new Money();
  private status = Status.Open;

  add(line: Line): void {
    if (this.status !== Status.Open) {
      throw new Error("order is closed");
    }
    this.lines.push(line);
    this.total = this.total.add(line.price);
  }

  isPaid(): boolean {
    return this.status === Status.Paid;
  }

  markPaid(): void {
    this.status = Status.Paid;
  }
}
