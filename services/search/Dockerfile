FROM python:3.12-slim

WORKDIR /app

# Build deps for some wheels; cleaned up to keep the layer small.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-cache the model into the image so first request isn't a cold download.
# Placed BEFORE the app COPY so editing app code does not bust this heavy layer.
# (Comment out to keep the image small and download at runtime instead.)
ARG EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL}')"

COPY app ./app
COPY ingest_embeddings.py ./

EXPOSE 8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
