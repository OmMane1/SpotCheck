from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router, service


@asynccontextmanager
async def lifespan(_: FastAPI):
    service.refresh_collection()
    yield


app = FastAPI(
    title="Fenway Parking Finder API",
    version="0.1.0",
    description="Hackathon API for legal street parking recommendations near Fenway Park.",
    lifespan=lifespan,
)
app.include_router(router)
