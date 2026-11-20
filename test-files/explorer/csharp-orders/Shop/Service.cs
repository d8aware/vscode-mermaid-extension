namespace Orders.Shop;

/// <summary>Checks orders out through an IStore (constructor injection).</summary>
public class Service
{
    private readonly IStore store;

    public Service(IStore store) => this.store = store;

    public Money Checkout(Order order)
    {
        order.MarkPaid();
        store.Save(order);
        return order.Total;
    }
}
