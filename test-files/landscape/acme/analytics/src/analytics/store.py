import json


def load() -> list[str]:
    return json.loads('["a", "b"]')
