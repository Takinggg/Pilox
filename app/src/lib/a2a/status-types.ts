/**
 * Contract for `GET /api/a2a/status` — safe to import from client components (no server-only deps).
 */
export interface MeshFederationPublicPayload {
  enabled: boolean;
  /** `2.0-config` = peers + probe only; `2.1-transport` = shared secret set (inbound JWT preferred / legacy secret + operator proxy). */
  phase: "2.0-config" | "2.1-transport";
  configuredPeerCount: number;
  peerHostnames: string[];
  /** True when `MESH_FEDERATION_SHARED_SECRET` is set (value never exposed). */
  sharedSecretConfigured: boolean;
  /** Indexed peer list + Agent Card URLs (env-derived, viewer+). `null` when federation off. */
  directoryPath: string | null;
  /** True when `MESH_FEDERATION_INBOUND_ALLOWLIST` is non-empty (inbound federation IP-restricted). */
  federationInboundAllowlistActive: boolean;
  /**
   * Dedicated ingress (same handler as default A2A JSON-RPC) — `null` when federation off.
   * @see `POST /api/a2a/federated/jsonrpc`
   */
  federatedInboundJsonRpcPath: string | null;
  /** WAN-oriented discovery & roster (no secrets). Omitted when federation disabled. */
  wanMesh?: {
    /** Public JSON descriptor for crawlers / operators (Agent Card + federation hints). */
    publicDescriptorPath: string;
    maxPeers: number;
    signedManifestConfigured: boolean;
    staticPeerCount: number;
    manifestPeerCount: number;
    /** null = no manifest URL configured; true/false = last merge had no / had a manifest fetch or verify issue. */
    manifestLastSyncOk: boolean | null;
    /** When `manifestLastSyncOk === false`, coarse category (no raw upstream strings). */
    manifestIssueCategory:
      | "fetch"
      | "verify"
      | "size"
      | "protocol"
      | "unknown"
      | null;
  };
  /** Present when transport is active (federation on + shared secret). */
  jsonRpcProxy:
    | {
        path: string;
        minPiloxRole: "operator";
        /** Short-lived HS256 JWT for inbound peer auth (preferred over raw secret). */
        inboundJwtHeader: "X-Pilox-Federation-JWT";
        /** Raw shared secret header (optional when peers accept JWT-only). */
        inboundSecretHeader: "X-Pilox-Federation-Secret";
        /** Seconds used when minting JWT at the operator proxy. */
        jwtTtlSeconds: number;
        /** Seconds of `exp`/`iat` clock skew allowed when verifying inbound JWT (`MESH_FEDERATION_JWT_CLOCK_SKEW_LEEWAY_SECONDS`). */
        jwtClockSkewLeewaySeconds: number;
        /** Origin string that must appear as JWT `aud` when the proxy mints tokens for this instance (`AUTH_URL` origin or `MESH_FEDERATION_JWT_AUDIENCE`). */
        jwtAudience: string;
        /** When true, inbound JWT must include `aud` matching `jwtAudience`. */
        jwtRequireAudience: boolean;
        /** HS256 (shared secret) or Ed25519 (per-peer keys + local seed for outbound). */
        jwtAlg: "HS256" | "Ed25519";
        /** This instance's Ed25519 public key (hex) for operators to configure on peers; null if not using Ed25519 or seed unset. */
        localEd25519PublicKeyHex: string | null;
        /** When true, proxy calls require `X-Pilox-Federation-Proxy-Operator-Token` matching env. */
        proxyOperatorTokenRequired: boolean;
        /** When false, proxy omits `X-Pilox-Federation-Secret` (JWT-only). */
        proxySendSharedSecret: boolean;
        /** Inbound JWTs must include `jti` (Redis single-use). */
        jwtRequireJti: boolean;
        /** When false, legacy `X-Pilox-Federation-Secret`-only inbound auth is rejected. */
        inboundAllowLegacySecret: boolean;
        /** Redis sliding window applied per client IP (inbound) and per operator id (proxy). */
        rateLimit: { maxRequests: number; windowMs: number };
      }
    | null;
}

/** One row from `GET /api/mesh/federation/status?probe=1` (operator+). */
export interface MeshFederationProbeRow {
  origin: string;
  hostname: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
}

/** One row from `GET /api/mesh/federation/directory` (viewer+). */
export interface MeshFederationDirectoryPeerRow {
  peerIndex: number;
  origin: string;
  hostname: string;
  agentCardUrl: string;
}

export interface MeshFederationDirectoryPayload {
  meshV2: string;
  federationEnabled: boolean;
  peerCount: number;
  peers: MeshFederationDirectoryPeerRow[];
}

/** Operator-only: `GET /api/mesh/federation/status?debug_manifest=1`. */
export interface MeshFederationManifestDebug {
  manifestLastError: string | null;
  effectivePeerCount: number;
}

export interface A2APublicStatusPayload {
  enabled: boolean;
  /** Same string as `GET /.well-known/pilox-mesh.json` and federation status/directory. */
  meshV2: string;
  endpoints: {
    agentCardPath: string;
    jsonRpcPath: string;
    /** Present when `A2A_PUBLIC_JSONRPC_ENABLED` — alias of `jsonRpcPath`, same policy. */
    publicJsonRpcPath?: string;
  };
  policy: {
    jsonRpcMinRole: string;
  };
  persistence: {
    taskStore: string;
    taskTtlSeconds: number;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  sdkLayers: {
    auditEnabled: boolean;
    circuitBreakerEnabled: boolean;
  };
  identity: {
    convention: string;
  };
  /**
   * Opt-in anonymous JSON-RPC (method allowlist + dedicated Redis rate limit).
   * Disabled by default — see `docs/MESH_PUBLIC_A2A.md`.
   */
  publicJsonRpc: {
    enabled: boolean;
    allowedMethods: string[];
    rateLimit: { maxRequests: number; windowMs: number };
    /** When set, a second Redis bucket applies per hashed `identity` header value (IP bucket still applies). */
    identityRateLimit: {
      headerName: string;
      maxRequests: number;
      windowMs: number;
    } | null;
    /** Redis counters `pilox:mesh:pub_rep:*` when enabled. */
    reputationTracking: boolean;
    /**
     * When set, public tier returns HTTP 429 (same JSON-RPC shape as rate limit) if
     * `rate_limited` + `rpc_error` counters for the peer hash reach the threshold.
     */
    reputationBlock: {
      badEventThreshold: number;
      retryAfterSeconds: number;
    } | null;
    /** Operator-configured public API keys (never values); separate Redis bucket `pilox:rl:public_a2a_apikey`. */
    apiKeys: {
      configured: boolean;
      required: boolean;
      /** At least one key uses per-key method scopes (`token|m1,m2`). */
      scopesEnabled: boolean;
      rateLimit: { maxRequests: number; windowMs: number } | null;
    };
    /** When the dedicated public Redis bucket denies the call (see `pilox:rl:public_a2a`). */
    rateLimitedResponse: {
      httpStatus: 429;
      jsonRpcErrorCode: number;
    };
  };
  /**
   * Static bootstrap hints for public mesh (operator URLs to peers' pilox-mesh.json) — not a DHT.
   */
  publicMesh: {
    bootstrapMeshDescriptorUrls: string[];
    /** From `MESH_PUBLIC_DHT_BOOTSTRAP_URLS` — overlay / DHT hints only (empty if unset). */
    dhtBootstrapHints: string[];
  };
  /** Mesh V2 — fédération (phase config ; proxy A2A dans une livraison ultérieure). */
  federation: MeshFederationPublicPayload;
}
