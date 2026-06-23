FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV GATEWAY_PORT=8080
EXPOSE 8080

# Multiple workers: the gateway is I/O-bound (proxying) and the token bucket is
# atomic in Redis, so it stays correct across workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
