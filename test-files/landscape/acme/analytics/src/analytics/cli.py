"""Command line entry point."""
from .report import build
# from .ignored import nothing  (comments do not count)


def main() -> None:
    print(build())


if __name__ == "__main__":
    main()
