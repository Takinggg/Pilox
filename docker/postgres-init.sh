#!/bin/bash
# Harden the default hive role created by postgres:16-alpine.
# The POSTGRES_USER (hive) is initially created as SUPERUSER by the official
# entrypoint. This script runs once during `initdb` and strips dangerous
# privileges, leaving only what the Hive app actually needs.
#
# Mounted via docker-compose volumes:
#   ./postgres-init.sh:/docker-entrypoint-initdb.d/99-harden-role.sh:ro

set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Strip superuser and dangerous privileges from the application role
    ALTER ROLE ${POSTGRES_USER} NOSUPERUSER NOCREATEROLE NOCREATEDB;

    -- Revoke the ability to read arbitrary files via COPY FROM/TO PROGRAM
    REVOKE pg_read_server_files  FROM ${POSTGRES_USER};
    REVOKE pg_write_server_files FROM ${POSTGRES_USER};
    REVOKE pg_execute_server_program FROM ${POSTGRES_USER};

    -- The app role keeps full ownership of its own database (schema, tables,
    -- sequences, indexes) but can no longer touch system catalogs or other DBs.
EOSQL

echo "✓ PostgreSQL role '${POSTGRES_USER}' hardened (NOSUPERUSER, no file/program access)"
