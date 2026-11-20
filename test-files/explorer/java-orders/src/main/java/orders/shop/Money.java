package orders.shop;

/** An amount in minor units of one currency. */
public class Money {
    private final long amount;
    private final String currency;

    public Money(long amount, String currency) { this.amount = amount; this.currency = currency; }

    public Money add(Money other) { return new Money(amount + other.amount, currency); }
}
