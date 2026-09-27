"""A tiny coursework-style program. Run it: it asks for input."""


def greet(name: str) -> str:
    return f"Hello, {name}! 🐸"


def main() -> None:
    name = input("What is your name? ")
    print(greet(name))
    count = int(input("How many greetings? "))
    for i in range(count):
        print(f"hello {i + 1}")
    print("done")


if __name__ == "__main__":
    main()
