class Money:
    """An amount in minor units of one currency."""

    def __init__(self, amount: int = 0, currency: str = "USD") -> None:
        self.amount = amount
        self.currency = currency

    def add(self, other: "Money") -> "Money":
        return Money(self.amount + other.amount, self.currency)
