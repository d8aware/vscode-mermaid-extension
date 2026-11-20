class Entity:
    """Anything with an identity."""

    def __init__(self, id: str = "") -> None:
        self.id = id
