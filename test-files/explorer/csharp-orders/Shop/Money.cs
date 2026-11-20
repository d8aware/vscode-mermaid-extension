namespace Orders.Shop;

/// <summary>An amount in minor units of one currency.</summary>
public class Money
{
    public long Amount { get; init; }
    public string Currency { get; init; } = "USD";

    public Money Add(Money other) => new() { Amount = Amount + other.Amount, Currency = Currency };
}
