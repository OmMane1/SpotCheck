from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(router)
