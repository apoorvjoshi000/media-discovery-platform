"""Catalog configuration, read from environment (12-factor)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    catalog_port: int = 8001
    mongo_uri: str = "mongodb://localhost:27017/media"
    kafka_brokers: str = "localhost:9092"
    otel_exporter_otlp_endpoint: str | None = None


settings = Settings()
