from analytics.store import load


def build() -> str:
    return ", ".join(load())
