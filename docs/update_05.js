// ============================================================================
// Hive — 05_Hive_Feature_List.docx Generator
// Generates a comprehensive 30+ page feature list document
// Usage: node update_05.js
// ============================================================================

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  TableOfContents,
  PageNumber,
  Footer,
  Header,
  Tab,
  TabStopType,
  TabStopPosition,
  convertInchesToTwip,
  ImageRun,
  PageOrientation,
  TableLayoutType,
  VerticalAlign,
  ExternalHyperlink,
  NumberFormat,
  LevelFormat,
} = require("docx");
const fs = require("fs");

// ============================================================================
// COLOR PALETTE
// ============================================================================
const COLORS = {
  // Brand
  PRIMARY: "F59E0B",       // Amber/Gold — Hive brand
  PRIMARY_DARK: "D97706",
  PRIMARY_LIGHT: "FEF3C7",
  ACCENT: "8B5CF6",        // Purple — accent
  ACCENT_LIGHT: "EDE9FE",

  // Priority badges
  P0_BG: "FEE2E2", P0_TEXT: "991B1B", P0_BORDER: "EF4444",  // Critical — Red
  P1_BG: "FEF3C7", P1_TEXT: "92400E", P1_BORDER: "F59E0B",  // High — Amber
  P2_BG: "DBEAFE", P2_TEXT: "1E40AF", P2_BORDER: "3B82F6",  // Medium — Blue
  P3_BG: "F3F4F6", P3_TEXT: "374151", P3_BORDER: "9CA3AF",  // Low — Gray

  // Status badges
  DONE_BG: "D1FAE5", DONE_TEXT: "065F46",
  IN_PROGRESS_BG: "DBEAFE", IN_PROGRESS_TEXT: "1E40AF",
  PLANNED_BG: "F3F4F6", PLANNED_TEXT: "374151",

  // Phase badges
  MVP_BG: "D1FAE5", MVP_TEXT: "065F46",
  PHASE2_BG: "FEF3C7", PHASE2_TEXT: "92400E",
  PHASE3_BG: "EDE9FE", PHASE3_TEXT: "5B21B6",

  // Table
  TABLE_HEADER_BG: "1F2937",  // Dark gray
  TABLE_HEADER_TEXT: "FFFFFF",
  TABLE_ROW_EVEN: "F9FAFB",
  TABLE_ROW_ODD: "FFFFFF",
  TABLE_BORDER: "D1D5DB",

  // Misc
  WHITE: "FFFFFF",
  BLACK: "000000",
  DARK_TEXT: "111827",
  BODY_TEXT: "374151",
  MUTED_TEXT: "6B7280",
  LIGHT_BG: "F9FAFB",
  SECTION_BG: "F3F4F6",
  NEW_BADGE_BG: "DBEAFE",
  NEW_BADGE_TEXT: "1E40AF",
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================
const FONTS = {
  HEADING: "Segoe UI",
  BODY: "Segoe UI",
  MONO: "Cascadia Code",
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Create a styled heading paragraph */
function heading(text, level, options = {}) {
  const sizes = {
    [HeadingLevel.HEADING_1]: 36,
    [HeadingLevel.HEADING_2]: 28,
    [HeadingLevel.HEADING_3]: 24,
    [HeadingLevel.HEADING_4]: 20,
  };
  const colors = {
    [HeadingLevel.HEADING_1]: COLORS.PRIMARY_DARK,
    [HeadingLevel.HEADING_2]: COLORS.DARK_TEXT,
    [HeadingLevel.HEADING_3]: COLORS.DARK_TEXT,
    [HeadingLevel.HEADING_4]: COLORS.BODY_TEXT,
  };

  const runs = [];
  if (options.newBadge) {
    runs.push(
      new TextRun({
        text: " NEW ",
        font: FONTS.HEADING,
        size: sizes[level] - 4,
        bold: true,
        color: COLORS.NEW_BADGE_TEXT,
        shading: { type: ShadingType.CLEAR, fill: COLORS.NEW_BADGE_BG, color: COLORS.NEW_BADGE_BG },
      }),
      new TextRun({ text: "  ", font: FONTS.HEADING, size: sizes[level] })
    );
  }
  runs.push(
    new TextRun({
      text: text,
      font: FONTS.HEADING,
      size: sizes[level] * 2, // half-points
      bold: true,
      color: colors[level],
    })
  );

  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 240, after: 120 },
    children: runs,
    ...(options.pageBreakBefore ? { pageBreakBefore: true } : {}),
    ...(options.border ? {
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.PRIMARY },
      },
    } : {}),
  });
}

/** Create body text paragraph */
function bodyText(text, options = {}) {
  return new Paragraph({
    spacing: { after: options.spacingAfter || 120, before: options.spacingBefore || 0, line: 276 },
    alignment: options.alignment || AlignmentType.LEFT,
    indent: options.indent ? { left: convertInchesToTwip(options.indent) } : undefined,
    children: [
      new TextRun({
        text: text,
        font: FONTS.BODY,
        size: 22,
        color: options.color || COLORS.BODY_TEXT,
        bold: options.bold || false,
        italics: options.italics || false,
      }),
    ],
  });
}

/** Create a bullet point */
function bullet(text, options = {}) {
  const children = [];
  if (options.bold_prefix) {
    children.push(
      new TextRun({
        text: options.bold_prefix,
        font: FONTS.BODY,
        size: 22,
        color: COLORS.DARK_TEXT,
        bold: true,
      })
    );
  }
  children.push(
    new TextRun({
      text: options.bold_prefix ? text : text,
      font: FONTS.BODY,
      size: 22,
      color: COLORS.BODY_TEXT,
    })
  );

  return new Paragraph({
    spacing: { after: 60, line: 276 },
    bullet: { level: options.level || 0 },
    children: children,
  });
}

/** Create a styled table cell */
function cell(text, options = {}) {
  const children = [];

  if (options.badge) {
    const badgeColors = {
      P0: { bg: COLORS.P0_BG, text: COLORS.P0_TEXT },
      P1: { bg: COLORS.P1_BG, text: COLORS.P1_TEXT },
      P2: { bg: COLORS.P2_BG, text: COLORS.P2_TEXT },
      P3: { bg: COLORS.P3_BG, text: COLORS.P3_TEXT },
      Done: { bg: COLORS.DONE_BG, text: COLORS.DONE_TEXT },
      "In Progress": { bg: COLORS.IN_PROGRESS_BG, text: COLORS.IN_PROGRESS_TEXT },
      Planned: { bg: COLORS.PLANNED_BG, text: COLORS.PLANNED_TEXT },
      MVP: { bg: COLORS.MVP_BG, text: COLORS.MVP_TEXT },
      "Phase 2": { bg: COLORS.PHASE2_BG, text: COLORS.PHASE2_TEXT },
      "Phase 3": { bg: COLORS.PHASE3_BG, text: COLORS.PHASE3_TEXT },
    };
    const bc = badgeColors[text] || { bg: COLORS.LIGHT_BG, text: COLORS.BODY_TEXT };
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 20, after: 20 },
        children: [
          new TextRun({
            text: ` ${text} `,
            font: FONTS.BODY,
            size: 18,
            bold: true,
            color: bc.text,
            shading: { type: ShadingType.CLEAR, fill: bc.bg, color: bc.bg },
          }),
        ],
      })
    );
  } else {
    const paragraphs = String(text).split("\n");
    for (const pText of paragraphs) {
      children.push(
        new Paragraph({
          spacing: { before: 20, after: 20 },
          alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [
            new TextRun({
              text: pText,
              font: options.mono ? FONTS.MONO : FONTS.BODY,
              size: options.headerCell ? 20 : (options.small ? 18 : 20),
              bold: options.bold || options.headerCell || false,
              color: options.headerCell ? COLORS.TABLE_HEADER_TEXT : (options.color || COLORS.BODY_TEXT),
              italics: options.italics || false,
            }),
          ],
        })
      );
    }
  }

  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.headerCell
      ? { type: ShadingType.CLEAR, fill: COLORS.TABLE_HEADER_BG, color: COLORS.TABLE_HEADER_BG }
      : options.shading
        ? { type: ShadingType.CLEAR, fill: options.shading, color: options.shading }
        : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: {
      top: convertInchesToTwip(0.04),
      bottom: convertInchesToTwip(0.04),
      left: convertInchesToTwip(0.08),
      right: convertInchesToTwip(0.08),
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.TABLE_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.TABLE_BORDER },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.TABLE_BORDER },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.TABLE_BORDER },
    },
    children: children,
  });
}

/** Create table header row */
function headerRow(headers, widths) {
  return new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      cell(h, { headerCell: true, center: true, width: widths ? widths[i] : undefined })
    ),
  });
}

/** Create a feature data row */
function featureRow(feature, index) {
  const bgColor = index % 2 === 0 ? COLORS.TABLE_ROW_EVEN : COLORS.TABLE_ROW_ODD;
  return new TableRow({
    children: [
      cell(feature.id, { center: true, mono: true, small: true, shading: bgColor, width: 7 }),
      cell(feature.name, { bold: true, shading: bgColor, width: 22 }),
      cell(feature.description, { shading: bgColor, width: 31 }),
      cell(feature.priority, { badge: true, shading: bgColor, width: 8 }),
      cell(feature.phase, { badge: true, shading: bgColor, width: 10 }),
      cell(feature.status, { badge: true, shading: bgColor, width: 12 }),
      cell(feature.notes || "—", { small: true, italics: !feature.notes, shading: bgColor, width: 10 }),
    ],
  });
}

/** Create a standard feature table */
function featureTable(features) {
  const widths = [7, 22, 31, 8, 10, 12, 10];
  const rows = [
    headerRow(["ID", "Feature", "Description", "Priority", "Phase", "Status", "Notes"], widths),
    ...features.map((f, i) => featureRow(f, i)),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows,
  });
}

/** Create a callout / info box */
function calloutBox(title, text, color = COLORS.PRIMARY) {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 12, color: color },
    },
    indent: { left: convertInchesToTwip(0.15) },
    shading: { type: ShadingType.CLEAR, fill: COLORS.LIGHT_BG, color: COLORS.LIGHT_BG },
    children: [
      new TextRun({
        text: title + "  ",
        font: FONTS.HEADING,
        size: 22,
        bold: true,
        color: color,
      }),
      new TextRun({
        text: text,
        font: FONTS.BODY,
        size: 20,
        color: COLORS.BODY_TEXT,
      }),
    ],
  });
}

