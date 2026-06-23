.PHONY: up down logs seed smoke test test-catalog test-gateway test-recommender test-search load clean ps help

up: ## Build + start the whole stack
	docker compose up --build -d

down: ## Stop the stack
	docker compose down

clean: ## Stop and wipe volumes (fresh start)
	docker compose down -v

ps: ## Show service status
	docker compose ps

logs: ## Tail logs
	docker compose logs -f --tail=100

seed: ## Ingest catalog + embeddings + demo data (run after `make up`)
	bash scripts/seed.sh

smoke: ## Functional smoke test against the running stack
	bash scripts/smoke.sh

# ---- unit tests ----
# Run inside one-off containers so the installed deps are present and no local
# Python env is needed. Tests are pure logic (no DB/Kafka required).
test: test-catalog test-gateway test-recommender test-search ## Run all unit tests

test-catalog:
	docker compose run --rm --no-deps -v "$(CURDIR)/services/catalog:/app" -w /app catalog python -m pytest -q

test-gateway:
	docker compose run --rm --no-deps -v "$(CURDIR)/services/gateway:/app" -w /app gateway python -m pytest -q

test-recommender:
	docker compose run --rm --no-deps -v "$(CURDIR)/services/recommender:/app" -w /app recommender python -m pytest -q

test-search:
	docker compose run --rm --no-deps -v "$(CURDIR)/services/search:/app" -w /app search python -m pytest -q

load: ## Run the k6 load test against the gateway
	k6 run loadtest/search.js

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'
