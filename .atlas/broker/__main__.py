try:
    from .cli import main
except ImportError:  # Allows ``python3 .atlas/broker``.
    from cli import main

raise SystemExit(main())
