// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum, index, primaryKey, numeric } from "drizzle-orm/pg-core";
import type { AgentConfig } from "@/lib/agent-config-schema";

export const userRoleEnum = pgEnum("user_role", ["admin", "operator", "viewer"]);
export const agentStatusEnum = pgEnum("agent_status", ["created", "running", "ready", "stopped", "paused", "error", "pulling"]);

// ── Instance UI (editable display name; singleton row id = 1) ──
export const instanceUiSettings = pgTable("instance_ui_settings", {
  id: integer("id").primaryKey().notNull(),
  instanceName: varchar("instance_name", { length: 255 }).notNull().default("Pilox"),
  /** Comma-separated extra hosts for egress SSRF allowlist (merged with PILOX_EGRESS_FETCH_HOST_ALLOWLIST). */
  egressHostAllowlistAppend: text("egress_host_allowlist_append").notNull().default(""),
  /** inherit = env + NODE_ENV; force_off / force_on override workflow JS code nodes. */
  workflowCodeNodesMode: varchar("workflow_code_nodes_mode", { length: 16 })
    .notNull()
    .default("inherit"),
  /** Base URL of the global Pilox registry Hub (no trailing slash). */
  publicRegistryHubUrl: text("public_registry_hub_url").notNull().default(""),
  /** Tenant key issued by Hub admin (`POST /v1/admin/instances`); paired with instance Bearer in secrets. */
  publicRegistryTenantKey: text("public_registry_tenant_key").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Admin overrides for selected process.env keys (see `runtime-instance-config.ts`). */
export const instanceRuntimeConfig = pgTable("instance_runtime_config", {
  key: varchar("key", { length: 128 }).primaryKey().notNull(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Users ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("viewer"),
  avatarUrl: text("avatar_url"),
  deactivatedAt: timestamp("deactivated_at"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  /** Incremented on password change or role change; JWT minted before this version is rejected. */
  securityVersion: integer("security_version").notNull().default(0),
  /** Stripe Customer id (`cus_…`) after first Checkout / Customer sync — used to match webhooks without metadata. */
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
  /** MFA TOTP fields */
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaPendingSecret: text("mfa_pending_secret"),
  mfaAttempts: integer("mfa_attempts").notNull().default(0),
  mfaLockoutUntil: timestamp("mfa_lockout_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const instanceRuntimeConfigAudit = pgTable(
  "instance_runtime_config_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configKey: varchar("config_key", { length: 128 }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("instance_runtime_config_audit_created_at_idx").on(t.createdAt)],
);

// ── Agents ─────────────────────────────────────────────
export const inferenceTierEnum = pgEnum("inference_tier", ["low", "medium", "high"]);
export const hypervisorTypeEnum = pgEnum("hypervisor_type", ["firecracker", "cloud-hypervisor", "docker"]);
export const agentSourceTypeEnum = pgEnum("agent_source_type", ["local", "url-import", "marketplace", "registry"]);

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  image: varchar("image", { length: 500 }).notNull(),
  status: agentStatusEnum("status").notNull().default("created"),
  instanceId: varchar("instance_id", { length: 128 }),
  instanceIp: varchar("instance_ip", { length: 45 }),
  port: integer("port"),
  envVars: jsonb("env_vars").$type<Record<string, string>>().default({}),
  config: jsonb("config").$type<AgentConfig>().default({}),
  cpuLimit: varchar("cpu_limit", { length: 20 }).default("1.0"),
  memoryLimit: varchar("memory_limit", { length: 20 }).default("512m"),
  gpuEnabled: boolean("gpu_enabled").default(false),
  hypervisor: hypervisorTypeEnum("hypervisor").notNull().default("firecracker"),
  confidential: boolean("confidential").default(false),
  // Inference optimization fields
  inferenceTier: inferenceTierEnum("inference_tier").default("medium"),
  preferredModel: varchar("preferred_model", { length: 255 }),
  totalTokensIn: integer("total_tokens_in").default(0),
  totalTokensOut: integer("total_tokens_out").default(0),
  lastActiveAt: timestamp("last_active_at"),
  // Budget enforcement
  budgetMaxTokensDay: integer("budget_max_tokens_day"),
  budgetMaxCostMonth: numeric("budget_max_cost_month", { precision: 10, scale: 4 }),
  budgetAlertWebhook: text("budget_alert_webhook"),
  llmProviderId: uuid("llm_provider_id").references(() => llmProviders.id, { onDelete: "set null" }),
  // Workflow graph (for composed agents)
  graph: jsonb("graph").$type<Record<string, unknown>>(),
  agentType: varchar("agent_type", { length: 20 }).notNull().default("simple"),
  /** Visibility: 'private' (local only), 'federation' (federated peers), 'public' (global registry) */
  visibility: varchar("visibility", { length: 20 }).notNull().default("private"),
  // Import / marketplace origin tracking
  sourceType: agentSourceTypeEnum("source_type").default("local"),
  sourceUrl: text("source_url"),
  manifestVersion: varchar("manifest_version", { length: 50 }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  groupId: uuid("group_id").references(() => agentGroups.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("agents_created_by_idx").on(t.createdBy),
  index("agents_group_id_idx").on(t.groupId),
  index("agents_status_idx").on(t.status),
  index("agents_hypervisor_idx").on(t.hypervisor),
  index("agents_source_type_idx").on(t.sourceType),
  index("agents_llm_provider_id_idx").on(t.llmProviderId),
]);

// ── Model Instances (per-model inference VMs/containers) ──
export const modelInstanceBackendEnum = pgEnum("model_instance_backend", ["ollama", "vllm", "aphrodite"]);
export const modelInstanceStatusEnum = pgEnum("model_instance_status", ["creating", "pulling", "running", "stopped", "error"]);

export const modelInstances = pgTable("model_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Model name as known by the backend (e.g. "deepseek-r1:70b", "hugging-quants/Meta-Llama-3.3-70B-Instruct-AWQ-INT4") */
  modelName: varchar("model_name", { length: 512 }).notNull(),
  /** Display name for the UI */
  displayName: varchar("display_name", { length: 255 }).notNull(),
  /** Inference backend engine */
  backend: modelInstanceBackendEnum("backend").notNull(),
  /** Hypervisor running this instance */
  hypervisor: hypervisorTypeEnum("hypervisor").notNull().default("docker"),
  /** VM or container ID from the hypervisor */
  instanceId: varchar("instance_id", { length: 128 }),
  /** IP address or Docker DNS hostname of the running instance */
  instanceIp: varchar("instance_ip", { length: 128 }),
  /** Port the inference engine listens on */
  port: integer("port").default(11434),
  /** Current status */
  status: modelInstanceStatusEnum("status").notNull().default("creating"),
  // ── Optimization settings ──
  quantization: varchar("quantization", { length: 20 }).notNull().default("Q4_K_M"),
  turboQuant: boolean("turbo_quant").default(false),
  speculativeDecoding: boolean("speculative_decoding").default(false),
  speculativeModel: varchar("speculative_model", { length: 255 }),
  cpuOffloadGB: integer("cpu_offload_gb").default(0),
  maxContextLen: integer("max_context_len").default(8192),
  prefixCaching: boolean("prefix_caching").default(false),
  vptq: boolean("vptq").default(false),
  // ── Resource limits ──
  gpuEnabled: boolean("gpu_enabled").default(false),
  cpuLimit: varchar("cpu_limit", { length: 20 }).default("4.0"),
  memoryLimitMB: integer("memory_limit_mb").default(8192),
  // ── Metadata ──
  parameterSize: varchar("parameter_size", { length: 20 }),
  family: varchar("family", { length: 50 }),
  error: text("error"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("model_instances_model_name_idx").on(t.modelName),
  index("model_instances_status_idx").on(t.status),
  index("model_instances_backend_idx").on(t.backend),
]);

// ── Agent Groups ───────────────────────────────────────
export const agentGroups = pgTable("agent_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("agent_groups_created_by_idx").on(t.createdBy),
]);

// ── Models ─────────────────────────────────────────────
export const models = pgTable("models", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 100 }).notNull().default("ollama"),
  size: varchar("size", { length: 50 }),
  quantization: varchar("quantization", { length: 20 }),
  status: varchar("status", { length: 50 }).notNull().default("available"),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("models_name_idx").on(t.name),
  index("models_status_idx").on(t.status),
]);

// ── Audit Logs ─────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 100 }).notNull(),
  resourceId: varchar("resource_id", { length: 255 }),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("audit_logs_user_id_idx").on(t.userId),
  index("audit_logs_action_idx").on(t.action),
  index("audit_logs_created_at_idx").on(t.createdAt),
  index("audit_logs_resource_idx").on(t.resource, t.resourceId),
]);

