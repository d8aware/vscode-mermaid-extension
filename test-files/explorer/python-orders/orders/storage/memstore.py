from orders.shop.order import Order
from orders.shop.store import Store


class MemStore(Store):
    """An in-memory Store."""

    def __init__(self) -> None:
        self._orders: dict[str, Order] = {}

    def save(self, order: Order) -> None:
        self._orders[order.id] = order

    def find(self, id: str) -> Order | None:
        return self._orders.get(id)
