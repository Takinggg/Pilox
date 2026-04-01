"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  Suspense,
  type ChangeEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Server,
  Network,
  Users,
  Key,
  Database,
  KeyRound,
  Palette,
  UserPlus,
  Plus,
  Download,
  Upload,
  Eye,
  Trash2,
  ChevronDown,
  ShieldCheck,
  CircleCheck,
  KeyRound as KeyIcon,
  Share2,
  Globe2,
  Store,
  AlertTriangle,
  Brain,
  Shield,
  Wallet,
  SlidersHorizontal,
  RotateCcw,
  Library,
} from "lucide-react";
import type { A2APublicStatusPayload } from "@/lib/a2a/status-types";
import { FederationSettingsPanel } from "./federation-settings-panel";
import { MarketplaceRegistriesPanel } from "@/components/dashboard/marketplace-registries-panel";
import { LlmProvidersPanel } from "@/components/settings/llm-providers-panel";
import { SecurityPolicyPanel } from "@/components/settings/security-policy-panel";
import { SettingsDeploymentNotice } from "@/components/settings/settings-deployment-notice";
import { BillingSettingsPanel } from "@/components/settings/billing-settings-panel";
import { MfaSettingsPanel } from "@/components/settings/mfa-settings-panel";
import { RuntimeInstanceConfigPanel } from "@/components/settings/runtime-instance-config-panel";
import { PublicRegistrySettingsPanel } from "@/components/settings/public-registry-settings-panel";

type SettingsTab =
  | "general"
  | "docker"
  | "network"
  | "users"
  | "secrets"
  | "backups"
  | "api-keys"
  | "a2a"
  | "federation"
  | "marketplace"
  | "llm-providers"
  | "security"
  | "appearance"
  | "billing"
  | "runtime-config"
  | "public-registry";

interface UserEntry {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  avatarUrl?: string;
  lastLoginAt?: string | null;
  deactivatedAt?: string | null;
}

interface SecretEntry {
  id: string;
  name: string;
  createdAt: string;
  agentId?: string;
}

interface BackupEntry {
  id: string;
  createdAt: string;
  size: number;
  type: string;
  status: string;
}

interface BackupSchedulePayload {
  enabled: boolean;
  cron: string;
  retentionDays: number;
}

interface TokenEntry {
  id: string;
  name: string;
  tokenPrefix: string;
  role: string;
  createdAt: string;
  lastUsedAt?: string;
}

type UserRole = "admin" | "operator" | "viewer";
const ROLE_LEVEL: Record<UserRole, number> = { admin: 3, operator: 2, viewer: 1 };

const BACKUP_CRON_PRESETS: { label: string; value: string }[] = [
  { label: "Daily at 02:00", value: "0 2 * * *" },
  { label: "Weekly (Sun 02:00)", value: "0 2 * * 0" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
];

/** Static tab list (order = sidebar). Used for `?tab=` deep links and RBAC filtering. */
const ALL_SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  icon: typeof SettingsIcon;
  minRole: UserRole;
  group: string;
}[] = [
  // Instance
  { key: "general", label: "General", icon: SettingsIcon, minRole: "viewer", group: "Instance" },
  { key: "appearance", label: "Appearance", icon: Palette, minRole: "viewer", group: "Instance" },
  { key: "docker", label: "Docker", icon: Server, minRole: "admin", group: "Instance" },
  { key: "network", label: "Network", icon: Network, minRole: "admin", group: "Instance" },
  { key: "runtime-config", label: "Runtime config", icon: SlidersHorizontal, minRole: "admin", group: "Instance" },
  // Security
  { key: "users", label: "Users & RBAC", icon: Users, minRole: "admin", group: "Security" },
  { key: "secrets", label: "Secrets", icon: Key, minRole: "operator", group: "Security" },
  { key: "api-keys", label: "API Keys", icon: KeyRound, minRole: "operator", group: "Security" },
  { key: "security", label: "Security", icon: Shield, minRole: "admin", group: "Security" },
  { key: "backups", label: "Backups", icon: Database, minRole: "admin", group: "Security" },
  // Integrations
  { key: "llm-providers", label: "LLM Providers", icon: Brain, minRole: "admin", group: "Integrations" },
  { key: "marketplace", label: "Marketplace", icon: Store, minRole: "operator", group: "Integrations" },
  { key: "public-registry", label: "Public registry", icon: Library, minRole: "operator", group: "Integrations" },
  // Mesh & Billing
  { key: "a2a", label: "A2A / mesh", icon: Share2, minRole: "admin", group: "Mesh & Billing" },
  { key: "federation", label: "Federation", icon: Globe2, minRole: "admin", group: "Mesh & Billing" },
  { key: "billing", label: "Billing", icon: Wallet, minRole: "viewer", group: "Mesh & Billing" },
];

type DockerStatusPayload = {
  connected: boolean;
  version?: string;
  apiVersion?: string;
  dockerHost?: string | null;
  defaultSocket?: string;
  error?: string;
};

type NetworkPayload = {
  hostname: string;
  interfaces: Record<string, unknown>;
  dnsServers: string[];
  listeningPorts: unknown[];
};

function SettingsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>("general");
  const [instanceName, setInstanceName] = useState("Pilox");
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [serverTimeZone, setServerTimeZone] = useState<string | null>(null);
  const [instanceBaseline, setInstanceBaseline] = useState("Pilox");
  const [instanceLoading, setInstanceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole>("viewer");
  const clientTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const [dockerStatus, setDockerStatus] = useState<DockerStatusPayload | null>(null);
  const [dockerLoading, setDockerLoading] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkPayload | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);

  // Users
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [showInviteUser, setShowInviteUser] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  // Appearance
  const [accentColor, setAccentColor] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("pilox-accent") ?? "#22C55E";
    return "#22C55E";
  });
  // Secrets
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [newSecretName, setNewSecretName] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [showAddSecret, setShowAddSecret] = useState(false);
  // Backups
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreSkipDb, setRestoreSkipDb] = useState(false);
  const [restoreSkipConfig, setRestoreSkipConfig] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState("0 2 * * *");
  const [scheduleRetention, setScheduleRetention] = useState(30);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  // API Keys
  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [showGenKey, setShowGenKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRole, setNewKeyRole] = useState("viewer");
  const [generatedKey, setGeneratedKey] = useState("");
  const [a2aStatus, setA2aStatus] = useState<A2APublicStatusPayload | null>(
    null
  );
  const [a2aStatusLoading, setA2aStatusLoading] = useState(false);
  /** True after `loadA2aStatus` has been invoked at least once (avoids flash before first effect run). */
  const [a2aBootstrapped, setA2aBootstrapped] = useState(false);
  /** Clock for relative times — updated on interval so render stays pure (no Date.now in render). */
  const [relativeNowMs, setRelativeNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setRelativeNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch current user role from session
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const role = d?.user?.role;
        if (role && role in ROLE_LEVEL) setCurrentRole(role);
      })
      .catch((err) => {
        console.warn("[pilox] settings: session fetch failed", err);
      });
  }, []);

  const loadInstanceSettings = useCallback(() => {
    setInstanceLoading(true);
    fetch("/api/settings/instance")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { instanceName?: string; externalUrl?: string | null; serverTimeZone?: string | null } | null) => {
        if (data?.instanceName) {
          setInstanceName(data.instanceName);
          setInstanceBaseline(data.instanceName);
        }
        setExternalUrl(data?.externalUrl ?? null);
        setServerTimeZone(data?.serverTimeZone ?? null);
      })
      .catch((err) => {
        console.warn("[pilox] settings: instance settings fetch failed", err);
      })
      .finally(() => setInstanceLoading(false));
  }, []);

  useEffect(() => {
    void loadInstanceSettings();
  }, [loadInstanceSettings]);

  const loadDockerStatus = useCallback(() => {
    setDockerLoading(true);
    fetch("/api/settings/docker-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDockerStatus(d && typeof d === "object" ? (d as DockerStatusPayload) : null))
      .catch((err) => {
        console.warn("[pilox] settings: docker status fetch failed", err);
        setDockerStatus(null);
      })
      .finally(() => setDockerLoading(false));
  }, []);

  const loadNetworkInfo = useCallback(() => {
    setNetworkLoading(true);
    fetch("/api/system/network")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNetworkInfo(d && typeof d === "object" ? (d as NetworkPayload) : null))
      .catch((err) => {
        console.warn("[pilox] settings: network info fetch failed", err);
        setNetworkInfo(null);
      })
      .finally(() => setNetworkLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "docker") void loadDockerStatus();
  }, [tab, loadDockerStatus]);

  useEffect(() => {
    if (tab === "network") void loadNetworkInfo();
  }, [tab, loadNetworkInfo]);

  const loadUsers = useCallback(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setUsers(Array.isArray(d.data) ? d.data : []))
      .catch((err) => {
        console.warn("[pilox] settings: users fetch failed", err);
      });
  }, []);

  const loadSecrets = useCallback(() => {
    fetch("/api/secrets")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSecrets(Array.isArray(d) ? d : d.secrets || []))
      .catch((err) => {
        console.warn("[pilox] settings: secrets fetch failed", err);
      });
  }, []);

  const loadBackups = useCallback(() => {
    fetch("/api/backups")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const raw = Array.isArray(d) ? d : d.backups || [];
        setBackups(
          raw.map((b: Record<string, unknown>) => ({
            id: String(b.id),
            createdAt: String(b.createdAt ?? ""),
            size: Number(b.size) || 0,
            status: String(b.status ?? ""),
            type: Array.isArray(b.includes) ? (b.includes as string[]).join(", ") : String(b.type ?? "—"),
          })),
        );
      })
      .catch((err) => {
        console.warn("[pilox] settings: backups fetch failed", err);
      });
  }, []);

  const loadBackupSchedule = useCallback(() => {
    setScheduleLoading(true);
    fetch("/api/backups/schedule")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BackupSchedulePayload | null) => {
        if (d && typeof d === "object") {
          setScheduleEnabled(Boolean(d.enabled));
          setScheduleCron(typeof d.cron === "string" && d.cron ? d.cron : "0 2 * * *");
          const rd = Number(d.retentionDays);
          setScheduleRetention(Number.isFinite(rd) && rd >= 1 ? rd : 30);
        }
      })
      .catch((err) => {
        console.warn("[pilox] settings: backup schedule fetch failed", err);
      })
      .finally(() => setScheduleLoading(false));
  }, []);

  const loadTokens = useCallback(() => {
    fetch("/api/tokens")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTokens(Array.isArray(d) ? d : d.data || []))
      .catch((err) => {
        console.warn("[pilox] settings: tokens fetch failed", err);
      });
  }, []);

  const loadA2aStatus = useCallback(() => {
    setA2aBootstrapped(true);
    setA2aStatusLoading(true);
    fetch("/api/a2a/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setA2aStatus(
          d && typeof d === "object" ? (d as A2APublicStatusPayload) : null
        )
      )
      .catch((err) => {
        console.warn("[pilox] settings: A2A status fetch failed", err);
        setA2aStatus(null);
      })
      .finally(() => setA2aStatusLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "users") loadUsers();
    if (tab === "secrets") loadSecrets();
    if (tab === "backups") {
      loadBackups();
      loadBackupSchedule();
    }
    if (tab === "api-keys") loadTokens();
    if (tab === "a2a" || tab === "federation" || tab === "marketplace") {
      queueMicrotask(() => {
        void loadA2aStatus();
      });
    }
  }, [tab, loadUsers, loadSecrets, loadBackups, loadBackupSchedule, loadTokens, loadA2aStatus]);

  async function saveGeneral() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/instance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName: instanceName.trim() }),
      });
      if (res.ok) {
        toast.success("Display name saved");
        setInstanceBaseline(instanceName.trim());
        void loadInstanceSettings();
      } else if (res.status === 403) {
        toast.error("Only admins can change the display name");
      } else {
        const j = await res.json().catch((err) => {
          console.warn("[pilox] settings: save display name JSON parse failed", err);
          return {};
        });
        toast.error(typeof j.error === "string" ? j.error : "Failed to save");
      }
    } catch (err) {
      console.warn("[pilox] settings: save display name failed", err);
      toast.error("Failed to save settings");
    }
    setSaving(false);
  }

  async function addSecret() {
    if (!newSecretName.trim() || !newSecretValue.trim()) return;
    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSecretName, value: newSecretValue }),
      });
      if (res.ok) {
        toast.success("Secret created");
        setNewSecretName("");
        setNewSecretValue("");
        setShowAddSecret(false);
        loadSecrets();
      } else toast.error("Failed to create secret");
    } catch {
      toast.error("Failed to create secret");
    }
  }

  async function deleteSecret(id: string) {
    try {
      const res = await fetch(`/api/secrets/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Secret deleted");
        loadSecrets();
      } else toast.error("Failed to delete secret");
    } catch {
      toast.error("Failed to delete secret");
    }
  }

  async function createBackup() {
    setCreatingBackup(true);
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includes: ["db"], encrypt: false }),
      });
      if (res.ok) {
        toast.success("Backup started");
        loadBackups();
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error(typeof j.error === "string" ? j.error : "Failed to create backup");
      }
    } catch {
      toast.error("Failed to create backup");
    }
    setCreatingBackup(false);
  }

  async function saveBackupSchedule() {
    setScheduleSaving(true);
    try {
      const res = await fetch("/api/backups/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: scheduleEnabled,
          cron: scheduleCron.trim() || "0 2 * * *",
          retentionDays: scheduleRetention,
        }),
      });
      if (res.ok) {
        toast.success("Backup schedule saved");
        loadBackupSchedule();
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error(typeof j.error === "string" ? j.error : "Failed to save schedule");
      }
    } catch {
      toast.error("Failed to save schedule");
    }
    setScheduleSaving(false);
  }

  async function restoreBackupFromIndex(backupId: string) {
    if (
      !window.confirm(
        "Restore this backup? This overwrites the database (and optionally config) from the archive. Continue?",
      )
    ) {
      return;
    }
    setRestoreBusy(true);
    try {
      const res = await fetch(`/api/backups/${backupId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipDb: restoreSkipDb, skipConfig: restoreSkipConfig }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof out.error === "string" ? out.error : "Restore failed");
        return;
      }
      toast.success(typeof out.message === "string" ? out.message : "Restore completed");
    } catch {
      toast.error("Restore failed");
    }
    setRestoreBusy(false);
  }

  async function onRestoreFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !window.confirm(
        "Restore from this file? This overwrites the database from the archive. Continue?",
      )
    ) {
      return;
    }
    setRestoreBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/backups/upload", { method: "POST", body: fd });
      const uploaded = await up.json().catch(() => ({}));
      if (!up.ok) {
        toast.error(typeof uploaded.error === "string" ? uploaded.error : "Upload failed");
        return;
      }
      const restoreId = typeof uploaded.id === "string" ? uploaded.id : "";
      const rel = typeof uploaded.file === "string" ? uploaded.file : "";
      if (!restoreId || !rel) {
        toast.error("Upload response invalid");
        return;
      }
      const res = await fetch(`/api/backups/${restoreId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: rel,
          skipDb: restoreSkipDb,
          skipConfig: restoreSkipConfig,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof out.error === "string" ? out.error : "Restore failed");
        return;
      }
      toast.success(typeof out.message === "string" ? out.message : "Restore completed");
    } catch {
      toast.error("Restore failed");
    }
    setRestoreBusy(false);
  }

  async function inviteUser() {
    if (!inviteName.trim() || !inviteEmail.trim() || !invitePassword.trim()) return;
    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          password: invitePassword.trim(),
          role: inviteRole,
        }),
      });
      if (res.ok) {
        toast.success(`User ${inviteEmail.trim()} invited`);
        setInviteName("");
        setInviteEmail("");
        setInvitePassword("");
        setInviteRole("viewer");
        setShowInviteUser(false);
        loadUsers();
      } else {
        const j = await res.json().catch((err) => {
          console.warn("[pilox] settings: invite user JSON parse failed", err);
          return {};
        });
        toast.error(typeof j.error === "string" ? j.error : "Failed to invite user");
      }
    } catch (err) {
      console.warn("[pilox] settings: invite user failed", err);
      toast.error("Failed to invite user");
    }
    setInviteSubmitting(false);
  }

  async function downloadBackup(id: string) {
    try {
      const res = await fetch(`/api/backups/${id}/download`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pilox-backup-${id}.tar.gz`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        toast.error("Failed to download backup");
      }
    } catch {
      toast.error("Failed to download backup");
    }
  }

  async function deleteBackup(id: string) {
    try {
      const res = await fetch(`/api/backups/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Backup deleted");
        loadBackups();
      } else toast.error("Failed to delete backup");
    } catch {
      toast.error("Failed to delete backup");
    }
  }

  async function generateApiKey() {
    if (!newKeyName.trim()) return;
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName, role: newKeyRole }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedKey(data.token || data.key || "");
        toast.success("API key generated");
        setNewKeyName("");
        loadTokens();
      } else toast.error("Failed to generate key");
    } catch {
      toast.error("Failed to generate key");
    }
  }

  async function deleteToken(id: string) {
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Token revoked");
        loadTokens();
      } else toast.error("Failed to revoke token");
    } catch {
      toast.error("Failed to revoke token");
    }
  }

  const settingsTabs = ALL_SETTINGS_TABS.filter(
    (t) => ROLE_LEVEL[currentRole] >= ROLE_LEVEL[t.minRole]
  );

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (!raw) return;
    const entry = ALL_SETTINGS_TABS.find((t) => t.key === raw);
    if (!entry) return;
    if (ROLE_LEVEL[currentRole] < ROLE_LEVEL[entry.minRole]) return;
    setTab(entry.key);
  }, [searchParams, currentRole]);

  // Clear sensitive state when switching away from secrets/api-keys tabs
  const handleTabChange = (newTab: SettingsTab) => {
    if (tab === "secrets" && newTab !== "secrets") {
      setNewSecretValue("");
      setNewSecretName("");
    }
    if (tab === "api-keys" && newTab !== "api-keys") {
      setGeneratedKey("");
      setShowGenKey(false);
    }
    setTab(newTab);
    const params = new URLSearchParams(searchParams.toString());
    if (newTab === "general") {
      params.delete("tab");
    } else {
      params.set("tab", newTab);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  function roleBadge(role: string) {
    const colors: Record<string, string> = {
      admin: "bg-destructive/10 text-destructive",
      operator: "bg-[var(--pilox-yellow)]/10 text-[var(--pilox-yellow)]",
      viewer: "bg-[var(--pilox-blue)]/10 text-[var(--pilox-blue)]",
      write: "bg-[var(--pilox-blue)]/10 text-[var(--pilox-blue)]",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${colors[role] || "bg-muted-foreground/10 text-muted-foreground"}`}
      >
        {role}
      </span>
    );
  }

  function initials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function formatSize(bytes: number) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function timeAgo(date: string) {
    const diff = relativeNowMs - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
    return new Date(date).toLocaleDateString();
  }

  return (
    <div className="flex h-full gap-0">
      {/* Settings Sub-nav */}
      <nav aria-label="Settings" className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-border px-3 py-6">
        {(() => {
          let lastGroup = "";
          return settingsTabs.map((t) => {
            const showHeader = t.group !== lastGroup;
            lastGroup = t.group;
            return (
              <div key={t.key}>
                {showHeader && (
                  <div className="mt-4 mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
                    {t.group}
                  </div>
                )}
                <button
                  onClick={() => handleTabChange(t.key)}
                  className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors ${
                    tab === t.key
                      ? "bg-[var(--pilox-elevated)] font-medium text-foreground border-l-[3px] border-foreground"
                      : "text-muted-foreground hover:bg-[var(--pilox-elevated)]/50 hover:text-[var(--pilox-fg-secondary)]"
                  }`}
                  aria-current={tab === t.key ? "page" : undefined}
                >
                  <t.icon className="h-3.5 w-3.5 shrink-0" />
                  {t.label}
                </button>
              </div>
            );
          });
        })()}
      </nav>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex flex-col gap-1 pb-6">
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-[13px] text-muted-foreground">
            Manage your instance configuration
          </p>
        </div>

        {/* ─── General ─── */}
        {tab === "general" && (
          <div className="flex max-w-2xl flex-col gap-8">
            <SettingsDeploymentNotice title="What you can change from this screen">
              <p>
                <strong className="text-sky-50">Display name</strong> is stored in the database (admins only).
                Public URL, auth redirects, and A2A endpoints come from{" "}
                <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">AUTH_URL</code> and related env
                vars — update your deployment config and restart the app to change them.
              </p>
            </SettingsDeploymentNotice>

            <MfaSettingsPanel />

            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">General Settings</h2>
                <p className="text-xs text-muted-foreground">
                  Instance label shown in the UI. URL and locale hints below are informational.
                </p>
              </div>
              {instanceLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Display name</label>
                    <input
                      value={instanceName}
                      onChange={(e) => setInstanceName(e.target.value)}
                      disabled={currentRole !== "admin"}
                      title={currentRole !== "admin" ? "Admins only" : undefined}
                      className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    {currentRole !== "admin" && (
                      <p className="text-[10px] text-muted-foreground">Only administrators can edit this field.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Public URL (AUTH_URL)</label>
                    <input
                      value={externalUrl ?? ""}
                      readOnly aria-readonly="true"
                      placeholder="Not set"
                      className="h-9 cursor-not-allowed rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-muted-foreground outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Your browser timezone</label>
                    <input
                      value={clientTimeZone}
                      readOnly aria-readonly="true"
                      className="h-9 cursor-default rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-[var(--pilox-fg-secondary)] outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Server TZ (env)</label>
                    <input
                      value={serverTimeZone ?? "—"}
                      readOnly aria-readonly="true"
                      className="h-9 cursor-default rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-muted-foreground outline-none"
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">UI language</label>
                    <input
                      value="English (only locale today)"
                      readOnly aria-readonly="true"
                      className="h-9 cursor-not-allowed rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-muted-foreground outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <button
                type="button"
                onClick={() => setInstanceName(instanceBaseline)}
                className="flex h-9 items-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => void saveGeneral()}
                disabled={saving || currentRole !== "admin" || instanceLoading}
                className="flex h-9 items-center rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save display name"}
              </button>
            </div>
          </div>
        )}

        {/* ─── Docker ─── */}
        {tab === "docker" && (
          <div className="flex max-w-2xl flex-col gap-6">
            <SettingsDeploymentNotice title="Docker is configured outside this UI">
              <p>
                The app uses the Docker API via{" "}
                <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">DOCKER_HOST</code> or the default
                Unix socket. Agent CPU/memory defaults come from manifests and deploy flows — not from this page.
              </p>
            </SettingsDeploymentNotice>

            <div>
              <h2 className="text-lg font-semibold text-foreground">Docker</h2>
              <p className="text-[13px] text-muted-foreground">Live status from the server process (admin only).</p>
            </div>

            {dockerLoading && !dockerStatus ? (
              <p className="text-sm text-muted-foreground">Checking Docker…</p>
            ) : dockerStatus ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${dockerStatus.connected ? "bg-primary" : "bg-destructive"}`}
                  />
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium text-foreground">
                      {dockerStatus.connected ? "Docker daemon reachable" : "Docker not reachable"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dockerStatus.connected
                        ? `Engine ${dockerStatus.version ?? "—"} · API ${dockerStatus.apiVersion ?? "—"}`
                        : dockerStatus.error ?? "Check DOCKER_HOST and socket permissions."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadDockerStatus()}
                    disabled={dockerLoading}
                    className="flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
                  >
                    {dockerLoading ? "…" : "Refresh"}
                  </button>
                </div>
                <div className="grid gap-3 rounded-xl border border-border bg-card p-4 text-[13px]">
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">DOCKER_HOST</span>
                    <code className="text-right text-[12px] text-[var(--pilox-fg-secondary)]">
                      {dockerStatus.dockerHost || "(default unix socket)"}
                    </code>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Default socket (reference)</span>
                    <code className="text-right text-[12px] text-[var(--pilox-fg-secondary)]">{dockerStatus.defaultSocket}</code>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Could not load Docker status.</p>
            )}
          </div>
        )}

        {/* ─── Network ─── */}
        {tab === "network" && (
          <div className="flex max-w-2xl flex-col gap-6">
            <SettingsDeploymentNotice title="Host & container networking (observability only)">
              <p>
                Reverse proxies, TLS, and Firecracker bridges are defined in your deployment (Compose, Helm, etc.).
                This tab summarizes what the app can see from the host and Docker — it does not change routing.
              </p>
            </SettingsDeploymentNotice>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Network</h2>
                <p className="text-[13px] text-muted-foreground">Host interfaces, DNS, and published container ports.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadNetworkInfo()}
                disabled={networkLoading}
                className="flex h-9 items-center rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-xs font-medium text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
              >
                {networkLoading ? "…" : "Refresh"}
              </button>
            </div>

            {networkLoading && !networkInfo ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : networkInfo ? (
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-[13px]">
                <div className="flex justify-between gap-4 border-b border-border pb-2">
                  <span className="text-muted-foreground">Hostname</span>
                  <code className="text-foreground">{networkInfo.hostname}</code>
                </div>
                <div className="flex justify-between gap-4 border-b border-border pb-2">
                  <span className="text-muted-foreground">Non-loopback interfaces</span>
                  <span className="text-foreground">{Object.keys(networkInfo.interfaces).length}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-border pb-2">
                  <span className="text-muted-foreground">DNS servers (resolv.conf)</span>
                  <span className="max-w-[60%] text-right text-[var(--pilox-fg-secondary)]">
                    {networkInfo.dnsServers.length ? networkInfo.dnsServers.join(", ") : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Published ports (running containers)</span>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {networkInfo.listeningPorts.length} container(s) with port mappings
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Could not load network summary.</p>
            )}
          </div>
        )}

        {/* ─── Users & RBAC ─── */}
        {tab === "users" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Users & RBAC</h2>
                <p className="text-[13px] text-muted-foreground">Manage team members and role-based access control</p>
              </div>
              <button
                onClick={() => setShowInviteUser(true)}
                className="flex h-9 items-center gap-2 rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                <UserPlus className="h-4 w-4" /> Invite User
              </button>
            </div>

            {/* Invite User form */}
            {showInviteUser && (
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground">Invite New User</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Full name</label>
                    <input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Jane Doe"
                      className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Email</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Password</label>
                    <input
                      type="password"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowInviteUser(false); setInviteName(""); setInviteEmail(""); setInvitePassword(""); }}
                    className="h-8 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-[var(--pilox-elevated)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={inviteUser}
                    disabled={inviteSubmitting || !inviteName.trim() || !inviteEmail.trim() || !invitePassword.trim()}
                    className="h-8 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                  >
                    {inviteSubmitting ? "Inviting..." : "Invite User"}
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center bg-card px-5 py-3 text-[11px] font-semibold tracking-wider text-muted-foreground">
                <span className="flex-1">NAME</span>
                <span className="flex-1">EMAIL</span>
                <span className="w-[100px]">ROLE</span>
                <span className="w-[120px]">LAST LOGIN</span>
                <span className="w-[80px]">STATUS</span>
              </div>
              {users.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No users found</div>
              ) : (
                users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center border-t border-border px-5 py-3.5"
                  >
                    <div className="flex flex-1 items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--pilox-elevated)] text-[10px] font-medium text-foreground">
                        {initials(u.name)}
                      </div>
                      <span className="text-[13px] font-medium text-foreground">{u.name}</span>
                    </div>
                    <span className="flex-1 text-[13px] text-muted-foreground">{u.email}</span>
                    <span className="w-[100px]">{roleBadge(u.role)}</span>
                    <span className="w-[120px] text-[13px] text-muted-foreground">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</span>
                    <span className="w-[80px]">
                      {u.deactivatedAt ? (
                        <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
                          Inactive
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                          Active
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── Secrets ─── */}
        {tab === "secrets" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Secrets Management</h2>
                <div className="flex items-center gap-2 mt-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <p className="text-[13px] text-muted-foreground">AES-256-GCM encrypted</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddSecret(true)}
                className="flex h-9 items-center gap-2 rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                <Plus className="h-4 w-4" /> Add Secret
              </button>
            </div>

            {showAddSecret && (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Name</label>
                    <input
                      value={newSecretName}
                      onChange={(e) => setNewSecretName(e.target.value)}
                      placeholder="OPENAI_API_KEY"
                      className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Value</label>
                    <input
                      type="password"
                      value={newSecretValue}
                      onChange={(e) => setNewSecretValue(e.target.value)}
                      placeholder="sk-..."
                      className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAddSecret(false)}
                    className="h-8 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-[var(--pilox-elevated)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addSecret}
                    className="h-8 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center bg-card px-5 py-3 text-[11px] font-semibold tracking-wider text-muted-foreground">
                <span className="flex-1">NAME</span>
                <span className="w-[140px]">CREATED</span>
                <span className="w-[120px]">USED BY</span>
                <span className="w-[80px]">ACTIONS</span>
              </div>
              {secrets.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No secrets stored</div>
              ) : (
                secrets.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center border-t border-border px-5 py-3.5"
                  >
                    <div className="flex flex-1 items-center gap-2.5">
                      <KeyIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-[13px] font-medium text-foreground">{s.name}</span>
                    </div>
                    <span className="w-[140px] text-[13px] text-muted-foreground">{timeAgo(s.createdAt)}</span>
                    <span className="w-[120px] text-[13px] text-muted-foreground">{s.agentId ? "1 agent" : "—"}</span>
                    <div className="flex w-[80px] gap-2">
                      <button
                        onClick={() => toast.info("Secret values cannot be viewed after creation for security")}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-[var(--pilox-elevated)]"
                      >
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => deleteSecret(s.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-[var(--pilox-elevated)]"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── Backups ─── */}
        {tab === "backups" && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Backup & Restore</h2>
              <p className="text-[13px] text-muted-foreground">Manage database backups and restore points</p>
            </div>

            <input
              ref={restoreFileInputRef}
              type="file"
              accept=".tar.gz,.tgz,application/gzip"
              className="hidden"
              onChange={onRestoreFileChange}
            />

            <div className="flex flex-wrap gap-3">
              <button
                onClick={createBackup}
                disabled={creatingBackup}
                className="flex h-9 items-center gap-2 rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {creatingBackup ? "Creating..." : "Create Backup"}
              </button>
              <button
                type="button"
                disabled={restoreBusy}
                onClick={() => restoreFileInputRef.current?.click()}
                className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
              >
                <Upload className="h-4 w-4" /> {restoreBusy ? "Working…" : "Restore from File"}
              </button>
            </div>

            <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--pilox-fg-secondary)]">
                <input
                  type="checkbox"
                  checked={restoreSkipDb}
                  onChange={(e) => setRestoreSkipDb(e.target.checked)}
                  className="rounded border-[var(--pilox-border-hover)]"
                />
                Skip database restore
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--pilox-fg-secondary)]">
                <input
                  type="checkbox"
                  checked={restoreSkipConfig}
                  onChange={(e) => setRestoreSkipConfig(e.target.checked)}
                  className="rounded border-[var(--pilox-border-hover)]"
                />
                Skip config restore
              </label>
            </div>

            <SettingsDeploymentNotice title="Automated backup schedule (operator reference)">
              <p>
                Pilox stores your desired cron and retention here. Apply the same schedule in your orchestrator
                (Kubernetes CronJob, systemd timer, etc.) to run <code className="text-[var(--pilox-fg-secondary)]">POST /api/backups</code>{" "}
                on that cadence. The UI does not start a background scheduler.
              </p>
            </SettingsDeploymentNotice>

            <div className="flex max-w-xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-foreground">Record schedule in Pilox</span>
                {scheduleLoading ? (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--pilox-fg-secondary)]">
                    <input
                      type="checkbox"
                      checked={scheduleEnabled}
                      onChange={(e) => setScheduleEnabled(e.target.checked)}
                      className="rounded border-[var(--pilox-border-hover)]"
                    />
                    Enabled
                  </label>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium tracking-wider text-muted-foreground">PRESET</label>
                <div className="relative">
                  <select
                    value={BACKUP_CRON_PRESETS.some((p) => p.value === scheduleCron) ? scheduleCron : "__custom__"}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v !== "__custom__") setScheduleCron(v);
                    }}
                    className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 pr-9 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {BACKUP_CRON_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                    <option value="__custom__">Custom cron…</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium tracking-wider text-muted-foreground">CRON EXPRESSION</label>
                <input
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 font-mono text-[13px] text-foreground outline-none focus:border-primary"
                  placeholder="0 2 * * *"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium tracking-wider text-muted-foreground">RETENTION (DAYS)</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={scheduleRetention}
                  onChange={(e) => setScheduleRetention(Number(e.target.value) || 30)}
                  className="h-10 max-w-[140px] rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary"
                />
              </div>
              <button
                type="button"
                disabled={scheduleSaving || scheduleLoading}
                onClick={() => void saveBackupSchedule()}
                className="h-9 w-fit rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
              >
                {scheduleSaving ? "Saving…" : "Save schedule"}
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="px-5 py-4">
                <h3 className="text-base font-semibold text-foreground">Backup History</h3>
              </div>
              <div className="flex items-center border-y border-border px-5 py-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground">
                <span className="w-[180px]">DATE</span>
                <span className="w-[100px]">SIZE</span>
                <span className="w-[100px]">TYPE</span>
                <span className="flex-1">STATUS</span>
                <span className="w-[112px]" />
              </div>
              {backups.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No backups yet</div>
              ) : (
                backups.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center border-b border-border px-5 py-3 last:border-0"
                  >
                    <span className="w-[180px] text-[13px] text-[var(--pilox-fg-secondary)]">
                      {new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="w-[100px] font-mono text-xs text-[var(--pilox-fg-secondary)]">{formatSize(b.size)}</span>
                    <span className="w-[100px] text-[13px] text-[var(--pilox-fg-secondary)]">{b.type}</span>
                    <span className="flex-1">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                        {b.status}
                      </span>
                    </span>
                    <div className="flex w-[112px] shrink-0 gap-1">
                      {b.status === "completed" ? (
                        <button
                          type="button"
                          disabled={restoreBusy}
                          onClick={() => void restoreBackupFromIndex(b.id)}
                          title="Restore this backup"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-[var(--pilox-elevated)] disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ) : (
                        <span className="inline-flex h-7 w-7 items-center justify-center" title="Complete the backup before restore">
                          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => downloadBackup(b.id)}
                        title="Download backup"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-[var(--pilox-elevated)]"
                      >
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBackup(b.id)}
                        title="Delete backup"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-[var(--pilox-elevated)]"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── API Keys ─── */}
        {tab === "billing" && (
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <BillingSettingsPanel />
          </Suspense>
        )}

        {tab === "api-keys" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">API Keys</h2>
                <p className="text-[13px] text-muted-foreground">Manage programmatic access to your Pilox instance</p>
              </div>
              <button
                onClick={() => { setShowGenKey(true); setGeneratedKey(""); }}
                className="flex h-9 items-center gap-2 rounded-lg bg-secondary px-4 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                <Plus className="h-4 w-4" /> Generate Key
              </button>
            </div>

            {showGenKey && (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                {generatedKey ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-foreground">Your API key (shown once):</p>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] p-3">
                      <code className="flex-1 break-all font-mono text-xs text-primary">{generatedKey}</code>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(generatedKey); toast.success("Copied to clipboard"); }}
                      className="self-end h-8 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                    >
                      Copy & Close
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground">Name</label>
                        <input
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          placeholder="Production"
                          className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-muted-foreground">Scope</label>
                        <select
                          value={newKeyRole}
                          onChange={(e) => setNewKeyRole(e.target.value)}
                          className="h-9 rounded-lg border border-border bg-[var(--pilox-surface-lowest)] px-3 text-[13px] text-foreground outline-none focus:border-primary"
                        >
                          <option value="viewer">viewer</option>
                          <option value="operator">operator</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowGenKey(false)}
                        className="h-8 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-[var(--pilox-elevated)]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={generateApiKey}
                        className="h-8 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                      >
                        Generate
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center bg-card px-5 py-3 text-[11px] font-semibold tracking-wider text-muted-foreground">
                <span className="flex-1">NAME</span>
                <span className="flex-1">KEY</span>
                <span className="w-[100px]">SCOPE</span>
                <span className="w-[120px]">CREATED</span>
                <span className="w-[100px]">LAST USED</span>
                <span className="w-[52px]" aria-hidden />
              </div>
              {tokens.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No API keys yet</div>
              ) : (
                tokens.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center border-t border-border px-5 py-3.5"
                  >
                    <div className="flex flex-1 items-center gap-2.5">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[13px] font-medium text-foreground">{t.name}</span>
                    </div>
                    <span className="flex-1 font-mono text-[13px] text-muted-foreground">pilox_...{t.tokenPrefix}</span>
                    <span className="w-[100px]">{roleBadge(t.role)}</span>
                    <span className="w-[120px] text-[13px] text-muted-foreground">{timeAgo(t.createdAt)}</span>
                    <span className="w-[100px] text-[13px] text-muted-foreground">
                      {t.lastUsedAt ? timeAgo(t.lastUsedAt) : "Never"}
                    </span>
                    <div className="flex w-[52px] justify-end">
                      <button
                        type="button"
                        onClick={() => void deleteToken(t.id)}
                        title="Revoke key"
                        className="rounded p-1.5 text-muted-foreground hover:bg-[var(--pilox-elevated)] hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── A2A / mesh ─── */}
        {tab === "a2a" && (
          <div className="flex max-w-2xl flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">A2A / mesh</h2>
              <p className="text-[13px] text-muted-foreground">
                A2A protocol embedded in this instance: public agent card, authenticated JSON-RPC,
                tasks and quotas on Redis. See{" "}
                <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">docs/A2A_INTEGRATION.md</code>.
              </p>
            </div>

            <SettingsDeploymentNotice title="A2A policy is environment-driven">
              <p>
                Every row below reflects live env configuration (
                <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">A2A_*</code>,{" "}
                <code className="rounded bg-[var(--pilox-surface-lowest)] px-1 font-mono text-[11px]">REDIS_URL</code>, etc.). There is
                no in-app editor — change variables and restart the process to apply.
              </p>
            </SettingsDeploymentNotice>

            {!a2aStatus &&
            (a2aStatusLoading || !a2aBootstrapped) ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !a2aStatus ? (
              <p className="text-sm text-muted-foreground">Could not load A2A status.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {!a2aStatus.enabled && (
                  <div className="flex gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-[13px] text-amber-100/90">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                    <p>
                      A2A is disabled on this instance (
                      <code className="rounded bg-[var(--pilox-elevated)] px-1 text-[12px]">
                        A2A_ENABLED=false
                      </code>
                      ). The Agent Card and JSON-RPC endpoints return 404 / 503;
                      this page still shows the configured policy for reference.
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
                <div className="grid gap-3 text-[13px]">
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Mesh V2 contract</span>
                    <code className="text-right text-[12px] text-[var(--pilox-fg-secondary)]">
                      {a2aStatus.meshV2}
                    </code>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Agent card (public)</span>
                    <code className="text-right text-foreground">{a2aStatus.endpoints.agentCardPath}</code>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">JSON-RPC</span>
                    <code className="text-right text-foreground">{a2aStatus.endpoints.jsonRpcPath}</code>
                  </div>
                  {a2aStatus.endpoints.publicJsonRpcPath ? (
                    <div className="flex justify-between gap-4 border-b border-border pb-2">
                      <span className="text-muted-foreground">JSON-RPC (public alias)</span>
                      <code className="text-right text-foreground">
                        {a2aStatus.endpoints.publicJsonRpcPath}
                      </code>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Min. role (JSON-RPC)</span>
                    <span className="text-foreground">{a2aStatus.policy.jsonRpcMinRole}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Task store</span>
                    <span className="text-foreground">
                      {a2aStatus.persistence.taskStore}
                      {a2aStatus.persistence.taskTtlSeconds > 0
                        ? ` · TTL ${Math.round(a2aStatus.persistence.taskTtlSeconds / 86400)}d`
                        : " · no TTL"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">A2A rate limit</span>
                    <span className="text-foreground">
                      {a2aStatus.rateLimit.maxRequests} / {a2aStatus.rateLimit.windowMs / 1000}s (Redis)
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">SDK audit / circuit breaker</span>
                    <span className="text-foreground">
                      {a2aStatus.sdkLayers.auditEnabled ? "audit on" : "audit off"} ·{" "}
                      {a2aStatus.sdkLayers.circuitBreakerEnabled ? "breaker on" : "breaker off"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Public JSON-RPC (allowlist)</span>
                    <span className="text-right text-foreground">
                      {a2aStatus.publicJsonRpc.enabled ? (
                        <>
                          <span className="text-amber-200/90">on</span>
                          {" · "}
                          {a2aStatus.publicJsonRpc.allowedMethods.length} method(s) ·{" "}
                          {a2aStatus.publicJsonRpc.rateLimit.maxRequests}/
                          {a2aStatus.publicJsonRpc.rateLimit.windowMs / 1000}s/IP
                        </>
                      ) : (
                        "off"
                      )}
                    </span>
                  </div>
                  {a2aStatus.publicJsonRpc.identityRateLimit ? (
                    <div className="flex justify-between gap-4 border-b border-border pb-2">
                      <span className="text-muted-foreground">Public JSON-RPC identity RL</span>
                      <span className="text-right text-foreground">
                        <code className="text-[11px] text-[var(--pilox-fg-secondary)]">
                          {a2aStatus.publicJsonRpc.identityRateLimit.headerName}
                        </code>
                        {" · "}
                        {a2aStatus.publicJsonRpc.identityRateLimit.maxRequests}/
                        {a2aStatus.publicJsonRpc.identityRateLimit.windowMs / 1000}s
                        (Redis, hashed value)
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Public JSON-RPC API keys</span>
                    <span className="text-right text-foreground">
                      {a2aStatus.publicJsonRpc.apiKeys.configured ? (
                        <>
                          <span className="text-sky-300/90">on</span>
                          {a2aStatus.publicJsonRpc.apiKeys.required
                            ? " · required"
                            : " · optional"}
                          {a2aStatus.publicJsonRpc.apiKeys.scopesEnabled
                            ? " · per-key scopes"
                            : ""}
                          {a2aStatus.publicJsonRpc.apiKeys.rateLimit
                            ? ` · ${a2aStatus.publicJsonRpc.apiKeys.rateLimit.maxRequests}/${
                                a2aStatus.publicJsonRpc.apiKeys.rateLimit.windowMs / 1000
                              }s/key`
                            : null}
                        </>
                      ) : (
                        "off"
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Public mesh reputation (Redis)</span>
                    <span className="text-foreground">
                      {a2aStatus.publicJsonRpc.reputationTracking ? (
                        <span className="text-emerald-400/90">on</span>
                      ) : (
                        "off"
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Reputation block (bad events ≥ threshold)</span>
                    <span className="text-right text-foreground">
                      {a2aStatus.publicJsonRpc.reputationBlock ? (
                        <span className="text-amber-400/90">
                          on · ≥{a2aStatus.publicJsonRpc.reputationBlock.badEventThreshold} → 429 · Retry-After{" "}
                          {a2aStatus.publicJsonRpc.reputationBlock.retryAfterSeconds}s
                        </span>
                      ) : (
                        "off"
                      )}
                    </span>
                  </div>
                  {a2aStatus.publicMesh.bootstrapMeshDescriptorUrls.length > 0 ? (
                    <div className="flex flex-col gap-2 border-b border-border pb-2">
                      <span className="text-muted-foreground">
                        Public mesh bootstrap (peer descriptors)
                      </span>
                      <div className="flex flex-col gap-1.5 text-right">
                        {a2aStatus.publicMesh.bootstrapMeshDescriptorUrls.map((u) => (
                          <code
                            key={u}
                            className="break-all text-[11px] leading-snug text-[var(--pilox-fg-secondary)]"
                          >
                            {u}
                          </code>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4 border-b border-border pb-2">
                    <span className="text-muted-foreground">Public bucket 429 (shape)</span>
                    <code className="text-right text-[12px] text-foreground">
                      HTTP {a2aStatus.publicJsonRpc.rateLimitedResponse.httpStatus} · JSON-RPC error{" "}
                      {a2aStatus.publicJsonRpc.rateLimitedResponse.jsonRpcErrorCode}
                    </code>
                  </div>
                  <div className="rounded-lg border border-border bg-gradient-to-r from-[var(--pilox-surface-base)] to-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[12px] font-medium text-foreground">
                          Mesh V2 federation
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {a2aStatus.federation.enabled ? (
                            <span className="text-emerald-400/90">On</span>
                          ) : (
                            <span>Off</span>
                          )}{" "}
                          · {a2aStatus.federation.phase}
                          {a2aStatus.federation.configuredPeerCount > 0
                            ? ` · ${a2aStatus.federation.configuredPeerCount} peer(s)`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTabChange("federation")}
                        className="h-9 shrink-0 rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 text-xs font-medium text-violet-200/95 hover:bg-violet-500/15"
                      >
                        Federation settings
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[12px] leading-relaxed text-muted-foreground">{a2aStatus.identity.convention}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Federation (mesh V2.4) ─── */}
        {tab === "federation" && (
          <FederationSettingsPanel
            federation={a2aStatus?.federation ?? null}
            a2aEnabled={a2aStatus?.enabled ?? false}
            statusLoading={a2aStatusLoading}
            onRefreshStatus={loadA2aStatus}
          />
        )}

        {tab === "marketplace" && <MarketplaceRegistriesPanel />}

        {tab === "public-registry" && (
          <PublicRegistrySettingsPanel currentRole={currentRole} />
        )}

        {/* ─── LLM Providers ─── */}
        {tab === "llm-providers" && <LlmProvidersPanel />}

        {tab === "security" && <SecurityPolicyPanel />}
        {tab === "runtime-config" && <RuntimeInstanceConfigPanel />}

        {/* ─── Appearance ─── */}
        {tab === "appearance" && (
          <div className="flex max-w-2xl flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
              <p className="text-[13px] text-muted-foreground">Customize the look and feel of your Pilox instance.</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Theme</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-primary bg-primary/10 p-4">
                  <div className="h-[60px] w-full rounded-md border border-border bg-background" />
                  <span className="text-[13px] font-medium text-foreground">Dark</span>
                  <CircleCheck className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 opacity-50 cursor-not-allowed">
                  <div className="h-[60px] w-full rounded-md border border-border bg-secondary" />
                  <span className="text-[13px] text-muted-foreground">Light</span>
                  <span className="text-[10px] text-muted-foreground">Not in this release</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Accent Color</h3>
              <p className="text-xs text-muted-foreground mb-3">Saved to your browser. Applies to active indicators and highlights.</p>
              <div className="flex gap-3">
                {["#22C55E", "#3B82F6", "#A855F7", "#F97316", "#EF4444"].map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setAccentColor(color);
                      localStorage.setItem("pilox-accent", color);
                      document.documentElement.style.setProperty("--pilox-accent", color);
                      toast.success("Accent color updated");
                    }}
                    className={`h-8 w-8 rounded-full transition-all ${accentColor === color ? "ring-2 ring-white ring-offset-2 ring-offset-background" : "hover:scale-110"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}
