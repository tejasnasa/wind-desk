# Wind Desk - developer commands
#
#   make install   create the venv, install backend + front-end dependencies
#   make ingest    (re)build the SQLite store from the Elexon API
#   make test      backend test suite + front-end type check and build
#   make up        build and start the Docker stack (http://localhost:8080)
#
PYTHON ?= python
VENV   ?= .venv
VENV_PYTHON = $(VENV)/Scripts/python.exe
VENV_BIN    = $(VENV)/bin/python
PY  = $(if $(wildcard $(VENV_PYTHON)),$(VENV_PYTHON),$(VENV_BIN))

.DEFAULT_GOAL := help
.PHONY: help install install-backend install-frontend ingest dev-api dev-web \
        test test-backend test-frontend build check docker-build up down logs \
        docker-ingest shots clean

help:
	@echo "Wind Desk"
	@echo "  make install        install backend (venv) and front-end dependencies"
	@echo "  make ingest         rebuild backend/data/wind.db from the Elexon API"
	@echo "  make dev-api        run the FastAPI service on :8000"
	@echo "  make dev-web        run the Vite dev server on :5173"
	@echo "  make test           backend tests + front-end type check and build"
	@echo "  make build          production front-end bundle"
	@echo "  make up             docker compose up (web on :8080, api on :8000)"
	@echo "  make down           stop the Docker stack"
	@echo "  make shots          capture UI screenshots into docs/screenshots"
	@echo "  make check          headless UI smoke check against a running stack"

install: install-backend install-frontend

install-backend:
	$(PYTHON) -m venv $(VENV)
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r backend/requirements-dev.txt

install-frontend:
	npm --prefix frontend install --no-audit --no-fund

ingest:
	cd backend && ../$(PY) -m scripts.seed

dev-api:
	cd backend && ../$(PY) -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-web:
	npm --prefix frontend run dev

test: test-backend test-frontend

test-backend:
	cd backend && ../$(PY) -m pytest tests -q

test-frontend:
	npm --prefix frontend run build

build:
	npm --prefix frontend run build

docker-build:
	docker compose build

up:
	docker compose up --build -d
	@echo "web: http://localhost:8080   api: http://localhost:8000/api/docs"

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

docker-ingest:
	docker compose run --rm ingest

shots:
	node tools/shots/shots.mjs http://127.0.0.1:5173 docs/screenshots

check:
	node tools/shots/check.mjs http://127.0.0.1:8080

clean:
	rm -rf frontend/dist frontend/node_modules $(VENV) .pytest_cache backend/.pytest_cache
	find . -name "__pycache__" -type d -prune -exec rm -rf {} +
