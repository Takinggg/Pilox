"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Hexagon,
  Key,
  User,
  Server,
  Network,
  Settings,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ExternalLink,
} from "lucide-react";

type SetupStep = 1 | 2 | 3 | 4 | 5 | 6;

const steps = [
  { icon: Key, label: "License" },
  { icon: User, label: "Admin Account" },
  { icon: Server, label: "Instance" },
  { icon: Network, label: "Network" },
  { icon: Settings, label: "Configuration" },
  { icon: CheckCircle, label: "Complete" },
];

interface LicenseInfo {
  plan: string;
  features: Record<string, boolean>;
  maxInstances: number;
  expiresAt: string | null;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>(1);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [setupTokenRequired, setSetupTokenRequired] = useState(false);
  const [setupToken, setSetupToken] = useState("");

  // License state
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseValid, setLicenseValid] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);

  // Form state
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [instanceName, setInstanceName] = useState("Pilox");
  const [instanceUrl, setInstanceUrl] = useState("http://localhost:3000");
  const [networkDns, setNetworkDns] = useState("pilox.local");
  const [networkSubnet, setNetworkSubnet] = useState("172.26.0.0/16");
  const [enableGpu, setEnableGpu] = useState(false);
  const [defaultCpu, setDefaultCpu] = useState("1.0");
  const [defaultMemory, setDefaultMemory] = useState("512m");

  // Check if setup already completed
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/setup/status");
        if (res.ok) {
          const data = await res.json();
          if (data.setupComplete) {
            router.replace("/auth/login");
            return;
          }
          if (data.setupTokenRequired) setSetupTokenRequired(true);
        }
      } catch {
        // ignore — show setup form
      }
      setChecking(false);
    })();
  }, [router]);

  async function handleVerifyLicense() {
    setError("");
    if (!licenseKey.trim()) {
      setError("Please enter a license key");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup/verify-license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: licenseKey.trim() }),
      });
      const data = await res.json();

      if (data.isValid) {
        setLicenseValid(true);
        setLicenseInfo({
          plan: data.plan,
          features: data.features,
          maxInstances: data.maxInstances,
          expiresAt: data.expiresAt,
        });
      } else {
        setError(data.error || "Invalid license key");
        setLicenseValid(false);
        setLicenseInfo(null);
      }
    } catch {
      setError("Could not verify license. Check your internet connection.");
    }
    setLoading(false);
  }

  async function handleCreateAdmin() {
    setError("");
    if (adminPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (adminPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (setupTokenRequired && !setupToken.trim()) {
      setError("Setup token is required (set PILOX_SETUP_TOKEN on the server)");
      return;
    }

    setLoading(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (setupToken.trim()) {
        headers.Authorization = `Bearer ${setupToken.trim()}`;
      }

      const res = await fetch("/api/setup", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          licenseKey: licenseKey.trim(),
          licensePlan: licenseInfo,
        }),
      });

      if (res.ok) {
        setStep(3);
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to create admin account");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  async function handleSaveConfig() {
    setLoading(true);
    setError("");

    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName,
          instanceUrl,
          networkDns,
          networkSubnet,
          enableGpu,
          defaultCpu,
          defaultMemory,
        }),
      });
    } catch {
      // Non-critical — config API may not exist yet
    }
    setLoading(false);
    setStep(6);
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="flex w-full max-w-[560px] flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center bg-primary pilox-cta-glow">
            <Hexagon className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h1 className="font-pilox-head text-xl font-semibold text-foreground">
              Set up Pilox
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure your self-hosted AI agent platform
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => {
            const stepNum = (i + 1) as SetupStep;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <div key={s.label} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`h-px w-6 ${isDone ? "bg-primary" : "bg-[var(--pilox-border)]"}`}
                  />
                )}
                <div
                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : isDone
                        ? "bg-primary/10 text-primary"
                        : "bg-[var(--pilox-elevated)] text-muted-foreground"
                  }`}
                >
                  <s.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="border border-border bg-card p-6">
          {error && (
            <div className="mb-4 border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: License Key */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-pilox-head text-base font-semibold text-foreground">
                  License Key
                </h2>
                <p className="text-sm text-muted-foreground">
                  Enter your Pilox license key to activate this instance
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    License Key
                  </label>
                  <input
                    value={licenseKey}
                    onChange={(e) => {
                      setLicenseKey(e.target.value);
                      if (licenseValid) {
                        setLicenseValid(false);
                        setLicenseInfo(null);
                      }
                    }}
                    placeholder="pilox-free-XXXX-XXXX"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring"
                  />
                </div>

                {/* Verified license info */}
                {licenseValid && licenseInfo && (
                  <div className="flex flex-col gap-3 border border-[var(--pilox-green)]/30 bg-[var(--pilox-green)]/5 p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[var(--pilox-green)]" />
                      <span className="text-sm font-medium text-foreground">
                        License verified
                      </span>
                      <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {licenseInfo.plan}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(licenseInfo.features).map(([feature, enabled]) => (
                        <span
                          key={feature}
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            enabled
                              ? "bg-[var(--pilox-green)]/10 text-[var(--pilox-green)]"
                              : "bg-muted text-muted-foreground line-through"
                          }`}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Max instances: {licenseInfo.maxInstances}</span>
                      {licenseInfo.expiresAt && (
                        <span>
                          Expires:{" "}
                          {new Date(licenseInfo.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {!licenseValid && (
                  <button
                    onClick={handleVerifyLicense}
                    disabled={loading || !licenseKey.trim()}
                    className="pilox-btn-motion flex h-10 items-center justify-center gap-2 bg-secondary text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Key className="h-4 w-4" /> Verify License
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {licenseValid && (
                  <button
                    onClick={() => setStep(2)}
                    className="pilox-btn-motion flex h-10 items-center justify-center gap-2 bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                )}

                <p className="text-center text-[11px] text-muted-foreground">
                  Don&apos;t have a license key?{" "}
                  <a
                    href="https://pilox.dev/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Get one here <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Admin Account */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-pilox-head text-base font-semibold text-foreground">
                  Create Admin Account
                </h2>
                <p className="text-sm text-muted-foreground">
                  This will be the first administrator of your Pilox instance
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    Full Name
                  </label>
                  <input
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="John Doe"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">Email</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    Password
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                {setupTokenRequired && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] text-foreground">
                      Setup token
                    </label>
                    <input
                      type="password"
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      placeholder="From server env PILOX_SETUP_TOKEN"
                      autoComplete="off"
                      className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Paste the value configured on the host (never committed to
                      git).
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="pilox-btn-motion flex h-10 flex-1 items-center justify-center gap-2 border border-border text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  onClick={handleCreateAdmin}
                  disabled={
                    loading ||
                    !adminName ||
                    !adminEmail ||
                    !adminPassword ||
                    (setupTokenRequired && !setupToken.trim())
                  }
                  className="pilox-btn-motion flex h-10 flex-1 items-center justify-center gap-2 bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Create Account <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Instance Config */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-pilox-head text-base font-semibold text-foreground">
                  Instance Configuration
                </h2>
                <p className="text-sm text-muted-foreground">
                  Name and URL for your Pilox instance
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    Instance Name
                  </label>
                  <input
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    placeholder="My Pilox"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    Instance URL
                  </label>
                  <input
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                    placeholder="https://pilox.yourcompany.com"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="pilox-btn-motion flex h-10 flex-1 items-center justify-center gap-2 border border-border text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="pilox-btn-motion flex h-10 flex-1 items-center justify-center gap-2 bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Network */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-pilox-head text-base font-semibold text-foreground">
                  Network Configuration
                </h2>
                <p className="text-sm text-muted-foreground">
                  Configure the internal network for agent communication
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    DNS Domain
                  </label>
                  <input
                    value={networkDns}
                    onChange={(e) => setNetworkDns(e.target.value)}
                    placeholder="pilox.local"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    Agent Subnet
                  </label>
                  <input
                    value={networkSubnet}
                    onChange={(e) => setNetworkSubnet(e.target.value)}
                    placeholder="172.26.0.0/16"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="pilox-btn-motion flex h-10 flex-1 items-center justify-center gap-2 border border-border text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="pilox-btn-motion flex h-10 flex-1 items-center justify-center gap-2 bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Defaults */}
          {step === 5 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-pilox-head text-base font-semibold text-foreground">
                  Default Agent Settings
                </h2>
                <p className="text-sm text-muted-foreground">
                  Set the default resource limits for new agents
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    Default CPU Limit
                  </label>
                  <input
                    value={defaultCpu}
                    onChange={(e) => setDefaultCpu(e.target.value)}
                    placeholder="1.0"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] text-foreground">
                    Default Memory Limit
                  </label>
                  <input
                    value={defaultMemory}
                    onChange={(e) => setDefaultMemory(e.target.value)}
                    placeholder="512m"
                    className="h-10 border border-border bg-[var(--pilox-bg-input)] px-3 font-mono text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="flex items-center justify-between border border-border bg-[var(--pilox-bg-input)] px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-[13px] text-foreground">
                      GPU Acceleration
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Enable GPU passthrough for agents
                    </span>
                  </div>
                  <button
                    onClick={() => setEnableGpu(!enableGpu)}
                    className="text-muted-foreground hover:text-[var(--pilox-fg-secondary)]"
                  >
                    {enableGpu ? (
                      <div className="flex h-6 w-11 items-center rounded-full bg-primary px-0.5">
                        <div className="ml-auto h-5 w-5 rounded-full bg-white" />
                      </div>
                    ) : (
                      <div className="flex h-6 w-11 items-center rounded-full bg-[var(--pilox-border)] px-0.5">
                        <div className="h-5 w-5 rounded-full bg-muted-foreground" />
                      </div>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(4)}
                  className="pilox-btn-motion flex h-10 flex-1 items-center justify-center gap-2 border border-border text-[13px] font-medium text-foreground hover:bg-[var(--pilox-elevated)]"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={loading}
                  className="pilox-btn-motion flex h-10 flex-1 items-center justify-center gap-2 bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Complete Setup <CheckCircle className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Complete */}
          {step === 6 && (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <h2 className="font-pilox-head text-lg font-semibold text-foreground">
                  Pilox is ready!
                </h2>
                <p className="text-center text-sm text-muted-foreground">
                  Your instance has been configured. You can now sign in and
                  start deploying agents.
                </p>
              </div>

              <div className="w-full border border-border bg-background p-4">
                <div className="flex flex-col gap-2 text-xs">
                  {[
                    { label: "License", value: licenseInfo?.plan ?? "—" },
                    { label: "Instance", value: instanceName },
                    { label: "URL", value: instanceUrl },
                    { label: "Admin", value: adminEmail },
                    { label: "Network", value: networkSubnet },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between"
                    >
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-mono text-[var(--pilox-fg-secondary)]">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => router.push("/auth/login")}
                className="pilox-btn-motion flex h-10 w-full items-center justify-center gap-2 bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to Login <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
