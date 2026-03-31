const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
  Tab,
  TabStopType,
  ShadingType,
  convertInchesToTwip,
  PageNumber,
  Footer,
  Header,
  ImageRun,
  ExternalHyperlink,
  TableOfContents,
  PageOrientation,
  LevelFormat,
  UnderlineType,
  VerticalAlign,
  TableLayoutType,
} = require("docx");
const fs = require("fs");

// ─── Color Palette ──────────────────────────────────────────────────────────
const C = {
  hivePrimary:   "1A73E8",  // Hive blue
  hiveSecondary: "0D47A1",  // Darker blue
  hiveAccent:    "FF6D00",  // Orange accent
  success:       "0F9D58",  // Green
  warning:       "F4B400",  // Yellow
  danger:        "DB4437",  // Red
  neutral:       "5F6368",  // Gray
  lightGray:     "F1F3F4",
  mediumGray:    "DADCE0",
  darkText:      "202124",
  bodyText:      "3C4043",
  white:         "FFFFFF",
  black:         "000000",
  phaseOne:      "1A73E8",
  phaseTwo:      "0F9D58",
  phaseThree:    "F4B400",
  phaseFour:     "DB4437",
  headerBg:      "1A237E",
  tableBorder:   "B0BEC5",
  tableHeaderBg: "1A73E8",
  tableAltRow:   "E8F0FE",
  done:          "0F9D58",
  inProgress:    "1A73E8",
  planned:       "9E9E9E",
  tagBgDone:     "C8E6C9",
  tagBgProgress: "BBDEFB",
  tagBgPlanned:  "E0E0E0",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function heading(text, level, opts) {
  opts = opts || {};
  var config = {
    text: text,
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : level === HeadingLevel.HEADING_2 ? 320 : 240, after: 120 },
  };
  if (opts.color) {
    config.children = [new TextRun({ text: text, bold: true, color: opts.color, size: level === HeadingLevel.HEADING_1 ? 36 : level === HeadingLevel.HEADING_2 ? 28 : 24, font: "Segoe UI" })];
    delete config.text;
  }
  if (opts.pageBreakBefore) config.pageBreakBefore = true;
  return new Paragraph(config);
}

function body(text, opts) {
  opts = opts || {};
  var config = {
    spacing: { after: opts.afterSpacing || 120, line: 276 },
    children: [
      new TextRun({
        text: text,
        size: 22,
        font: "Segoe UI",
        color: opts.color || C.bodyText,
        bold: opts.bold || false,
        italics: opts.italics || false,
      }),
    ],
  };
  if (opts.indent) config.indent = { left: convertInchesToTwip(opts.indent) };
  return new Paragraph(config);
}

function bodyRuns(runs, opts) {
  opts = opts || {};
  var children = runs.map(function(r) {
    var runOpts = {
      text: r.text,
      size: r.size || 22,
      font: r.font || "Segoe UI",
      color: r.color || C.bodyText,
      bold: r.bold || false,
      italics: r.italics || false,
    };
    if (r.underline) runOpts.underline = {};
    return new TextRun(runOpts);
  });
  var config = {
    spacing: { after: opts.afterSpacing || 120, line: 276 },
    children: children,
  };
  if (opts.indent) config.indent = { left: convertInchesToTwip(opts.indent) };
  if (opts.alignment) config.alignment = opts.alignment;
  return new Paragraph(config);
}

function bullet(text, level, checked) {
  var prefix = checked === true ? "\u2611 " : checked === false ? "\u2610 " : "";
  var color = checked === true ? C.done : checked === false ? C.neutral : C.bodyText;
  return new Paragraph({
    bullet: { level: level },
    spacing: { after: 60, line: 260 },
    children: [
      new TextRun({ text: prefix + text, size: 21, font: "Segoe UI", color: color }),
    ],
  });
}

function spacer(lines) {
  lines = lines || 1;
  return new Paragraph({ spacing: { after: lines * 120 }, children: [] });
}

function mkPageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function colorBadge(text, bgColor, textColor) {
  textColor = textColor || C.white;
  return new TextRun({
    text: " " + text + " ",
    size: 18,
    font: "Segoe UI",
    color: textColor,
    bold: true,
    shading: { type: ShadingType.CLEAR, fill: bgColor },
  });
}

function statusBadgeRun(status) {
  var map = {
    "Done": { bg: C.tagBgDone, fg: C.done },
    "In progress": { bg: C.tagBgProgress, fg: C.inProgress },
    "Planned": { bg: C.tagBgPlanned, fg: C.neutral },
  };
  var s = map[status] || map["Planned"];
  return colorBadge(status, s.bg, s.fg);
}

// ─── Table helpers ──────────────────────────────────────────────────────────

function cellBorders(color) {
  var b = { style: BorderStyle.SINGLE, size: 1, color: color };
  return { top: b, bottom: b, left: b, right: b };
}

function tableHeaderCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: C.tableHeaderBg },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: text, bold: true, size: 20, font: "Segoe UI", color: C.white })],
      }),
    ],
    borders: cellBorders(C.white),
  });
}

function tableCell(text, width, opts) {
  opts = opts || {};
  var children;
  if (Array.isArray(text)) {
    children = text.map(function(t) {
      if (typeof t === "string") {
        return new TextRun({ text: t, size: 20, font: "Segoe UI", color: opts.color || C.bodyText, bold: opts.bold || false });
      }
      return t;
    });
  } else {
    children = [new TextRun({ text: String(text), size: 20, font: "Segoe UI", color: opts.color || C.bodyText, bold: opts.bold || false })];
  }
  var cellOpts = {
    width: { size: width, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        alignment: opts.alignment || AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: children,
      }),
    ],
    borders: cellBorders(C.tableBorder),
  };
  if (opts.shading) cellOpts.shading = { type: ShadingType.CLEAR, fill: opts.shading };
  return new TableCell(cellOpts);
}

function makeTable(headers, rows, colWidths) {
  var headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(function(h, i) { return tableHeaderCell(h, colWidths[i]); }),
  });
  var dataRows = rows.map(function(row, ri) {
    return new TableRow({
      children: row.map(function(cell, ci) {
        var isAlt = ri % 2 === 1;
        if (typeof cell === "object" && cell !== null && cell.runs) {
          return tableCell(cell.runs, colWidths[ci], { shading: isAlt ? C.tableAltRow : undefined });
        }
        return tableCell(cell, colWidths[ci], { shading: isAlt ? C.tableAltRow : undefined });
      }),
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow].concat(dataRows),
    layout: TableLayoutType.FIXED,
  });
}

// Gantt bar helper
function ganttBar(label, startCol, spanCols, totalCols, color) {
  var cells = [];
  cells.push(tableCell(label, 18, { bold: true }));
  for (var i = 0; i < totalCols; i++) {
    var isActive = i >= startCol && i < startCol + spanCols;
    cells.push(new TableCell({
      width: { size: Math.floor(82 / totalCols), type: WidthType.PERCENTAGE },
      shading: isActive ? { type: ShadingType.CLEAR, fill: color } : undefined,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 20, after: 20 },
        children: isActive ? [new TextRun({ text: " ", size: 16, font: "Segoe UI", color: C.white })] : [],
      })],
      borders: cellBorders(C.tableBorder),
    }));
  }
  return new TableRow({ children: cells });
}

function ganttHeaderRow(months) {
  var cells = [tableHeaderCell("", 18)];
  months.forEach(function(m) {
    cells.push(new TableCell({
      width: { size: Math.floor(82 / months.length), type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: C.headerBg },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 20, after: 20 },
        children: [new TextRun({ text: m, size: 14, font: "Segoe UI", color: C.white, bold: true })],
      })],
      borders: cellBorders(C.white),
    }));
  });
  return new TableRow({ tableHeader: true, children: cells });
}

// Deliverables box
function deliverableBox(title, items) {
  var result = [
    new Paragraph({
      spacing: { before: 200, after: 80 },
      shading: { type: ShadingType.CLEAR, fill: C.lightGray },
      border: { left: { style: BorderStyle.SINGLE, size: 6, color: C.hivePrimary, space: 10 } },
      indent: { left: convertInchesToTwip(0.2) },
      children: [new TextRun({ text: "  " + title, bold: true, size: 22, font: "Segoe UI", color: C.hivePrimary })],
    }),
  ];
  items.forEach(function(item) {
    result.push(new Paragraph({
      spacing: { after: 40 },
      indent: { left: convertInchesToTwip(0.5) },
      children: [
        new TextRun({ text: "\u2714 ", size: 20, font: "Segoe UI", color: C.success }),
        new TextRun({ text: item, size: 20, font: "Segoe UI", color: C.bodyText }),
      ],
    }));
  });
  result.push(spacer());
  return result;
}

// Info callout
function callout(text, type) {
  type = type || "info";
  var colors = { info: C.hivePrimary, warning: C.warning, success: C.success, danger: C.danger };
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: C.lightGray },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: colors[type], space: 10 } },
    indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
    children: [new TextRun({ text: "  " + text, size: 20, font: "Segoe UI", color: C.bodyText, italics: true })],
  });
}

// Section divider
function sectionDivider() {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.mediumGray, space: 8 } },
    children: [],
  });
}

// ─── Document Structure ─────────────────────────────────────────────────────

function buildCoverPage() {
  return [
    spacer(4),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "\u2B21", size: 120, font: "Segoe UI", color: C.hivePrimary })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: "HIVE", size: 72, font: "Segoe UI", bold: true, color: C.hivePrimary })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "Product Roadmap", size: 44, font: "Segoe UI Light", color: C.neutral })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "Self-Hosted AI Agent Management Platform", size: 26, font: "Segoe UI", color: C.bodyText, italics: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: '"Proxmox for AI Agents"', size: 24, font: "Segoe UI", color: C.hiveAccent, bold: true })],
    }),
    spacer(3),
    sectionDivider(),
    spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Version 2.0  |  March 2026  |  CONFIDENTIAL", size: 20, font: "Segoe UI", color: C.neutral }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: "Updated with Firecracker, GPU Sidecar & Agent Wizard features", size: 18, font: "Segoe UI", color: C.hivePrimary, italics: true }),
      ],
    }),
    spacer(2),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Document 12 of 12  \u2022  Hive Documentation Suite", size: 18, font: "Segoe UI", color: C.neutral })],
    }),
    mkPageBreak(),
  ];
}

