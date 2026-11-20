package orders.shop;

/** Keeps orders. storage.MemStore implements it. */
public interface Store {
    void save(Order order);

    Order find(String id);
}
