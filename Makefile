# vado bene? — helper locali
#
# Usage:
#   make build      Build dell'immagine Docker (standalone)
#   make run        Build + avvio compose locale (app + sidecar cron)
#   make stop       Stop dei container compose
#   make logs       Tail dei log dell'app
#   make migrate    Applica le migrazioni Supabase (richiede SUPABASE_DB_URL)
#   make test       lint + typecheck + test

COMPOSE := docker compose -f docker-compose.local.yml

.PHONY: build run stop logs migrate test

build:
	docker build -t vadobene:latest .

run:
	$(COMPOSE) up --build -d
	@echo "App su http://localhost:3000 (compose: app + sidecar cron)"

stop:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f app

migrate:
	pnpm db:migrate

test:
	pnpm lint && pnpm typecheck && pnpm test
