"""Raises an error on purpose so the traceback parser has something to chew on."""


def inner(x: int) -> int:
    return 10 // x


def outer() -> int:
    return inner(0)


print("about to raise an error")
outer()
