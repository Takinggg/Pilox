HIVE_VERSION ?= 0.1.0
ARCH ?= amd64
BUILD_DIR := build
ISO_NAME := hive-os-$(HIVE_VERSION)-$(ARCH).iso
APP_DIR := $(BUILD_DIR)/app
CLI_DIR := $(BUILD_DIR)/cli

.PHONY: all build-app build-cli build-iso clean help

all: build-app build-cli build-iso

help:
	@echo "Hive OS Build System v$(HIVE_VERSION)"
	@echo ""
	@echo "Targets:"
	@echo "  all        - Build everything (app + cli + iso)"
	@echo "  build-app  - Build the Next.js web application"
	@echo "  build-cli  - Build the CLI tool"
	@echo "  build-iso  - Build the installable ISO image"
	@echo "  clean      - Remove all build artifacts"
	@echo ""
	@echo "Variables:"
	@echo "  HIVE_VERSION  - Version string (default: $(HIVE_VERSION))"
	@echo "  ARCH          - Target architecture (default: $(ARCH))"

build-app:
	@echo "==> Building Hive application..."
	@mkdir -p $(APP_DIR)
	bash scripts/build-app.sh $(APP_DIR)

build-cli:
	@echo "==> Building Hive CLI..."
	@mkdir -p $(CLI_DIR)
	cd ../cli && npm ci && npm run build
	cp -r ../cli/dist $(CLI_DIR)/
	cp ../cli/package.json $(CLI_DIR)/
	cp ../cli/bin/hive.js $(CLI_DIR)/

build-iso: build-app build-cli
	@echo "==> Building ISO image..."
	@mkdir -p $(BUILD_DIR)
	HIVE_VERSION=$(HIVE_VERSION) ARCH=$(ARCH) bash scripts/build-iso.sh

clean:
	@echo "==> Cleaning build artifacts..."
	rm -rf $(BUILD_DIR)
	rm -f *.iso
	cd ../cli && rm -rf dist node_modules
	@echo "==> Clean complete."
