"""Keep API tests off the user's durable event directory."""

from __future__ import annotations

import os

os.environ.setdefault("TOVA_EVENT_STORE", "memory")
