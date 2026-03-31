#!/usr/bin/env bash
# build-app.sh — Build the Hive Next.js application for production deployment
#
# Usage: bash build-app.sh [output_dir]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
APP_DIR="${PROJECT_ROOT}"
OUTPUT_DIR="${1:-$(dirname "$SCRIPT_DIR")/build/app}"

echo "Building Hive application..."
echo "  Source:  ${APP_DIR}"
echo "  Output:  ${OUTPUT_DIR}"

# Validate that the project has a package.json
if [ ! -f "${APP_DIR}/package.json" ]; then
    echo "Error: No package.json found in ${APP_DIR}"
    exit 1
fi

cd "${APP_DIR}"

# Install dependencies (clean install for reproducibility)
echo ""
echo "==> Installing dependencies..."
npm ci --ignore-scripts=false

# Build the Next.js application
echo ""
echo "==> Building Next.js application..."
NODE_ENV=production npm run build

# Copy standalone output
echo ""
echo "==> Copying build output..."
mkdir -p "${OUTPUT_DIR}"

# Next.js standalone output (next.config with output: 'standalone')
if [ -d ".next/standalone" ]; then
    cp -a .next/standalone/. "${OUTPUT_DIR}/"
    # Copy static assets
    if [ -d ".next/static" ]; then
        mkdir -p "${OUTPUT_DIR}/.next/static"
        cp -a .next/static/. "${OUTPUT_DIR}/.next/static/"
    fi
    # Copy public assets
    if [ -d "public" ]; then
        mkdir -p "${OUTPUT_DIR}/public"
        cp -a public/. "${OUTPUT_DIR}/public/"
    fi
else
    # Fallback: copy the entire .next directory
    echo "Warning: Standalone output not found. Copying full build."
    cp -a .next "${OUTPUT_DIR}/"
    cp package.json "${OUTPUT_DIR}/"
    cp -a node_modules "${OUTPUT_DIR}/"
    if [ -d "public" ]; then
        cp -a public "${OUTPUT_DIR}/"
    fi
fi

# Copy Prisma schema and migrations if present
if [ -d "prisma" ]; then
    echo "==> Copying Prisma schema and migrations..."
    mkdir -p "${OUTPUT_DIR}/prisma"
    cp -a prisma/. "${OUTPUT_DIR}/prisma/"
fi

# Copy drizzle schema and migrations if present
if [ -d "drizzle" ]; then
    echo "==> Copying Drizzle migrations..."
    mkdir -p "${OUTPUT_DIR}/drizzle"
    cp -a drizzle/. "${OUTPUT_DIR}/drizzle/"
fi

# Create a version file
echo "${HIVE_VERSION:-0.1.0}" > "${OUTPUT_DIR}/VERSION"

# Calculate size
APP_SIZE=$(du -sh "${OUTPUT_DIR}" | cut -f1)
echo ""
echo "Build complete!"
echo "  Output: ${OUTPUT_DIR}"
echo "  Size:   ${APP_SIZE}"
