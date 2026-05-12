.PHONY: dev build clean logs ps down help devdown clean-build seed-cities force-seed-cities build-clusters dev-clean rebuild-container rebuild-buildclusters clean-raw

# Load .env if present (so REALMAP_OPENAI_API_KEY is available for extend-raw-data targets)
ifneq (,$(wildcard .env))
include .env
export
endif

# Default target
.DEFAULT_GOAL := help

# Clean everything and start fresh
dev-clean:
	@echo "Cleaning everything and starting fresh..."
	docker-compose -f docker-compose.dev.yml down -v
	@echo "Building containers with cache..."
	DOCKER_BUILDKIT=1 docker-compose -f docker-compose.dev.yml build
	@echo "Starting Elasticsearch..."
	docker-compose -f docker-compose.dev.yml up -d elasticsearch
	@echo "Waiting for Elasticsearch to be healthy..."
	@until curl -s http://localhost:9200/_cluster/health | grep -q '"status":"yellow"\|"status":"green"'; do \
		echo "Waiting for Elasticsearch to be ready..."; \
		sleep 5; \
	done
	@echo "Building packages..."
	@echo "1. Building shared package..."
	docker-compose -f docker-compose.dev.yml run --rm --no-deps server sh -c "pnpm --filter @realmap/shared build"
	@echo "2. Building dependent packages in parallel..."
	docker-compose -f docker-compose.dev.yml run --rm --no-deps server sh -c "pnpm --filter @realmap/scripts build" & \
	docker-compose -f docker-compose.dev.yml run --rm --no-deps client pnpm --filter @realmap/client build & \
	wait
	@echo "3. Seeding cities data..."
	docker-compose -f docker-compose.dev.yml run --rm server sh -c "pnpm --filter @realmap/scripts seed-cities"
	@echo "4. Building embeddings (Python/umap-learn)..."
	docker-compose -f docker-compose.dev.yml run --rm server \
		sh -c "pip3 install --break-system-packages -q -r /app/packages/scripts/src/buildClusters/requirements.txt && python3 /app/packages/scripts/src/buildClusters/run.py"
	mkdir -p packages/client/public/data packages/client/src/data
	cp data/features.json packages/client/public/data/features.json
	cp data/features.json packages/client/src/data/features.json
	cp data/global_color_calibration.json packages/client/public/data/global_color_calibration.json
	cp data/global_color_calibration.json packages/client/src/data/global_color_calibration.json
	cp data/IngredientsSchema.ts packages/shared/src/types/Ingredients.ts
	cp data/CookingMethodsSchema.ts packages/shared/src/types/CookingMethods.ts
	@echo "Starting all services..."
	docker-compose -f docker-compose.dev.yml up

# Clean build (for platform mismatch issues)
dev:
	docker-compose -f docker-compose.dev.yml down
	docker-compose -f docker-compose.dev.yml build --no-cache
	docker-compose -f docker-compose.dev.yml up

# Development environment
devup:
	@echo "Starting development environment..."
	docker-compose -f docker-compose.dev.yml up --build

# Stop development environment
devdown:
	@echo "Stopping development environment..."
	docker-compose -f docker-compose.dev.yml down

# Build all services
build:
	@echo "Building all services..."
	docker-compose -f docker-compose.dev.yml build

