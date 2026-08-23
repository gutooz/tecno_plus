.PHONY: dev dev-backend dev-frontend infra-up infra-up-local-db infra-down py-backend py-test py-lint py-typecheck

dev:
	npm run dev

dev-backend:
	npm run dev:backend

dev-frontend:
	npm run dev:frontend

infra-up:
	docker compose up -d redis

infra-up-local-db:
	docker compose --profile local-db up -d mongo redis

infra-down:
	docker compose down

py-backend:
	cd backend && uvicorn app.main:create_app --factory --reload --port 8000

py-test:
	cd backend && pytest

py-lint:
	cd backend && ruff check .

py-typecheck:
	cd backend && mypy app
