"""Gateway configuration, read from environment."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gateway_port: int = 8080
    mongo_uri: str = "mongodb://localhost:27017/media"
    redis_url: str = "redis://localhost:6379"

    # downstream services
    catalog_url: str = "http://localhost:8001"
    search_url: str = "http://localhost:8002"
    recommender_url: str = "http://localhost:8003"

    # auth
    jwt_access_secret: str = "dev-access-secret"
    jwt_refresh_secret: str = "dev-refresh-secret"
    jwt_access_ttl: int = 900  # 15 min
    jwt_refresh_ttl: int = 604800  # 7 days

    # rate limit (token bucket)
    rate_limit_capacity: int = 60  # max burst tokens
    rate_limit_refill: float = 30  # tokens per second

    node_env: str = "development"
    otel_exporter_otlp_endpoint: str | None = None

    # Browser origins allowed to call the gateway (comma-separated). The web
    # client runs at :3000 and calls the gateway at :8080 cross-origin.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"


settings = Settings()