function buildDocumentInfo() {
  return [
    heading("Document Information", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    makeTable(
      ["Field", "Details"],
      [
        ["Document Title", "Hive Product Roadmap"],
        ["Document Number", "12 of 12"],
        ["Version", "2.0 (Updated)"],
        ["Date", "March 20, 2026"],
        ["Author", "Hive Platform Team"],
        ["Status", "Active \u2014 Updated"],
        ["Classification", "Confidential"],
        ["Audience", "Engineering, Product, Leadership"],
      ],
      [35, 65]
    ),
    spacer(2),
    heading("Revision History", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Version", "Date", "Author", "Changes"],
      [
        ["1.0", "March 2026", "Platform Team", "Initial roadmap creation"],
        ["2.0", "March 2026", "Platform Team", "Added Firecracker MicroVM, GPU Sidecar architecture, 9-step Agent Wizard, updated timelines and milestones"],
      ],
      [12, 18, 20, 50]
    ),
    mkPageBreak(),
  ];
}

function buildTableOfContents() {
  var tocItems = [
    "1. Executive Summary",
    "2. Product Vision & Strategy",
    "3. Roadmap Overview & Timeline",
    "4. Phase 1: MVP Foundation (Month 1\u20133)",
    "     Sprint 1\u20132: Core Infrastructure",
    "     Sprint 3\u20134: Agent Management",
    "     Sprint 5\u20136: Dashboard & Monitoring",
    "     Sprint 7\u20138: MVP Polish",
    "     Phase 1 Deliverables",
    "5. Phase 2: Intelligence Layer (Month 4\u20136)",
    "     Sprint 9\u201310: Agent Deployment Wizard",
    "     Sprint 11\u201312: GPU Sidecar Architecture",
    "     Sprint 13\u201314: Firecracker MicroVM",
    "     Sprint 15\u201316: Advanced Monitoring",
    "     Phase 2 Deliverables",
    "6. Phase 3: Enterprise & Scale (Month 7\u201312)",
    "     Multi-Server Cluster",
    "     Kata Containers & gVisor",
    "     Agent Marketplace",
    "     Enterprise Features",
    "     AI-Native Features",
    "     Platform Maturity",
    "7. Phase 4: Ecosystem (Month 12+)",
    "8. Gantt Timeline",
    "9. Key Milestones",
    "10. Technical Debt & Quality Strategy",
    "11. Risk Register",
    "12. Resource Planning",
    "13. Success Metrics & KPIs",
    "14. Dependencies & Assumptions",
    "15. Appendices",
  ];
  return [
    heading("Table of Contents", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
  ].concat(tocItems.map(function(item) {
    var isIndented = item.startsWith("     ");
    var cleaned = item.trim();
    return new Paragraph({
      spacing: { after: isIndented ? 30 : 60 },
      indent: { left: convertInchesToTwip(isIndented ? 0.5 : 0) },
      children: [new TextRun({
        text: cleaned,
        size: isIndented ? 20 : 22,
        font: "Segoe UI",
        color: isIndented ? C.bodyText : C.hivePrimary,
        bold: !isIndented,
      })],
    });
  })).concat([mkPageBreak()]);
}

function buildExecutiveSummary() {
  return [
    heading("1. Executive Summary", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    body("Hive is a self-hosted AI agent management platform\u2014often described as \"Proxmox for AI agents.\"\u00A0It provides infrastructure teams and AI engineers with a unified control plane for deploying, monitoring, and orchestrating autonomous AI agents across heterogeneous compute environments."),
    spacer(),
    body("This roadmap document (v2.0) represents a significant update to the original plan, incorporating three major feature additions that respond to early technical exploration and community feedback:"),
    spacer(),
    bodyRuns([
      { text: "Firecracker MicroVM Runtime", bold: true, color: C.hivePrimary },
      { text: " \u2014 Sub-second boot times with hardware-level isolation using AWS Firecracker. Agents run inside lightweight virtual machines rather than containers, providing defense-in-depth security while maintaining near-container performance." },
    ], { indent: 0.3 }),
    spacer(),
    bodyRuns([
      { text: "GPU Sidecar Architecture", bold: true, color: C.success },
      { text: " \u2014 A shared inference layer that decouples GPU access from individual agents. Rather than binding GPUs directly to containers, Hive runs inference services (vLLM, Ollama) as sidecars and routes agent requests through an internal load balancer with VRAM budget management." },
    ], { indent: 0.3 }),
    spacer(),
    bodyRuns([
      { text: "9-Step Agent Deployment Wizard", bold: true, color: C.hiveAccent },
      { text: " \u2014 A guided deployment experience that walks users through runtime selection, resource allocation, model configuration, I/O setup, agent relationships, and review. Supports draft saving, templates, and one-click deployment." },
    ], { indent: 0.3 }),
    spacer(),
    body("The roadmap is organized into four phases spanning approximately 15 months, from project inception in March 2026 through ecosystem maturity in early 2027. The plan follows an iterative, sprint-based methodology with two-week sprint cadence."),
    spacer(),
    callout("This document supersedes the v1.0 roadmap. All timeline estimates are subject to revision based on team velocity and technical discovery.", "info"),
    spacer(),

    heading("Key Strategic Shifts in v2.0", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Area", "v1.0 Approach", "v2.0 Updated Approach", "Rationale"],
      [
        ["Agent Isolation", "Docker containers only", "Docker + Firecracker MicroVMs", "Hardware-level isolation for untrusted agent code"],
        ["GPU Access", "Direct GPU passthrough", "Shared GPU Sidecar with inference router", "Better GPU utilization, multi-tenant safety"],
        ["Deployment UX", "Simple form-based deploy", "9-step guided wizard with templates", "Reduced deployment errors, better discoverability"],
        ["Runtime Model", "Single runtime", "Pluggable runtime abstraction layer", "Future-proof for Kata, gVisor, and other runtimes"],
        ["Inference", "External API only", "Built-in inference (vLLM + Ollama)", "Reduced latency, on-prem model hosting"],
      ],
      [16, 20, 26, 38]
    ),
    mkPageBreak(),
  ];
}

function buildVisionStrategy() {
  return [
    heading("2. Product Vision & Strategy", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    heading("Vision Statement", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("To become the definitive open-source platform for self-hosted AI agent infrastructure, enabling any organization to deploy, monitor, and orchestrate autonomous AI agents with the same ease as managing virtual machines in Proxmox or containers in Kubernetes."),
    spacer(),

    heading("Strategic Pillars", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    spacer(),

    bodyRuns([{ text: "1. Self-Hosted First", bold: true, color: C.hivePrimary }]),
    body("All data, models, and agent workloads remain on the user's infrastructure. Zero telemetry, zero cloud dependencies. Complete data sovereignty.", { indent: 0.3 }),
    spacer(),

    bodyRuns([{ text: "2. Runtime Flexibility", bold: true, color: C.hivePrimary }]),
    body("Support multiple isolation backends\u2014Docker for development speed, Firecracker for production security, and future runtimes (Kata, gVisor) for specialized use cases. The runtime abstraction layer ensures agents are portable.", { indent: 0.3 }),
    spacer(),

    bodyRuns([{ text: "3. GPU Intelligence", bold: true, color: C.hivePrimary }]),
    body("The GPU Sidecar architecture transforms GPU infrastructure from a per-agent resource to a shared service. VRAM budgets, request queuing, and continuous batching maximize hardware utilization across all agents.", { indent: 0.3 }),
    spacer(),

    bodyRuns([{ text: "4. Operational Excellence", bold: true, color: C.hivePrimary }]),
    body("Comprehensive monitoring, alerting, log aggregation, and health matrices provide full observability into agent behavior. The platform should surface problems before users notice them.", { indent: 0.3 }),
    spacer(),

    bodyRuns([{ text: "5. Developer Experience", bold: true, color: C.hivePrimary }]),
    body("The 9-step Agent Wizard, template marketplace, and CLI tools make it easy for both novice and expert users to deploy agents. Complexity is available but never forced.", { indent: 0.3 }),
    spacer(),

    heading("Target Architecture", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("The following diagram illustrates the high-level architecture that the roadmap aims to deliver:"),
    spacer(),
    makeTable(
      ["Layer", "Components", "Phase"],
      [
        ["Presentation", "Next.js 16 Dashboard, Agent Wizard, CLI", "1\u20132"],
        ["API", "Next.js API Routes, SSE, WebSocket", "1"],
        ["Business Logic", "Agent Manager, Scheduler, Alert Engine", "1\u20133"],
        ["Runtime Abstraction", "Docker Driver, Firecracker Driver, Future Drivers", "1\u20132"],
        ["Inference Layer", "vLLM, Ollama, Inference Router, VRAM Manager", "2"],
        ["Communication", "vsock (Firecracker), Docker API, HTTP", "1\u20132"],
        ["Data", "PostgreSQL (Drizzle ORM), Redis (caching/queues)", "1"],
        ["Infrastructure", "Traefik (reverse proxy), TLS, Networking", "1"],
      ],
      [22, 50, 28]
    ),
    mkPageBreak(),
  ];
}

function buildRoadmapOverview() {
  return [
    heading("3. Roadmap Overview & Timeline", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    body("The Hive roadmap spans four major phases across 15+ months. Each phase builds on the previous, with clear deliverables and success criteria."),
    spacer(),

    heading("Phase Summary", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Phase", "Timeframe", "Theme", "Key Deliverables"],
      [
        [{ runs: [colorBadge("Phase 1", C.phaseOne)] }, "Month 1\u20133", "MVP Foundation", "Docker runtime, Dashboard, Auth, RBAC, Secrets"],
        [{ runs: [colorBadge("Phase 2", C.phaseTwo)] }, "Month 4\u20136", "Intelligence Layer", "Agent Wizard, GPU Sidecar, Firecracker, Advanced Monitoring"],
        [{ runs: [colorBadge("Phase 3", C.phaseThree)] }, "Month 7\u201312", "Enterprise & Scale", "Multi-server, Marketplace, SSO, Fine-tuning, Kata/gVisor"],
        [{ runs: [colorBadge("Phase 4", C.phaseFour)] }, "Month 12+", "Ecosystem", "Multi-cloud, Visual Pipeline, White-label, AMD/Metal GPU"],
      ],
      [15, 16, 22, 47]
    ),
    spacer(2),

    heading("Sprint Cadence", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("All work is organized into 2-week sprints. Phase 1 and 2 contain 8 sprints each (16 sprints total). Sprint boundaries are flexible and may shift based on velocity."),
    spacer(),
    makeTable(
      ["Sprint", "Phase", "Focus Area", "Duration"],
      [
        ["1\u20132", "Phase 1", "Core Infrastructure", "4 weeks"],
        ["3\u20134", "Phase 1", "Agent Management", "4 weeks"],
        ["5\u20136", "Phase 1", "Dashboard & Monitoring", "4 weeks"],
        ["7\u20138", "Phase 1", "MVP Polish & RBAC", "4 weeks"],
        ["9\u201310", "Phase 2", "Agent Deployment Wizard", "4 weeks"],
        ["11\u201312", "Phase 2", "GPU Sidecar Architecture", "4 weeks"],
        ["13\u201314", "Phase 2", "Firecracker MicroVM", "4 weeks"],
        ["15\u201316", "Phase 2", "Advanced Monitoring", "4 weeks"],
      ],
      [15, 18, 42, 25]
    ),
    mkPageBreak(),
  ];
}

function buildPhaseOne() {
  return [
    heading("4. Phase 1: MVP Foundation (Month 1\u20133)", HeadingLevel.HEADING_1, { color: C.phaseOne }),
    spacer(),
    bodyRuns([
      { text: "Goal: ", bold: true, color: C.phaseOne },
      { text: "Deliver a working self-hosted platform with Docker-based agent deployment, real-time monitoring dashboard, user authentication, and role-based access control." },
    ]),
    spacer(),
    callout("Phase 1 establishes the foundation that all subsequent phases build upon. Every architectural decision here must account for future Firecracker and GPU Sidecar integration.", "info"),
    spacer(),

    // Sprint 1-2
    heading("Sprint 1\u20132: Core Infrastructure", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("Establish the foundational tech stack, development environment, database schema, and authentication system. This sprint sets up the monorepo structure, CI/CD pipeline, and core development tooling."),
    spacer(),
    bullet("Project scaffolding (Next.js 16, TypeScript, Tailwind v4)", 0, true),
    bullet("Database schema (Drizzle + PostgreSQL)", 0, true),
    bullet("Authentication (NextAuth v5, login, register)", 0, true),
    bullet("Docker Compose setup (PostgreSQL, Redis, Traefik)", 0, true),
    bullet("Docker runtime integration (Dockerode)", 0, false),
    bullet("Basic agent CRUD API", 0, false),
    spacer(),
    body("Technical Details:", { bold: true }),
    bullet("Next.js 16 App Router with Server Components for optimal SSR/streaming", 1),
    bullet("Drizzle ORM for type-safe database access with zero-cost abstractions", 1),
    bullet("NextAuth v5 with credential provider (email/password) and session management", 1),
    bullet("Traefik reverse proxy with automatic TLS certificate management", 1),
    bullet("Redis for session storage, caching, and future pub/sub messaging", 1),
    spacer(),

    // Sprint 3-4
    heading("Sprint 3\u20134: Agent Management", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("Build the core agent management interface and lifecycle operations. This is the primary user-facing functionality that defines the Hive experience."),
    spacer(),
    bullet("Agent list view (card grid with status badges)", 0, false),
    bullet("Agent detail view (overview, logs, settings tabs)", 0, false),
    bullet("Agent lifecycle (start, stop, restart, delete)", 0, false),
    bullet("Real-time log streaming (SSE)", 0, false),
    bullet("Basic agent deployment (simple form)", 0, false),
    bullet("Agent grouping", 0, false),
    spacer(),
    body("UX Considerations:", { bold: true }),
    bullet("Status badges use consistent color coding: green (running), yellow (starting), red (error), gray (stopped)", 1),
    bullet("Log streaming uses Server-Sent Events for efficient one-way real-time data", 1),
    bullet("Agent cards show key metrics at a glance: status, uptime, CPU, memory", 1),
    bullet("The simple deployment form will later be superseded by the 9-step wizard in Phase 2", 1),
    spacer(),

    // Sprint 5-6
    heading("Sprint 5\u20136: Dashboard & Monitoring", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("Create the main dashboard with system health indicators, agent status overview, and basic per-agent resource metrics."),
    spacer(),
    bullet("Dashboard with stat cards (agents count, status breakdown)", 0, false),
    bullet("System health panel (Docker, DB, Redis status)", 0, false),
    bullet("Basic CPU/Memory metrics per agent", 0, false),
    bullet("Audit log (user actions tracking)", 0, false),
    bullet("Settings page (instance config, Docker config)", 0, false),
    spacer(),
    body("Dashboard Layout:", { bold: true }),
    makeTable(
      ["Section", "Content", "Update Frequency"],
      [
        ["Top Stats Bar", "Total agents, Running, Stopped, Errored", "5 seconds"],
        ["System Health", "Docker daemon, PostgreSQL, Redis connectivity", "10 seconds"],
        ["Agent Grid", "Card-based view with status, metrics, quick actions", "5 seconds"],
        ["Activity Feed", "Recent deployments, errors, user actions", "Real-time (SSE)"],
        ["Resource Overview", "Aggregate CPU, Memory, Disk usage", "15 seconds"],
      ],
      [22, 50, 28]
    ),
    spacer(),

    // Sprint 7-8
    heading("Sprint 7\u20138: MVP Polish", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("Finalize MVP with security features, error handling, responsive design, and documentation."),
    spacer(),
    bullet("RBAC implementation (Admin/Operator/Viewer)", 0, false),
    bullet("Secrets management (encrypted env vars)", 0, false),
    bullet("Error handling & empty states", 0, false),
    bullet("Responsive layout", 0, false),
    bullet("Basic onboarding flow", 0, false),
    bullet("Documentation & README", 0, false),
    spacer(),
    body("RBAC Permission Matrix:", { bold: true }),
    makeTable(
      ["Action", "Admin", "Operator", "Viewer"],
      [
        ["View dashboard", "\u2713", "\u2713", "\u2713"],
        ["View agents & logs", "\u2713", "\u2713", "\u2713"],
        ["Deploy/manage agents", "\u2713", "\u2713", "\u2717"],
        ["Manage secrets", "\u2713", "\u2713", "\u2717"],
        ["User management", "\u2713", "\u2717", "\u2717"],
        ["System settings", "\u2713", "\u2717", "\u2717"],
        ["RBAC configuration", "\u2713", "\u2717", "\u2717"],
      ],
      [34, 22, 22, 22]
    ),
    spacer(),

    // Deliverables
  ].concat(deliverableBox("Phase 1 Deliverables", [
    "Working self-hosted platform with Docker Compose deployment",
    "Docker-based agent deployment with lifecycle management",
    "Dashboard with real-time monitoring and system health",
    "User authentication with NextAuth v5 (email/password)",
    "Role-based access control (Admin, Operator, Viewer)",
    "Encrypted secrets management for agent environment variables",
    "Responsive UI with error handling and empty states",
    "Audit logging for compliance and debugging",
  ])).concat([mkPageBreak()]);
}

function buildPhaseTwo() {
  var result = [
    heading("5. Phase 2: Intelligence Layer (Month 4\u20136)", HeadingLevel.HEADING_1, { color: C.phaseTwo }),
    spacer(),
    bodyRuns([
      { text: "Goal: ", bold: true, color: C.phaseTwo },
      { text: "Introduce GPU infrastructure with shared inference, Firecracker MicroVM support for secure agent isolation, a comprehensive 9-step deployment wizard, and advanced monitoring capabilities." },
    ]),
    spacer(),
    callout("Phase 2 is the largest update in v2.0 of this roadmap, introducing three entirely new subsystems: the Agent Wizard, GPU Sidecar, and Firecracker runtime.", "warning"),
    spacer(),

    // ─── Sprint 9-10: Agent Wizard ──────────────────────────────
    heading("Sprint 9\u201310: Agent Deployment Wizard", HeadingLevel.HEADING_2, { color: C.hiveAccent }),
    spacer(),
    body("The Agent Deployment Wizard replaces the simple deployment form from Phase 1 with a comprehensive, guided 9-step flow. It is designed to handle all deployment complexity while remaining approachable for first-time users."),
    spacer(),

    heading("Wizard Architecture", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("The wizard is implemented as a multi-step form with client-side state management, draft persistence, and real-time validation. Each step validates independently and can be revisited non-linearly."),
    spacer(),

    bullet("Wizard UI framework (9-step flow)", 0, false),
    bullet("Step 1: Runtime selection (Docker initially)", 0, false),
    bullet("Step 2: Template/image selection with search", 0, false),
    bullet("Step 3: Resource allocation with host detection", 0, false),
    bullet("Step 4: Model selection (Ollama/HuggingFace)", 0, false),
    bullet("Step 5: Inputs configuration (API, volumes, queues, cron)", 0, false),
    bullet("Step 6: Outputs configuration (webhooks, files, queues)", 0, false),
    bullet("Step 7: Agent relationships (parent-child, pipeline)", 0, false),
    bullet("Step 8: Environment & config", 0, false),
    bullet("Step 9: Review & deploy", 0, false),
    bullet("Draft saving & resume", 0, false),
    bullet("Agent templates (pre-built + custom)", 0, false),
    spacer(),

    heading("Wizard Step Detail", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    makeTable(
      ["Step", "Name", "Purpose", "Key Features"],
      [
        ["1", "Runtime", "Choose execution environment", "Docker (default), Firecracker (Phase 2). Visual comparison card with pros/cons."],
        ["2", "Template / Image", "Select base image or template", "Search by name/tag, community templates, custom Dockerfile, OCI registry support"],
        ["3", "Resources", "Allocate CPU, memory, disk", "Host resource detection, slider controls, preset sizes (S/M/L/XL), GPU access mode"],
        ["4", "Model", "Configure AI model", "Ollama model browser, HuggingFace search, quantization options, VRAM estimation"],
        ["5", "Inputs", "Define data sources", "API endpoints, volume mounts, message queue subscriptions, cron schedules"],
        ["6", "Outputs", "Define data sinks", "Webhook endpoints, file outputs, queue publishing, notification channels"],
        ["7", "Relationships", "Set agent topology", "Parent-child hierarchy, pipeline chains, dependency graphs, communication channels"],
        ["8", "Environment", "Configure runtime env", "Environment variables, secrets references, config files, feature flags"],
        ["9", "Review", "Validate and deploy", "Full configuration summary, dry-run validation, estimated costs, one-click deploy"],
      ],
      [8, 14, 28, 50]
    ),
    spacer(),

    heading("Draft & Template System", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("Users can save wizard progress as drafts and resume later. Completed configurations can be saved as reusable templates. The template system supports:"),
    bullet("Auto-save drafts every 30 seconds during wizard flow", 0),
    bullet("Named drafts with description and tags", 0),
    bullet("Template inheritance: extend a template with overrides", 0),
    bullet("Template parameters: configurable fields exposed to users", 0),
    bullet("Pre-built templates for common agent types (chatbot, RAG, code analysis, data pipeline)", 0),
    bullet("Custom templates created from successful deployments", 0),
    spacer(),

    // ─── Sprint 11-12: GPU Sidecar ──────────────────────────────
    heading("Sprint 11\u201312: GPU Sidecar Architecture", HeadingLevel.HEADING_2, { color: C.success, pageBreakBefore: true }),
    spacer(),
    body("The GPU Sidecar architecture is a fundamental design decision that separates Hive from traditional container orchestrators. Instead of passing GPU devices directly into agent containers, Hive runs inference services as shared sidecars and routes agent requests through an internal load balancer."),
    spacer(),

    heading("Architecture Overview", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("The GPU Sidecar system consists of four primary components:"),
    spacer(),
    makeTable(
      ["Component", "Role", "Technology"],
      [
        ["Inference Services", "Run AI models, serve predictions", "vLLM (high-throughput), Ollama (ease-of-use)"],
        ["Inference Router", "Load balance requests across services", "Custom Go/Rust service, round-robin + least-connections"],
        ["VRAM Manager", "Track and budget GPU memory", "Custom service, integrates with nvidia-smi / ROCm"],
        ["API Proxy", "OpenAI-compatible endpoint for agents", "Next.js API route, transparent to agent code"],
      ],
      [22, 35, 43]
    ),
    spacer(),

    bullet("Inference service integration (vLLM + Ollama)", 0, false),
    bullet("Inference Router (internal load balancer)", 0, false),
    bullet("OpenAI-compatible API proxy", 0, false),
    bullet("Model management (pull, load, unload)", 0, false),
    bullet("VRAM budget management", 0, false),
    bullet("GPU monitoring dashboard (VRAM, utilization, temperature)", 0, false),
    bullet("Request queuing with priority system", 0, false),
    bullet("Continuous batching configuration", 0, false),
    bullet("GPU access modes (Shared/Dedicated/None)", 0, false),
    spacer(),

    heading("GPU Access Modes", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("Agents can request one of three GPU access modes during deployment (Wizard Step 3):"),
    spacer(),
    makeTable(
      ["Mode", "Description", "Use Case", "VRAM Impact"],
      [
        ["Shared", "Agent uses shared inference sidecar via API proxy", "Most agents, chatbots, RAG", "No direct VRAM allocation"],
        ["Dedicated", "Agent gets exclusive GPU device passthrough", "Fine-tuning, heavy batch inference", "Full GPU VRAM reserved"],
        ["None", "Agent has no GPU access", "Data processing, web scraping", "Zero GPU impact"],
      ],
      [14, 32, 28, 26]
    ),
    spacer(),

    heading("VRAM Budget Management", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("The VRAM Manager tracks model memory usage and prevents over-subscription. Key behaviors:"),
    bullet("Automatic VRAM estimation based on model size and quantization level", 0),
    bullet("Hard limits prevent loading models that would exceed available VRAM", 0),
    bullet("Soft limits trigger warnings when VRAM utilization exceeds 85%", 0),
    bullet("Priority-based eviction: low-priority models unloaded when high-priority requests arrive", 0),
    bullet("Model sharing: multiple agents can reference the same loaded model without duplicating VRAM", 0),
    spacer(),

    heading("Request Queuing & Batching", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("When GPU inference capacity is saturated, incoming requests enter a priority queue:"),
    makeTable(
      ["Priority Level", "Queue Behavior", "Timeout", "Example Use"],
      [
        ["Critical (P0)", "Immediate processing, preempts batch", "5s", "Real-time user-facing agents"],
        ["High (P1)", "Next available slot", "30s", "Interactive agents"],
        ["Normal (P2)", "Standard FIFO queue", "120s", "Background processing"],
        ["Low (P3)", "Best-effort, may be dropped", "300s", "Batch jobs, non-urgent tasks"],
      ],
      [18, 34, 14, 34]
    ),
    spacer(),

    // ─── Sprint 13-14: Firecracker ──────────────────────────────
    heading("Sprint 13\u201314: Firecracker MicroVM", HeadingLevel.HEADING_2, { color: C.danger, pageBreakBefore: true }),
    spacer(),
    body("Firecracker is a lightweight virtual machine manager (VMM) created by AWS for serverless workloads (Lambda, Fargate). Hive integrates Firecracker as an alternative runtime to Docker, providing hardware-level isolation with sub-second boot times."),
    spacer(),

    heading("Why Firecracker?", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("AI agents often execute untrusted code (LLM-generated scripts, user-provided tools, third-party plugins). Docker containers share the host kernel, creating potential attack surfaces. Firecracker microVMs provide:"),
    spacer(),
    makeTable(
      ["Feature", "Docker Container", "Firecracker MicroVM"],
      [
        ["Isolation Level", "Process-level (namespaces, cgroups)", "Hardware-level (KVM virtualization)"],
        ["Boot Time", "~500ms", "~125ms"],
        ["Memory Overhead", "~5MB", "~5MB (minimal VMM)"],
        ["Kernel", "Shared with host", "Dedicated guest kernel"],
        ["Attack Surface", "Host kernel exposed", "Minimal VMM, reduced syscalls"],
        ["Escape Risk", "Container escape possible", "VM escape extremely difficult"],
        ["GPU Access", "Direct device passthrough", "Via vsock proxy to sidecar"],
        ["Networking", "Docker bridge/overlay", "TAP device + iptables"],
      ],
      [22, 39, 39]
    ),
    spacer(),

    bullet("Firecracker runtime implementation", 0, false),
    bullet("KVM detection and setup", 0, false),
    bullet("MicroVM lifecycle management", 0, false),
    bullet("vsock communication layer", 0, false),
    bullet("vsock proxy for GPU inference access", 0, false),
    bullet("Runtime abstraction layer (common interface)", 0, false),
    bullet("Runtime selection in wizard (Step 1 update)", 0, false),
    bullet("Performance benchmarking (Docker vs Firecracker)", 0, false),
    spacer(),

    heading("Runtime Abstraction Layer", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("To support multiple runtimes cleanly, Hive introduces a Runtime Abstraction Layer (RAL) that provides a common interface:"),
    spacer(),
    makeTable(
      ["Operation", "Docker Implementation", "Firecracker Implementation"],
      [
        ["create(config)", "docker.createContainer()", "firecracker.createVM()"],
        ["start(id)", "container.start()", "vm.start() via Firecracker API"],
        ["stop(id)", "container.stop()", "vm.shutdown() + SendCtrlAltDel"],
        ["remove(id)", "container.remove()", "vm.destroy() + cleanup rootfs"],
        ["logs(id)", "container.logs() stream", "vsock log channel"],
        ["exec(id, cmd)", "container.exec()", "vsock command channel"],
        ["stats(id)", "container.stats() stream", "vsock metrics channel"],
        ["status(id)", "container.inspect().State", "Firecracker API /machine-config"],
      ],
      [22, 39, 39]
    ),
    spacer(),

    heading("vsock Communication", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("Firecracker microVMs use vsock (virtual socket) for host-guest communication instead of network protocols. Hive implements several vsock channels:"),
    spacer(),
    makeTable(
      ["Channel (CID:Port)", "Purpose", "Protocol"],
      [
        ["guest:5000", "Agent control plane (start, stop, health)", "JSON-RPC over vsock"],
        ["guest:5001", "Log streaming (stdout, stderr)", "Line-delimited JSON"],
        ["guest:5002", "Metrics collection (CPU, memory, disk)", "Prometheus exposition format"],
        ["guest:5003", "GPU inference proxy (forwarded to sidecar)", "HTTP-over-vsock (OpenAI API)"],
        ["guest:5004", "File transfer (rootfs updates, artifacts)", "Custom binary protocol"],
      ],
      [20, 40, 40]
    ),
    spacer(),

    heading("KVM Requirements", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("Firecracker requires KVM (Kernel-based Virtual Machine) support. Hive will detect and guide setup:"),
    bullet("Automatic KVM detection on startup (/dev/kvm check)", 0),
    bullet("BIOS/UEFI virtualization guidance if KVM is unavailable", 0),
    bullet("Graceful fallback to Docker-only mode", 0),
    bullet("Support for Intel VT-x and AMD-V processors", 0),
    bullet("Nested virtualization support for cloud deployments", 0),
    spacer(),

    // ─── Sprint 15-16: Advanced Monitoring ──────────────────────
    heading("Sprint 15\u201316: Advanced Monitoring", HeadingLevel.HEADING_2, { color: C.hivePrimary, pageBreakBefore: true }),
    spacer(),
    body("Building on the basic monitoring from Phase 1, this sprint adds time-series metrics, log aggregation, alerting, and GPU-specific monitoring."),
    spacer(),

    bullet("Advanced metrics charts (CPU, Memory, Network, Disk over time)", 0, false),
    bullet("Log aggregation (unified view across agents)", 0, false),
    bullet("Alert rules engine", 0, false),
    bullet("Webhook notifications for alerts", 0, false),
    bullet("Agent health matrix", 0, false),
    bullet("Resource comparison view", 0, false),
    bullet("Inference queue monitoring", 0, false),
    bullet("Model performance metrics (tokens/sec, latency)", 0, false),
    spacer(),

    heading("Alert Rules Engine", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("The alert engine supports configurable rules with multiple notification channels:"),
    spacer(),
    makeTable(
      ["Alert Type", "Default Threshold", "Severity", "Notification"],
      [
        ["CPU > threshold", "90% for 5 minutes", "Warning", "Dashboard + Webhook"],
        ["Memory > threshold", "85% for 3 minutes", "Warning", "Dashboard + Webhook"],
        ["Agent crash", "Any restart within 60s", "Critical", "Dashboard + Webhook + Email"],
        ["Disk space low", "< 10% free", "Critical", "Dashboard + Webhook + Email"],
        ["GPU VRAM > threshold", "95% utilization", "Warning", "Dashboard + Webhook"],
        ["Inference latency", "> 5s p99 latency", "Warning", "Dashboard"],
        ["Agent unresponsive", "No heartbeat for 30s", "Critical", "Dashboard + Webhook"],
        ["Queue depth", "> 100 pending requests", "Warning", "Dashboard"],
      ],
      [22, 26, 16, 36]
    ),
    spacer(),

    heading("GPU Monitoring Dashboard", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("A dedicated GPU monitoring view shows real-time GPU health and inference performance:"),
    bullet("Per-GPU VRAM usage (used/total with bar chart)", 0),
    bullet("GPU utilization percentage with historical trend", 0),
    bullet("Temperature monitoring with thermal throttle warnings", 0),
    bullet("Active models list with VRAM allocation per model", 0),
    bullet("Inference throughput (requests/second, tokens/second)", 0),
    bullet("Queue depth and wait time distribution", 0),
    bullet("Per-agent GPU usage breakdown", 0),
    spacer(),
  ];

  // Phase 2 Deliverables
  result = result.concat(deliverableBox("Phase 2 Deliverables", [
    "9-step agent deployment wizard with draft saving and resume",
    "Agent template system (pre-built and custom templates)",
    "GPU Sidecar architecture with vLLM + Ollama inference services",
    "Inference Router with request queuing and priority system",
    "VRAM budget management and GPU monitoring dashboard",
    "Firecracker MicroVM runtime with sub-second boot times",
    "vsock communication layer for Firecracker agents",
    "Runtime abstraction layer (Docker + Firecracker)",
    "Advanced monitoring with time-series metrics and alert rules",
    "Log aggregation across all agents and runtimes",
    "Agent orchestration (parent-child hierarchies, pipelines)",
  ]));
  result.push(mkPageBreak());
  return result;
}

function buildPhaseThree() {
  var result = [
    heading("6. Phase 3: Enterprise & Scale (Month 7\u201312)", HeadingLevel.HEADING_1, { color: C.phaseThree }),
    spacer(),
    bodyRuns([
      { text: "Goal: ", bold: true, color: C.phaseThree },
      { text: "Prepare Hive for production enterprise deployments with multi-server clustering, an agent marketplace, enterprise authentication, and AI-native features like model fine-tuning and A/B testing." },
    ]),
    spacer(),

    // Multi-Server Cluster
    heading("Multi-Server Cluster", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Extend Hive from single-server to multi-server deployments. Users can add remote servers to their Hive cluster and manage agents across them from a single dashboard."),
    spacer(),
    bullet("Add remote servers to Hive cluster", 0, false),
    bullet("Agent placement (manual & auto)", 0, false),
    bullet("Cross-server networking", 0, false),
    bullet("Centralized monitoring across servers", 0, false),
    bullet("Agent migration between servers", 0, false),
    spacer(),
    body("Cluster Architecture:", { bold: true }),
    makeTable(
      ["Component", "Description"],
      [
        ["Control Plane", "Primary Hive server, runs dashboard, API, scheduler"],
        ["Worker Nodes", "Remote servers running agent workloads"],
        ["Agent Placement", "Scheduler selects node based on resources, GPU, affinity rules"],
        ["Networking", "WireGuard mesh VPN for secure inter-node communication"],
        ["State Sync", "PostgreSQL replication + Redis Cluster for shared state"],
      ],
      [25, 75]
    ),
    spacer(),

    // Kata & gVisor
    heading("Kata Containers & gVisor", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Expand the runtime abstraction layer with additional isolation backends:"),
    spacer(),
    bullet("Kata Containers runtime (GPU + VM isolation)", 0, false),
    bullet("gVisor runtime option", 0, false),
    bullet("Runtime benchmark comparisons", 0, false),
    spacer(),
    makeTable(
      ["Runtime", "Isolation", "GPU Support", "Performance", "Best For"],
      [
        ["Docker", "Process (namespaces)", "Direct passthrough", "Fastest", "Development, trusted agents"],
        ["Firecracker", "Hardware (KVM)", "Via vsock proxy", "Near-native", "Untrusted code, production"],
        ["Kata", "Hardware (KVM)", "GPU passthrough + VM", "Good", "GPU + VM isolation needed"],
        ["gVisor", "User-space kernel", "Limited", "Moderate", "Syscall filtering, sandboxing"],
      ],
      [14, 20, 20, 16, 30]
    ),
    spacer(),

    // Agent Marketplace
    heading("Agent Marketplace", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("A curated marketplace for agent templates, enabling one-click deployment of community-contributed agent configurations."),
    spacer(),
    bullet("Template marketplace UI", 0, false),
    bullet("Community-contributed templates", 0, false),
    bullet("Template ratings & reviews", 0, false),
    bullet("One-click deploy from marketplace", 0, false),
    bullet("Template versioning", 0, false),
    spacer(),
    body("Marketplace Categories:", { bold: true }),
    makeTable(
      ["Category", "Examples", "Expected Count"],
      [
        ["Chatbots & Assistants", "Customer support bot, internal Q&A, Slack bot", "15\u201320"],
        ["RAG Pipelines", "Document Q&A, knowledge base, code search", "10\u201315"],
        ["Code Agents", "Code review, test generation, documentation", "8\u201312"],
        ["Data Processing", "ETL pipelines, web scrapers, data validators", "10\u201315"],
        ["DevOps Agents", "Log analysis, incident response, monitoring", "5\u201310"],
        ["Research Agents", "Paper summarization, literature review, fact-checking", "5\u20138"],
      ],
      [25, 45, 30]
    ),
    spacer(),

    // Enterprise Features
    heading("Enterprise Features", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Security and compliance features required for enterprise adoption:"),
    spacer(),
    bullet("SSO/LDAP authentication", 0, false),
    bullet("2FA (TOTP)", 0, false),
    bullet("Advanced RBAC (custom roles, team-based)", 0, false),
    bullet("IP allowlisting", 0, false),
    bullet("Compliance reporting", 0, false),
    bullet("SLA monitoring", 0, false),
    spacer(),
    body("Enterprise Authentication:", { bold: true }),
    makeTable(
      ["Method", "Standard", "Integration"],
      [
        ["SAML 2.0", "SSO", "Okta, Azure AD, OneLogin"],
        ["OpenID Connect", "SSO", "Google Workspace, Auth0, Keycloak"],
        ["LDAP/AD", "Directory", "Active Directory, OpenLDAP"],
        ["TOTP", "2FA", "Google Authenticator, Authy"],
        ["WebAuthn", "2FA (future)", "YubiKey, Windows Hello, Touch ID"],
      ],
      [25, 20, 55]
    ),
    spacer(),

    // AI-Native Features
    heading("AI-Native Features", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Features that leverage the GPU Sidecar infrastructure for advanced AI workflows:"),
    spacer(),
    bullet("Model fine-tuning UI (LoRA, QLoRA)", 0, false),
    bullet("A/B testing between models", 0, false),
    bullet("Inference caching (semantic cache)", 0, false),
    bullet("Prompt management", 0, false),
    bullet("Agent performance benchmarking", 0, false),
    bullet("Auto-scaling (spawn more instances on demand)", 0, false),
    spacer(),

    heading("Fine-Tuning Pipeline", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    body("The fine-tuning UI provides a managed experience for adapting base models:"),
    makeTable(
      ["Step", "Feature", "Details"],
      [
        ["1", "Dataset Upload", "CSV, JSONL, or Parquet format; automatic validation and splitting"],
        ["2", "Base Model Selection", "Choose from loaded models in the inference sidecar"],
        ["3", "Training Config", "LoRA rank, learning rate, epochs, batch size presets"],
        ["4", "Training Execution", "GPU-accelerated training with real-time loss monitoring"],
        ["5", "Evaluation", "Automatic eval on holdout set, comparison with base model"],
        ["6", "Deployment", "One-click merge and deploy as new model variant"],
      ],
      [8, 22, 70]
    ),
    spacer(),

    // Platform Maturity
    heading("Platform Maturity", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Features that mature Hive into a complete platform:"),
    spacer(),
    bullet("PWA support", 0, false),
    bullet("Mobile app consideration (React Native)", 0, false),
    bullet("Plugin system for extensions", 0, false),
    bullet("Terraform/Pulumi provider", 0, false),
    bullet("CLI tool for automation", 0, false),
    bullet("Comprehensive API documentation (OpenAPI)", 0, false),
    bullet("Backup & disaster recovery", 0, false),
    bullet("Internationalization (i18n)", 0, false),
    spacer(),
  ];

  result = result.concat(deliverableBox("Phase 3 Deliverables", [
    "Multi-server cluster with agent placement and migration",
    "Kata Containers and gVisor runtime support",
    "Agent marketplace with community templates and ratings",
    "Enterprise SSO (SAML, OIDC), LDAP, and 2FA",
    "Advanced RBAC with custom roles and team-based permissions",
    "Model fine-tuning UI (LoRA/QLoRA) with evaluation pipeline",
    "A/B testing, inference caching, and prompt management",
    "Auto-scaling for agent instances",
    "CLI tool, Terraform provider, and OpenAPI documentation",
    "Backup/restore and disaster recovery",
  ]));
  result.push(mkPageBreak());
  return result;
}

function buildPhaseFour() {
  var result = [
    heading("7. Phase 4: Ecosystem (Month 12+)", HeadingLevel.HEADING_1, { color: C.phaseFour }),
    spacer(),
    bodyRuns([
      { text: "Goal: ", bold: true, color: C.phaseFour },
      { text: "Build a thriving platform ecosystem with multi-cloud capabilities, visual agent orchestration, real-time collaboration, and support for diverse GPU architectures." },
    ]),
    spacer(),
    body("Phase 4 represents the long-term vision for Hive, expanding beyond single-organization deployments into a full ecosystem platform."),
    spacer(),

    bullet("Multi-cloud GPU burst (overflow to cloud)", 0, false),
    bullet("AMD ROCm GPU support", 0, false),
    bullet("Apple Metal support (Mac mini clusters)", 0, false),
    bullet("Agent-to-agent marketplace (agents hire agents)", 0, false),
    bullet("Visual pipeline builder (drag-and-drop)", 0, false),
    bullet("Real-time collaboration", 0, false),
    bullet("Billing/metering for managed hosting", 0, false),
    bullet("White-label support", 0, false),
    bullet("Enterprise support tier", 0, false),
    spacer(),

    heading("Multi-Cloud GPU Burst", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("When on-premises GPU capacity is exhausted, Hive can automatically burst agent workloads to cloud GPU instances:"),
    spacer(),
    makeTable(
      ["Cloud Provider", "GPU Options", "Integration Method"],
      [
        ["AWS", "A10G, A100, H100 (p4, p5 instances)", "EC2 API + Firecracker AMI"],
        ["GCP", "T4, A100, H100 (a2, a3 instances)", "Compute Engine API"],
        ["Azure", "T4, A100, H100 (NC, ND series)", "Azure API"],
        ["Lambda Labs", "A100, H100", "Lambda Cloud API"],
        ["CoreWeave", "A100, H100, A40", "Kubernetes API"],
      ],
      [22, 40, 38]
    ),
    spacer(),

    heading("Visual Pipeline Builder", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("A drag-and-drop canvas for visually composing multi-agent workflows. Agents are represented as nodes, with edges defining data flow and dependencies."),
    spacer(),
    body("Pipeline Builder Features:", { bold: true }),
    bullet("Drag-and-drop agent nodes onto canvas", 0),
    bullet("Visual connection of agent inputs/outputs", 0),
    bullet("Conditional branching and merging", 0),
    bullet("Loop and retry nodes", 0),
    bullet("Real-time pipeline execution visualization", 0),
    bullet("Pipeline versioning and rollback", 0),
    bullet("Export/import pipeline configurations as JSON", 0),
    spacer(),

    heading("GPU Architecture Expansion", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Beyond NVIDIA CUDA, Hive will support additional GPU architectures:"),
    spacer(),
    makeTable(
      ["Architecture", "Vendor", "Framework", "Status"],
      [
        ["CUDA", "NVIDIA", "CUDA Toolkit + cuDNN", "Phase 2 (primary)"],
        ["ROCm", "AMD", "ROCm + MIOpen", "Phase 4"],
        ["Metal", "Apple", "Metal Performance Shaders", "Phase 4 (experimental)"],
        ["oneAPI", "Intel", "oneAPI + oneDNN", "Phase 4 (evaluation)"],
      ],
      [18, 16, 36, 30]
    ),
    spacer(),
  ];

  result = result.concat(deliverableBox("Phase 4 Deliverables", [
    "Multi-cloud GPU burst for overflow capacity",
    "AMD ROCm and Apple Metal GPU support",
    "Visual pipeline builder for multi-agent workflows",
    "Agent-to-agent marketplace (autonomous delegation)",
    "Real-time collaboration for team environments",
    "White-label support for managed hosting providers",
    "Billing and metering infrastructure",
    "Enterprise support tier with SLAs",
  ]));
  result.push(mkPageBreak());
  return result;
}

function buildGanttTimeline() {
  var months = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];

  return [
    heading("8. Gantt Timeline", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    body("The following Gantt chart provides a visual overview of work streams across the 12-month primary roadmap period. Each bar represents the active development period for a feature area."),
    spacer(),

    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        ganttHeaderRow(months),
        ganttBar("Core Infrastructure", 0, 2, 12, C.phaseOne),
        ganttBar("Agent Management", 1, 2, 12, C.phaseOne),
        ganttBar("Dashboard & Monitoring", 2, 2, 12, C.phaseOne),
        ganttBar("MVP Polish & RBAC", 2, 2, 12, C.phaseOne),
        ganttBar("Agent Wizard", 3, 2, 12, C.phaseTwo),
        ganttBar("GPU Sidecar", 4, 2, 12, C.phaseTwo),
        ganttBar("Firecracker", 5, 2, 12, C.phaseFour),
        ganttBar("Advanced Monitoring", 5, 2, 12, C.phaseTwo),
        ganttBar("Multi-Server Cluster", 6, 3, 12, C.phaseThree),
        ganttBar("Kata / gVisor", 7, 2, 12, C.phaseThree),
        ganttBar("Marketplace", 8, 3, 12, C.phaseThree),
        ganttBar("Enterprise Auth", 7, 2, 12, C.phaseThree),
        ganttBar("AI-Native Features", 8, 4, 12, C.phaseThree),
        ganttBar("Platform Maturity", 9, 3, 12, C.phaseThree),
      ],
    }),
    spacer(),

    heading("Legend", HeadingLevel.HEADING_3, { color: C.hiveSecondary }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        colorBadge(" Phase 1 ", C.phaseOne),
        new TextRun({ text: "  MVP Foundation    ", size: 18, font: "Segoe UI" }),
        colorBadge(" Phase 2 ", C.phaseTwo),
        new TextRun({ text: "  Intelligence Layer    ", size: 18, font: "Segoe UI" }),
        colorBadge(" Phase 3 ", C.phaseThree),
        new TextRun({ text: "  Enterprise & Scale    ", size: 18, font: "Segoe UI" }),
        colorBadge(" Phase 4 ", C.phaseFour),
        new TextRun({ text: "  Ecosystem", size: 18, font: "Segoe UI" }),
      ],
    }),
    mkPageBreak(),
  ];
}

function buildMilestones() {
  return [
    heading("9. Key Milestones", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    body("The following milestones represent critical checkpoints in the Hive roadmap. Each milestone has clear success criteria and dependencies."),
    spacer(),

    makeTable(
      ["Milestone", "Target", "Status", "Dependencies"],
      [
        [{ runs: [new TextRun({ text: "Project Inception", bold: true, size: 20, font: "Segoe UI" })] }, "March 2026", { runs: [statusBadgeRun("Done")] }, "None"],
        [{ runs: [new TextRun({ text: "MVP Feature Complete", bold: true, size: 20, font: "Segoe UI" })] }, "June 2026", { runs: [statusBadgeRun("In progress")] }, "Sprints 1\u20138"],
        [{ runs: [new TextRun({ text: "Beta Launch (Docker)", bold: true, size: 20, font: "Segoe UI" })] }, "July 2026", { runs: [statusBadgeRun("Planned")] }, "MVP complete, docs ready"],
        [{ runs: [new TextRun({ text: "Advanced Wizard GA", bold: true, size: 20, font: "Segoe UI" })] }, "August 2026", { runs: [statusBadgeRun("Planned")] }, "Sprints 9\u201310"],
        [{ runs: [new TextRun({ text: "GPU Sidecar GA", bold: true, size: 20, font: "Segoe UI" })] }, "September 2026", { runs: [statusBadgeRun("Planned")] }, "Inference services, VRAM manager"],
        [{ runs: [new TextRun({ text: "Firecracker Support", bold: true, size: 20, font: "Segoe UI" })] }, "October 2026", { runs: [statusBadgeRun("Planned")] }, "KVM setup, vsock layer"],
        [{ runs: [new TextRun({ text: "Multi-Server Cluster", bold: true, size: 20, font: "Segoe UI" })] }, "December 2026", { runs: [statusBadgeRun("Planned")] }, "Networking, scheduler"],
        [{ runs: [new TextRun({ text: "Marketplace Launch", bold: true, size: 20, font: "Segoe UI" })] }, "February 2027", { runs: [statusBadgeRun("Planned")] }, "Template system, community"],
        [{ runs: [new TextRun({ text: "Enterprise GA", bold: true, size: 20, font: "Segoe UI" })] }, "March 2027", { runs: [statusBadgeRun("Planned")] }, "SSO, RBAC, compliance"],
      ],
      [24, 18, 16, 42]
    ),
    spacer(2),

    heading("Milestone Dependencies Graph", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Critical path dependencies between milestones:"),
    spacer(),
    body("Project Inception \u2192 MVP Feature Complete \u2192 Beta Launch (Docker)", { indent: 0.3, bold: true }),
    body("Beta Launch \u2192 Advanced Wizard GA \u2192 GPU Sidecar GA \u2192 Firecracker Support", { indent: 0.3, bold: true }),
    body("Firecracker Support \u2192 Multi-Server Cluster \u2192 Enterprise GA", { indent: 0.3, bold: true }),
    body("GPU Sidecar GA \u2192 Marketplace Launch", { indent: 0.3, bold: true }),
    spacer(),

    callout("The critical path runs through MVP \u2192 Wizard \u2192 GPU Sidecar \u2192 Firecracker \u2192 Enterprise GA. Delays on this path directly impact the Enterprise GA date.", "warning"),
    mkPageBreak(),
  ];
}

function buildTechnicalDebt() {
  return [
    heading("10. Technical Debt & Quality Strategy", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    body("Technical debt management is integrated into the development process, not treated as a separate work stream. The team allocates a fixed percentage of each sprint to debt reduction."),
    spacer(),

    heading("Continuous Quality Practices", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Practice", "Frequency", "Ownership", "Metric"],
      [
        ["Code Review", "Every PR", "All engineers", "100% review coverage"],
        ["Unit Testing", "Every PR", "Feature owner", "> 80% line coverage"],
        ["Integration Testing", "Per sprint", "QA / Feature owner", "Critical path coverage"],
        ["E2E Testing", "Per sprint", "QA", "Top 10 user journeys"],
        ["Security Scanning", "Daily (CI)", "Security + DevOps", "Zero critical CVEs"],
        ["Dependency Updates", "Weekly", "Rotating duty", "< 30 days behind latest"],
        ["Performance Profiling", "Monthly", "Performance lead", "p99 latency targets"],
        ["Architecture Review", "Quarterly", "Tech leads + Staff", "ADR documentation"],
      ],
      [22, 18, 25, 35]
    ),
    spacer(),

    heading("Sprint Debt Budget", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Each sprint reserves capacity for technical debt:"),
    spacer(),
    makeTable(
      ["Sprint Phase", "Feature Work", "Tech Debt", "Buffer"],
      [
        ["Phase 1 (Sprints 1\u20138)", "80%", "15%", "5%"],
        ["Phase 2 (Sprints 9\u201316)", "70%", "20%", "10%"],
        ["Phase 3 (Month 7\u201312)", "65%", "25%", "10%"],
        ["Phase 4 (Month 12+)", "60%", "30%", "10%"],
      ],
      [30, 24, 23, 23]
    ),
    spacer(),
    body("The increasing debt allocation reflects the natural accumulation of complexity as the platform matures. Phase 3 and 4 sprints include more refactoring to keep the codebase maintainable."),
    spacer(),

    heading("Quarterly Architecture Reviews", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Every quarter, the engineering team conducts a full architecture review covering:"),
    bullet("Performance: load test results, p99 latency trends, memory usage", 0),
    bullet("Scalability: identify bottlenecks in current architecture", 0),
    bullet("Security: review of authentication, authorization, data encryption", 0),
    bullet("Code quality: complexity metrics, test coverage trends, dependency health", 0),
    bullet("Developer experience: build times, CI duration, onboarding friction", 0),
    bullet("Technical debt inventory: prioritized backlog of known debt items", 0),
    mkPageBreak(),
  ];
}

function buildRiskRegister() {
  return [
    heading("11. Risk Register", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    body("The following risks have been identified and assessed. Each risk includes mitigation strategies and contingency plans."),
    spacer(),

    makeTable(
      ["ID", "Risk", "Impact", "Likelihood", "Severity", "Mitigation"],
      [
        ["R1", "GPU driver compatibility issues across Linux distributions and kernel versions", "High", "Medium", { runs: [colorBadge("HIGH", C.danger)] }, "Maintain GPU compatibility test matrix. Fallback to CPU inference. Document supported driver versions."],
        ["R2", "Firecracker KVM requirements limit deployment environments (no nested virt, no Windows)", "Medium", "High", { runs: [colorBadge("HIGH", C.danger)] }, "Docker as default fallback. Clear system requirements documentation. Auto-detect KVM support."],
        ["R3", "Performance degradation at scale (100+ agents, multi-server)", "High", "Medium", { runs: [colorBadge("HIGH", C.danger)] }, "Regular load testing. Capacity planning. Horizontal scaling architecture."],
        ["R4", "Security vulnerabilities in container/VM escape", "Critical", "Low", { runs: [colorBadge("HIGH", C.danger)] }, "Regular security audits. Firecracker for untrusted workloads. CVE monitoring and rapid patching."],
        ["R5", "Community adoption below targets", "Medium", "Medium", { runs: [colorBadge("MED", C.warning)] }, "Open source from day one. Comprehensive documentation. Active community engagement."],
        ["R6", "vLLM/Ollama API breaking changes", "Medium", "Medium", { runs: [colorBadge("MED", C.warning)] }, "Pin inference service versions. Abstraction layer for inference API. Monitor upstream releases."],
        ["R7", "Team velocity lower than projected", "High", "Medium", { runs: [colorBadge("HIGH", C.danger)] }, "Sprint retrospectives. Scope negotiation. Feature flagging for partial releases."],
        ["R8", "VRAM management complexity", "Medium", "High", { runs: [colorBadge("HIGH", C.danger)] }, "Conservative VRAM budgets. Extensive testing. Graceful degradation when VRAM is exhausted."],
        ["R9", "vsock communication reliability", "Medium", "Low", { runs: [colorBadge("LOW", C.success)] }, "Comprehensive integration tests. Retry logic. Fallback to network communication."],
        ["R10", "Regulatory requirements (EU AI Act, etc.)", "Medium", "Medium", { runs: [colorBadge("MED", C.warning)] }, "Legal review. Compliance reporting features. Audit trail for all agent actions."],
      ],
      [6, 28, 10, 11, 11, 34]
    ),
    spacer(),

    heading("Risk Response Matrix", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Risk response strategies by severity level:"),
    spacer(),
    makeTable(
      ["Severity", "Response Strategy", "Escalation Path", "Review Cadence"],
      [
        [{ runs: [colorBadge("CRITICAL", C.danger)] }, "Immediate halt. War room assembled. Fix within 24 hours.", "CTO + Engineering Leads", "Daily until resolved"],
        [{ runs: [colorBadge("HIGH", C.danger)] }, "Assigned owner. Mitigation plan within 48 hours.", "Engineering Lead", "Weekly"],
        [{ runs: [colorBadge("MEDIUM", C.warning)] }, "Tracked in risk backlog. Addressed in sprint planning.", "Team Lead", "Bi-weekly"],
        [{ runs: [colorBadge("LOW", C.success)] }, "Monitored. No immediate action required.", "Individual contributor", "Monthly"],
      ],
      [16, 40, 22, 22]
    ),
    mkPageBreak(),
  ];
}

function buildResourcePlanning() {
  return [
    heading("12. Resource Planning", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    body("Resource planning across the four phases, including team composition, infrastructure, and tooling requirements."),
    spacer(),

    heading("Team Structure by Phase", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Role", "Phase 1", "Phase 2", "Phase 3", "Phase 4"],
      [
        ["Full-Stack Engineers", "2\u20133", "3\u20134", "4\u20136", "5\u20138"],
        ["Backend / Infrastructure", "1\u20132", "2\u20133", "3\u20134", "3\u20134"],
        ["Frontend / UX", "1", "1\u20132", "2", "2\u20133"],
        ["DevOps / SRE", "0\u20131", "1", "1\u20132", "2"],
        ["ML / AI Engineer", "0", "1", "1\u20132", "2\u20133"],
        ["QA Engineer", "0", "0\u20131", "1", "1\u20132"],
        ["Technical Writer", "0", "0\u20131", "1", "1"],
        ["Product Manager", "0\u20131", "1", "1", "1"],
        ["Total (est.)", "4\u20138", "9\u201313", "14\u201322", "17\u201327"],
      ],
      [24, 19, 19, 19, 19]
    ),
    spacer(),

    heading("Infrastructure Requirements", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Component", "Phase 1", "Phase 2", "Phase 3+"],
      [
        ["Development Servers", "1x 16-core, 64GB RAM", "2x 32-core, 128GB RAM", "4x 64-core, 256GB RAM"],
        ["GPU Hardware", "None required", "1x NVIDIA RTX 4090 (24GB)", "2\u20134x A100 (80GB)"],
        ["Storage", "500GB SSD", "2TB NVMe", "10TB+ NVMe array"],
        ["CI/CD", "GitHub Actions (free tier)", "GitHub Actions (pro)", "Self-hosted runners"],
        ["Monitoring", "Built-in dashboard", "Built-in + Prometheus/Tempo", "Full observability stack"],
        ["Testing", "Local Docker", "KVM test environment", "Multi-node test cluster"],
      ],
      [22, 26, 26, 26]
    ),
    spacer(),

    heading("Technology Stack", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Category", "Technology", "Version", "Purpose"],
      [
        ["Framework", "Next.js", "16.x", "Full-stack React framework"],
        ["Language", "TypeScript", "5.x", "Type-safe development"],
        ["Styling", "Tailwind CSS", "v4", "Utility-first CSS framework"],
        ["Database", "PostgreSQL", "16.x", "Primary data store"],
        ["ORM", "Drizzle", "Latest", "Type-safe SQL query builder"],
        ["Cache", "Redis", "7.x", "Caching, sessions, pub/sub"],
        ["Auth", "NextAuth", "v5", "Authentication framework"],
        ["Container", "Docker + Dockerode", "Latest", "Container runtime"],
        ["MicroVM", "Firecracker", "1.x", "MicroVM runtime"],
        ["Inference", "vLLM + Ollama", "Latest", "Model serving"],
        ["Proxy", "Traefik", "3.x", "Reverse proxy, TLS termination"],
        ["IaC", "Docker Compose", "3.x", "Development orchestration"],
      ],
      [16, 22, 14, 48]
    ),
    mkPageBreak(),
  ];
}

function buildSuccessMetrics() {
  return [
    heading("13. Success Metrics & KPIs", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),
    body("Each phase has measurable success criteria. These KPIs are reviewed at sprint retrospectives and phase boundaries."),
    spacer(),

    heading("Phase 1 KPIs", HeadingLevel.HEADING_2, { color: C.phaseOne }),
    makeTable(
      ["Metric", "Target", "Measurement"],
      [
        ["Agent deployment success rate", "> 95%", "Successful deploys / Total attempts"],
        ["Dashboard load time", "< 2 seconds", "Time to interactive (Lighthouse)"],
        ["API response time (p99)", "< 500ms", "Server-side latency"],
        ["Authentication reliability", "99.9% uptime", "Successful logins / Total attempts"],
        ["Docker container lifecycle", "< 5s start, < 3s stop", "Container operation timing"],
        ["Test coverage", "> 80% lines", "Jest coverage report"],
      ],
      [30, 24, 46]
    ),
    spacer(),

    heading("Phase 2 KPIs", HeadingLevel.HEADING_2, { color: C.phaseTwo }),
    makeTable(
      ["Metric", "Target", "Measurement"],
      [
        ["Wizard completion rate", "> 80%", "Completed wizard / Started wizard"],
        ["Wizard time-to-deploy", "< 5 minutes", "Start-to-deploy duration"],
        ["GPU inference latency (p50)", "< 100ms", "Time to first token"],
        ["GPU utilization", "> 60% average", "nvidia-smi utilization sampling"],
        ["Firecracker boot time", "< 200ms", "Time from create to ready"],
        ["VRAM budget accuracy", "\u00B15% of predicted", "Actual vs estimated VRAM usage"],
        ["Alert false positive rate", "< 10%", "False alerts / Total alerts"],
      ],
      [30, 24, 46]
    ),
    spacer(),

    heading("Phase 3 KPIs", HeadingLevel.HEADING_2, { color: C.phaseThree }),
    makeTable(
      ["Metric", "Target", "Measurement"],
      [
        ["Cluster agent capacity", "> 500 agents", "Max concurrent agents across cluster"],
        ["Cross-server latency", "< 10ms", "Control plane round-trip between nodes"],
        ["Marketplace templates", "> 50 templates", "Published templates count"],
        ["Enterprise SSO setup time", "< 30 minutes", "Time from start to first SSO login"],
        ["Fine-tuning success rate", "> 90%", "Successful jobs / Total jobs"],
      ],
      [30, 24, 46]
    ),
    spacer(),

    heading("North Star Metrics", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("These overarching metrics guide all product decisions:"),
    spacer(),
    makeTable(
      ["Metric", "Target (12 months)", "Why It Matters"],
      [
        ["GitHub Stars", "> 5,000", "Community interest and visibility"],
        ["Active Installations", "> 500", "Real adoption beyond curiosity"],
        ["Monthly Active Agents", "> 10,000 (across all installs)", "Platform is being used for real workloads"],
        ["Community Contributors", "> 50", "Sustainable open-source ecosystem"],
        ["Marketplace Templates", "> 100", "Platform utility beyond core features"],
      ],
      [28, 30, 42]
    ),
    mkPageBreak(),
  ];
}

function buildDependencies() {
  return [
    heading("14. Dependencies & Assumptions", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),

    heading("External Dependencies", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Dependency", "Type", "Risk if Unavailable", "Contingency"],
      [
        ["Docker Engine", "Runtime", "No agent deployment (Phase 1)", "Podman as alternative"],
        ["Firecracker VMM", "Runtime", "No MicroVM support", "Docker-only mode"],
        ["KVM (/dev/kvm)", "System", "Firecracker cannot run", "Docker fallback, document requirements"],
        ["NVIDIA GPU Drivers", "Hardware", "No GPU inference", "CPU-only inference (slower)"],
        ["vLLM", "Service", "Reduced inference throughput", "Ollama as fallback"],
        ["Ollama", "Service", "No easy model management", "Manual model loading"],
        ["PostgreSQL 16", "Database", "No data persistence", "None (hard requirement)"],
        ["Redis 7", "Cache", "Degraded performance", "In-memory fallback (limited)"],
        ["Node.js 20+", "Runtime", "Cannot run platform", "None (hard requirement)"],
        ["Linux kernel 5.10+", "System", "Limited Firecracker features", "Minimum kernel requirements"],
      ],
      [20, 12, 32, 36]
    ),
    spacer(),

    heading("Key Assumptions", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("This roadmap is built on the following assumptions. If any prove incorrect, timelines may need adjustment:"),
    spacer(),
    bullet("The target deployment environment is Linux (Ubuntu 22.04+ or equivalent). Windows and macOS are development-only.", 0),
    bullet("GPU workloads primarily target NVIDIA GPUs with CUDA. AMD and Apple Silicon are Phase 4.", 0),
    bullet("The team has access to at least one NVIDIA GPU for development and testing by Phase 2 start.", 0),
    bullet("Community contributions will begin during Phase 2 (after open-source release).", 0),
    bullet("Firecracker's vsock implementation is stable enough for production use.", 0),
    bullet("vLLM and Ollama will maintain backward-compatible APIs through our development period.", 0),
    bullet("Next.js 16 will be stable and production-ready by project start.", 0),
    bullet("Network latency between cluster nodes is < 5ms for LAN deployments.", 0),
    spacer(),

    heading("Scope Boundaries", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("The following items are explicitly out of scope for the current roadmap:"),
    spacer(),
    bullet("Training large models from scratch (only fine-tuning is in scope)", 0),
    bullet("Kubernetes-native deployment (Hive manages its own orchestration)", 0),
    bullet("Mobile-first UI (responsive web is the target; native app is Phase 4 consideration)", 0),
    bullet("Multi-region deployment (single region per cluster in Phases 1\u20133)", 0),
    bullet("Real-time audio/video processing agents (text and structured data only)", 0),
    mkPageBreak(),
  ];
}

function buildAppendices() {
  return [
    heading("15. Appendices", HeadingLevel.HEADING_1, { color: C.hivePrimary }),
    spacer(),

    heading("Appendix A: Glossary", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    makeTable(
      ["Term", "Definition"],
      [
        ["Agent", "An autonomous AI workload running inside a container or microVM, managed by Hive"],
        ["Firecracker", "AWS open-source VMM for creating lightweight microVMs with KVM isolation"],
        ["GPU Sidecar", "A shared inference service that runs alongside agents, providing GPU access via API"],
        ["Inference Router", "Internal load balancer that distributes inference requests across GPU sidecars"],
        ["MicroVM", "A minimal virtual machine with a dedicated kernel, providing hardware-level isolation"],
        ["RAL", "Runtime Abstraction Layer \u2014 common interface for Docker, Firecracker, and future runtimes"],
        ["Sidecar", "A helper service deployed alongside the primary workload (borrowed from Kubernetes pattern)"],
        ["vLLM", "High-throughput inference engine with continuous batching and PagedAttention"],
        ["VRAM", "Video RAM \u2014 GPU memory used for storing model weights and computation buffers"],
        ["vsock", "Virtual socket \u2014 communication channel between host and guest in Firecracker microVMs"],
        ["Wizard", "The 9-step guided agent deployment flow introduced in Phase 2"],
      ],
      [22, 78]
    ),
    spacer(),

    heading("Appendix B: Architecture Decision Records", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("Key architecture decisions documented during roadmap planning:"),
    spacer(),
    makeTable(
      ["ADR #", "Decision", "Date", "Status"],
      [
        ["ADR-001", "Use Next.js 16 App Router as full-stack framework", "Mar 2026", "Accepted"],
        ["ADR-002", "PostgreSQL + Drizzle for primary data store", "Mar 2026", "Accepted"],
        ["ADR-003", "Sidecar pattern for GPU inference (not direct passthrough)", "Mar 2026", "Accepted"],
        ["ADR-004", "Firecracker over Kata for primary MicroVM runtime", "Mar 2026", "Accepted"],
        ["ADR-005", "Runtime Abstraction Layer for multi-runtime support", "Mar 2026", "Accepted"],
        ["ADR-006", "9-step wizard over single-page deployment form", "Mar 2026", "Accepted"],
        ["ADR-007", "vsock for Firecracker host-guest communication", "Mar 2026", "Accepted"],
        ["ADR-008", "OpenAI-compatible API as inference interface standard", "Mar 2026", "Accepted"],
      ],
      [12, 52, 16, 20]
    ),
    spacer(),

    heading("Appendix C: Related Documents", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("This roadmap should be read in conjunction with the following Hive documentation:"),
    spacer(),
    makeTable(
      ["Doc #", "Title", "Relevance"],
      [
        ["01", "Hive Product Vision", "Overall product direction and philosophy"],
        ["02", "Hive Market Study", "Market opportunity and TAM analysis"],
        ["03", "Hive Competitive Analysis", "Competitor landscape and differentiation"],
        ["04", "Hive User Personas", "Target user profiles and needs"],
        ["05", "Hive Feature List", "Comprehensive feature inventory"],
        ["06", "Hive MVP Plan", "Detailed MVP scope and acceptance criteria"],
        ["07", "Hive Technical Architecture", "System architecture and design decisions"],
        ["08", "Hive Security & Compliance", "Security model and compliance requirements"],
        ["09", "Hive API Specifications", "REST/SSE API design and contracts"],
        ["10", "Hive Business Model", "Revenue strategy and pricing"],
        ["11", "Hive GTM Strategy", "Go-to-market plan and launch strategy"],
      ],
      [10, 34, 56]
    ),
    spacer(2),

    heading("Appendix D: Sprint Velocity Tracking Template", HeadingLevel.HEADING_2, { color: C.hiveSecondary }),
    body("The following template is used to track velocity across sprints. Actual data populates as sprints are completed."),
    spacer(),
    makeTable(
      ["Sprint", "Planned Points", "Completed Points", "Velocity", "Carry-Over", "Notes"],
      [
        ["Sprint 1", "40", "TBD", "TBD", "TBD", "Project kickoff sprint"],
        ["Sprint 2", "40", "TBD", "TBD", "TBD", ""],
        ["Sprint 3", "42", "TBD", "TBD", "TBD", ""],
        ["Sprint 4", "42", "TBD", "TBD", "TBD", ""],
        ["Sprint 5", "44", "TBD", "TBD", "TBD", ""],
        ["Sprint 6", "44", "TBD", "TBD", "TBD", ""],
        ["Sprint 7", "46", "TBD", "TBD", "TBD", ""],
        ["Sprint 8", "46", "TBD", "TBD", "TBD", "MVP release sprint"],
      ],
      [12, 16, 18, 14, 14, 26]
    ),
    spacer(3),

    // End matter
    sectionDivider(),
    spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "End of Document", size: 22, font: "Segoe UI", color: C.neutral, italics: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "Hive \u2014 Proxmox for AI Agents", size: 20, font: "Segoe UI", color: C.hivePrimary, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Document 12 of 12  \u2022  Version 2.0  \u2022  March 2026", size: 18, font: "Segoe UI", color: C.neutral })],
    }),
  ];
}

// ─── Main Document Assembly ─────────────────────────────────────────────────

async function main() {
  console.log("Building Hive Product Roadmap (Document 12)...");
  console.log("Version 2.0 - Updated with Firecracker, GPU Sidecar, Agent Wizard\n");

  var allChildren = [].concat(
    buildCoverPage(),
    buildDocumentInfo(),
    buildTableOfContents(),
    buildExecutiveSummary(),
    buildVisionStrategy(),
    buildRoadmapOverview(),
    buildPhaseOne(),
    buildPhaseTwo(),
    buildPhaseThree(),
    buildPhaseFour(),
    buildGanttTimeline(),
    buildMilestones(),
    buildTechnicalDebt(),
    buildRiskRegister(),
    buildResourcePlanning(),
    buildSuccessMetrics(),
    buildDependencies(),
    buildAppendices()
  );

  var doc = new Document({
    creator: "Hive Platform Team",
    title: "Hive Product Roadmap",
    description: "Comprehensive product roadmap for the Hive AI agent management platform",
    styles: {
      default: {
        document: {
          run: {
            font: "Segoe UI",
            size: 22,
            color: C.bodyText,
          },
          paragraph: {
            spacing: { line: 276 },
          },
        },
        heading1: {
          run: {
            font: "Segoe UI",
            size: 36,
            bold: true,
            color: C.hivePrimary,
          },
          paragraph: {
            spacing: { before: 400, after: 120 },
          },
        },
        heading2: {
          run: {
            font: "Segoe UI",
            size: 28,
            bold: true,
            color: C.hiveSecondary,
          },
          paragraph: {
            spacing: { before: 320, after: 100 },
          },
        },
        heading3: {
          run: {
            font: "Segoe UI",
            size: 24,
            bold: true,
            color: C.bodyText,
          },
          paragraph: {
            spacing: { before: 240, after: 80 },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "hive-bullets",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } } },
            { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1.0), hanging: convertInchesToTwip(0.25) } } } },
            { level: 2, format: LevelFormat.BULLET, text: "\u25AA", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(0.25) } } } },
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
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: C.mediumGray, space: 4 } },
                children: [
                  new TextRun({ text: "Hive Product Roadmap", size: 16, font: "Segoe UI", color: C.neutral, italics: true }),
                  new TextRun({ text: "  |  ", size: 16, font: "Segoe UI", color: C.mediumGray }),
                  new TextRun({ text: "v2.0", size: 16, font: "Segoe UI", color: C.neutral, italics: true }),
                  new TextRun({ text: "  |  ", size: 16, font: "Segoe UI", color: C.mediumGray }),
                  new TextRun({ text: "Confidential", size: 16, font: "Segoe UI", color: C.danger, bold: true }),
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
                border: { top: { style: BorderStyle.SINGLE, size: 1, color: C.mediumGray, space: 4 } },
                children: [
                  new TextRun({ text: "Hive \u2014 Self-Hosted AI Agent Management Platform", size: 16, font: "Segoe UI", color: C.neutral }),
                  new TextRun({ text: "  |  Page ", size: 16, font: "Segoe UI", color: C.neutral }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Segoe UI", color: C.neutral }),
                  new TextRun({ text: " of ", size: 16, font: "Segoe UI", color: C.neutral }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: "Segoe UI", color: C.neutral }),
                ],
              }),
            ],
          }),
        },
        children: allChildren,
      },
    ],
  });

  var buffer = await Packer.toBuffer(doc);
  var outputPath = "G:/Hive/docs/12_Hive_Roadmap.docx";
  fs.writeFileSync(outputPath, buffer);

  var stats = fs.statSync(outputPath);
  var sizeKB = (stats.size / 1024).toFixed(1);
  console.log("Document generated successfully!");
  console.log("  Output: " + outputPath);
  console.log("  Size:   " + sizeKB + " KB");
  console.log("  Format: US Letter (8.5\" x 11\")");
  console.log("\nSections included:");
  console.log("  1.  Cover Page");
  console.log("  2.  Document Information & Revision History");
  console.log("  3.  Table of Contents");
  console.log("  4.  Executive Summary");
  console.log("  5.  Product Vision & Strategy");
  console.log("  6.  Roadmap Overview & Timeline");
  console.log("  7.  Phase 1: MVP Foundation (Month 1-3)");
  console.log("  8.  Phase 2: Intelligence Layer (Month 4-6) [NEW]");
  console.log("       - Agent Deployment Wizard (9-step flow)");
  console.log("       - GPU Sidecar Architecture");
  console.log("       - Firecracker MicroVM Runtime");
  console.log("       - Advanced Monitoring");
  console.log("  9.  Phase 3: Enterprise & Scale (Month 7-12)");
  console.log("  10. Phase 4: Ecosystem (Month 12+)");
  console.log("  11. Gantt Timeline");
  console.log("  12. Key Milestones");
  console.log("  13. Technical Debt & Quality Strategy");
  console.log("  14. Risk Register");
  console.log("  15. Resource Planning");
  console.log("  16. Success Metrics & KPIs");
  console.log("  17. Dependencies & Assumptions");
  console.log("  18. Appendices (Glossary, ADRs, Related Docs, Velocity Template)");
}

main().catch(function(err) {
  console.error("Error generating document:", err);
  process.exit(1);
});
