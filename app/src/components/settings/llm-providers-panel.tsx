"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Zap,
  Check,
  X,
  Loader2,
  Brain,
  Server,
  Cloud,
  ExternalLink,
} from "lucide-react";

interface LlmProvider {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  models: unknown[];
  isDefault: boolean;
  enabled: boolean;
  rateLimits: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI", icon: Cloud },
  { value: "anthropic", label: "Anthropic", icon: Brain },
  { value: "azure", label: "Azure OpenAI", icon: Cloud },
  { value: "custom", label: "Custom (OpenAI-compat)", icon: ExternalLink },
  { value: "local", label: "Local (Ollama)", icon: Server },
] as const;

function providerIcon(type: string) {
  const entry = PROVIDER_TYPES.find((p) => p.value === type);
  return entry?.icon ?? Cloud;
}

function providerLabel(type: string) {
  return PROVIDER_TYPES.find((p) => p.value === type)?.label ?? type;
}

export function LlmProvidersPanel() {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add form state
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("openai");
  const [addBaseUrl, setAddBaseUrl] = useState("");
  const [addApiKey, setAddApiKey] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  // Model discovery state
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);

  const loadProviders = useCallback(() => {
    setLoading(true);
    fetch("/api/settings/llm-providers")
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d) => setProviders(Array.isArray(d.providers) ? d.providers : []))
      .catch((err) => {
        console.warn("[pilox] llm-providers: list fetch failed", err);
        setProviders([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  async function addProvider() {
    if (!addName.trim()) return;
    setAddSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: addName.trim(),
        type: addType,
      };
      if (addBaseUrl.trim()) body.baseUrl = addBaseUrl.trim();
      if (addApiKey.trim()) body.apiKey = addApiKey.trim();

      const res = await fetch("/api/settings/llm-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Provider added");
        setAddName("");
        setAddType("openai");
        setAddBaseUrl("");
        setAddApiKey("");
        setShowAdd(false);
        loadProviders();
      } else {
        const j = await res.json().catch((e) => {
          console.warn("[pilox] llm-providers: add JSON parse failed", e);
          return {};
        });
        toast.error(typeof j.error === "string" ? j.error : "Failed to add provider");
      }
    } catch (err) {
      console.warn("[pilox] llm-providers: add request failed", err);
      toast.error("Failed to add provider");
    }
    setAddSubmitting(false);
  }

  async function deleteProvider(id: string) {
    try {
      const res = await fetch(`/api/settings/llm-providers/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Provider deleted");
        loadProviders();
      } else toast.error("Failed to delete provider");
    } catch (err) {
      console.warn("[pilox] llm-providers: delete failed", err);
      toast.error("Failed to delete provider");
    }
  }

  async function toggleEnabled(p: LlmProvider) {
    try {
      const res = await fetch(`/api/settings/llm-providers/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      if (res.ok) {
        loadProviders();
      } else toast.error("Failed to update provider");
    } catch (err) {
      console.warn("[pilox] llm-providers: toggle enabled failed", err);
      toast.error("Failed to update provider");
    }
  }

  async function setDefault(id: string) {
    try {
      const res = await fetch(`/api/settings/llm-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (res.ok) {
        toast.success("Default provider updated");
        loadProviders();
      } else toast.error("Failed to set default");
    } catch (err) {
      console.warn("[pilox] llm-providers: set default failed", err);
      toast.error("Failed to set default");
    }
  }

  function startEdit(p: LlmProvider) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditBaseUrl(p.baseUrl ?? "");
    setEditApiKey("");
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setEditSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: editName.trim() };
      if (editBaseUrl.trim()) body.baseUrl = editBaseUrl.trim();
      if (editApiKey.trim()) body.apiKey = editApiKey.trim();

      const res = await fetch(`/api/settings/llm-providers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Provider updated");
        setEditingId(null);
        loadProviders();
      } else toast.error("Failed to update provider");
    } catch (err) {
      console.warn("[pilox] llm-providers: save edit failed", err);
      toast.error("Failed to update provider");
    }
    setEditSubmitting(false);
  }

  async function testConnection(id: string) {
    setTestingId(id);
    setTestResult((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch(`/api/settings/llm-providers/${id}/test`, { method: "POST" });
      const data = await res.json().catch((e) => {
        console.warn("[pilox] llm-providers: test connection JSON parse failed", e);
        return {};
      });
      setTestResult((prev) => ({
        ...prev,
        [id]: {
          ok: res.ok && data.ok,
          message: data.message ?? data.error ?? (res.ok ? "Connected" : "Failed"),
        },
      }));
    } catch (err) {
      console.warn("[pilox] llm-providers: test connection failed", err);
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: false, message: "Network error" },
      }));
    }
    setTestingId(null);
  }

  async function discoverModels(id: string) {
    setDiscoveringId(id);
    try {
      const res = await fetch(`/api/settings/llm-providers/${id}/models?persist=true`);
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data.models) ? data.models.length : 0;
        toast.success(`Discovered ${count} model(s)`);
        loadProviders();
      } else {
        const data = await res.json().catch((e) => {
          console.warn("[pilox] llm-providers: discover models JSON parse failed", e);
          return {};
        });
        toast.error(data.error ?? "Failed to discover models");
      }
    } catch (err) {
      console.warn("[pilox] llm-providers: discover models failed", err);
      toast.error("Failed to discover models");
    }
    setDiscoveringId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">LLM Providers</h2>
          <p className="text-[13px] text-muted-foreground">
            Configure AI model providers for your agents — OpenAI, Anthropic, Azure, or any OpenAI-compatible endpoint.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex h-9 items-center gap-2 rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          <Plus className="h-4 w-4" /> Add Provider
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">New LLM Provider</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Provider type</label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary"
              >
                {PROVIDER_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Display name</label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="My OpenAI"
                className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
              />
            </div>
            {addType !== "local" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">
                    Base URL{" "}
                    <span className="text-muted-foreground">
                      {addType === "openai" || addType === "anthropic" ? "(optional — uses default)" : ""}
                    </span>
                  </label>
                  <input
                    value={addBaseUrl}
                    onChange={(e) => setAddBaseUrl(e.target.value)}
                    placeholder={
                      addType === "azure"
                        ? "https://your-resource.openai.azure.com"
                        : addType === "custom"
                          ? "https://api.example.com"
                          : ""
                    }
                    className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">API Key</label>
                  <input
                    type="password"
                    value={addApiKey}
                    onChange={(e) => setAddApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                  />
                </div>
              </>
            )}
            {addType === "local" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">
                  Base URL <span className="text-muted-foreground">(defaults to http://localhost:11434)</span>
                </label>
                <input
                  value={addBaseUrl}
                  onChange={(e) => setAddBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAdd(false);
                setAddName("");
                setAddType("openai");
                setAddBaseUrl("");
                setAddApiKey("");
              }}
              className="h-8 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-[var(--pilox-elevated)]"
            >
              Cancel
            </button>
            <button
              onClick={addProvider}
              disabled={addSubmitting || !addName.trim()}
              className="h-8 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              {addSubmitting ? "Adding..." : "Add Provider"}
            </button>
          </div>
        </div>
      )}

      {/* Provider list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading providers...</p>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12">
          <Brain className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No LLM providers configured</p>
          <p className="max-w-sm text-center text-xs text-muted-foreground">
            Add a provider to enable multi-model AI capabilities for your agents.
            Agents without a provider will use the local Ollama instance.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-2 flex h-8 items-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <Plus className="h-3.5 w-3.5" /> Add your first provider
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {providers.map((p) => {
            const Icon = providerIcon(p.type);
            const isEditing = editingId === p.id;
            const test = testResult[p.id];

            return (
              <div
                key={p.id}
                className={`rounded-xl border bg-card p-5 transition-colors ${
                  p.isDefault
                    ? "border-primary/30"
                    : p.enabled
                      ? "border-border"
                      : "border-border opacity-60"
                }`}
              >
                {isEditing ? (
                  /* Edit mode */
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground">Name</label>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground">Base URL</label>
                        <input
                          value={editBaseUrl}
                          onChange={(e) => setEditBaseUrl(e.target.value)}
                          className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground">New API Key (leave blank to keep)</label>
                        <input
                          type="password"
                          value={editApiKey}
                          onChange={(e) => setEditApiKey(e.target.value)}
                          placeholder="unchanged"
                          className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="h-8 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-[var(--pilox-elevated)]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={editSubmitting}
                        className="h-8 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                      >
                        {editSubmitting ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--pilox-surface-lowest)]">
                      <Icon className="h-5 w-5 text-[var(--pilox-fg-secondary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-foreground">{p.name}</span>
                        <span className="rounded-full bg-[var(--pilox-elevated)] px-2 py-0.5 text-[11px] text-muted-foreground">
                          {providerLabel(p.type)}
                        </span>
                        {p.isDefault && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            Default
                          </span>
                        )}
                        {!p.enabled && (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[12px] text-muted-foreground">
                        {p.baseUrl && (
                          <span className="truncate max-w-[300px]">{p.baseUrl}</span>
                        )}
                        <span>
                          {Array.isArray(p.models) ? p.models.length : 0} model(s)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Discover models */}
                      <button
                        onClick={() => discoverModels(p.id)}
                        disabled={discoveringId === p.id}
                        title="Discover available models"
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
                      >
                        {discoveringId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Brain className="h-3.5 w-3.5" />
                        )}
                        Models
                      </button>
                      {/* Test connection */}
                      <button
                        onClick={() => testConnection(p.id)}
                        disabled={testingId === p.id}
                        title="Test connection"
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-[var(--pilox-fg-secondary)] hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
                      >
                        {testingId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                        Test
                      </button>
                      {/* Enable/disable */}
                      <button
                        onClick={() => toggleEnabled(p)}
                        title={p.enabled ? "Disable" : "Enable"}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-[var(--pilox-elevated)] ${
                          p.enabled ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {p.enabled ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </button>
                      {/* Set default */}
                      {!p.isDefault && p.enabled && (
                        <button
                          onClick={() => setDefault(p.id)}
                          title="Set as default"
                          className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[11px] text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-foreground"
                        >
                          Default
                        </button>
                      )}
                      {/* Edit */}
                      <button
                        onClick={() => startEdit(p)}
                        title="Edit"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => deleteProvider(p.id)}
                        title="Delete"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Test result banner */}
                {test && !isEditing && (
                  <div
                    className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                      test.ok
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {test.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    {test.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
