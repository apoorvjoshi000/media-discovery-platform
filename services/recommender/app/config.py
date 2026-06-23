"""Recommender configuration, read from environment."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    recommender_port: int = 8003
    mongo_uri: str = "mongodb://localhost:27017/media"
    kafka_brokers: str = "localhost:9092"
    catalog_url: str = "http://localhost:8001"
    model_rebuild_seconds: int = 60
    otel_exporter_otlp_endpoint: str | None = None


settings = Settings()
