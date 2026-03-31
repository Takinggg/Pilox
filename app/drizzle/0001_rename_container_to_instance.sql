-- Migration: Rename container_id to instance_id
-- Firecracker microVMs replaced Docker containers for agent isolation.
-- The column now stores the VM instance identifier (or "docker:xxx" for GPU agents).

ALTER TABLE "agents" RENAME COLUMN "container_id" TO "instance_id";
