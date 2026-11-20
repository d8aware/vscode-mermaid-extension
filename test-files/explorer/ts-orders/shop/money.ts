/** An amount in minor units of one currency. */
export class Money {
  constructor(readonly amount = 0, readonly currency = "USD") {}

  add(other: Money): Money {
    return new Money(this.amount + other.amount, this.currency);
  }
}