/** Spacer paragraph */
function spacer(height = 120) {
  return new Paragraph({ spacing: { before: height, after: 0 }, children: [] });
}

/** Key-value pair as inline paragraph */
function kvPair(key, value) {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: convertInchesToTwip(0.25) },
    children: [
      new TextRun({ text: key + ": ", font: FONTS.BODY, size: 22, bold: true, color: COLORS.DARK_TEXT }),
      new TextRun({ text: value, font: FONTS.BODY, size: 22, color: COLORS.BODY_TEXT }),
    ],
  });
}

/** Section intro paragraph */
function sectionIntro(text) {
  return new Paragraph({
    spacing: { before: 80, after: 160, line: 276 },
    children: [
      new TextRun({
        text: text,
        font: FONTS.BODY,
        size: 22,
        color: COLORS.BODY_TEXT,
        italics: true,
      }),
    ],
  });
}

/** Comparison table (2-column or multi-column) */
function comparisonTable(headers, rows) {
  const w = Math.floor(100 / headers.length);
  const widths = headers.map(() => w);
  const tRows = [
    headerRow(headers, widths),
    ...rows.map((row, idx) => {
      const bgColor = idx % 2 === 0 ? COLORS.TABLE_ROW_EVEN : COLORS.TABLE_ROW_ODD;
      return new TableRow({
        children: row.map((cellText, ci) =>
          cell(cellText, {
            shading: bgColor,
            width: widths[ci],
            bold: ci === 0,
          })
        ),
      });
    }),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tRows,
  });
}

// ============================================================================
// FEATURE DATA — All features organized by category
// ============================================================================

let featureCounter = 0;
function fid(prefix) {
  featureCounter++;
  return `${prefix}-${String(featureCounter).padStart(3, "0")}`;
}

// --- CORE PLATFORM ---
const corePlatformFeatures = [
  { id: fid("COR"), name: "Real-Time Dashboard", description: "Central dashboard displaying real-time metrics including active agents, resource utilization, system health indicators, and recent activity feed. Auto-refreshes via WebSocket connections.", priority: "P0", phase: "MVP", status: "Done", notes: "WebSocket-based" },
  { id: fid("COR"), name: "Stat Cards", description: "Overview cards showing total agents, running agents, stopped agents, CPU usage, memory usage, GPU usage (if available), and alerts count at a glance.", priority: "P0", phase: "MVP", status: "Done", notes: "" },
  { id: fid("COR"), name: "System Health Indicator", description: "Traffic-light style system health monitor aggregating host-level metrics, Docker daemon status, database connectivity, and agent error rates into a single health score.", priority: "P1", phase: "MVP", status: "Done", notes: "" },
  { id: fid("COR"), name: "Agent CRUD Operations", description: "Full create, read, update, and delete operations for AI agents. Create agents from templates, Docker images, or custom configurations. Edit agent settings post-creation.", priority: "P0", phase: "MVP", status: "Done", notes: "REST API + UI" },
  { id: fid("COR"), name: "Agent Lifecycle Management", description: "Control agent state transitions: Start, Stop, Restart, Pause, and Resume. State machine ensures valid transitions only. Graceful shutdown with configurable timeout.", priority: "P0", phase: "MVP", status: "Done", notes: "State machine pattern" },
  { id: fid("COR"), name: "Agent Grouping & Organization", description: "Organize agents into logical groups, projects, or folders. Apply bulk actions to groups. Filter and search agents by group, status, runtime, or tags.", priority: "P1", phase: "MVP", status: "Done", notes: "Tag-based + folders" },
  { id: fid("COR"), name: "Real-Time Log Streaming", description: "Live log output from agent containers streamed to the UI via WebSockets. Support for log levels (info, warn, error, debug), search within logs, and log download.", priority: "P0", phase: "MVP", status: "Done", notes: "WebSocket streaming" },
  { id: fid("COR"), name: "Embedded Terminal", description: "Full interactive terminal (xterm.js) providing shell access into running agent containers. Supports resize, copy/paste, and multiple concurrent sessions. Direct container exec via Docker API.", priority: "P0", phase: "MVP", status: "Done", notes: "xterm.js + Docker exec" },
  { id: fid("COR"), name: "Role-Based Access Control", description: "Three-tier RBAC system: Admin (full access), Operator (manage agents, no system settings), Viewer (read-only). Enforced at API and UI levels with permission matrix.", priority: "P0", phase: "MVP", status: "Done", notes: "3 roles" },
  { id: fid("COR"), name: "Audit Logging", description: "Comprehensive audit trail recording all user actions: agent operations, setting changes, authentication events, and API calls. Includes timestamp, user, action, target, and IP address.", priority: "P1", phase: "MVP", status: "Done", notes: "All actions logged" },
  { id: fid("COR"), name: "Settings Management", description: "Centralized settings panel for instance configuration, Docker daemon settings, network configuration, resource limits, and notification preferences. Changes validated before applying.", priority: "P1", phase: "MVP", status: "Done", notes: "Instance + Docker + Network" },
  { id: fid("COR"), name: "Secrets Management", description: "Encrypted key-value store for sensitive data (API keys, tokens, credentials). Secrets injected into agent containers as environment variables. Encryption at rest with AES-256.", priority: "P1", phase: "MVP", status: "Done", notes: "AES-256 encryption" },
];

// --- AUTHENTICATION & SECURITY ---
const authFeatures = [
  { id: fid("AUT"), name: "Email/Password Authentication", description: "Standard email and password authentication using NextAuth v5. Includes form validation, secure password hashing with bcrypt, and configurable password complexity requirements.", priority: "P0", phase: "MVP", status: "Done", notes: "NextAuth v5 + bcrypt" },
  { id: fid("AUT"), name: "JWT Session Management", description: "Stateless JWT-based sessions with configurable expiration. Access tokens for API calls and refresh tokens for session renewal. Tokens stored in secure HTTP-only cookies.", priority: "P0", phase: "MVP", status: "Done", notes: "HTTP-only cookies" },
  { id: fid("AUT"), name: "User Registration", description: "Self-service user registration with email validation, password strength meter, and optional admin approval workflow. First user automatically becomes admin.", priority: "P0", phase: "MVP", status: "Done", notes: "First user = Admin" },
  { id: fid("AUT"), name: "Password Reset Flow", description: "Secure password reset via email with time-limited tokens (1 hour expiry). Rate-limited to prevent abuse. Invalidates all existing sessions on password change.", priority: "P1", phase: "MVP", status: "Done", notes: "1-hour token expiry" },
  { id: fid("AUT"), name: "Session Management", description: "View active sessions with device info, IP address, and last activity. Revoke individual sessions or all sessions. Admin can view and revoke any user's sessions.", priority: "P1", phase: "MVP", status: "Done", notes: "View + revoke" },
  { id: fid("AUT"), name: "Login Attempt Throttling", description: "Progressive rate limiting on failed login attempts. After 5 failures: 1-minute lockout. After 10: 15-minute lockout. After 20: account locked pending admin reset. IP-based and account-based.", priority: "P1", phase: "MVP", status: "Done", notes: "Progressive lockout" },
  { id: fid("AUT"), name: "RBAC Permission Matrix", description: "Granular permission matrix mapping 3 roles (Admin, Operator, Viewer) to specific actions across all resources. Permissions checked at middleware level for every API request.", priority: "P0", phase: "MVP", status: "Done", notes: "Middleware enforcement" },
  { id: fid("AUT"), name: "API Key Management", description: "Generate, rotate, and revoke API keys with configurable scopes (read, write, admin). Keys support expiration dates, usage tracking, and IP allowlisting.", priority: "P1", phase: "MVP", status: "Done", notes: "Scoped + expiring" },
  { id: fid("AUT"), name: "Container Security Monitoring", description: "Monitor container security posture: privileged mode detection, exposed ports audit, volume mount review, capability analysis, and seccomp profile validation.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Security scanner" },
];

