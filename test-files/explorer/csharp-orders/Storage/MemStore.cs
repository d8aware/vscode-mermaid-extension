using Orders.Shop;

namespace Orders.Storage;

/// <summary>An in-memory IStore.</summary>
public class MemStore : IStore
{
    private readonly Dictionary<string, Order> orders = new();

    public void Save(Order order) => orders[order.Id] = order;

    public Order? Find(string id) => orders.GetValueOrDefault(id);
}
