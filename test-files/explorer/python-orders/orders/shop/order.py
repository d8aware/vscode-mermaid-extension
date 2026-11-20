# Start here: Explore Classes From Here on this file lights Status, Line and
# Order. Order extends Entity; its fields lead out to Line, Money and Status.
from enum import Enum

from orders.shop.entity import Entity
from orders.shop.money import Money


class Status(Enum):
    OPEN = "open"
    PAID = "paid"


class Line:
    def __init__(self, sku: str, price: Money) -> None:
        self.sku = sku
        self.price: Money = price


class Order(Entity):
    def __init__(self, id: str) -> None:
        super().__init__(id)
        self.lines: list[Line] = []
        self.total: Money = Money()
        self._status: Status = Status.OPEN

    def add(self, line: Line) -> None:
        if self._status is not Status.OPEN:
            raise ValueError("order is closed")
        self.lines.append(line)
        self.total = self.total.add(line.price)

    def is_paid(self) -> bool:
        return self._status is Status.PAID

    def mark_paid(self) -> None:
        self._status = Status.PAID
