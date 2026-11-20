from orders.shop.money import Money
from orders.shop.order import Order
from orders.shop.store import Store


class Service:
    """Checks orders out through a Store (constructor injection)."""

    def __init__(self, store: Store) -> None:
        self._store: Store = store

    def checkout(self, order: Order) -> Money:
        order.mark_paid()
        self._store.save(order)
        return order.total
