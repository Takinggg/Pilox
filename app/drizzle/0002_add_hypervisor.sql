-- Add hypervisor type for multi-backend VM isolation
CREATE TYPE "hypervisor_type" AS ENUM ('firecracker', 'cloud-hypervisor');

ALTER TABLE "agents" ADD COLUMN "hypervisor" hypervisor_type NOT NULL DEFAULT 'firecracker';
ALTER TABLE "agents" ADD COLUMN "confidential" boolean DEFAULT false;

CREATE INDEX "agents_hypervisor_idx" ON "agents" ("hypervisor");
