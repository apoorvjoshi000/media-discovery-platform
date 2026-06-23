"""Central configuration, read from environment (12-factor)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    search_port: int = 8002
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dim: int = 384
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "movies"
    catalog_url: str = "http://localhost:8001"
    otel_exporter_otlp_endpoint: str | None = None


settings = Settings()
