# Fenway Parking Backend

Small Python API for hackathon parking recommendations around Fenway.

## Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Run from the `backend` directory.

## Endpoints

- `GET /health`
- `POST /recommendations`