// --- MULTI-RUNTIME ARCHITECTURE (NEW) ---
const runtimeFeatures = [
  { id: fid("RUN"), name: "Docker Runtime (Default)", description: "Standard Docker containerization as the default and primary runtime. Full Docker API integration for container lifecycle, networking, volume management, and image operations.", priority: "P0", phase: "MVP", status: "Done", notes: "Default runtime" },
  { id: fid("RUN"), name: "NVIDIA Container Toolkit", description: "GPU passthrough to Docker containers via NVIDIA Container Toolkit. Auto-detection of available GPUs, driver version validation, and CUDA compatibility checking.", priority: "P0", phase: "MVP", status: "Done", notes: "GPU passthrough" },
  { id: fid("RUN"), name: "Docker Compose Support", description: "Deploy multi-container agents using Docker Compose definitions. Support for service dependencies, shared networks, and volume declarations within a single agent deployment.", priority: "P1", phase: "MVP", status: "In Progress", notes: "Multi-container agents" },
  { id: fid("RUN"), name: "Volume Management", description: "Create, mount, and manage persistent volumes for agent data. Named volumes, bind mounts, and tmpfs support. Volume browser in UI for inspecting stored data.", priority: "P1", phase: "MVP", status: "Done", notes: "" },
  { id: fid("RUN"), name: "Network Configuration", description: "Agent network configuration: bridge, host, and overlay networks. Custom DNS settings, port mapping, and inter-agent network isolation. Network policies for security.", priority: "P1", phase: "MVP", status: "Done", notes: "" },
  { id: fid("RUN"), name: "Image Registry Integration", description: "Pull images from Docker Hub, GHCR, ECR, and custom private registries. Registry credential management, image search, tag browsing, and pull progress tracking.", priority: "P1", phase: "MVP", status: "Done", notes: "Hub + custom registries" },
  { id: fid("RUN"), name: "Firecracker MicroVM Runtime", description: "Lightweight microVM runtime using Firecracker for hardware-level isolation via KVM. Approximately 125ms boot time and ~5MB memory overhead per VM. Ideal for running untrusted agent code with strong security guarantees.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "KVM-based isolation" },
  { id: fid("RUN"), name: "Firecracker CPU-Only Workloads", description: "Firecracker VMs optimized for CPU-bound AI workloads. GPU access provided via the GPU Sidecar architecture through vsock communication rather than direct passthrough.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "GPU via Sidecar" },
  { id: fid("RUN"), name: "Firecracker vsock Communication", description: "High-performance host-guest communication via vsock (Virtual Socket). Approximately 2 microsecond latency for inference API calls from Firecracker VMs to host GPU Sidecar services.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "~2\u00B5s latency" },
  { id: fid("RUN"), name: "Kata Containers Runtime", description: "OCI-compatible container runtime with VM-level isolation. Standard container images run in lightweight VMs. GPU support via VFIO passthrough for workloads requiring both isolation and GPU access.", priority: "P2", phase: "Phase 3", status: "Planned", notes: "OCI + VM isolation" },
  { id: fid("RUN"), name: "gVisor Runtime", description: "Application kernel providing medium isolation. Intercepts system calls at the application level without full VM overhead. Suitable for semi-trusted workloads requiring better performance than VMs.", priority: "P2", phase: "Phase 3", status: "Planned", notes: "Application kernel" },
  { id: fid("RUN"), name: "Runtime Abstraction Layer", description: "Common interface abstracting all runtime backends (Docker, Firecracker, Kata, gVisor). Unified API for container/VM lifecycle, networking, storage, and monitoring regardless of underlying runtime.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "Common interface" },
  { id: fid("RUN"), name: "Runtime Comparison UI", description: "Side-by-side comparison matrix in settings showing capabilities, performance characteristics, isolation level, GPU support, and resource overhead for each available runtime.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Settings page" },
  { id: fid("RUN"), name: "Runtime Auto-Detection", description: "Automatic detection of available runtimes on the host system. Checks for Docker daemon, KVM support (for Firecracker), Kata installation, and gVisor availability. Surfaces capabilities in the deployment wizard.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Auto-detect Docker, KVM" },
];

// --- GPU SIDECAR ARCHITECTURE (NEW) ---
const gpuSidecarFeatures = [
  { id: fid("GPU"), name: "Decoupled GPU Architecture", description: "Separates GPU inference workloads from agent execution. Agents communicate with a shared GPU inference service rather than requiring direct GPU access, enabling efficient GPU mutualization across dozens of agents.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "Core architecture" },
  { id: fid("GPU"), name: "Shared Inference Service", description: "Centralized inference service supporting multiple backends: vLLM, Text Generation Inference (TGI), Ollama, NVIDIA Triton, and llama.cpp. Configurable per-model backend selection.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "vLLM, TGI, Ollama, Triton, llama.cpp" },
  { id: fid("GPU"), name: "OpenAI-Compatible API", description: "All agents access inference through an OpenAI-compatible API endpoint. Supports /v1/chat/completions, /v1/completions, /v1/embeddings, and /v1/models endpoints. Drop-in replacement for OpenAI SDK.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "Drop-in OpenAI replacement" },
  { id: fid("GPU"), name: "Inference Router", description: "Intelligent request routing from agents to inference backends. Load balancing across multiple model instances with support for round-robin, least-connections, and latency-aware routing strategies.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Load balancing" },
  { id: fid("GPU"), name: "Request Queue & Priority System", description: "Request queuing with 10 priority levels (1=lowest, 10=highest). Priority-based scheduling ensures critical agents get inference results first. Queue depth monitoring and overflow protection.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "10 priority levels" },
  { id: fid("GPU"), name: "Per-Agent Rate Limiting", description: "Configurable rate limits per agent for inference requests. Supports requests-per-second, requests-per-minute, and tokens-per-minute limits. Burst allowance and graceful throttling.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "RPM + TPM limits" },
  { id: fid("GPU"), name: "Model Lifecycle Management", description: "Full model lifecycle: Pull (download from registry) \u2192 Ready (on disk) \u2192 Loaded (in VRAM) \u2192 Idle (loaded but inactive) \u2192 Unloaded (VRAM freed). Automatic idle unloading with configurable timeouts.", priority: "P0", phase: "Phase 2", status: "Planned", notes: "5-state lifecycle" },
  { id: fid("GPU"), name: "VRAM Budget Management", description: "Track and manage VRAM allocation across all loaded models. VRAM budget per GPU, reservation system for critical models, and automatic eviction of low-priority models when VRAM pressure is high.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Budget + eviction" },
  { id: fid("GPU"), name: "Continuous Batching", description: "Batch multiple inference requests for the same model into a single GPU operation. Achieves 3-5x throughput improvement over sequential processing. Dynamic batch sizing based on request rate.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "3-5x throughput gain" },
  { id: fid("GPU"), name: "PagedAttention", description: "Efficient VRAM management using PagedAttention (vLLM). Eliminates memory fragmentation by managing KV-cache in fixed-size pages, enabling up to 24x higher throughput for long sequences.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Via vLLM" },
  { id: fid("GPU"), name: "Prefix Caching", description: "Cache and reuse KV-cache for shared system prompts across agents. When multiple agents use the same system prompt, compute it once and share, reducing latency and VRAM usage.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Shared system prompts" },
  { id: fid("GPU"), name: "Multi-GPU Strategies", description: "Support for tensor parallelism (split model across GPUs), pipeline parallelism (split layers), and model replication (same model on multiple GPUs). Auto-selection based on model size and GPU topology.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Tensor/Pipeline/Replication" },
  { id: fid("GPU"), name: "GPU Monitoring Dashboard", description: "Real-time GPU metrics: VRAM usage per model, GPU utilization percentage, temperature, power draw (watts), fan speed, and clock frequencies. Historical charts and alerting thresholds.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "NVML integration" },
  { id: fid("GPU"), name: "Quantization Support", description: "Support for multiple quantization formats to reduce model VRAM requirements: GGUF (llama.cpp), GPTQ, AWQ, Q4_K_M, Q5_K_M, Q8, and FP16. Quantization comparison showing quality vs. VRAM tradeoffs.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "GGUF, GPTQ, AWQ, etc." },
  { id: fid("GPU"), name: "vsock Proxy for Firecracker", description: "Proxy service enabling Firecracker microVMs to access the GPU Sidecar inference API via vsock. Approximately 2 microsecond latency overhead. Transparent to agents using the OpenAI-compatible API.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Firecracker-specific" },
  { id: fid("GPU"), name: "GPU Access Modes", description: "Three GPU access modes per agent: Shared (via API, multiple agents share GPU), Dedicated (GPU passthrough for exclusive access), and None (CPU-only agent). Configurable in deployment wizard.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Shared / Dedicated / None" },
];

// --- AGENT DEPLOYMENT WIZARD (NEW) ---
const wizardFeatures = [
  { id: fid("WIZ"), name: "9-Step Deployment Wizard", description: "Comprehensive guided wizard for deploying new AI agents. Nine sequential steps covering runtime, template, resources, model, I/O, relationships, config, and review. Progress indicator and step validation.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "9 steps" },
  { id: fid("WIZ"), name: "Step 1: Runtime Selection", description: "Choose the execution runtime for the agent: Docker (default), Firecracker MicroVM, Kata Containers, or gVisor. Interactive comparison matrix showing isolation level, boot time, GPU support, and resource overhead.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "Runtime comparison matrix" },
  { id: fid("WIZ"), name: "Step 2: Agent Template", description: "Select from pre-built agent templates: LLM Chat Bot, Code Assistant, RAG Pipeline, Data Analyst, API Agent, or Custom. Alternatively, search Docker Hub for images or clone an existing agent's configuration.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "6 templates + Docker search" },
  { id: fid("WIZ"), name: "Step 3: Server Performance", description: "Auto-detect host hardware (CPU model, core count, RAM, GPU model/VRAM, disk space). Allocate resources with visual sliders for CPU cores, RAM, GPU VRAM, and disk. Pre-defined performance profiles: Nano (0.5 CPU, 512MB), Micro, Small, Medium, Large, XLarge, Custom.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "7 performance profiles" },
  { id: fid("WIZ"), name: "Step 4: Model Selection", description: "Browse and select AI models from Ollama library and HuggingFace Hub. Quantization format selector with quality/VRAM comparison. Context window configuration. Compatibility checker validates model fits within allocated resources.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Ollama + HuggingFace" },
  { id: fid("WIZ"), name: "Step 5: Inputs Configuration", description: "Configure agent input sources: HTTP/API endpoints (REST, GraphQL), message queues (Redis, RabbitMQ), file volume mounts, database connections, webhook listeners, cron schedule triggers, and agent-to-agent input channels.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "7 input types" },
  { id: fid("WIZ"), name: "Step 6: Outputs Configuration", description: "Configure agent output destinations: API responses, webhook dispatch (with retry logic), file outputs to volumes, message queue publishing, database writes, agent-to-agent output channels, and notification triggers.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "7 output types" },
  { id: fid("WIZ"), name: "Step 7: Agent Relationships", description: "Visual orchestration canvas for defining agent relationships. Configure parent-child hierarchy, dependency chains, pipeline positioning, and data flow. Orchestration patterns: Standalone, Worker, Orchestrator, Pipeline Node, Mesh Participant.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "5 orchestration patterns" },
  { id: fid("WIZ"), name: "Step 8: Environment & Config", description: "Environment variable editor with secret references (e.g., {{SECRET.OPENAI_KEY}}). Config file editor for agent-specific configuration. Network settings (ports, DNS), and advanced Docker/runtime options (capabilities, sysctls, labels).", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Secret references" },
  { id: fid("WIZ"), name: "Step 9: Review & Deploy", description: "Complete deployment summary with all configuration validated. Deploy options: Deploy Now (immediate start), Create Stopped (deploy but don't start), Save as Template (reusable), Export (docker-compose.yml). Live deployment progress with container pull and startup logs.", priority: "P0", phase: "Phase 2", status: "Planned", notes: "4 deploy options" },
  { id: fid("WIZ"), name: "Wizard Draft Saving", description: "Auto-save wizard progress as drafts. Resume incomplete deployments from any step. Named drafts for future reference. Draft expiration after 30 days.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Auto-save" },
  { id: fid("WIZ"), name: "Keyboard Shortcuts", description: "Navigate wizard steps with keyboard: Enter/Tab to advance, Shift+Tab/Escape to go back, Ctrl+1-9 to jump to specific steps, Ctrl+D to deploy from any step. Shortcut overlay (press ?).", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Full keyboard nav" },
  { id: fid("WIZ"), name: "Contextual Help System", description: "Inline help tooltips, expandable help panels, and contextual documentation links at each wizard step. Explains concepts like runtime differences, resource requirements, and orchestration patterns.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Per-step help" },
  { id: fid("WIZ"), name: "Presets & Quick Deploy", description: "Save complete wizard configurations as reusable presets. Pre-built presets for common use cases (e.g., 'Chat Agent with Llama 3', 'RAG Pipeline with Mistral'). One-click deploy from preset.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Reusable presets" },
];

// --- INFRASTRUCTURE MANAGEMENT (NEW) ---
const infraFeatures = [
  { id: fid("INF"), name: "Host Hardware Auto-Detection", description: "Automatically detect and report host hardware: CPU model, core count, clock speed, AVX2/AVX-512 support; total/available RAM; GPU model, VRAM, driver version, CUDA version; disk capacity and type (SSD/HDD); network interfaces and speed.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "CPU, RAM, GPU, Disk, Network" },
  { id: fid("INF"), name: "Resource Pool Management", description: "Define and manage resource pools that group CPU, RAM, GPU, and storage into allocatable units. Agents draw from pools. Over-commitment ratios configurable per resource type.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "Over-commitment support" },
  { id: fid("INF"), name: "Capacity Planning", description: "Projections dashboard showing current resource usage trends, estimated capacity exhaustion dates, and recommendations for scaling. Factor in model VRAM requirements and agent resource profiles.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Trend projections" },
  { id: fid("INF"), name: "Server Setup Wizard", description: "First-time server setup wizard guiding through: Docker installation verification, GPU driver check, database initialization, admin account creation, and initial settings configuration.", priority: "P0", phase: "MVP", status: "Done", notes: "First-run experience" },
  { id: fid("INF"), name: "Hardware Requirements Calculator", description: "Calculator tool estimating hardware needed for specific AI models. Input a model (e.g., Llama 3 70B Q4_K_M) and see required VRAM, RAM, disk space, and recommended CPU. Factors in quantization level.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Model-specific" },
  { id: fid("INF"), name: "AVX2/AVX-512 Detection", description: "Detect CPU instruction set extensions (AVX2, AVX-512, VNNI) required for efficient CPU-based inference with llama.cpp and similar frameworks. Warning if host CPU lacks required extensions.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "CPU inference compat" },
];

// --- MONITORING & OBSERVABILITY ---
const monitoringFeatures = [
  { id: fid("MON"), name: "Real-Time Dashboard Metrics", description: "Live-updating dashboard with key metrics: agent count by status, aggregate CPU/memory/GPU usage, network throughput, and disk I/O. Configurable refresh interval (1s-60s).", priority: "P0", phase: "MVP", status: "Done", notes: "WebSocket updates" },
  { id: fid("MON"), name: "Resource Charts", description: "Time-series charts for CPU usage, memory consumption, network bandwidth (in/out), and disk I/O (read/write). Per-host and per-agent views. Configurable time ranges (1h, 6h, 24h, 7d, 30d).", priority: "P0", phase: "MVP", status: "Done", notes: "Recharts library" },
  { id: fid("MON"), name: "Per-Agent Resource Monitoring", description: "Individual agent resource dashboards showing CPU, memory, network, and disk usage specific to that agent's container. Historical data with zoom and pan. Export to CSV.", priority: "P1", phase: "MVP", status: "Done", notes: "" },
  { id: fid("MON"), name: "Log Aggregation", description: "Centralized log collection from all agent containers. Structured log parsing, log level filtering (debug, info, warn, error), full-text search, and log download. Configurable retention period.", priority: "P0", phase: "MVP", status: "Done", notes: "Centralized collection" },
  { id: fid("MON"), name: "Alert Rules Engine", description: "Configurable alert rules based on metrics thresholds: CPU > X%, memory > X%, disk > X%, agent unhealthy for > X minutes. Multiple condition support (AND/OR). Alert severity levels.", priority: "P1", phase: "MVP", status: "Done", notes: "Threshold-based" },
  { id: fid("MON"), name: "Alert Notifications", description: "Alert delivery channels: in-app notifications (toast + notification center), webhook dispatch (for external integrations), with future support for Slack, email, PagerDuty, and Telegram.", priority: "P1", phase: "MVP", status: "In Progress", notes: "In-app + webhook now" },
  { id: fid("MON"), name: "Agent Health Matrix", description: "Color-coded grid visualization showing health status of all agents at a glance. Green (healthy), yellow (warning), red (critical), gray (stopped). Click any cell to drill into agent details.", priority: "P1", phase: "MVP", status: "Done", notes: "Color-coded grid" },
  { id: fid("MON"), name: "Resource Comparison", description: "Side-by-side resource usage comparison between two or more agents. Useful for identifying resource-hungry agents, comparing performance profiles, and capacity planning.", priority: "P2", phase: "MVP", status: "Done", notes: "" },
  { id: fid("MON"), name: "GPU Metrics Dashboard", description: "Real-time GPU monitoring: VRAM usage (per model and total), GPU compute utilization, temperature, power draw in watts, fan speed, and PCIe bandwidth. Requires NVIDIA GPU with NVML.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "NEW — NVML-based" },
  { id: fid("MON"), name: "Inference Queue Monitoring", description: "Monitor the GPU Sidecar inference request queue: queue depth, wait times, throughput (requests/sec), and per-agent queue usage. Identify bottlenecks and adjust priorities.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "NEW — Queue analytics" },
  { id: fid("MON"), name: "Model Performance Metrics", description: "Per-model inference performance: tokens per second (generation speed), time-to-first-token (latency), prompt processing speed (tokens/sec), and batch efficiency. Compare across quantization levels.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "NEW — Tokens/sec, latency" },
];

// --- MODELS & MARKETPLACE ---
const modelFeatures = [
  { id: fid("MOD"), name: "Model Management", description: "Central model registry managing AI models from Ollama, HuggingFace, and custom sources. Track model metadata: parameter count, quantization, required VRAM, license, and capabilities.", priority: "P0", phase: "MVP", status: "Done", notes: "Ollama + HuggingFace" },
  { id: fid("MOD"), name: "Model Pull with Progress", description: "Download models with real-time progress tracking: download percentage, speed (MB/s), ETA. Support for resuming interrupted downloads. Background downloads with notification on completion.", priority: "P1", phase: "MVP", status: "Done", notes: "Resume support" },
  { id: fid("MOD"), name: "Model Configuration", description: "Per-model inference parameters: temperature, top_p, top_k, max_tokens, repetition_penalty, stop sequences, and system prompt. Save configurations as presets for reuse across agents.", priority: "P1", phase: "MVP", status: "Done", notes: "Parameter presets" },
  { id: fid("MOD"), name: "Agent Template Marketplace", description: "Community-driven marketplace for sharing and discovering agent templates. Browse by category, rating, and download count. One-click import of templates including model, config, and resource requirements.", priority: "P2", phase: "Phase 3", status: "Planned", notes: "Future — community" },
  { id: fid("MOD"), name: "Custom Template Creation", description: "Create custom agent templates from running agents. Capture container image, environment variables, resource allocation, model selection, and I/O configuration. Share templates within the organization.", priority: "P2", phase: "Phase 2", status: "Planned", notes: "Export from running agents" },
  { id: fid("MOD"), name: "Docker Image Browser", description: "Search and browse Docker Hub images directly from the Hive UI. View image tags, sizes, pull counts, and documentation. Filter by official images, verified publishers, and categories.", priority: "P1", phase: "MVP", status: "Done", notes: "Docker Hub integration" },
];

// --- USER EXPERIENCE ---
const uxFeatures = [
  { id: fid("UXD"), name: "Dark-Only UI Design System", description: "Purpose-built dark UI design system optimized for server management and long monitoring sessions. Consistent color palette, component library, and spacing system. Reduces eye strain in data center environments.", priority: "P0", phase: "MVP", status: "Done", notes: "Tailwind CSS" },
  { id: fid("UXD"), name: "Command Palette", description: "Quick-access command palette (Cmd+K / Ctrl+K) for searching agents, navigating pages, executing actions, and accessing settings. Fuzzy search with keyboard-first interaction.", priority: "P1", phase: "MVP", status: "Done", notes: "Cmd+K / Ctrl+K" },
  { id: fid("UXD"), name: "Keyboard Shortcuts", description: "Vim-inspired keyboard shortcuts for power users. Navigate between agents (j/k), expand details (enter), start/stop (s), delete (d+d), and more. Customizable keybindings. Shortcut cheatsheet overlay.", priority: "P1", phase: "MVP", status: "Done", notes: "Vim-inspired" },
  { id: fid("UXD"), name: "Toast Notifications", description: "Non-blocking toast notifications for action feedback (agent started, settings saved, error occurred). Auto-dismiss with configurable duration. Click to expand for details. Action buttons on error toasts.", priority: "P0", phase: "MVP", status: "Done", notes: "Sonner library" },
  { id: fid("UXD"), name: "Skeleton Loading States", description: "Animated skeleton placeholders shown while data loads. Matches the layout of the incoming content for a smooth visual transition. Prevents layout shift and provides perceived performance improvement.", priority: "P1", phase: "MVP", status: "Done", notes: "" },
  { id: fid("UXD"), name: "Empty States with Onboarding", description: "Contextual empty states when no data exists (no agents, no logs, no alerts). Include helpful descriptions and clear calls-to-action guiding users to create their first resource.", priority: "P1", phase: "MVP", status: "Done", notes: "CTA guidance" },
  { id: fid("UXD"), name: "Progressive Disclosure", description: "Complex features revealed progressively. Basic options shown by default; advanced options behind 'Advanced' toggles. Reduces cognitive load for new users while maintaining power for experts.", priority: "P1", phase: "MVP", status: "Done", notes: "" },
  { id: fid("UXD"), name: "Responsive Design", description: "Fully responsive UI supporting desktop (1440px+), tablet (768-1439px), and mobile (320-767px) viewports. Collapsible sidebar, responsive tables, and touch-friendly controls.", priority: "P1", phase: "MVP", status: "Done", notes: "Desktop + Tablet + Mobile" },
  { id: fid("UXD"), name: "PWA Support", description: "Progressive Web App capabilities: installable on desktop and mobile, offline caching for static assets, push notifications for alerts, and app-like full-screen experience.", priority: "P3", phase: "Phase 3", status: "Planned", notes: "Future" },
];

// --- API & INTEGRATION ---
const apiFeatures = [
  { id: fid("API"), name: "RESTful API", description: "Complete REST API for all platform operations. JSON request/response format. Versioned endpoints (/api/v1/). OpenAPI 3.0 specification with auto-generated documentation. Rate limiting and pagination.", priority: "P0", phase: "MVP", status: "Done", notes: "OpenAPI 3.0 spec" },
  { id: fid("API"), name: "OpenAI-Compatible Inference API", description: "Inference API endpoint compatible with OpenAI's API format. Agents and external clients use standard OpenAI SDK to interact with locally-hosted models. Supports chat completions, completions, and embeddings.", priority: "P0", phase: "Phase 2", status: "In Progress", notes: "NEW — GPU Sidecar" },
  { id: fid("API"), name: "Webhook Support", description: "Outgoing webhooks triggered by platform events: agent state changes, alert firing, deployment completion, and user actions. Configurable retry logic with exponential backoff. Webhook signature verification.", priority: "P1", phase: "MVP", status: "Done", notes: "Event-driven" },
  { id: fid("API"), name: "API Key Authentication", description: "API key-based authentication for programmatic access. Scoped keys (read-only, agent-management, full-admin). Usage tracking with per-key analytics. Automatic key rotation reminders.", priority: "P1", phase: "MVP", status: "Done", notes: "Scoped keys" },
  { id: fid("API"), name: "Docker Socket Integration", description: "Direct integration with Docker daemon via Unix socket (/var/run/docker.sock) or TCP. Container lifecycle management, image operations, network/volume management, and stats streaming.", priority: "P0", phase: "MVP", status: "Done", notes: "Socket + TCP" },
  { id: fid("API"), name: "vsock Proxy for Firecracker", description: "Network proxy translating vsock connections from Firecracker microVMs to TCP, enabling agents running in microVMs to access the inference API and other host services transparently.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "NEW — Firecracker bridge" },
];

// --- DATA & STORAGE ---
const dataFeatures = [
  { id: fid("DAT"), name: "PostgreSQL Database", description: "PostgreSQL as the primary data store for all application data: user accounts, agent configurations, audit logs, alert rules, and settings. Prisma ORM for type-safe queries and migrations.", priority: "P0", phase: "MVP", status: "Done", notes: "Prisma ORM" },
  { id: fid("DAT"), name: "Redis Cache & Pub/Sub", description: "Redis for caching frequently accessed data (agent status, metrics), session storage, and pub/sub for real-time event distribution to WebSocket clients. Configurable TTLs per cache category.", priority: "P0", phase: "MVP", status: "Done", notes: "Cache + pub/sub" },
  { id: fid("DAT"), name: "Persistent Volume Management", description: "Manage Docker volumes for agent data persistence. Create named volumes, configure mount points, set size limits, and browse volume contents. Volumes survive agent restarts and re-deployments.", priority: "P1", phase: "MVP", status: "Done", notes: "" },
  { id: fid("DAT"), name: "Backup & Restore", description: "Full platform backup: database dump, agent configurations, secrets (encrypted), and settings. Scheduled automatic backups with configurable retention. One-click restore from backup file.", priority: "P1", phase: "MVP", status: "In Progress", notes: "DB + config backup" },
  { id: fid("DAT"), name: "Log Retention Policies", description: "Configurable log retention: retain logs for 7/30/90/365 days or unlimited. Automatic log rotation and cleanup. Per-agent override of global retention policy. Log archival to external storage.", priority: "P2", phase: "MVP", status: "Done", notes: "Configurable retention" },
  { id: fid("DAT"), name: "Model Cache Management", description: "Manage cached AI model files. View cache size per model, total disk usage, and cache location. Evict unused models to free disk space. Configure max cache size with LRU eviction.", priority: "P1", phase: "Phase 2", status: "Planned", notes: "LRU eviction" },
];

// --- DEPLOYMENT & OPERATIONS ---
const deployFeatures = [
  { id: fid("DEP"), name: "Docker Compose Self-Hosting", description: "Single docker-compose.yml for deploying the entire Hive platform: web app, API server, PostgreSQL, Redis, and Traefik. Production-ready with sensible defaults. Works on any Linux server with Docker.", priority: "P0", phase: "MVP", status: "Done", notes: "Single compose file" },
  { id: fid("DEP"), name: "Traefik Reverse Proxy", description: "Auto-configured Traefik reverse proxy for TLS termination, HTTP-to-HTTPS redirect, and path-based routing. Automatic Let's Encrypt certificate provisioning. Dashboard for routing inspection.", priority: "P1", phase: "MVP", status: "Done", notes: "Auto Let's Encrypt" },
  { id: fid("DEP"), name: "Health Checks", description: "Comprehensive health check system: application-level (/health endpoint), database connectivity, Redis connectivity, Docker daemon, and per-agent container health. Kubernetes-compatible liveness and readiness probes.", priority: "P0", phase: "MVP", status: "Done", notes: "K8s-compatible probes" },
  { id: fid("DEP"), name: "Auto-Restart Policies", description: "Configurable restart policies for agent containers: never, on-failure (with max retry count), always, unless-stopped. Exponential backoff for repeated failures. Restart event logging.", priority: "P1", phase: "MVP", status: "Done", notes: "Docker restart policies" },
  { id: fid("DEP"), name: "Multi-Server Cluster Support", description: "Distribute agents across multiple physical servers. Central control plane with remote agent workers. Server discovery, agent scheduling based on resource availability, and cross-server networking.", priority: "P2", phase: "Phase 3", status: "Planned", notes: "NEW — Future clustering" },
];


// ============================================================================
// DOCUMENT SECTIONS
// ============================================================================

function buildTitlePage() {
  return [
    spacer(600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: "HIVE",
          font: FONTS.HEADING,
          size: 96,
          bold: true,
          color: COLORS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 80 },
      children: [
        new TextRun({
          text: "Self-Hosted AI Agent Management Platform",
          font: FONTS.HEADING,
          size: 32,
          color: COLORS.MUTED_TEXT,
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.PRIMARY },
      },
      children: [],
    }),
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: "Feature List",
          font: FONTS.HEADING,
          size: 56,
          bold: true,
          color: COLORS.DARK_TEXT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 20 },
      children: [
        new TextRun({
          text: "Comprehensive Platform Feature Specification",
          font: FONTS.HEADING,
          size: 28,
          color: COLORS.MUTED_TEXT,
        }),
      ],
    }),
    spacer(600),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Document Version: ", font: FONTS.BODY, size: 22, color: COLORS.MUTED_TEXT }),
        new TextRun({ text: "2.0", font: FONTS.BODY, size: 22, bold: true, color: COLORS.DARK_TEXT }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Last Updated: ", font: FONTS.BODY, size: 22, color: COLORS.MUTED_TEXT }),
        new TextRun({ text: "March 2026", font: FONTS.BODY, size: 22, bold: true, color: COLORS.DARK_TEXT }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Classification: ", font: FONTS.BODY, size: 22, color: COLORS.MUTED_TEXT }),
        new TextRun({ text: "Internal \u2014 Confidential", font: FONTS.BODY, size: 22, bold: true, color: COLORS.DARK_TEXT }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Total Features: ", font: FONTS.BODY, size: 22, color: COLORS.MUTED_TEXT }),
        new TextRun({
          text: String(
            corePlatformFeatures.length + authFeatures.length + runtimeFeatures.length +
            gpuSidecarFeatures.length + wizardFeatures.length + infraFeatures.length +
            monitoringFeatures.length + modelFeatures.length + uxFeatures.length +
            apiFeatures.length + dataFeatures.length + deployFeatures.length
          ),
          font: FONTS.BODY,
          size: 22,
          bold: true,
          color: COLORS.PRIMARY_DARK,
        }),
      ],
    }),
  ];
}

function buildDocumentInfo() {
  return [
    heading("Document Information", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    spacer(80),
    comparisonTable(
      ["Property", "Value"],
      [
        ["Document Title", "Hive Feature List"],
        ["Document ID", "HIVE-DOC-05"],
        ["Version", "2.0"],
        ["Date", "March 20, 2026"],
        ["Author", "Hive Product Team"],
        ["Status", "Active"],
        ["Classification", "Internal \u2014 Confidential"],
      ]
    ),
    spacer(160),
    heading("Revision History", HeadingLevel.HEADING_2),
    comparisonTable(
      ["Version", "Date", "Author", "Changes"],
      [
        ["1.0", "January 2026", "Product Team", "Initial feature list \u2014 Core platform, auth, monitoring, UX, API, data, deployment features"],
        ["2.0", "March 2026", "Product Team", "Major update \u2014 Added Multi-Runtime Architecture, GPU Sidecar, Deployment Wizard, Infrastructure Management. Updated existing feature statuses."],
      ]
    ),
    spacer(160),
    heading("How to Read This Document", HeadingLevel.HEADING_2),
    bodyText("Each feature is documented in a table with the following columns:"),
    spacer(40),
    kvPair("ID", "Unique identifier (e.g., COR-001 for Core Platform, GPU-035 for GPU Sidecar)"),
    kvPair("Feature", "Short name of the feature"),
    kvPair("Description", "Detailed description of what the feature does and how it works"),
    kvPair("Priority", "P0 (Critical) / P1 (High) / P2 (Medium) / P3 (Low)"),
    kvPair("Phase", "MVP (launch) / Phase 2 (3-6 months post-launch) / Phase 3 (6-12 months)"),
    kvPair("Status", "Done / In Progress / Planned"),
    kvPair("Notes", "Additional context, dependencies, or technical notes"),
    spacer(120),
    heading("Priority Definitions", HeadingLevel.HEADING_3),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        headerRow(["Priority", "Definition", "Examples"], [15, 45, 40]),
        new TableRow({
          children: [
            cell("P0", { badge: true, width: 15 }),
            cell("Critical — Must have for product viability. Blocking for launch or major release.", { shading: COLORS.P0_BG, width: 45 }),
            cell("Agent CRUD, Dashboard, Authentication, Docker Runtime", { shading: COLORS.P0_BG, width: 40 }),
          ],
        }),
        new TableRow({
          children: [
            cell("P1", { badge: true, width: 15 }),
            cell("High — Important for user experience and competitive positioning. Should be in the target release.", { shading: COLORS.P1_BG, width: 45 }),
            cell("Audit Logging, API Keys, Log Streaming, Alert Engine", { shading: COLORS.P1_BG, width: 40 }),
          ],
        }),
        new TableRow({
          children: [
            cell("P2", { badge: true, width: 15 }),
            cell("Medium — Valuable but can be deferred. Enhances the product but not blocking.", { shading: COLORS.P2_BG, width: 45 }),
            cell("Capacity Planning, Template Marketplace, PWA Support", { shading: COLORS.P2_BG, width: 40 }),
          ],
        }),
        new TableRow({
          children: [
            cell("P3", { badge: true, width: 15 }),
            cell("Low — Nice to have. Long-term enhancements for future consideration.", { shading: COLORS.P3_BG, width: 45 }),
            cell("PWA Support", { shading: COLORS.P3_BG, width: 40 }),
          ],
        }),
      ],
    }),
  ];
}

function buildExecutiveSummary() {
  const allFeatures = [
    ...corePlatformFeatures, ...authFeatures, ...runtimeFeatures,
    ...gpuSidecarFeatures, ...wizardFeatures, ...infraFeatures,
    ...monitoringFeatures, ...modelFeatures, ...uxFeatures,
    ...apiFeatures, ...dataFeatures, ...deployFeatures,
  ];
  const total = allFeatures.length;
  const done = allFeatures.filter(f => f.status === "Done").length;
  const inProgress = allFeatures.filter(f => f.status === "In Progress").length;
  const planned = allFeatures.filter(f => f.status === "Planned").length;
  const p0 = allFeatures.filter(f => f.priority === "P0").length;
  const p1 = allFeatures.filter(f => f.priority === "P1").length;
  const p2 = allFeatures.filter(f => f.priority === "P2").length;
  const p3 = allFeatures.filter(f => f.priority === "P3").length;
  const mvp = allFeatures.filter(f => f.phase === "MVP").length;
  const phase2 = allFeatures.filter(f => f.phase === "Phase 2").length;
  const phase3 = allFeatures.filter(f => f.phase === "Phase 3").length;

  return [
    heading("Executive Summary", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    spacer(80),
    bodyText(
      "Hive is a self-hosted AI agent management platform \u2014 often described as \"Proxmox for AI agents.\" It provides a comprehensive web-based interface for deploying, managing, monitoring, and orchestrating AI agents running in isolated containers or microVMs on your own infrastructure."
    ),
    bodyText(
      "This document catalogs every feature of the Hive platform across 12 functional categories. Version 2.0 introduces four major new feature areas: Multi-Runtime Architecture (Docker + Firecracker + future runtimes), GPU Sidecar Architecture (shared inference with VRAM mutualization), a 9-Step Agent Deployment Wizard, and Infrastructure Management capabilities."
    ),
    spacer(80),
    heading("Feature Summary", HeadingLevel.HEADING_2),
    comparisonTable(
      ["Metric", "Count"],
      [
        ["Total Features", String(total)],
        ["Done", String(done)],
        ["In Progress", String(inProgress)],
        ["Planned", String(planned)],
      ]
    ),
    spacer(120),
    heading("By Priority", HeadingLevel.HEADING_3),
    comparisonTable(
      ["Priority", "Count", "Percentage"],
      [
        ["P0 — Critical", String(p0), `${Math.round(p0/total*100)}%`],
        ["P1 — High", String(p1), `${Math.round(p1/total*100)}%`],
        ["P2 — Medium", String(p2), `${Math.round(p2/total*100)}%`],
        ["P3 — Low", String(p3), `${Math.round(p3/total*100)}%`],
      ]
    ),
    spacer(120),
    heading("By Phase", HeadingLevel.HEADING_3),
    comparisonTable(
      ["Phase", "Count", "Percentage"],
      [
        ["MVP (Launch)", String(mvp), `${Math.round(mvp/total*100)}%`],
        ["Phase 2 (3-6 months)", String(phase2), `${Math.round(phase2/total*100)}%`],
        ["Phase 3 (6-12 months)", String(phase3), `${Math.round(phase3/total*100)}%`],
      ]
    ),
    spacer(120),
    heading("By Category", HeadingLevel.HEADING_3),
    comparisonTable(
      ["Category", "Features", "New in v2.0"],
      [
        ["Core Platform", String(corePlatformFeatures.length), "—"],
        ["Authentication & Security", String(authFeatures.length), "—"],
        ["Multi-Runtime Architecture", String(runtimeFeatures.length), "NEW"],
        ["GPU Sidecar Architecture", String(gpuSidecarFeatures.length), "NEW"],
        ["Agent Deployment Wizard", String(wizardFeatures.length), "NEW"],
        ["Infrastructure Management", String(infraFeatures.length), "NEW"],
        ["Monitoring & Observability", String(monitoringFeatures.length), "3 new features"],
        ["Models & Marketplace", String(modelFeatures.length), "—"],
        ["User Experience", String(uxFeatures.length), "—"],
        ["API & Integration", String(apiFeatures.length), "2 new features"],
        ["Data & Storage", String(dataFeatures.length), "—"],
        ["Deployment & Operations", String(deployFeatures.length), "1 new feature"],
      ]
    ),
  ];
}

function buildFeatureSection(title, description, features, headingOpts = {}) {
  return [
    heading(title, HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true, ...headingOpts }),
    sectionIntro(description),
    spacer(60),
    featureTable(features),
    spacer(80),
  ];
}

function buildRuntimeDeepDive() {
  return [
    spacer(120),
    heading("Runtime Comparison Matrix", HeadingLevel.HEADING_2),
    bodyText("The following matrix compares all supported and planned runtimes across key dimensions relevant to AI agent deployment."),
    spacer(60),
    comparisonTable(
      ["Property", "Docker", "Firecracker", "Kata Containers", "gVisor"],
      [
        ["Isolation Level", "Namespace (OS-level)", "Hardware (VM via KVM)", "Hardware (VM, OCI compat)", "Application kernel"],
        ["Boot Time", "~500ms", "~125ms", "~1-2s", "~200ms"],
        ["Memory Overhead", "~10MB", "~5MB", "~30-50MB", "~15MB"],
        ["GPU Support", "Full (NVIDIA Toolkit)", "Via GPU Sidecar API", "VFIO passthrough", "Limited"],
        ["OCI Compatible", "Yes", "No (custom)", "Yes", "Yes"],
        ["Networking", "Bridge / Host / Overlay", "TAP + mmds", "Bridge / TC", "Netstack"],
        ["Storage", "Volumes / Bind mounts", "Block device", "Volumes (virtiofs)", "Overlay + tmpfs"],
        ["Use Case", "General purpose", "Untrusted code", "Enterprise compliance", "Dev/test workloads"],
        ["Phase", "MVP (available now)", "Phase 2", "Phase 3", "Phase 3"],
        ["Status", "Done", "Planned", "Planned", "Planned"],
      ]
    ),
    spacer(120),
    heading("Runtime Selection Decision Tree", HeadingLevel.HEADING_2),
    bodyText("Use the following decision framework to choose the appropriate runtime for each agent:"),
    spacer(40),
    bullet("Does the agent run untrusted or user-submitted code?", { level: 0 }),
    bullet("YES \u2192 Use Firecracker MicroVM for hardware-level isolation", { level: 1 }),
    bullet("NO \u2192 Continue to next question", { level: 1 }),
    bullet("Does the agent need direct GPU access (not via API)?", { level: 0 }),
    bullet("YES \u2192 Use Docker with NVIDIA Container Toolkit (or Kata with VFIO)", { level: 1 }),
    bullet("NO \u2192 Continue to next question", { level: 1 }),
    bullet("Is regulatory compliance (SOC 2, HIPAA) a primary concern?", { level: 0 }),
    bullet("YES \u2192 Use Kata Containers for OCI + VM isolation", { level: 1 }),
    bullet("NO \u2192 Use Docker (simplest, most features, largest ecosystem)", { level: 1 }),
  ];
}

function buildGPUSidecarDeepDive() {
  return [
    spacer(120),
    heading("GPU Sidecar Architecture Overview", HeadingLevel.HEADING_2),
    bodyText(
      "The GPU Sidecar architecture decouples GPU inference from agent execution, enabling efficient GPU mutualization. Instead of each agent requiring its own GPU, agents send inference requests to a shared GPU service via an OpenAI-compatible API."
    ),
    spacer(40),
    heading("Architecture Benefits", HeadingLevel.HEADING_3),
    bullet("Cost Efficiency: Single GPU serves 10-50+ agents simultaneously", { bold_prefix: "Cost Efficiency: ", level: 0 }),
    bullet("Flexibility: Agents don't need GPU drivers or CUDA installed", { bold_prefix: "Flexibility: ", level: 0 }),
    bullet("Security: Agents never access GPU hardware directly (unless dedicated mode)", { bold_prefix: "Security: ", level: 0 }),
    bullet("Performance: Continuous batching provides 3-5x throughput vs. sequential", { bold_prefix: "Performance: ", level: 0 }),
    bullet("Compatibility: Works with Docker, Firecracker, and all runtimes", { bold_prefix: "Compatibility: ", level: 0 }),
    spacer(80),
    heading("Supported Inference Backends", HeadingLevel.HEADING_3),
    comparisonTable(
      ["Backend", "Type", "Best For", "Key Feature"],
      [
        ["vLLM", "Open Source", "Production LLM serving", "PagedAttention, continuous batching"],
        ["TGI", "HuggingFace", "HF model ecosystem", "Tight HF integration, Flash Attention"],
        ["Ollama", "Open Source", "Easy setup, dev/test", "Simple API, model library"],
        ["NVIDIA Triton", "NVIDIA", "Multi-framework serving", "TensorRT, model ensembles"],
        ["llama.cpp", "Open Source", "CPU inference, GGUF", "Efficient CPU/GPU, quantization"],
      ]
    ),
    spacer(80),
    heading("Quantization Comparison", HeadingLevel.HEADING_3),
    bodyText("Quantization reduces model VRAM requirements by representing weights with fewer bits. The trade-off is a small reduction in output quality."),
    spacer(40),
    comparisonTable(
      ["Format", "Bits", "VRAM (7B model)", "Quality Impact", "Speed"],
      [
        ["FP16", "16-bit", "~14 GB", "Baseline (100%)", "1.0x"],
        ["Q8", "8-bit", "~7 GB", "Negligible (~99%)", "1.1x"],
        ["Q5_K_M", "5-bit", "~5 GB", "Very small (~97%)", "1.3x"],
        ["Q4_K_M", "4-bit", "~4 GB", "Small (~95%)", "1.5x"],
        ["GPTQ", "4-bit", "~4 GB", "Small (~95%)", "1.4x"],
        ["AWQ", "4-bit", "~4 GB", "Small (~96%)", "1.5x"],
        ["GGUF Q4", "4-bit", "~4 GB", "Small (~95%)", "1.5x (CPU too)"],
      ]
    ),
    spacer(80),
    heading("Model Lifecycle States", HeadingLevel.HEADING_3),
    bodyText("Every model in the GPU Sidecar system goes through a 5-state lifecycle:"),
    spacer(40),
    comparisonTable(
      ["State", "Location", "VRAM Used", "Description"],
      [
        ["Pull", "Downloading", "None", "Model being downloaded from registry (Ollama/HuggingFace)"],
        ["Ready", "On Disk", "None", "Downloaded and available. Not loaded into GPU memory."],
        ["Loaded", "In VRAM", "Full allocation", "Model weights loaded into GPU VRAM. Ready for inference."],
        ["Idle", "In VRAM", "Full allocation", "Loaded but no recent requests. Candidate for eviction."],
        ["Unloaded", "On Disk", "None", "VRAM freed. Must be re-loaded before next inference."],
      ]
    ),
  ];
}

function buildWizardDeepDive() {
  return [
    spacer(120),
    heading("Deployment Wizard Flow", HeadingLevel.HEADING_2),
    bodyText("The 9-step deployment wizard guides users through every aspect of agent configuration. Each step validates input before allowing progression. Users can navigate freely between completed steps."),
    spacer(60),
    comparisonTable(
      ["Step", "Name", "Required", "Key Decisions"],
      [
        ["1", "Runtime Selection", "Yes", "Docker vs. Firecracker vs. Kata vs. gVisor"],
        ["2", "Agent Template", "Yes", "Template, Docker image, or clone existing"],
        ["3", "Server Performance", "Yes", "CPU, RAM, GPU, Disk allocation"],
        ["4", "Model Selection", "If AI agent", "Model, quantization, context window"],
        ["5", "Inputs Configuration", "No", "API, webhooks, queues, files, cron, agent-to-agent"],
        ["6", "Outputs Configuration", "No", "API responses, webhooks, files, notifications"],
        ["7", "Agent Relationships", "No", "Parent/child, dependencies, orchestration pattern"],
        ["8", "Environment & Config", "No", "Env vars, secrets, Docker options"],
        ["9", "Review & Deploy", "Yes", "Validation, deploy mode, progress tracking"],
      ]
    ),
    spacer(80),
    heading("Performance Profiles", HeadingLevel.HEADING_3),
    bodyText("Pre-defined resource allocation profiles for quick selection in Step 3:"),
    spacer(40),
    comparisonTable(
      ["Profile", "CPU", "RAM", "GPU VRAM", "Disk", "Use Case"],
      [
        ["Nano", "0.5 cores", "512 MB", "None", "1 GB", "Lightweight scripts, cron jobs"],
        ["Micro", "1 core", "1 GB", "None", "5 GB", "Simple API agents, webhooks"],
        ["Small", "2 cores", "4 GB", "None", "10 GB", "Small LLMs (CPU), basic RAG"],
        ["Medium", "4 cores", "8 GB", "4 GB", "20 GB", "7B models (Q4), code assistants"],
        ["Large", "8 cores", "16 GB", "8 GB", "50 GB", "13B models, multi-tool agents"],
        ["XLarge", "16 cores", "32 GB", "24 GB", "100 GB", "70B models (Q4), production serving"],
        ["Custom", "User-defined", "User-defined", "User-defined", "User-defined", "Manual resource allocation"],
      ]
    ),
    spacer(80),
    heading("Orchestration Patterns", HeadingLevel.HEADING_3),
    bodyText("Step 7 supports five orchestration patterns for multi-agent systems:"),
    spacer(40),
    comparisonTable(
      ["Pattern", "Description", "Data Flow", "Example"],
      [
        ["Standalone", "Independent agent with no relationships", "None", "Chat bot, API service"],
        ["Worker", "Receives tasks from an orchestrator", "Orchestrator \u2192 Worker", "Code executor, web scraper"],
        ["Orchestrator", "Coordinates and dispatches to workers", "Orchestrator \u2192 Workers", "Task planner, coordinator"],
        ["Pipeline Node", "Part of a sequential processing chain", "Node A \u2192 Node B \u2192 Node C", "Data ETL, content pipeline"],
        ["Mesh Participant", "Peer-to-peer communication with other agents", "Any \u2194 Any", "Collaborative research, swarm"],
      ]
    ),
  ];
}

function buildAppendixA() {
  // Full feature ID reference
  const allFeatures = [
    { category: "Core Platform", prefix: "COR", features: corePlatformFeatures },
    { category: "Authentication & Security", prefix: "AUT", features: authFeatures },
    { category: "Multi-Runtime Architecture", prefix: "RUN", features: runtimeFeatures },
    { category: "GPU Sidecar Architecture", prefix: "GPU", features: gpuSidecarFeatures },
    { category: "Agent Deployment Wizard", prefix: "WIZ", features: wizardFeatures },
    { category: "Infrastructure Management", prefix: "INF", features: infraFeatures },
    { category: "Monitoring & Observability", prefix: "MON", features: monitoringFeatures },
    { category: "Models & Marketplace", prefix: "MOD", features: modelFeatures },
    { category: "User Experience", prefix: "UXD", features: uxFeatures },
    { category: "API & Integration", prefix: "API", features: apiFeatures },
    { category: "Data & Storage", prefix: "DAT", features: dataFeatures },
    { category: "Deployment & Operations", prefix: "DEP", features: deployFeatures },
  ];

  const rows = [];
  for (const cat of allFeatures) {
    for (const f of cat.features) {
      rows.push([f.id, f.name, cat.category, f.priority, f.phase, f.status]);
    }
  }

  return [
    heading("Appendix A: Complete Feature Index", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("Alphabetical-by-ID listing of all features for quick reference."),
    spacer(60),
    (() => {
      const widths = [8, 25, 22, 10, 13, 12];
      const tableRows = [
        headerRow(["ID", "Feature Name", "Category", "Priority", "Phase", "Status"], widths),
        ...rows.map((row, idx) => {
          const bgColor = idx % 2 === 0 ? COLORS.TABLE_ROW_EVEN : COLORS.TABLE_ROW_ODD;
          return new TableRow({
            children: [
              cell(row[0], { mono: true, small: true, center: true, shading: bgColor, width: widths[0] }),
              cell(row[1], { bold: true, shading: bgColor, width: widths[1] }),
              cell(row[2], { small: true, shading: bgColor, width: widths[2] }),
              cell(row[3], { badge: true, shading: bgColor, width: widths[3] }),
              cell(row[4], { badge: true, shading: bgColor, width: widths[4] }),
              cell(row[5], { badge: true, shading: bgColor, width: widths[5] }),
            ],
          });
        }),
      ];
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      });
    })(),
  ];
}

function buildAppendixB() {
  return [
    heading("Appendix B: Technology Stack", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("Key technologies and frameworks used in the Hive platform."),
    spacer(60),
    heading("Frontend", HeadingLevel.HEADING_2),
    comparisonTable(
      ["Technology", "Version", "Purpose"],
      [
        ["Next.js", "14.x (App Router)", "React framework with server-side rendering"],
        ["React", "18.x", "UI component library"],
        ["TypeScript", "5.x", "Type-safe JavaScript"],
        ["Tailwind CSS", "3.x", "Utility-first CSS framework (dark theme)"],
        ["Shadcn/UI", "Latest", "Pre-built accessible component library"],
        ["Recharts", "2.x", "Charting library for metrics dashboards"],
        ["xterm.js", "5.x", "Terminal emulator for container shell access"],
        ["Zustand", "4.x", "Lightweight state management"],
      ]
    ),
    spacer(80),
    heading("Backend", HeadingLevel.HEADING_2),
    comparisonTable(
      ["Technology", "Version", "Purpose"],
      [
        ["Next.js API Routes", "14.x", "Backend API endpoints"],
        ["NextAuth v5", "5.x", "Authentication framework"],
        ["Prisma", "5.x", "ORM for PostgreSQL"],
        ["PostgreSQL", "16.x", "Primary database"],
        ["Redis", "7.x", "Caching, sessions, pub/sub"],
        ["Docker Engine API", "v1.43+", "Container management"],
        ["WebSocket (ws)", "8.x", "Real-time log streaming and events"],
      ]
    ),
    spacer(80),
    heading("Infrastructure", HeadingLevel.HEADING_2),
    comparisonTable(
      ["Technology", "Version", "Purpose"],
      [
        ["Docker", "24.x+", "Default container runtime"],
        ["Docker Compose", "v2", "Platform deployment orchestration"],
        ["Traefik", "v3", "Reverse proxy, TLS, routing"],
        ["Firecracker", "1.x", "MicroVM runtime (Phase 2)"],
        ["NVIDIA Container Toolkit", "Latest", "GPU passthrough for Docker"],
        ["vLLM / TGI / Ollama", "Latest", "Inference backends (Phase 2)"],
      ]
    ),
  ];
}

function buildAppendixC() {
  return [
    heading("Appendix C: Glossary", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("Definitions of key terms used throughout this document."),
    spacer(60),
    comparisonTable(
      ["Term", "Definition"],
      [
        ["Agent", "An AI-powered process running inside a container or microVM, managed by Hive"],
        ["Continuous Batching", "Technique of batching multiple inference requests into a single GPU operation for higher throughput"],
        ["Firecracker", "Lightweight virtual machine monitor (VMM) by AWS providing microVM-level isolation via KVM"],
        ["GPU Sidecar", "Shared GPU inference service that decouples GPU access from individual agent containers"],
        ["GGUF", "File format for quantized LLM models, used by llama.cpp"],
        ["gVisor", "Application kernel by Google that intercepts system calls for medium-level isolation"],
        ["Inference", "The process of running a trained AI model to generate predictions or text"],
        ["Kata Containers", "OCI-compatible runtime that runs containers inside lightweight VMs"],
        ["KVM", "Kernel-based Virtual Machine — Linux kernel module for hardware virtualization"],
        ["MicroVM", "Extremely lightweight virtual machine with minimal overhead (~5MB RAM)"],
        ["NVML", "NVIDIA Management Library — API for monitoring and managing NVIDIA GPUs"],
        ["OCI", "Open Container Initiative — standards for container formats and runtimes"],
        ["PagedAttention", "Memory management technique (vLLM) that manages KV-cache in pages for efficiency"],
        ["Quantization", "Reducing model weight precision (e.g., FP16 to 4-bit) to decrease VRAM requirements"],
        ["RBAC", "Role-Based Access Control — restricting system access based on user roles"],
        ["TGI", "Text Generation Inference — HuggingFace's optimized inference server"],
        ["vLLM", "High-throughput LLM serving engine with PagedAttention"],
        ["VRAM", "Video RAM — GPU memory used for loading model weights and computation"],
        ["vsock", "Virtual socket for efficient host-guest communication in VMs (~2\u00B5s latency)"],
      ]
    ),
  ];
}


// ============================================================================
// MAIN — Assemble and generate the document
// ============================================================================

async function main() {
  console.log("Generating 05_Hive_Feature_List.docx ...");
  console.log("");

  const children = [
    // Title page
    ...buildTitlePage(),

    // Document info & revision history
    ...buildDocumentInfo(),

    // Executive summary with statistics
    ...buildExecutiveSummary(),

    // =====================================================================
    // FEATURE SECTIONS
    // =====================================================================

    // 1. Core Platform
    ...buildFeatureSection(
      "1. Core Platform",
      "The foundational features that make up the Hive platform. These features provide the primary interface for managing AI agents, including the dashboard, agent lifecycle management, real-time monitoring, and system administration capabilities.",
      corePlatformFeatures
    ),

    // 2. Authentication & Security
    ...buildFeatureSection(
      "2. Authentication & Security",
      "Security features protecting the Hive platform and its managed agents. Includes user authentication, session management, role-based access control, API key management, and container security monitoring.",
      authFeatures
    ),

    // 3. Multi-Runtime Architecture (NEW)
    ...buildFeatureSection(
      "3. Multi-Runtime Architecture",
      "NEW IN V2.0 — Hive's multi-runtime architecture enables agents to run in different execution environments depending on security, performance, and isolation requirements. Docker remains the default, with Firecracker MicroVMs for untrusted code and future support for Kata Containers and gVisor.",
      runtimeFeatures,
      { newBadge: true }
    ),
    ...buildRuntimeDeepDive(),

    // 4. GPU Sidecar Architecture (NEW)
    ...buildFeatureSection(
      "4. GPU Sidecar Architecture",
      "NEW IN V2.0 — The GPU Sidecar decouples GPU inference from agent execution, enabling efficient GPU mutualization across many agents. A shared inference service exposes an OpenAI-compatible API, with support for multiple backends, request queuing, continuous batching, and advanced VRAM management.",
      gpuSidecarFeatures,
      { newBadge: true }
    ),
    ...buildGPUSidecarDeepDive(),

    // 5. Agent Deployment Wizard (NEW)
    ...buildFeatureSection(
      "5. Agent Deployment Wizard",
      "NEW IN V2.0 — A comprehensive 9-step guided wizard for deploying new AI agents. Covers runtime selection, template choice, resource allocation, model selection, I/O configuration, agent relationships, environment setup, and review/deploy with live progress tracking.",
      wizardFeatures,
      { newBadge: true }
    ),
    ...buildWizardDeepDive(),

    // 6. Infrastructure Management (NEW)
    ...buildFeatureSection(
      "6. Infrastructure Management",
      "NEW IN V2.0 — Infrastructure-level features for understanding and managing the host hardware that runs Hive and its agents. Includes hardware auto-detection, resource pool management, capacity planning, and compatibility checking for AI workloads.",
      infraFeatures,
      { newBadge: true }
    ),

    // 7. Monitoring & Observability
    ...buildFeatureSection(
      "7. Monitoring & Observability",
      "Comprehensive monitoring and observability features for tracking agent health, resource usage, and system performance. Version 2.0 adds GPU metrics, inference queue monitoring, and model performance tracking.",
      monitoringFeatures
    ),

    // 8. Models & Marketplace
    ...buildFeatureSection(
      "8. Models & Marketplace",
      "Features for managing AI models, browsing model registries, configuring inference parameters, and discovering agent templates. Supports Ollama and HuggingFace model ecosystems.",
      modelFeatures
    ),

    // 9. User Experience
    ...buildFeatureSection(
      "9. User Experience",
      "Design system and UX features that make Hive intuitive and efficient. Purpose-built dark UI, keyboard-first interaction, progressive disclosure, and responsive design across all device sizes.",
      uxFeatures
    ),

    // 10. API & Integration
    ...buildFeatureSection(
      "10. API & Integration",
      "External integration points including the REST API, OpenAI-compatible inference API, webhook support, and Docker socket integration. Version 2.0 adds vsock proxy for Firecracker microVMs.",
      apiFeatures
    ),

    // 11. Data & Storage
    ...buildFeatureSection(
      "11. Data & Storage",
      "Data persistence, caching, and storage management features. PostgreSQL for application data, Redis for caching and real-time events, and volume management for agent data persistence.",
      dataFeatures
    ),

    // 12. Deployment & Operations
    ...buildFeatureSection(
      "12. Deployment & Operations",
      "Features for deploying and operating the Hive platform itself. Docker Compose for self-hosting, Traefik reverse proxy, health checks, and auto-restart policies. Phase 3 introduces multi-server clustering.",
      deployFeatures
    ),

    // =====================================================================
    // APPENDICES
    // =====================================================================
    ...buildAppendixA(),
    ...buildAppendixB(),
    ...buildAppendixC(),

    // End of document
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: COLORS.PRIMARY },
      },
      children: [
        new TextRun({
          text: "End of Document",
          font: FONTS.HEADING,
          size: 24,
          color: COLORS.MUTED_TEXT,
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60 },
      children: [
        new TextRun({
          text: "Hive \u2014 Self-Hosted AI Agent Management Platform",
          font: FONTS.BODY,
          size: 20,
          color: COLORS.MUTED_TEXT,
        }),
      ],
    }),
  ];

  const doc = new Document({
    creator: "Hive Product Team",
    title: "Hive Feature List",
    description: "Comprehensive feature specification for the Hive AI Agent Management Platform",
    styles: {
      default: {
        document: {
          run: {
            font: FONTS.BODY,
            size: 22,
            color: COLORS.BODY_TEXT,
          },
          paragraph: {
            spacing: { line: 276 },
          },
        },
        heading1: {
          run: {
            font: FONTS.HEADING,
            size: 36 * 2,
            bold: true,
            color: COLORS.PRIMARY_DARK,
          },
          paragraph: {
            spacing: { before: 400, after: 120 },
          },
        },
        heading2: {
          run: {
            font: FONTS.HEADING,
            size: 28 * 2,
            bold: true,
            color: COLORS.DARK_TEXT,
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
          },
        },
        heading3: {
          run: {
            font: FONTS.HEADING,
            size: 24 * 2,
            bold: true,
            color: COLORS.DARK_TEXT,
          },
          paragraph: {
            spacing: { before: 200, after: 100 },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "default-bullet",
          levels: [
            {
              level: 0,
              format: LevelFormat ? LevelFormat.BULLET : "bullet",
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
            },
            {
              level: 1,
              format: LevelFormat ? LevelFormat.BULLET : "bullet",
              text: "\u25E6",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: convertInchesToTwip(1.0), hanging: convertInchesToTwip(0.25) } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11),
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
            },
          },
          pageNumberStart: 1,
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.TABLE_BORDER },
                },
                children: [
                  new TextRun({
                    text: "Hive Feature List",
                    font: FONTS.BODY,
                    size: 18,
                    color: COLORS.MUTED_TEXT,
                    italics: true,
                  }),
                  new TextRun({
                    text: "  |  ",
                    font: FONTS.BODY,
                    size: 18,
                    color: COLORS.TABLE_BORDER,
                  }),
                  new TextRun({
                    text: "v2.0 \u2014 March 2026",
                    font: FONTS.BODY,
                    size: 18,
                    color: COLORS.MUTED_TEXT,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: {
                  top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.TABLE_BORDER },
                },
                children: [
                  new TextRun({
                    text: "CONFIDENTIAL",
                    font: FONTS.BODY,
                    size: 16,
                    color: COLORS.MUTED_TEXT,
                  }),
                  new TextRun({
                    text: "  \u2014  Page ",
                    font: FONTS.BODY,
                    size: 16,
                    color: COLORS.MUTED_TEXT,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONTS.BODY,
                    size: 16,
                    color: COLORS.MUTED_TEXT,
                  }),
                  new TextRun({
                    text: " of ",
                    font: FONTS.BODY,
                    size: 16,
                    color: COLORS.MUTED_TEXT,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONTS.BODY,
                    size: 16,
                    color: COLORS.MUTED_TEXT,
                  }),
                ],
              }),
            ],
          }),
        },
        children: children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = "G:/Hive/docs/05_Hive_Feature_List.docx";
  fs.writeFileSync(outPath, buffer);

  // Print summary
  const allFeatures = [
    ...corePlatformFeatures, ...authFeatures, ...runtimeFeatures,
    ...gpuSidecarFeatures, ...wizardFeatures, ...infraFeatures,
    ...monitoringFeatures, ...modelFeatures, ...uxFeatures,
    ...apiFeatures, ...dataFeatures, ...deployFeatures,
  ];
  const total = allFeatures.length;
  const done = allFeatures.filter(f => f.status === "Done").length;
  const inProgress = allFeatures.filter(f => f.status === "In Progress").length;
  const planned = allFeatures.filter(f => f.status === "Planned").length;

  console.log(`Document generated: ${outPath}`);
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log("");
  console.log("Feature Summary:");
  console.log(`  Total features:  ${total}`);
  console.log(`  Done:            ${done}`);
  console.log(`  In Progress:     ${inProgress}`);
  console.log(`  Planned:         ${planned}`);
  console.log("");
  console.log("Categories:");
  console.log(`  Core Platform:            ${corePlatformFeatures.length}`);
  console.log(`  Authentication & Security: ${authFeatures.length}`);
  console.log(`  Multi-Runtime (NEW):      ${runtimeFeatures.length}`);
  console.log(`  GPU Sidecar (NEW):        ${gpuSidecarFeatures.length}`);
  console.log(`  Deployment Wizard (NEW):  ${wizardFeatures.length}`);
  console.log(`  Infrastructure (NEW):     ${infraFeatures.length}`);
  console.log(`  Monitoring:               ${monitoringFeatures.length}`);
  console.log(`  Models & Marketplace:     ${modelFeatures.length}`);
  console.log(`  User Experience:          ${uxFeatures.length}`);
  console.log(`  API & Integration:        ${apiFeatures.length}`);
  console.log(`  Data & Storage:           ${dataFeatures.length}`);
  console.log(`  Deployment & Operations:  ${deployFeatures.length}`);
  console.log("");
  console.log("Done.");
}

main().catch(err => {
  console.error("Error generating document:", err);
  process.exit(1);
});
