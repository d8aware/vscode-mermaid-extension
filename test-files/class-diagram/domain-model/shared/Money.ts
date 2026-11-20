export enum Currency {
  USD = "USD",
  EUR = "EUR",
}

export class Money {
  constructor(readonly amount: number, readonly currency: Currency) {}

  static zero(currency: Currency = Currency.USD): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount, this.currency);
  }
}
