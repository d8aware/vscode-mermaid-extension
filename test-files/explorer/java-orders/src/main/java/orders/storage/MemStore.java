package orders.storage;

import java.util.HashMap;
import java.util.Map;

import orders.shop.Order;
import orders.shop.Store;

/** An in-memory Store. */
public class MemStore implements Store {
    private final Map<String, Order> orders = new HashMap<>();

    @Override
    public void save(Order order) { orders.put(order.getId(), order); }

    @Override
    public Order find(String id) { return orders.get(id); }
}
