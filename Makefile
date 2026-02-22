SHELL := /bin/bash
.DEFAULT_GOAL := help

NPM ?= npm
NODE ?= node
TSC ?= npx tsc

.PHONY: help install build rebuild clean dev lint typecheck test validate-examples check ci run-sample

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies from lockfile
	$(NPM) ci

build: ## Build TypeScript sources into dist/
	$(NPM) run build

rebuild: clean build ## Clean and build from scratch

clean: ## Remove build artifacts
	rm -rf dist

dev: ## Run TypeScript compiler in watch mode
	$(NPM) run dev

typecheck: ## Run strict TypeScript checks without emitting JS
	$(TSC) --noEmit

lint: ## Run ESLint
	$(NPM) run lint

test: build ## Run test suite
	$(NPM) test

validate-examples: build ## Validate bundled example quizzes
	$(NODE) dist/cli.js validate examples/sample-quiz.json --verbose
	$(NODE) dist/cli.js validate examples/adaptive-quiz.json --verbose

check: lint test validate-examples ## Full local verification pipeline

ci: install check ## CI entrypoint

run-sample: build ## Run the sample quiz interactively
	$(NODE) dist/cli.js quiz examples/sample-quiz.json
