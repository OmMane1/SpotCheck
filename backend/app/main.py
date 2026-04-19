from fastapi import FastAPI

from app.api.routes import router


app = FastAPI(
    title="Fenway Parking Finder API",
    version="0.1.0",
    description="Hackathon API for legal street parking recommendations near Fenway Park.",
)
app.include_router(router)
