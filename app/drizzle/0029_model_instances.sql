-- Model Instances: per-model isolated inference containers
DO $$ BEGIN
  CREATE TYPE "public"."model_instance_backend" AS ENUM('ollama', 'vllm');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."model_instance_status" AS ENUM('creating', 'pulling', 'running', 'stopped', 'error');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "model_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "model_name" varchar(512) NOT NULL,
  "display_name" varchar(255) NOT NULL,
  "backend" "model_instance_backend" NOT NULL,
  "hypervisor" "hypervisor_type" NOT NULL DEFAULT 'docker',
  "instance_id" varchar(128),
  "instance_ip" varchar(45),
  "port" integer DEFAULT 11434,
  "status" "model_instance_status" NOT NULL DEFAULT 'creating',
  "quantization" varchar(20) NOT NULL DEFAULT 'Q4_K_M',
  "turbo_quant" boolean DEFAULT false,
  "speculative_decoding" boolean DEFAULT false,
  "speculative_model" varchar(255),
  "cpu_offload_gb" integer DEFAULT 0,
  "max_context_len" integer DEFAULT 8192,
  "prefix_caching" boolean DEFAULT false,
  "vptq" boolean DEFAULT false,
  "gpu_enabled" boolean DEFAULT false,
  "cpu_limit" varchar(20) DEFAULT '4.0',
  "memory_limit_mb" integer DEFAULT 8192,
  "parameter_size" varchar(20),
  "family" varchar(50),
  "error" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "model_instances" ADD CONSTRAINT "model_instances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "model_instances_model_name_idx" ON "model_instances" USING btree ("model_name");
CREATE INDEX IF NOT EXISTS "model_instances_status_idx" ON "model_instances" USING btree ("status");
CREATE INDEX IF NOT EXISTS "model_instances_backend_idx" ON "model_instances" USING btree ("backend");
