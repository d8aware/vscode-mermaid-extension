// Start here: Explore Classes From Here on this file lights Status, Line and
// Order. Order extends Entity; its fields lead out to Line, Money and Status.
namespace Orders.Shop;

public enum Status
{
    Open,
    Paid,
}

public class Line
{
    public string Sku { get; init; } = "";
    public Money Price { get; init; } = new();
}

public class Order : Entity
{
    public List<Line> Lines { get; } = new();
    public Money Total { get; private set; } = new();
    private Status status = Status.Open;

    public void Add(Line line)
    {
        if (status != Status.Open)
        {
            throw new InvalidOperationException("order is closed");
        }
        Lines.Add(line);
        Total = Total.Add(line.Price);
    }

    public bool IsPaid() => status == Status.Paid;

    internal void MarkPaid() => status = Status.Paid;
}