// ── Billing / wallet (Stripe webhooks) ─────────────────
/** Per-user balance in minor currency units (e.g. cents for USD). */
export const userWalletBalances = pgTable("user_wallet_balances", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  balanceMinor: integer("balance_minor").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Append-only ledger; `stripe_event_id` is globally unique (Stripe `evt_…` or `pilox_usage:{uuid}`) for idempotency.
 * `entry_type`: `credit` | `debit_refund` | `usage_debit` (inference metering).
 */
export const billingLedgerEntries = pgTable(
  "billing_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull().unique(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 128 }),
    stripeRefundId: varchar("stripe_refund_id", { length: 128 }),
    entryType: varchar("entry_type", { length: 24 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("billing_ledger_entries_user_id_idx").on(t.userId),
    index("billing_ledger_entries_pi_idx").on(t.stripePaymentIntentId),
    index("billing_ledger_entries_user_created_idx").on(t.userId, t.createdAt),
  ]
);

// ── Secrets ────────────────────────────────────────────
export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("secrets_agent_id_idx").on(t.agentId),
  index("secrets_created_by_idx").on(t.createdBy),
]);

// ── LLM Providers ────────────────────────────────────
export const llmProviders = pgTable("llm_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  type: varchar("type", { length: 50 }).notNull(),
  baseUrl: text("base_url"),
  /** FK to secrets.id (maintained by SQL migration, not Drizzle — breaks circular ref). */
  apiKeySecretId: uuid("api_key_secret_id"),
  models: jsonb("models").$type<Array<{ id: string; name: string; costPerInputToken?: number; costPerOutputToken?: number }>>().notNull().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  rateLimits: jsonb("rate_limits").$type<Record<string, unknown>>().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("llm_providers_type_idx").on(t.type),
]);

