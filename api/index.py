import sys
from pathlib import Path

# Add backend/ to path so `from app.xxx import ...` works in Vercel serverless
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.main import app  # noqa: F401  (Vercel looks for `app`)
