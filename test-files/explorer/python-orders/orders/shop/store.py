from abc import ABC, abstractmethod

from orders.shop.order import Order


class Store(ABC):
    """Keeps orders. storage.memstore.MemStore implements it."""

    @abstractmethod
    def save(self, order: Order) -> None: ...

    @abstractmethod
    def find(self, id: str) -> Order | None: ...
