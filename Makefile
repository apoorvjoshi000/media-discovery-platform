.PHONY: up down logs seed smoke test test-catalog test-gateway test-recommender test-search load clean ps

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

# ---- unit tests (run locally, no stack required) ----
test: test-catalog test-gateway test-recommender test-search ## Run all unit tests

test-catalog:
	cd services/catalog && npm install && npm test

test-gateway:
	cd services/gateway && npm install && npm test

test-recommender:
	cd services/recommender && npm install && npm test

test-search:
	cd services/search && pip install -q -r requirements.txt && pytest -q

load: ## Run the k6 load test against the gateway
	k6 run loadtest/search.js

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'
