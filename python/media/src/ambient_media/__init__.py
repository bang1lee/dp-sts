"""Local media tools, executed through Nx and uv."""


def main() -> None:
    from ambient_media.cli import main as cli_main

    cli_main()
