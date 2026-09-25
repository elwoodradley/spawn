"""A tiny coursework-style program. Spawn it: it asks for input."""


def greet(name: str) -> str:
    return f"Hello, {name}! 🐸"


def main() -> None:
    name = input("What is your name? ")
    print(greet(name))
    count = int(input("How many croaks? "))
    for i in range(count):
        print(f"croak {i + 1}")
    print("done")


if __name__ == "__main__":
    main()