// ── Agent Tools ──────────────────────────────────────
export const agentTools = pgTable("agent_tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  serverUrl: text("server_url"),
  inputSchema: jsonb("input_schema"),
  outputSchema: jsonb("output_schema"),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("agent_tools_agent_id_idx").on(t.agentId),
]);

// ── API Tokens ────────────────────────────────────────
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  /** SHA-256 hash of the token – the plaintext is shown once at creation */
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  /** First 8 chars of the token for identification in UI */
  tokenPrefix: varchar("token_prefix", { length: 8 }).notNull(),
  /** HMAC-SHA256 integrity tag (hex) — prevents tokens injected via direct DB access */
  tokenHmac: varchar("token_hmac", { length: 64 }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: userRoleEnum("role").notNull().default("viewer"),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("api_tokens_user_id_idx").on(t.userId),
]);

// ── Inference Usage ───────────────────────────────────
export const inferenceUsage = pgTable("inference_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }).notNull(),
  model: varchar("model", { length: 255 }).notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  durationMs: integer("duration_ms"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
  providerType: varchar("provider_type", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("inference_usage_agent_id_idx").on(t.agentId),
  index("inference_usage_created_at_idx").on(t.createdAt),
]);

// ── Connected Registries ──────────────────────────────
export const connectedRegistries = pgTable("connected_registries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  authToken: text("auth_token"),
  enabled: boolean("enabled").notNull().default(true),
  recordCount: integer("record_count").default(0),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status", { length: 50 }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("connected_registries_enabled_idx").on(t.enabled),
]);

