package orders.shop;

/** Checks orders out through a Store (constructor injection). */
public class Service {
    private final Store store;

    public Service(Store store) { this.store = store; }

    public Money checkout(Order order) {
        order.markPaid();
        store.save(order);
        return order.getTotal();
    }
}
