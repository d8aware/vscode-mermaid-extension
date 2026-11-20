namespace Orders.Shop;

/// <summary>Keeps orders. Storage.MemStore implements it.</summary>
public interface IStore
{
    void Save(Order order);
    Order? Find(string id);
}