/** User-saved shortcuts to remote agents (Internet-of-agents bookmarks). */
export const meshAgentPins = pgTable(
  "mesh_agent_pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    registryHandle: varchar("registry_handle", { length: 512 }),
    connectedRegistryId: uuid("connected_registry_id").references(() => connectedRegistries.id, {
      onDelete: "set null",
    }),
    agentCardUrl: text("agent_card_url").notNull(),
    jsonRpcUrl: text("json_rpc_url"),
    meshDescriptorUrl: text("mesh_descriptor_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("mesh_agent_pins_user_id_idx").on(t.userId),
    index("mesh_agent_pins_agent_card_url_idx").on(t.agentCardUrl),
  ],
);

/** Denormalized marketplace catalog rows (V2: large catalogs, worker rebuild). See `MARKETPLACE_CATALOG_SOURCE=db`. */
export const marketplaceCatalogRows = pgTable(
  "marketplace_catalog_rows",
  {
    registryId: uuid("registry_id")
      .references(() => connectedRegistries.id, { onDelete: "cascade" })
      .notNull(),
    handle: varchar("handle", { length: 512 }).notNull(),
    agent: jsonb("agent").notNull().$type<Record<string, unknown>>(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.registryId, t.handle] }),
    index("marketplace_catalog_rows_updated_at_idx").on(t.updatedAt),
  ],
);

/** Deploy counts from this Pilox instance (local reputation signal). */
export const marketplaceAgentLocalStats = pgTable(
  "marketplace_agent_local_stats",
  {
    registryId: uuid("registry_id")
      .references(() => connectedRegistries.id, { onDelete: "cascade" })
      .notNull(),
    handle: varchar("handle", { length: 512 }).notNull(),
    deployCount: integer("deploy_count").notNull().default(0),
    lastDeployedAt: timestamp("last_deployed_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.registryId, t.handle] })],
);

// ── Chat Conversations ────────────────────────────────
export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("chat_conversations_agent_id_idx").on(t.agentId),
  index("chat_conversations_user_id_idx").on(t.userId),
]);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").references(() => chatConversations.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  tokensIn: integer("tokens_in").default(0),
  tokensOut: integer("tokens_out").default(0),
  model: varchar("model", { length: 255 }),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("chat_messages_conversation_id_idx").on(t.conversationId),
  index("chat_messages_created_at_idx").on(t.createdAt),
]);

// ── Workflows ────────────────────────────────────────
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  graph: jsonb("graph").$type<Record<string, unknown>>().notNull().default({}),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("workflows_created_by_idx").on(t.createdBy),
]);

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).notNull().default("running"),
  input: jsonb("input"),
  output: jsonb("output"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("workflow_runs_agent_id_idx").on(t.agentId),
]);

// ── Type exports ───────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserWalletBalance = typeof userWalletBalances.$inferSelect;
export type BillingLedgerEntry = typeof billingLedgerEntries.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentGroup = typeof agentGroups.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Model = typeof models.$inferSelect;
export type Secret = typeof secrets.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type InferenceUsage = typeof inferenceUsage.$inferSelect;
export type ConnectedRegistry = typeof connectedRegistries.$inferSelect;
export type NewConnectedRegistry = typeof connectedRegistries.$inferInsert;
export type MeshAgentPin = typeof meshAgentPins.$inferSelect;
export type NewMeshAgentPin = typeof meshAgentPins.$inferInsert;
export type MarketplaceCatalogRow = typeof marketplaceCatalogRows.$inferSelect;
export type MarketplaceAgentLocalStat = typeof marketplaceAgentLocalStats.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type LlmProvider = typeof llmProviders.$inferSelect;
export type NewLlmProvider = typeof llmProviders.$inferInsert;
export type AgentTool = typeof agentTools.$inferSelect;
export type NewAgentTool = typeof agentTools.$inferInsert;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