# Clean up containers, volumes, and build artifacts
clean:
	@echo "Cleaning up build artifacts..."
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf packages/*/dist

# View logs
logs:
	@echo "Viewing logs..."
	docker-compose -f docker-compose.dev.yml logs -f

# List running containers
ps:
	@echo "Listing running containers..."
	docker-compose -f docker-compose.dev.yml ps

# Stop all services
down:
	@echo "Stopping all services..."
	docker-compose -f docker-compose.dev.yml down

# Install dependencies
install:
	@echo "Installing dependencies..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm install

# Build shared package
build-shared:
	@echo "Building shared package..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/shared build

# Build server package
build-server:
	@echo "Building server package..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/server build

# Build client package
build-client:
	@echo "Building client package..."
	docker-compose -f docker-compose.dev.yml run --rm client pnpm --filter @realmap/client build

# Run tests
test:
	@echo "Running tests..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm test

# Lint code
lint:
	@echo "Running linter..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm lint

# Format code
format:
	@echo "Formatting code..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm format

# Seed cities data (only if index is empty)
seed-cities:
	@echo "Seeding cities data (if index is empty)..."
	@echo "Waiting for Elasticsearch to be healthy..."
	@until curl -s http://localhost:9200/_cluster/health | grep -q '"status":"yellow"\|"status":"green"'; do \
		echo "Waiting for Elasticsearch to be ready..."; \
		sleep 5; \
	done
	@echo "Elasticsearch is healthy. Starting seed process..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/scripts seed-cities

# Force seed cities data (even if index is not empty)
force-seed-cities:
	@echo "Force seeding cities data..."
	@echo "Waiting for Elasticsearch to be healthy..."
	@until curl -s http://localhost:9200/_cluster/health | grep -q '"status":"yellow"\|"status":"green"'; do \
		echo "Waiting for Elasticsearch to be ready..."; \
		sleep 5; \
	done
	@echo "Elasticsearch is healthy. Starting force seed process..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/scripts force-seed-cities

# Rebuild Python pipeline image (run this after changing requirements.txt)
rebuild-buildclusters:
	@echo "🐍 Rebuilding Python pipeline image (realmap-buildclusters)..."
	@docker rmi realmap-buildclusters:latest 2>/dev/null || true
	@docker build -f Dockerfile.buildclusters -t realmap-buildclusters:latest .
	@echo "✅ Pipeline image rebuilt — run make build-clusters to use it"

# Rebuild container and update dependencies
rebuild-container:
	@echo "🔨 Rebuilding Docker container with updated dependencies..."
	@echo "   Removing old image to ensure clean rebuild..."
	@docker rmi realmap-server:latest 2>/dev/null || true
	@echo "   Building server image from scratch (no cache)..."
	docker-compose -f docker-compose.dev.yml build --no-cache server
	@echo "✅ Container rebuilt successfully!"

# Build clusters with Bayesian architecture (v4)
build-clusters-bayes:
	@echo "🚀 Building clusters with Bayesian architecture (v4)..."
	@echo "🔨 Rebuilding Docker container with Python dependencies..."
	docker-compose -f docker-compose.dev.yml build --no-cache server
	@echo "🧪 Running tests inside Docker container..."
	docker-compose -f docker-compose.dev.yml run --rm server sh -c "python3 test_bayes.py"
	@echo "✅ Tests passed! Building shared package..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/shared build
	@set -euo pipefail; \
	docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/shared build; \
	docker-compose -f docker-compose.dev.yml run --rm server sh -c "cd packages/scripts && rm -rf dist && npx tsc src/buildClustersBayes.ts --outDir dist --module CommonJS --target ES2022 --esModuleInterop --skipLibCheck"; \
	docker-compose -f docker-compose.dev.yml run --rm server node packages/scripts/dist/buildClustersBayes.js; \
	echo "✅ Bayesian clustering completed!"; \
	echo "📊 Results: clusters_bayes.jsonl, clustering_metrics_bayes.json"

# Correct place IDs in raw data files
correct-place-ids:
	@echo "🔧 Correcting place IDs in raw data files..."
	docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/scripts run correct-place-ids
	@echo "✅ Place ID correction completed!"

# Extend raw data using OpenAI (file under data/raw; output to data/extended/<name>.extended.json)
# Usage: make extend-raw-data FILE=data.england.json
extend-raw-data:
	@if [ -z "$(REALMAP_OPENAI_API_KEY)" ]; then \
		echo "❌ Error: REALMAP_OPENAI_API_KEY environment variable must be set"; \
		echo "   Run: export REALMAP_OPENAI_API_KEY='sk-your-key-here'"; \
		exit 1; \
	fi
	@if [ -z "$(FILE)" ]; then \
		echo "❌ Error: FILE parameter must be set (filename under data/raw)"; \
		echo "   Usage: make extend-raw-data FILE=data.england.json"; \
		exit 1; \
	fi
	@if [ ! -f "data/raw/$(FILE)" ]; then \
		echo "❌ Error: data/raw/$(FILE) not found"; \
		exit 1; \
	fi
	@echo "🤖 Extending raw data: $(FILE)"
	@echo "🔨 Building shared package (required for scripts)..."
	@docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/shared build
	@echo "🚀 Running data extension pipeline..."
	@docker-compose -f docker-compose.dev.yml run --rm -e REALMAP_OPENAI_API_KEY=$(REALMAP_OPENAI_API_KEY) server \
		pnpm --filter @realmap/scripts run extend-raw-data --file=$(FILE)
	@echo "✅ Extended data saved to data/extended/$$(echo $(FILE) | sed 's/\.json$$/.extended.json/')"

# Dry run (no modifications). Usage: make extend-raw-data-dry-run FILE=data.england.json
extend-raw-data-dry-run:
	@if [ -z "$(REALMAP_OPENAI_API_KEY)" ]; then \
		echo "❌ Error: REALMAP_OPENAI_API_KEY environment variable must be set"; \
		exit 1; \
	fi
	@if [ -z "$(FILE)" ]; then \
		echo "❌ Error: FILE parameter must be set"; \
		echo "   Usage: make extend-raw-data-dry-run FILE=data.england.json"; \
		exit 1; \
	fi
	@echo "🔨 Building shared package (required for scripts)..."
	@docker-compose -f docker-compose.dev.yml run --rm server pnpm --filter @realmap/shared build
	@echo "🧪 Running data extension dry-run (no files will be modified)..."
	@docker-compose -f docker-compose.dev.yml run --rm -e REALMAP_OPENAI_API_KEY=$(REALMAP_OPENAI_API_KEY) server \
		pnpm --filter @realmap/scripts run extend-raw-data --file=$(FILE) --dry-run

# Clean raw data: strip 0.44 fillers, normalize keys, filter to master sets.
# Backups written as *.json.bak. Report at data/clean_report.json.
clean-raw:
	@echo "🧹 Cleaning raw data files..."
	@docker run --rm \
		-v "$(CURDIR)/data:/app/data" \
		-v "$(CURDIR)/packages/scripts/src/buildClusters:/app/scripts:ro" \
		python:3.12-slim \
		python3 /app/scripts/clean_raw.py
	@echo "✅ Raw data cleaned. See data/clean_report.json"

# Build embedding — Python + umap-learn via dedicated Debian-based image.
# Produces: features.json, global_color_calibration.json, build_report.json
# First run builds the Python image (~2 min). Subsequent runs reuse it.
build-clusters:
	@echo "🧹 Clearing cached embedding artifacts..."
	@rm -f data/*.bin data/umap.*.bin data/umap.*.meta.json data/features.*.bin \
		data/features.cols.*.json data/features.cols.*.meta.json 2>/dev/null || true

	@echo "🐍 Ensuring Python pipeline image is ready..."
	@docker image inspect realmap-buildclusters:latest > /dev/null 2>&1 \
		|| (echo "   First run: building Python image with umap-learn (~2 min)..." \
		    && docker build -f Dockerfile.buildclusters -t realmap-buildclusters:latest .)

	@echo "🚀 Running embedding pipeline (umap-learn)..."
	@docker run --rm \
		-v "$(CURDIR)/data:/app/data" \
		-v "$(CURDIR)/packages/scripts/src/buildClusters:/app/scripts:ro" \
		realmap-buildclusters:latest \
		python3 /app/scripts/run.py

	@echo "📋 Copying artifacts to client..."
	@mkdir -p packages/client/public/data packages/client/src/data
	@for file in \
		features.json \
		global_color_calibration.json \
		features_meta.json \
		build_report.json \
		insights.json \
		hex_grid.json; \
	do \
		if [ -f "data/$$file" ]; then \
			cp "data/$$file" "packages/client/public/data/$$file" && \
			cp "data/$$file" "packages/client/src/data/$$file" && \
			echo "  ✓ $$file"; \
		else \
			echo "  ⊘ Missing data/$$file — pipeline may have failed"; \
		fi; \
	done
	@if [ -f "data/IngredientsSchema.ts" ]; then \
		cp "data/IngredientsSchema.ts" "packages/shared/src/types/Ingredients.ts" && \
		echo "  ✓ IngredientsSchema.ts"; \
	fi
	@if [ -f "data/CookingMethodsSchema.ts" ]; then \
		cp "data/CookingMethodsSchema.ts" "packages/shared/src/types/CookingMethods.ts" && \
		echo "  ✓ CookingMethodsSchema.ts"; \
	fi

	@echo "🔁 Rebuilding shared TypeScript types..."
	@if docker inspect realmap-server 2>/dev/null | grep -q '"Running": true'; then \
		docker exec realmap-server pnpm --filter @realmap/shared build 2>&1 | tail -3 && \
		echo "  ✓ @realmap/shared rebuilt (Vite will hot-reload)"; \
	else \
		echo "  ℹ  Dev server not running — shared types will rebuild on next devup"; \
	fi

	@echo "🧪 Running structural validation (full coverage)..."
	@python3 data/validate_all.py 2>&1 | tail -5

	@echo "🧪 Running curated validation..."
	@python3 data/validate_data.py 2>&1 | grep -E "TOTAL|PASSED|✗|✓ " | head -20

	@echo "✅ Embedding pipeline complete! Refresh browser to see new colors."

# Generate color & clustering visual test report (opens in browser).
# Reads: data/features.json + data/global_color_calibration.json
# Writes: data/color_report.html
color-report:
	@echo "🎨 Generating color & clustering test report..."
	@python3 data/color_report.py --open
	@echo "✅ Report ready: data/color_report.html"

# Show help
help:
	@echo "Available commands:"
	@echo "  make dev           - Clean build and start all services"
	@echo "  make dev-clean     - Clean everything (including volumes) and start fresh"
	@echo "  make devup         - Start development environment"
	@echo "  make devdown       - Stop development environment"
	@echo "  make build         - Build all services"
	@echo "  make clean         - Clean up build artifacts"
	@echo "  make logs          - View logs"
	@echo "  make ps            - List running containers"
	@echo "  make down          - Stop all services"
	@echo "  make install       - Install dependencies"
	@echo "  make build-shared  - Build shared package"
	@echo "  make build-server  - Build server package"
	@echo "  make build-client  - Build client package"
	@echo "  make test          - Run tests"
	@echo "  make lint          - Run linter"
	@echo "  make format        - Format code"
	@echo "  make seed-cities   - Seed cities data (if index is empty)"
	@echo "  make force-seed-cities - Force seed cities data"
	@echo "  make build-clusters - Build clusters (with dependency check)"
	@echo "  make build-clusters-bayes - Build clusters with Bayesian architecture (v4)"
	@echo "  make extend-raw-data FILE=data.england.json - Extend one raw file (requires REALMAP_OPENAI_API_KEY)"
	@echo "  make extend-raw-data-dry-run FILE=data.england.json - Dry run (no modifications)"
	@echo "  make test-bayes - Test Bayesian clustering core"
	@echo "  make rebuild-container - Rebuild Docker container with updated dependencies"
	@echo "  make color-report - Generate color & clustering visual test report (opens browser)"
