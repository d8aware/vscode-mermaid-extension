from analytics.report import build


def test_build() -> None:
    assert build() == "a, b"
