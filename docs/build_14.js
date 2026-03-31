// ============================================================================
// Hive — 14_Hive_Workflow_Import.docx Generator
// Generates a comprehensive 25-30 page document on Workflow Import
// Usage: node build_14.js
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
  PageOrientation,
  TableLayoutType,
  VerticalAlign,
  NumberFormat,
  LevelFormat,
} = require("docx");
const fs = require("fs");

// ============================================================================
// COLOR PALETTE
// ============================================================================
const COLORS = {
  PRIMARY: "F59E0B",
  PRIMARY_DARK: "D97706",
  PRIMARY_LIGHT: "FEF3C7",
  ACCENT: "1E3A5F",        // Dark blue accent
  ACCENT_LIGHT: "DBEAFE",

  // Status colors
  FULL_BG: "D1FAE5", FULL_TEXT: "065F46", FULL_BORDER: "10B981",
  PARTIAL_BG: "FEF3C7", PARTIAL_TEXT: "92400E", PARTIAL_BORDER: "F59E0B",
  PLANNED_BG: "F3F4F6", PLANNED_TEXT: "374151", PLANNED_BORDER: "9CA3AF",

  // Table
  TABLE_HEADER_BG: "1E3A5F",
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
  CODE_BG: "F1F5F9",
  CODE_BORDER: "CBD5E1",
};

const FONTS = {
  HEADING: "Segoe UI",
  BODY: "Segoe UI",
  MONO: "Cascadia Code",
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function heading(text, level, options = {}) {
  const sizes = {
    [HeadingLevel.HEADING_1]: 36,
    [HeadingLevel.HEADING_2]: 28,
    [HeadingLevel.HEADING_3]: 24,
    [HeadingLevel.HEADING_4]: 20,
  };
  const colors = {
    [HeadingLevel.HEADING_1]: COLORS.ACCENT,
    [HeadingLevel.HEADING_2]: COLORS.DARK_TEXT,
    [HeadingLevel.HEADING_3]: COLORS.DARK_TEXT,
    [HeadingLevel.HEADING_4]: COLORS.BODY_TEXT,
  };

  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 240, after: 120 },
    children: [
      new TextRun({
        text: text,
        font: FONTS.HEADING,
        size: sizes[level] * 2,
        bold: true,
        color: colors[level],
      }),
    ],
    ...(options.pageBreakBefore ? { pageBreakBefore: true } : {}),
    ...(options.border ? {
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.PRIMARY },
      },
    } : {}),
  });
}

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

function bodyTextMulti(runs) {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: runs.map(r => new TextRun({
      text: r.text,
      font: r.mono ? FONTS.MONO : FONTS.BODY,
      size: r.size || 22,
      color: r.color || COLORS.BODY_TEXT,
      bold: r.bold || false,
      italics: r.italics || false,
    })),
  });
}

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
      text: text,
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

function cell(text, options = {}) {
  const children = [];

  if (options.badge) {
    const badgeColors = {
      "Full": { bg: COLORS.FULL_BG, text: COLORS.FULL_TEXT },
      "Partial": { bg: COLORS.PARTIAL_BG, text: COLORS.PARTIAL_TEXT },
      "Planned": { bg: COLORS.PLANNED_BG, text: COLORS.PLANNED_TEXT },
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

function headerRow(headers, widths) {
  return new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      cell(h, { headerCell: true, center: true, width: widths ? widths[i] : undefined })
    ),
  });
}

function dataRow(cells, index, widths, options = {}) {
  const bgColor = index % 2 === 0 ? COLORS.TABLE_ROW_EVEN : COLORS.TABLE_ROW_ODD;
  return new TableRow({
    children: cells.map((c, i) => {
      if (typeof c === "object" && c._badge) {
        return cell(c.text, { badge: true, shading: bgColor, width: widths ? widths[i] : undefined });
      }
      return cell(c, {
        shading: bgColor,
        width: widths ? widths[i] : undefined,
        bold: options.boldFirst && i === 0,
        mono: options.monoCol && options.monoCol.includes(i),
        small: options.small,
      });
    }),
  });
}

function badge(text) {
  return { _badge: true, text };
}

function makeTable(headers, rows, widths, options = {}) {
  const tRows = [
    headerRow(headers, widths),
    ...rows.map((row, idx) => dataRow(row, idx, widths, options)),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tRows,
  });
}

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

function spacer(height = 120) {
  return new Paragraph({ spacing: { before: height, after: 0 }, children: [] });
}

function codeBlock(lines) {
  return lines.map((line, i) => {
    const p = new Paragraph({
      spacing: { after: 0, before: i === 0 ? 80 : 0, line: 240 },
      indent: { left: convertInchesToTwip(0.15) },
      shading: { type: ShadingType.CLEAR, fill: COLORS.CODE_BG, color: COLORS.CODE_BG },
      border: i === 0 ? {
        top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.CODE_BORDER },
        left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.CODE_BORDER },
        right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.CODE_BORDER },
      } : i === lines.length - 1 ? {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.CODE_BORDER },
        left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.CODE_BORDER },
        right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.CODE_BORDER },
      } : {
        left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.CODE_BORDER },
        right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.CODE_BORDER },
      },
      children: [
        new TextRun({
          text: line,
          font: FONTS.MONO,
          size: 17,
          color: COLORS.DARK_TEXT,
        }),
      ],
    });
    return p;
  });
}

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

// ============================================================================
// TITLE PAGE
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
          text: "Self-Hosted AI Agent Operating System",
          font: FONTS.HEADING,
          size: 28,
          color: COLORS.MUTED_TEXT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.PRIMARY },
      },
      children: [],
    }),
    spacer(300),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "Workflow Import &",
          font: FONTS.HEADING,
          size: 56,
          bold: true,
          color: COLORS.ACCENT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "Cross-Platform Compatibility",
          font: FONTS.HEADING,
          size: 56,
          bold: true,
          color: COLORS.ACCENT,
        }),
      ],
    }),
    spacer(100),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Technical Specification & Implementation Guide",
          font: FONTS.HEADING,
          size: 26,
          color: COLORS.MUTED_TEXT,
          italics: true,
        }),
      ],
    }),
    spacer(400),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Document 14 of 14",
          font: FONTS.BODY,
          size: 22,
          color: COLORS.MUTED_TEXT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Version 1.0  |  March 2026",
          font: FONTS.BODY,
          size: 22,
          color: COLORS.MUTED_TEXT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "CONFIDENTIAL",
          font: FONTS.HEADING,
          size: 20,
          bold: true,
          color: COLORS.PRIMARY_DARK,
        }),
      ],
    }),
  ];
}

// ============================================================================
// TABLE OF CONTENTS
// ============================================================================

function buildTOC() {
  return [
    heading("Table of Contents", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    spacer(200),
  ];
}

// ============================================================================
// SECTION 1: EXECUTIVE SUMMARY
// ============================================================================

function buildSection1() {
  return [
    heading("1. Executive Summary", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("The Workflow Import system is Hive's strategic differentiator for user acquisition, enabling seamless migration from competing platforms."),

    bodyText("The Workflow Import feature is one of Hive's most compelling capabilities for driving adoption. Rather than requiring users to rebuild their AI agent workflows from scratch, Hive provides a comprehensive import system that parses workflow definitions from eight major platforms and maps them to native Hive agents. This dramatically lowers the barrier to entry for teams already invested in other tools."),
    spacer(80),

    heading("Supported Platforms", HeadingLevel.HEADING_2),
    bodyText("Hive's import engine currently supports or plans to support workflows from the following external platforms:"),
    bullet("N8N - Visual workflow automation platform (JSON workflow export)", { bold_prefix: "N8N: " }),
    bullet("LangFlow - Visual LLM application builder (JSON flow export)", { bold_prefix: "LangFlow: " }),
    bullet("Flowise - Low-code LLM orchestration (JSON chatflow export)", { bold_prefix: "Flowise: " }),
    bullet("Dify - LLM application development platform (YAML DSL export)", { bold_prefix: "Dify: " }),
    bullet("Docker Compose - Container orchestration definitions (YAML)", { bold_prefix: "Docker Compose: " }),
    bullet("Ollama Modelfile - Model configuration format (Text)", { bold_prefix: "Ollama: " }),
    bullet("CrewAI - Multi-agent framework (Python/YAML configs)", { bold_prefix: "CrewAI: " }),
    bullet("AutoGen - Microsoft's multi-agent framework (Python/JSON)", { bold_prefix: "AutoGen: " }),
    spacer(80),

    heading("Import Pipeline Overview", HeadingLevel.HEADING_2),
    bodyText("Every import follows a standardized six-stage pipeline that ensures consistency, validation, and user control:"),
    spacer(40),

    makeTable(
      ["Stage", "Action", "Description"],
      [
        ["1. Import", "File Upload", "User uploads or drags-and-drops a workflow file from any supported platform. Multiple file formats accepted (JSON, YAML, text)."],
        ["2. Parse", "Format Detection", "The import engine auto-detects the platform from file structure and content signatures. Falls back to manual platform selection if ambiguous."],
        ["3. Map", "IR Generation", "Platform-specific parser converts the workflow into Hive's Intermediate Representation (HiveAgentGraph), mapping nodes to agents and connections to pipelines."],
        ["4. Pre-fill", "Wizard Population", "The IR data pre-fills Hive's Agent Deployment Wizard with configuration values, resource requirements, model selections, and connection definitions."],
        ["5. Review", "User Validation", "User reviews detected agents, connections, and configurations in a visual preview. Can edit, remove, or add agents before deployment."],
        ["6. Deploy", "Agent Creation", "Approved agents are deployed to Hive infrastructure. Each agent goes through the standard deployment pipeline with progress tracking."],
      ],
      [8, 14, 78],
      { boldFirst: true }
    ),
    spacer(80),

    calloutBox("STRATEGIC VALUE", "The import feature converts evaluation users into committed users. By eliminating the migration cost, Hive removes the #1 objection to switching platforms: 'I have already invested too much in my current tool.'", COLORS.ACCENT),

    heading("Key Benefits", HeadingLevel.HEADING_2),
    bullet("Zero-effort migration from competing platforms - users bring existing workflows", { bold_prefix: "Frictionless Adoption: " }),
    bullet("Agent configurations, model selections, and resource requirements are automatically extracted", { bold_prefix: "Automatic Configuration: " }),
    bullet("Users review and approve every imported agent before deployment", { bold_prefix: "Full Control: " }),
    bullet("All imports are validated, sandboxed, and audited for enterprise compliance", { bold_prefix: "Security-First: " }),
    bullet("Partial imports succeed even when some components are unsupported", { bold_prefix: "Graceful Degradation: " }),
    bullet("Import history allows re-importing updated workflows", { bold_prefix: "Iterative Migration: " }),
  ];
}

// ============================================================================
// SECTION 2: SUPPORTED PLATFORMS & FORMATS
// ============================================================================

function buildSection2() {
  return [
    heading("2. Supported Platforms & Formats", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("A comprehensive matrix of all platforms supported by Hive's import engine, with support levels and format details."),

    bodyText("Hive categorizes platform support into three tiers: Full support means the import engine can parse and map all major components with high fidelity. Partial support indicates that configuration data can be extracted but some programmatic logic requires manual setup. Planned support denotes platforms on the roadmap for future releases."),
    spacer(80),

    heading("Platform Support Matrix", HeadingLevel.HEADING_2),
    makeTable(
      ["Platform", "Export Format", "Support Level", "Description"],
      [
        ["N8N", "JSON (.json)", badge("Full"), "Workflow nodes map directly to Hive agents. Connections become pipeline edges. Credentials map to Hive Secrets. Supports all major N8N node categories including LangChain nodes."],
        ["LangFlow", "JSON (.json)", badge("Full"), "Flow components map to agents with full LLM model configuration extraction. Chains and agent patterns are recognized and converted to Hive pipelines. Embedding and vector store configs preserved."],
        ["Flowise", "JSON (.json)", badge("Full"), "Chatflow components follow the same mapping principles as LangFlow. Document loaders, text splitters, and retrieval chains fully supported. Chat memory configurations preserved."],
        ["Dify", "YAML (.yml)", badge("Full"), "Dify DSL applications map to agent configurations. Supports chatbot, completion, workflow, and agent-type apps. Variable definitions and model provider configurations fully extracted."],
        ["Docker Compose", "YAML (.yml/.yaml)", badge("Full"), "Docker services map to agent groups. Volumes become persistent storage. Networks map to agent group isolation. Environment variables split into config and secrets. Resource limits (deploy.resources) preserved."],
        ["Ollama Modelfile", "Text (Modelfile)", badge("Full"), "Model configuration imported directly into Hive's model management. Parameters (temperature, top_p, context window), system prompts, and template definitions all preserved."],
        ["CrewAI", "Python / YAML", badge("Partial"), "Agent role definitions, goal statements, and tool assignments extractible from YAML configs and Python decorators. Custom tool code logic requires manual recreation in Hive Script Agents."],
        ["AutoGen", "Python / JSON", badge("Partial"), "Agent configurations, model settings, and group chat definitions extractible. Code execution logic and custom function definitions require manual setup. ConversableAgent configs fully supported."],
        ["LangChain", "Python / YAML", badge("Planned"), "Future support planned for LCEL chain definitions and LangServe configurations. Will parse chain components, model bindings, and tool definitions from Python source files."],
        ["Zapier", "JSON (.json)", badge("Planned"), "Future support for Zapier Zap exports. Trigger-action model maps well to Hive's input-output agent pattern. OAuth-based integrations will map to Hive Secrets."],
        ["Make.com", "JSON (.json)", badge("Planned"), "Future support for Make.com (formerly Integromat) scenario exports. Module sequences will map to Hive pipeline stages. Router modules map to conditional agents."],
      ],
      [14, 16, 12, 58],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Format Detection Signatures", HeadingLevel.HEADING_2),
    bodyText("The import engine automatically detects the source platform by examining file content signatures. This enables a drag-and-drop experience where users do not need to manually specify the platform."),
    spacer(40),

    makeTable(
      ["Platform", "Detection Method", "Signature"],
      [
        ["N8N", "JSON key presence", 'Root object contains "nodes" array and "connections" object with node ID keys'],
        ["LangFlow", "JSON key presence", 'Root object contains "data" with "nodes" and "edges" arrays, nodes have "type" with langflow prefix'],
        ["Flowise", "JSON key presence", 'Root object contains "nodes" and "edges", nodes have "data.category" field'],
        ["Dify", "YAML key presence", 'Root contains "app" object with "mode" field (chatbot/completion/workflow/agent)'],
        ["Docker Compose", "YAML key presence", 'Root contains "services" object and optionally "version" field'],
        ["Ollama Modelfile", "Text pattern match", 'File starts with "FROM" directive followed by model name/path'],
        ["CrewAI", "Python/YAML pattern", 'Python files contain @agent, @task decorators; YAML contains agents/tasks keys'],
        ["AutoGen", "Python/JSON pattern", 'Contains ConversableAgent, AssistantAgent, or GroupChat class references'],
      ],
      [14, 18, 68],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Version Compatibility", HeadingLevel.HEADING_2),
    bodyText("Each parser maintains compatibility with specific platform versions. The import engine validates version compatibility before parsing and provides clear error messages for unsupported versions."),
    spacer(40),

    makeTable(
      ["Platform", "Minimum Version", "Maximum Version", "Notes"],
      [
        ["N8N", "0.200.0", "1.x (latest)", "Workflow format stabilized in v0.200. LangChain nodes require v1.0+."],
        ["LangFlow", "0.5.0", "1.x (latest)", "Component schema changed significantly in v0.5."],
        ["Flowise", "1.0.0", "2.x (latest)", "Chatflow format stable since v1.0."],
        ["Dify", "0.6.0", "0.x (latest)", "DSL format introduced in v0.6."],
        ["Docker Compose", "2.0", "3.x (latest)", "Compose Specification format preferred."],
        ["Ollama", "0.1.0", "0.x (latest)", "Modelfile format has been stable since initial release."],
        ["CrewAI", "0.30.0", "0.x (latest)", "YAML config support added in v0.30."],
        ["AutoGen", "0.2.0", "0.x (latest)", "OAI config format stable since v0.2."],
      ],
      [18, 18, 18, 46],
      { boldFirst: true }
    ),
  ];
}

// ============================================================================
// SECTION 3: ARCHITECTURE OVERVIEW
// ============================================================================

function buildSection3() {
  return [
    heading("3. Architecture Overview", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("The import engine follows a modular parser registry architecture, converting all platform formats into a unified Intermediate Representation."),

    heading("Import Engine Architecture", HeadingLevel.HEADING_2),
    bodyText("The import engine is built on three core architectural patterns: the Parser Registry, the Intermediate Representation (IR), and the Deployment Bridge. This separation ensures that adding support for a new platform requires only implementing a new parser without modifying the core pipeline."),
    spacer(60),

    heading("System Flow Diagram", HeadingLevel.HEADING_3),
    bodyText("The following text-based diagram illustrates the complete import pipeline from file upload to agent deployment:"),
    spacer(40),

    ...codeBlock([
      "  +------------------+     +-------------------+     +------------------+",
      "  |   File Upload    |     |  Platform Auto-   |     |  Parser Registry |",
      "  |   (Drag & Drop)  | --> |  Detection Engine  | --> |  (8 Parsers)     |",
      "  +------------------+     +-------------------+     +------------------+",
      "                                                            |",
      "                                                            v",
      "  +------------------+     +-------------------+     +------------------+",
      "  |  Agent Wizard    |     |   Validation &    |     |  Intermediate    |",
      "  |  (Pre-filled)    | <-- |   Preview Screen  | <-- |  Representation  |",
      "  +------------------+     +-------------------+     |  (HiveAgentGraph)|",
      "         |                                           +------------------+",
      "         v",
      "  +------------------+     +-------------------+",
      "  |  Deployment      |     |  Running Agents   |",
      "  |  Pipeline        | --> |  in Hive          |",
      "  +------------------+     +-------------------+",
    ]),
    spacer(100),

    heading("Parser Registry Pattern", HeadingLevel.HEADING_2),
    bodyText("The Parser Registry implements a strategy pattern where each platform has a dedicated parser class that implements a common IWorkflowParser interface. The registry automatically selects the correct parser based on the auto-detection result or manual platform selection."),
    spacer(40),

    ...codeBlock([
      "  interface IWorkflowParser {",
      "    readonly platform: string;",
      "    readonly supportedVersions: VersionRange;",
      "",
      "    detect(content: string): DetectionResult;",
      "    validate(content: string): ValidationResult;",
      "    parse(content: string): HiveAgentGraph;",
      "    getWarnings(): ImportWarning[];",
      "  }",
      "",
      "  class ParserRegistry {",
      "    private parsers: Map<string, IWorkflowParser>;",
      "",
      "    register(parser: IWorkflowParser): void;",
      "    detectPlatform(content: string): string | null;",
      "    parse(platform: string, content: string): HiveAgentGraph;",
      "  }",
    ]),
    spacer(80),

    heading("Parser Implementations", HeadingLevel.HEADING_3),
    makeTable(
      ["Parser Class", "Platform", "Input Format", "Complexity", "Lines of Code (est.)"],
      [
        ["N8NParser", "N8N", "JSON", "High", "~1,200"],
        ["LangFlowParser", "LangFlow", "JSON", "Medium", "~800"],
        ["FlowiseParser", "Flowise", "JSON", "Medium", "~750"],
        ["DifyParser", "Dify", "YAML", "Medium", "~600"],
        ["DockerComposeParser", "Docker Compose", "YAML", "Medium", "~500"],
        ["OllamaParser", "Ollama", "Text", "Low", "~300"],
        ["CrewAIParser", "CrewAI", "Python/YAML", "High", "~900"],
        ["AutoGenParser", "AutoGen", "Python/JSON", "High", "~850"],
      ],
      [20, 18, 14, 14, 34],
      { boldFirst: true, monoCol: [0] }
    ),
    spacer(80),

    heading("Intermediate Representation (IR)", HeadingLevel.HEADING_2),
    bodyText("All parsers output a unified data structure called HiveAgentGraph. This Intermediate Representation serves as the canonical format that the rest of the import pipeline (validation, preview, deployment) operates on. By normalizing all platform formats into a single IR, the import engine decouples platform-specific parsing from deployment logic."),
    spacer(40),

    bodyText("The IR captures four primary concerns:"),
    bullet("Agent definitions with runtime, image, resources, and configuration", { bold_prefix: "Agents: " }),
    bullet("Connection topology defining data flow between agents", { bold_prefix: "Edges: " }),
    bullet("Configuration values that can be exposed as environment variables", { bold_prefix: "Variables: " }),
    bullet("Sensitive values that must be stored in Hive's encrypted secrets store", { bold_prefix: "Secrets: " }),
    spacer(40),

    calloutBox("DESIGN PRINCIPLE", "The IR intentionally loses some platform-specific information that has no equivalent in Hive. This is by design: the goal is a working Hive deployment, not a perfect round-trip conversion. Platform-specific metadata is preserved in the metadata field for reference but does not affect deployment.", COLORS.ACCENT),
  ];
}

// ============================================================================
// SECTION 4: N8N IMPORT (DEEP DIVE)
// ============================================================================

function buildSection4() {
  return [
    heading("4. N8N Import (Deep Dive)", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("N8N is the most feature-rich import target, with comprehensive node mapping covering 50+ node types across all major categories."),

    heading("N8N Workflow JSON Structure", HeadingLevel.HEADING_2),
    bodyText("An N8N workflow export is a JSON file containing a flat list of nodes, a connections object mapping node outputs to node inputs, and workflow-level settings. The parser processes each element:"),
    spacer(40),

    ...codeBlock([
      '  {',
      '    "name": "My AI Workflow",',
      '    "nodes": [',
      '      {',
      '        "id": "uuid-1234",',
      '        "name": "Webhook Trigger",',
      '        "type": "n8n-nodes-base.webhook",',
      '        "typeVersion": 1.1,',
      '        "position": [250, 300],',
      '        "parameters": {',
      '          "httpMethod": "POST",',
      '          "path": "/agent-input",',
      '          "responseMode": "responseNode"',
      '        }',
      '      },',
      '      ...',
      '    ],',
      '    "connections": {',
      '      "Webhook Trigger": {',
      '        "main": [[{ "node": "LLM Chat", "type": "main", "index": 0 }]]',
      '      }',
      '    },',
      '    "settings": { "executionOrder": "v1" }',
      '  }',
    ]),
    spacer(80),

    heading("Node Type Mapping", HeadingLevel.HEADING_2),
    bodyText("The following table shows how N8N node types map to Hive agent types. Each mapping includes the Hive agent template used, the runtime configuration, and any special handling notes."),
    spacer(40),

    heading("Core Node Mappings", HeadingLevel.HEADING_3),
    makeTable(
      ["N8N Node Type", "Hive Agent Type", "Runtime", "Notes"],
      [
        ["n8n-nodes-base.webhook", "Hive Input Agent (HTTP Trigger)", "Docker", "Maps httpMethod, path, and authentication settings. Response mode determines if agent is synchronous."],
        ["@n8n/n8n-nodes-langchain.lmChatOllama", "Hive LLM Agent (GPU Sidecar)", "Docker + GPU", "Model name extracted and validated against Ollama library. Temperature, topP, topK parameters preserved."],
        ["n8n-nodes-base.httpRequest", "Hive HTTP Agent", "Docker", "URL, method, headers, body, and authentication all mapped. Retry logic translated to Hive retry config."],
        ["n8n-nodes-base.code", "Hive Script Agent (Node.js/Python)", "Docker", "Code content extracted. Language detected from node configuration. Dependencies require manual specification."],
        ["n8n-nodes-base.if", "Hive Router Agent (Conditional)", "Docker", "Condition expressions converted to Hive routing rules. Multiple output branches supported."],
        ["n8n-nodes-base.merge", "Hive Aggregator Agent", "Docker", "Merge mode (append, combine, choose) mapped to aggregation strategy. Wait-for-all behavior preserved."],
        ["n8n-nodes-base.postgres", "Hive DB Agent (PostgreSQL)", "Docker", "Connection parameters mapped to secrets. Query templates preserved. Operation type (select/insert/update/delete) mapped."],
        ["n8n-nodes-base.redis", "Hive Cache Agent", "Docker", "Redis connection mapped to secrets. Operations (get/set/delete/publish) preserved. Key patterns maintained."],
        ["n8n-nodes-base.set", "Hive Transform Agent", "Docker", "Field assignments converted to transform rules. Expression evaluation mode detected and handled."],
        ["n8n-nodes-base.splitInBatches", "Hive Batch Agent", "Docker", "Batch size preserved. Processing mode (sequential/parallel) mapped. Reset behavior configured."],
      ],
      [28, 26, 12, 34],
      { monoCol: [0] }
    ),
    spacer(80),

    heading("LangChain Node Mappings", HeadingLevel.HEADING_3),
    bodyText("N8N v1.0+ includes LangChain-specific nodes for AI workflows. These map to specialized Hive agent configurations:"),
    spacer(40),

    makeTable(
      ["N8N LangChain Node", "Hive Agent Type", "Configuration Extracted"],
      [
        ["@n8n/n8n-nodes-langchain.lmChatOllama", "LLM Agent (Ollama)", "Model name, temperature, topP, topK, contextWindow, baseUrl"],
        ["@n8n/n8n-nodes-langchain.lmChatOpenAi", "LLM Agent (OpenAI-compat)", "Model, temperature, maxTokens, frequencyPenalty, presencePenalty, apiKey (ref)"],
        ["@n8n/n8n-nodes-langchain.chainLlm", "Pipeline Agent (LLM Chain)", "Prompt template, memory type, output parser configuration"],
        ["@n8n/n8n-nodes-langchain.chainRetrievalQa", "RAG Pipeline Agent", "Retriever config, chain type (stuff/map_reduce/refine), prompt template"],
        ["@n8n/n8n-nodes-langchain.agent", "Orchestrator Agent", "Agent type (openai-functions/react), tools list, system message, memory"],
        ["@n8n/n8n-nodes-langchain.toolCode", "Tool Agent (Script)", "Tool name, description, code content, input schema definition"],
        ["@n8n/n8n-nodes-langchain.toolHttpRequest", "Tool Agent (HTTP)", "URL, method, headers, description for LLM tool-use"],
        ["@n8n/n8n-nodes-langchain.memoryBufferWindow", "Memory Config", "Window size, session key, context variable name"],
        ["@n8n/n8n-nodes-langchain.embeddingsOllama", "Embedding Config", "Model name, baseUrl, dimensions (mapped to Hive embedding service)"],
        ["@n8n/n8n-nodes-langchain.vectorStoreInMemory", "Vector Store Config", "Namespace, metric type (mapped to Hive built-in vector store)"],
        ["@n8n/n8n-nodes-langchain.textSplitterTokenSplitter", "Text Processing Config", "Chunk size, chunk overlap, model for tokenization"],
        ["@n8n/n8n-nodes-langchain.documentDefaultDataLoader", "Document Loader Config", "Data type, metadata fields, binary property name"],
      ],
      [34, 24, 42],
      { monoCol: [0] }
    ),
    spacer(80),

    heading("Connection Mapping", HeadingLevel.HEADING_2),
    bodyText("N8N connections define data flow between nodes using a source-node-name to target-node-name mapping with output/input index pairs. The parser converts these to Hive pipeline edges:"),
    spacer(40),

    makeTable(
      ["N8N Concept", "Hive Equivalent", "Mapping Logic"],
      [
        ["connections[nodeName].main[outputIndex]", "HiveEdge (source.port)", "Output index becomes named port: 'output_0', 'output_1', etc."],
        ["Target node + input index", "HiveEdge (target.port)", "Input index becomes named port: 'input_0', 'input_1', etc."],
        ["Multiple outputs (IF node)", "Multiple HiveEdges", "Each branch becomes a separate edge with condition expression"],
        ["AI sub-nodes (memory, tools)", "Agent configuration", "Sub-node connections become nested agent config rather than edges"],
      ],
      [30, 24, 46],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Parameter Mapping", HeadingLevel.HEADING_2),
    bodyText("N8N node parameters are mapped to Hive agent configuration values. Expression parameters (containing ={{...}}) are converted to Hive template expressions:"),
    spacer(40),

    makeTable(
      ["N8N Parameter", "Hive Configuration", "Transform Applied"],
      [
        ["parameters.httpMethod", "config.http.method", "Direct string mapping (GET, POST, PUT, DELETE)"],
        ["parameters.url", "config.http.url", "Expression handling if dynamic; static otherwise"],
        ["parameters.model", "config.model.name", "Validated against available Ollama models"],
        ["parameters.temperature", "config.model.temperature", "Clamped to 0.0-2.0 range"],
        ["parameters.maxTokens", "config.model.maxTokens", "Validated against model max context"],
        ["parameters.query", "config.db.query", "SQL template preserved with parameter bindings"],
        ["parameters.code", "config.script.code", "Code content preserved; language auto-detected"],
        ["parameters.conditions", "config.routing.rules", "Condition tree flattened to rule set"],
        ["parameters.batchSize", "config.batch.size", "Integer validation applied"],
        ["parameters.retryOnFail", "config.retry.enabled", "Boolean mapping with count extraction"],
      ],
      [26, 26, 48],
      { monoCol: [0, 1] }
    ),
    spacer(80),

    heading("Credentials Handling", HeadingLevel.HEADING_2),
    bodyText("N8N credentials are never imported with their actual values (which are encrypted in the N8N database and not included in workflow exports). Instead, the parser extracts credential references and creates corresponding Hive Secret placeholders:"),
    spacer(40),

    bullet("N8N credential references (by name and type) are detected in node configurations", { bold_prefix: "Detection: " }),
    bullet("A HiveSecretRef is created for each unique credential with the original name", { bold_prefix: "Placeholder Creation: " }),
    bullet("Agent configurations reference secrets using {{SECRET.credential_name}} syntax", { bold_prefix: "Reference Injection: " }),
    bullet("During the review step, users are prompted to provide values for all detected secrets", { bold_prefix: "User Prompt: " }),
    bullet("Secrets are encrypted with AES-256 and stored in Hive's secrets vault", { bold_prefix: "Encryption: " }),

    spacer(40),
    calloutBox("SECURITY", "Credential values are never transmitted, logged, or stored in plaintext at any stage of the import process. Only credential names and types are extracted from the workflow file.", COLORS.FULL_TEXT),
  ];
}

// ============================================================================
// SECTION 5: LANGFLOW / FLOWISE IMPORT
// ============================================================================

function buildSection5() {
  return [
    heading("5. LangFlow & Flowise Import", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("LangFlow and Flowise share similar JSON-based flow formats, enabling a shared parsing strategy with platform-specific adaptations."),

    heading("Component Type Mapping", HeadingLevel.HEADING_2),
    bodyText("Both LangFlow and Flowise organize their flows around typed components (LLMs, chains, tools, memory, embeddings, vector stores). The parser maps each component category to Hive agent types:"),
    spacer(40),

    makeTable(
      ["Component Category", "LangFlow Type", "Flowise Type", "Hive Agent Type"],
      [
        ["LLM", "ChatOpenAI, ChatOllama, etc.", "chatModels/*", "LLM Agent with model config"],
        ["Chain", "LLMChain, ConversationalChain", "chains/*", "Pipeline Agent (sequential)"],
        ["Agent", "AgentExecutor, OpenAIAgent", "agentflows/*", "Orchestrator Agent"],
        ["Tool", "SerpAPI, Calculator, CustomTool", "tools/*", "Tool Agent (typed)"],
        ["Memory", "BufferMemory, ConversationSummary", "memory/*", "Memory configuration (agent-level)"],
        ["Embedding", "OllamaEmbeddings, OpenAIEmbed", "embeddings/*", "Embedding service config"],
        ["Vector Store", "Chroma, Pinecone, PGVector", "vectorStores/*", "Vector Store Agent"],
        ["Document Loader", "PDFLoader, DirectoryLoader", "documentloaders/*", "Document Ingestion Agent"],
        ["Text Splitter", "RecursiveCharacterSplitter", "textsplitters/*", "Text Processing config"],
        ["Retriever", "VectorStoreRetriever", "retrievers/*", "RAG Pipeline component"],
        ["Output Parser", "StructuredOutputParser", "outputparsers/*", "Transform Agent (post-LLM)"],
      ],
      [18, 24, 20, 38],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Model Configuration Extraction", HeadingLevel.HEADING_2),
    bodyText("The parser extracts comprehensive model configuration from LLM components, including provider-specific parameters:"),
    spacer(40),

    makeTable(
      ["Parameter", "LangFlow Field", "Flowise Field", "Hive Config Path"],
      [
        ["Model Name", "model_name", "modelName", "config.model.name"],
        ["Temperature", "temperature", "temperature", "config.model.temperature"],
        ["Max Tokens", "max_tokens", "maxTokens", "config.model.maxTokens"],
        ["Top P", "top_p", "topP", "config.model.topP"],
        ["Streaming", "streaming", "streaming", "config.model.streaming"],
        ["Base URL", "base_url / ollama_base_url", "basePath", "config.model.baseUrl"],
        ["API Key", "api_key (ref)", "credential", "{{SECRET.api_key}}"],
        ["System Message", "system_message", "systemMessagePrompt", "config.model.systemPrompt"],
      ],
      [16, 24, 22, 38],
      { monoCol: [1, 2, 3] }
    ),
    spacer(80),

    heading("Chain & Agent Pattern Recognition", HeadingLevel.HEADING_2),
    bodyText("The parser recognizes common LLM application patterns and maps them to optimized Hive pipeline configurations:"),
    spacer(40),

    bullet("LLM + Prompt Template + Output Parser detected as a single Pipeline Agent with prompt, model, and output config", { bold_prefix: "Simple LLM Chain: " }),
    bullet("Retriever + LLM Chain recognized as a RAG Pipeline Agent with vector store and LLM configuration combined", { bold_prefix: "RAG Chain: " }),
    bullet("Agent + Tools + Memory detected as an Orchestrator Agent with tool-use capabilities and conversation state", { bold_prefix: "Agentic Pattern: " }),
    bullet("Chat Input + LLM + Chat Output recognized as a Conversational Agent with built-in HTTP endpoint", { bold_prefix: "Conversational Bot: " }),

    spacer(40),
    heading("Flowise-Specific Handling", HeadingLevel.HEADING_3),
    bodyText("Flowise chatflows include additional metadata not present in LangFlow exports. The parser handles these Flowise-specific elements:"),
    bullet("Flowise chatflow IDs are preserved in metadata for reference tracking"),
    bullet("Analytic configurations (LangSmith, LangFuse, LunaryAI) are mapped to Hive's observability config"),
    bullet("Speech-to-text and override configurations are mapped to agent input processing"),
    bullet("Follow-up prompt configurations are preserved in agent chat behavior settings"),
  ];
}

// ============================================================================
// SECTION 6: DIFY IMPORT
// ============================================================================

function buildSection6() {
  return [
    heading("6. Dify Import", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("Dify uses a YAML-based DSL for application export, providing a structured and human-readable format that maps cleanly to Hive agents."),

    heading("Dify DSL YAML Structure", HeadingLevel.HEADING_2),
    bodyText("A Dify export file contains the application definition, model configuration, prompt templates, and variable definitions in a single YAML document:"),
    spacer(40),

    ...codeBlock([
      '  app:',
      '    mode: workflow',
      '    name: "Customer Support Agent"',
      '    description: "Handles customer inquiries with RAG"',
      '    icon: "robot"',
      '  ',
      '  model_config:',
      '    provider: ollama',
      '    model: llama3:8b',
      '    parameters:',
      '      temperature: 0.7',
      '      max_tokens: 2048',
      '      top_p: 0.9',
      '  ',
      '  prompt_config:',
      '    prompt_type: advanced',
      '    advanced_prompt_template:',
      '      - role: system',
      '        text: "You are a helpful customer support agent..."',
      '  ',
      '  dataset_configs:',
      '    retrieval_model: multiple',
      '    datasets:',
      '      - dataset_id: "abc-123"',
      '        name: "Product Knowledge Base"',
      '  ',
      '  variables:',
      '    - variable: customer_name',
      '      type: text-input',
      '      required: true',
      '    - variable: department',
      '      type: select',
      '      options: ["billing", "technical", "general"]',
    ]),
    spacer(80),

    heading("App Type Mapping", HeadingLevel.HEADING_2),
    bodyText("Dify supports four application types, each mapping to a different Hive agent configuration:"),
    spacer(40),

    makeTable(
      ["Dify App Mode", "Hive Agent Type", "Configuration", "Description"],
      [
        ["chatbot", "Conversational Agent", "HTTP input + LLM + chat memory", "Interactive chat interface with conversation history. Maps to Hive agent with WebSocket endpoint and session management."],
        ["completion", "Completion Agent", "HTTP input + LLM + single response", "Single prompt-response pattern. Maps to a stateless Hive agent with REST API endpoint."],
        ["workflow", "Pipeline Agent Group", "Multi-agent pipeline", "Multi-step workflow with branching logic. Each workflow node becomes a Hive agent; connections become pipeline edges."],
        ["agent", "Orchestrator Agent", "LLM + tools + reasoning loop", "Autonomous agent with tool-use capabilities. Maps to Hive Orchestrator with tool agents as dependencies."],
      ],
      [14, 18, 24, 44],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Variable Mapping", HeadingLevel.HEADING_2),
    bodyText("Dify application variables map to Hive agent input parameters and environment configuration:"),
    spacer(40),

    makeTable(
      ["Dify Variable Type", "Hive Equivalent", "Handling"],
      [
        ["text-input", "Agent input parameter (string)", "Exposed as query parameter or request body field"],
        ["paragraph", "Agent input parameter (text)", "Multi-line text input, mapped to request body"],
        ["select", "Agent input parameter (enum)", "Options list preserved; validated on input"],
        ["number", "Agent input parameter (number)", "Min/max constraints preserved if defined"],
        ["file", "Agent input parameter (file)", "File upload endpoint configured; size limits applied"],
        ["api-key (external)", "Hive Secret reference", "Mapped to {{SECRET.variable_name}} with user prompt"],
      ],
      [22, 28, 50],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Model Provider Configuration", HeadingLevel.HEADING_2),
    bodyText("Dify model provider configurations are mapped to Hive's GPU Sidecar inference service or external API connections:"),
    spacer(40),

    makeTable(
      ["Dify Provider", "Hive Configuration", "Handling"],
      [
        ["ollama", "GPU Sidecar (local Ollama)", "Model name validated against local Ollama library. Base URL set to Hive's internal inference endpoint."],
        ["openai", "External API Agent", "API key mapped to secret. Model name and parameters preserved. Endpoint configurable for OpenAI-compatible services."],
        ["anthropic", "External API Agent", "API key mapped to secret. Model name preserved. Max tokens and stop sequences mapped."],
        ["azure_openai", "External API Agent", "Deployment name, API version, and endpoint URL all preserved. API key mapped to secret."],
        ["huggingface", "GPU Sidecar (HF model)", "Model ID extracted. Quantization preference preserved. Task type (text-generation, embeddings) mapped."],
        ["custom", "Configurable endpoint", "Base URL, auth method, and model ID preserved. User must verify endpoint accessibility from Hive host."],
      ],
      [18, 22, 60],
      { boldFirst: true }
    ),
  ];
}

// ============================================================================
// SECTION 7: DOCKER COMPOSE IMPORT
// ============================================================================

function buildSection7() {
  return [
    heading("7. Docker Compose Import", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("Docker Compose files provide a natural mapping to Hive agent groups, with services becoming agents and infrastructure definitions mapping to Hive's resource management."),

    heading("Service to Agent Mapping", HeadingLevel.HEADING_2),
    bodyText("Each Docker Compose service is mapped to a Hive agent with comprehensive configuration extraction:"),
    spacer(40),

    makeTable(
      ["Compose Field", "Hive Agent Field", "Transform Logic"],
      [
        ["service name", "agent.name", "Sanitized to valid Hive agent name (alphanumeric + hyphens)"],
        ["image", "agent.image", "Image reference preserved with tag. Private registry credentials mapped to secrets."],
        ["build.context", "agent.image (built)", "Build context triggers image build workflow. Dockerfile analyzed for base image and dependencies."],
        ["command / entrypoint", "agent.config.command", "Command array preserved. Entrypoint override mapped to agent startup config."],
        ["environment", "agent.env + agent.secrets", "Variables with sensitive names (API_KEY, TOKEN, PASSWORD, SECRET) mapped to Hive Secrets; others to env config."],
        ["ports", "agent.ports", "Host:container port mappings preserved. Protocol (tcp/udp) maintained."],
        ["volumes", "agent.volumes", "Named volumes create Hive persistent volumes. Bind mounts mapped to volume mounts with path."],
        ["depends_on", "agent.dependencies", "Service dependencies become agent deployment order constraints and health check gates."],
        ["restart", "agent.restartPolicy", "Direct mapping: no, always, on-failure, unless-stopped."],
        ["labels", "agent.metadata.labels", "Labels preserved as agent metadata. Traefik labels trigger reverse proxy config."],
      ],
      [22, 22, 56],
      { monoCol: [0, 1] }
    ),
    spacer(80),

    heading("Volume Mapping", HeadingLevel.HEADING_2),
    bodyText("Docker Compose volume definitions are mapped to Hive's persistent storage system:"),
    spacer(40),

    makeTable(
      ["Volume Type", "Hive Storage", "Handling"],
      [
        ["Named volume", "Hive Persistent Volume", "Creates a named persistent volume in Hive. Data survives agent restarts and re-deployments."],
        ["Bind mount (host path)", "Hive Volume Mount", "Path validated on Hive host. Warning if path does not exist. Created if necessary with permissions check."],
        ["tmpfs mount", "Hive tmpfs Volume", "Temporary in-memory storage. Size limit preserved from tmpfs options."],
        ["Volume with driver", "Hive Volume (driver-specific)", "NFS, CIFS, and local drivers supported. Driver options preserved in volume configuration."],
      ],
      [22, 22, 56],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Network Mapping", HeadingLevel.HEADING_2),
    bodyText("Docker Compose networks map to Hive agent group isolation boundaries:"),
    spacer(40),

    bullet("Each named network becomes a Hive agent group with network isolation enabled", { bold_prefix: "Network to Group: " }),
    bullet("Services sharing a network are grouped together with inter-agent communication enabled", { bold_prefix: "Shared Networks: " }),
    bullet("External networks generate a warning prompting the user to configure Hive network settings", { bold_prefix: "External Networks: " }),
    bullet("Custom subnet and gateway configurations are preserved in Hive network settings", { bold_prefix: "Custom Subnets: " }),
    bullet("Network aliases become agent DNS aliases within the Hive CoreDNS configuration", { bold_prefix: "Aliases: " }),
    spacer(80),

    heading("Resource Limits Mapping", HeadingLevel.HEADING_2),
    bodyText("Docker Compose deploy.resources constraints are mapped to Hive agent resource configurations:"),
    spacer(40),

    makeTable(
      ["Compose Resource Path", "Hive Resource Config", "Notes"],
      [
        ["deploy.resources.limits.cpus", "resources.cpu (limit)", "CPU limit in cores (e.g., '2.0' = 2 CPU cores)"],
        ["deploy.resources.limits.memory", "resources.memory (limit)", "Memory limit with unit (e.g., '2G', '512M')"],
        ["deploy.resources.reservations.cpus", "resources.cpu (request)", "Minimum CPU allocation guaranteed"],
        ["deploy.resources.reservations.memory", "resources.memory (request)", "Minimum memory allocation guaranteed"],
        ["deploy.resources.reservations.devices (GPU)", "resources.gpu: true", "NVIDIA GPU reservation detected; GPU sidecar access enabled"],
        ["deploy.replicas", "agent.replicas", "Number of agent instances. Mapped to Hive scaling config."],
      ],
      [34, 24, 42],
      { monoCol: [0, 1] }
    ),
    spacer(80),

    heading("Environment Variable Intelligence", HeadingLevel.HEADING_2),
    bodyText("The parser applies heuristics to classify environment variables into configuration values and secrets:"),
    spacer(40),

    makeTable(
      ["Classification", "Detection Pattern", "Hive Destination"],
      [
        ["Secret", "Variable name contains: KEY, SECRET, TOKEN, PASSWORD, CREDENTIAL, AUTH", "Hive Secrets (encrypted)"],
        ["Secret", "Value starts with: sk-, pk-, ghp_, glpat-, xoxb-", "Hive Secrets (encrypted)"],
        ["Secret", "Value matches Base64/JWT pattern", "Hive Secrets (encrypted)"],
        ["Config", "Variable name matches: PORT, HOST, URL, PATH, MODE, LEVEL, ENV", "Agent environment variable"],
        ["Config", "Value is numeric, boolean, or short string", "Agent environment variable"],
        ["Config (default)", "No pattern match", "Agent environment variable (user can reclassify)"],
      ],
      [16, 42, 42],
      { boldFirst: true }
    ),
  ];
}

// ============================================================================
// SECTION 8: INTERMEDIATE REPRESENTATION SPEC
// ============================================================================

function buildSection8() {
  return [
    heading("8. Intermediate Representation (IR) Specification", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("The HiveAgentGraph is the canonical data structure that all parsers output and all downstream systems consume."),

    heading("HiveAgentGraph Interface", HeadingLevel.HEADING_2),
    bodyText("The root interface captures the complete imported workflow as a graph of agents connected by edges, along with variables and secret references:"),
    spacer(40),

    ...codeBlock([
      '  interface HiveAgentGraph {',
      '    version: string;                    // IR schema version (e.g., "1.0.0")',
      '    source: {',
      '      platform: string;                 // Source platform (e.g., "n8n", "dify")',
      '      version: string;                  // Source platform version',
      '      exportedAt: string;               // ISO 8601 timestamp of original export',
      '      fileName: string;                 // Original file name',
      '    };',
      '    agents: HiveAgentNode[];            // All detected agents',
      '    edges: HiveEdge[];                  // Connections between agents',
      '    variables: HiveVariable[];          // Configuration variables',
      '    secrets: HiveSecretRef[];           // Secret references (values never stored)',
      '    metadata: Record<string, unknown>;  // Platform-specific metadata',
      '    warnings: ImportWarning[];          // Parse warnings for user review',
      '  }',
    ]),
    spacer(80),

    heading("HiveAgentNode Interface", HeadingLevel.HEADING_2),
    bodyText("Each agent node captures the complete configuration needed to deploy an agent in Hive:"),
    spacer(40),

    ...codeBlock([
      '  interface HiveAgentNode {',
      '    id: string;                         // Unique agent ID (UUID v4)',
      '    name: string;                       // Human-readable agent name',
      '    type: AgentType;                    // Hive agent type enum',
      '    runtime: "docker" | "firecracker" | "auto";',
      '    image: string;                      // Docker image reference',
      '    config: Record<string, unknown>;    // Agent-specific configuration',
      '    resources: {',
      '      cpu: string;                      // CPU allocation (e.g., "1.0")',
      '      memory: string;                   // Memory allocation (e.g., "2Gi")',
      '      gpu: boolean;                     // Whether GPU access is required',
      '      gpuVram: string;                  // VRAM requirement if GPU (e.g., "8Gi")',
      '    };',
      '    env: Record<string, string>;        // Environment variables',
      '    ports: number[];                    // Exposed port numbers',
      '    inputs: PortDefinition[];           // Input port definitions',
      '    outputs: PortDefinition[];          // Output port definitions',
      '    position: { x: number; y: number }; // Canvas position for visual layout',
      '    sourceRef: {                        // Reference back to source platform',
      '      nodeId: string;                   // Original node/component ID',
      '      nodeType: string;                 // Original node type string',
      '    };',
      '    tags: string[];                     // Auto-generated tags for organization',
      '  }',
    ]),
    spacer(80),

    heading("AgentType Enum", HeadingLevel.HEADING_3),
    bodyText("The AgentType enum defines all recognized agent types in Hive:"),
    spacer(40),

    makeTable(
      ["AgentType Value", "Description", "Typical Source"],
      [
        ["llm", "LLM inference agent with model configuration", "LangFlow LLM, N8N Ollama, Dify chatbot"],
        ["http", "HTTP request/response agent", "N8N HTTP Request, Dify API calls"],
        ["script", "Custom code execution agent (Node.js/Python)", "N8N Code node, CrewAI custom tools"],
        ["router", "Conditional routing agent", "N8N IF node, Dify branch nodes"],
        ["aggregator", "Data aggregation/merge agent", "N8N Merge node"],
        ["transform", "Data transformation agent", "N8N Set node, data mapping"],
        ["batch", "Batch processing agent", "N8N SplitInBatches"],
        ["db", "Database interaction agent", "N8N Postgres/MySQL nodes"],
        ["cache", "Cache/Redis interaction agent", "N8N Redis node"],
        ["input", "Workflow trigger/input agent", "N8N Webhook, Dify input"],
        ["output", "Workflow response/output agent", "N8N Respond node"],
        ["orchestrator", "Multi-agent orchestrator", "CrewAI crew, AutoGen GroupChat"],
        ["rag", "RAG pipeline agent", "LangFlow RAG chain"],
        ["vectorstore", "Vector store agent", "LangFlow/Flowise vector stores"],
        ["embedding", "Text embedding agent", "LangFlow embeddings"],
        ["generic", "Generic container agent", "Docker Compose services"],
      ],
      [18, 36, 46],
      { monoCol: [0], boldFirst: true }
    ),
    spacer(80),

    heading("HiveEdge Interface", HeadingLevel.HEADING_2),
    bodyText("Edges define directional data flow between agents, with optional transform and condition expressions:"),
    spacer(40),

    ...codeBlock([
      '  interface HiveEdge {',
      '    id: string;                         // Unique edge ID (UUID v4)',
      '    source: {',
      '      agentId: string;                  // Source agent ID',
      '      port: string;                     // Source output port name',
      '    };',
      '    target: {',
      '      agentId: string;                  // Target agent ID',
      '      port: string;                     // Target input port name',
      '    };',
      '    transform?: string;                 // Optional data transform expression',
      '    condition?: string;                 // Optional routing condition',
      '    metadata?: {',
      '      label?: string;                   // Display label for the edge',
      '      sourceNodeName?: string;          // Original source node name',
      '      targetNodeName?: string;          // Original target node name',
      '    };',
      '  }',
    ]),
    spacer(80),

    heading("Supporting Interfaces", HeadingLevel.HEADING_2),
    spacer(40),

    ...codeBlock([
      '  interface PortDefinition {',
      '    name: string;                       // Port name (e.g., "input_0")',
      '    type: "data" | "trigger" | "config";',
      '    dataType?: string;                  // Expected data format',
      '    required?: boolean;',
      '  }',
      '',
      '  interface HiveVariable {',
      '    key: string;                        // Variable name',
      '    value: string;                      // Default value',
      '    description?: string;               // Human-readable description',
      '    scope: "global" | "agent";          // Variable scope',
      '    agentId?: string;                   // If agent-scoped, which agent',
      '  }',
      '',
      '  interface HiveSecretRef {',
      '    key: string;                        // Secret name in Hive vault',
      '    sourceName: string;                 // Original credential name',
      '    sourceType: string;                 // Original credential type',
      '    usedBy: string[];                   // Agent IDs that reference this secret',
      '    required: boolean;                  // Whether agents fail without this secret',
      '  }',
      '',
      '  interface ImportWarning {',
      '    level: "info" | "warning" | "error";',
      '    code: string;                       // Machine-readable warning code',
      '    message: string;                    // Human-readable message',
      '    nodeId?: string;                    // Related source node ID',
      '    suggestion?: string;               // Suggested resolution',
      '  }',
    ]),
  ];
}

// ============================================================================
// SECTION 9: IMPORT UX FLOW
// ============================================================================

function buildSection9() {
  return [
    heading("9. Import UX Flow", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("The import experience is designed to be intuitive for first-time users while providing full control for power users."),

    heading("Step-by-Step User Flow", HeadingLevel.HEADING_2),
    spacer(40),

    heading("Step 1: Initiate Import", HeadingLevel.HEADING_3),
    bodyText("The import flow can be initiated from multiple locations in the Hive UI:"),
    bullet("'Import' button in the Agent Management page header"),
    bullet("'Import Workflow' option in the Dashboard quick actions panel"),
    bullet("'Import from File' option in the Agent creation dropdown menu"),
    bullet("Keyboard shortcut Ctrl+I (Cmd+I on macOS) from anywhere in the application"),
    spacer(40),

    heading("Step 2: File Upload Dialog", HeadingLevel.HEADING_3),
    bodyText("The import dialog presents a clean, focused interface:"),
    bullet("Large drag-and-drop zone occupying the center of the dialog (supports .json, .yml, .yaml, and text files)"),
    bullet("'Browse Files' button as an alternative to drag-and-drop"),
    bullet("Recent imports list showing previously imported files with timestamps and status"),
    bullet("File size indicator showing the 10MB maximum limit"),
    bullet("Supported platforms listed with icons below the drop zone"),
    spacer(40),

    heading("Step 3: Platform Auto-Detection", HeadingLevel.HEADING_3),
    bodyText("Upon file upload, the import engine immediately begins analysis:"),
    bullet("File content is parsed and matched against platform detection signatures"),
    bullet("Detected platform is displayed with confidence level (high/medium/low)"),
    bullet("If auto-detection confidence is low, user is prompted to manually select the platform from a dropdown"),
    bullet("Platform version is extracted and validated against supported version ranges"),
    bullet("If the platform version is unsupported, a clear error message is shown with upgrade/downgrade suggestions"),
    spacer(40),

    heading("Step 4: Parsing Progress", HeadingLevel.HEADING_3),
    bodyText("The parser provides real-time feedback during analysis:"),
    bullet("Progress bar with percentage completion and current phase label"),
    bullet("Live counter showing: nodes detected, connections mapped, variables found, secrets identified"),
    bullet("Warning badges appear in real-time as compatibility issues are detected"),
    bullet("Parse timeout of 30 seconds with a cancel button always visible"),
    bullet("For large workflows (20+ nodes), an estimated time remaining is displayed"),
    spacer(40),

    heading("Step 5: Preview Screen", HeadingLevel.HEADING_3),
    bodyText("The preview screen is the most critical step, giving users full visibility into what will be deployed:"),
    spacer(40),

    bodyText("The preview is divided into three panels:", { bold: true }),
    spacer(20),

    bodyTextMulti([{ text: "Agent Cards Panel (left): ", bold: true }, { text: "Each detected agent is shown as a card with its name, type, image, resource requirements, and status (ready/warning/error). Cards are color-coded: green border for ready-to-deploy, yellow for warnings, red for errors requiring attention." }]),
    spacer(40),

    bodyTextMulti([{ text: "Visual Graph Panel (center): ", bold: true }, { text: "An interactive graph visualization (using React Flow) shows all agents as nodes and connections as edges. Users can pan, zoom, and click nodes to see details. The layout is automatically arranged but can be manually adjusted." }]),
    spacer(40),

    bodyTextMulti([{ text: "Issues Panel (right): ", bold: true }, { text: "A categorized list of warnings and errors. Each issue includes a description, the affected agent(s), and a suggested resolution. Users can dismiss informational warnings or take action on errors." }]),
    spacer(80),

    heading("Step 6: Edit & Customize", HeadingLevel.HEADING_3),
    bodyText("Before deployment, users have full editing capabilities:"),
    bullet("Click any agent card to open its configuration editor"),
    bullet("Rename agents, change resource allocations, modify environment variables"),
    bullet("Delete agents that are not needed (dependencies are automatically updated)"),
    bullet("Add new agents manually to complement the imported workflow"),
    bullet("Rearrange the visual graph layout for clarity"),
    bullet("Provide values for detected secret references"),
    spacer(40),

    heading("Step 7: Deploy All", HeadingLevel.HEADING_3),
    bodyText("The 'Deploy All' button triggers the deployment pipeline:"),
    bullet("Each agent is fed into the Agent Wizard with all fields pre-filled from the IR"),
    bullet("Users can choose 'Deploy Now' (start all agents) or 'Create Stopped' (deploy but do not start)"),
    bullet("Agent dependencies are respected: dependent agents wait for their prerequisites"),
    bullet("A deployment queue shows all agents with individual progress bars"),
    spacer(40),

    heading("Step 8: Deployment Progress", HeadingLevel.HEADING_3),
    bodyText("During deployment, a progress dashboard shows:"),
    bullet("Per-agent status: Queued, Pulling Image, Creating Container, Configuring, Starting, Running, or Failed"),
    bullet("Overall progress bar with count (e.g., '7 of 12 agents deployed')"),
    bullet("Live logs for the currently deploying agent"),
    bullet("'Skip' button to skip a failing agent and continue with the rest"),
    bullet("'Retry' button for failed agents with error details"),
    bullet("'Cancel Remaining' button to stop the deployment queue"),
    spacer(40),

    calloutBox("UX PRINCIPLE", "The import flow follows Hive's progressive disclosure pattern: simple by default, powerful on demand. A user importing a simple N8N workflow can go from file upload to running agents in under 60 seconds.", COLORS.PRIMARY_DARK),
  ];
}

// ============================================================================
// SECTION 10: VALIDATION & ERROR HANDLING
// ============================================================================

function buildSection10() {
  return [
    heading("10. Validation & Error Handling", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("The import engine implements multiple validation layers to ensure imported workflows result in functional, secure Hive deployments."),

    heading("Validation Pipeline", HeadingLevel.HEADING_2),
    bodyText("Validation occurs at four distinct stages, each catching different categories of issues:"),
    spacer(40),

    makeTable(
      ["Stage", "Validation Type", "Checks Performed", "Failure Mode"],
      [
        ["1. Upload", "File Format Validation", "File extension, MIME type, file size (max 10MB), character encoding (UTF-8), well-formed JSON/YAML", "Reject with clear error message"],
        ["2. Parse", "Schema Validation", "Platform-specific schema compliance, required fields present, data types correct, version compatibility", "Reject with field-level error details"],
        ["3. Map", "Semantic Validation", "Node type recognized, connections valid (output to input), no orphaned nodes, no circular dependencies", "Warning per issue; partial import allowed"],
        ["4. Pre-Deploy", "Resource Validation", "Image exists/pullable, ports available, resource limits within host capacity, GPU available if required, secrets populated", "Warning per issue; user decides"],
      ],
      [10, 18, 42, 30],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Error Categories & Handling", HeadingLevel.HEADING_2),
    spacer(40),

    makeTable(
      ["Error Category", "Severity", "Example", "Resolution Strategy"],
      [
        ["Unsupported Node Type", "Warning", "N8N 'n8n-nodes-base.googleSheets' has no direct Hive mapping", "Suggest creating a generic HTTP Agent with Google Sheets API. Provide API documentation link."],
        ["Missing Credentials", "Warning", "Workflow references 'OpenAI API' credential not included in export", "Prompt user to create the secret in Hive Secrets vault. Pre-fill secret name from workflow."],
        ["Resource Unavailable", "Warning", "Imported model requires GPU but Hive host has no GPU detected", "Suggest CPU-compatible quantization (Q4_K_M). Warn about performance impact."],
        ["Circular Dependency", "Error", "Agent A depends on Agent B which depends on Agent A", "Highlight circular path in visual graph. Require user to break the cycle before deploying."],
        ["Version Incompatible", "Error", "N8N workflow exported from v0.150 (below minimum v0.200)", "Show version mismatch details. Suggest re-exporting from a supported version."],
        ["Malformed File", "Error", "JSON syntax error at line 42, column 15", "Show exact error location with surrounding context. Suggest fixing the file and re-uploading."],
        ["Duplicate Agent Names", "Warning", "Two nodes both named 'HTTP Request'", "Auto-suffix with numbers: 'HTTP Request', 'HTTP Request 2'. User can rename."],
        ["Port Conflict", "Warning", "Two agents both request port 8080", "Auto-assign alternative ports. Show mapping table in preview."],
      ],
      [20, 10, 34, 36],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Partial Import Strategy", HeadingLevel.HEADING_2),
    bodyText("When some components of a workflow cannot be fully imported, the engine supports partial import:"),
    spacer(40),

    bullet("All agents that can be fully mapped are deployed normally"),
    bullet("Agents with warnings are deployed with a 'needs attention' flag visible in the UI"),
    bullet("Agents with errors are skipped but listed in the import report with resolution steps"),
    bullet("Connections to/from skipped agents are preserved as 'pending' edges for later resolution"),
    bullet("The import report is saved and accessible from the agent group settings page"),
    bullet("Users can re-run the import to update skipped agents after making changes"),
    spacer(80),

    heading("Circular Dependency Detection", HeadingLevel.HEADING_2),
    bodyText("The import engine uses Kahn's algorithm (topological sort) to detect circular dependencies in the agent graph. When a cycle is detected:"),
    spacer(40),

    bullet("The specific cycle path is identified (e.g., Agent A -> Agent B -> Agent C -> Agent A)"),
    bullet("All agents in the cycle are highlighted in red in the visual graph preview"),
    bullet("A clear error message explains which connections create the cycle"),
    bullet("The user must remove at least one edge to break the cycle before deployment is allowed"),
    bullet("Suggestion engine proposes which edge removal would least impact the workflow logic"),
  ];
}

// ============================================================================
// SECTION 11: API SPECIFICATION
// ============================================================================

function buildSection11() {
  return [
    heading("11. API Specification", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("The import engine exposes a RESTful API for programmatic workflow import, enabling CLI tools and external integrations."),

    heading("Endpoints Overview", HeadingLevel.HEADING_2),
    spacer(40),

    makeTable(
      ["Method", "Endpoint", "Description", "Auth Required"],
      [
        ["POST", "/api/v1/import/upload", "Upload a workflow file and receive parsed IR", "Admin, Operator"],
        ["POST", "/api/v1/import/validate", "Validate an IR document before deployment", "Admin, Operator"],
        ["POST", "/api/v1/import/deploy", "Deploy all agents from a validated IR", "Admin, Operator"],
        ["GET", "/api/v1/import/platforms", "List supported platforms and version ranges", "Any authenticated"],
        ["POST", "/api/v1/import/preview", "Parse and return preview without deploying", "Admin, Operator"],
        ["GET", "/api/v1/import/history", "List previous imports with status and timestamps", "Admin, Operator"],
        ["GET", "/api/v1/import/history/:id", "Get details of a specific import", "Admin, Operator"],
        ["DELETE", "/api/v1/import/history/:id", "Delete an import record", "Admin"],
      ],
      [10, 28, 40, 22],
      { monoCol: [0, 1] }
    ),
    spacer(80),

    heading("POST /api/v1/import/upload", HeadingLevel.HEADING_2),
    bodyText("Upload a workflow file for parsing. The file is sent as multipart/form-data. The response contains the parsed HiveAgentGraph IR."),
    spacer(40),

    heading("Request", HeadingLevel.HEADING_3),
    ...codeBlock([
      '  POST /api/v1/import/upload',
      '  Content-Type: multipart/form-data',
      '  Authorization: Bearer <api_key>',
      '',
      '  Form Fields:',
      '    file: <workflow_file>              // Required. The workflow file.',
      '    platform: "n8n"                    // Optional. Override auto-detection.',
      '    name: "My Workflow Import"         // Optional. Name for the import.',
    ]),
    spacer(40),

    heading("Response (200 OK)", HeadingLevel.HEADING_3),
    ...codeBlock([
      '  {',
      '    "id": "imp_abc123",',
      '    "status": "parsed",',
      '    "platform": "n8n",',
      '    "platformVersion": "1.24.0",',
      '    "detectionConfidence": "high",',
      '    "graph": { /* HiveAgentGraph */ },',
      '    "summary": {',
      '      "agentCount": 8,',
      '      "edgeCount": 12,',
      '      "variableCount": 3,',
      '      "secretCount": 2,',
      '      "warningCount": 1,',
      '      "errorCount": 0',
      '    },',
      '    "createdAt": "2026-03-20T14:30:00Z"',
      '  }',
    ]),
    spacer(80),

    heading("POST /api/v1/import/validate", HeadingLevel.HEADING_2),
    bodyText("Validate an IR document (possibly modified by the user) before deployment. Returns detailed validation results."),
    spacer(40),

    heading("Request", HeadingLevel.HEADING_3),
    ...codeBlock([
      '  POST /api/v1/import/validate',
      '  Content-Type: application/json',
      '  Authorization: Bearer <api_key>',
      '',
      '  {',
      '    "importId": "imp_abc123",',
      '    "graph": { /* Modified HiveAgentGraph */ }',
      '  }',
    ]),
    spacer(40),

    heading("Response (200 OK)", HeadingLevel.HEADING_3),
    ...codeBlock([
      '  {',
      '    "valid": true,',
      '    "errors": [],',
      '    "warnings": [',
      '      {',
      '        "code": "UNSUPPORTED_NODE",',
      '        "message": "Node type googleSheets has no direct mapping",',
      '        "agentId": "agent-uuid-5",',
      '        "suggestion": "Use HTTP Agent with Google Sheets API"',
      '      }',
      '    ],',
      '    "resourceCheck": {',
      '      "cpuAvailable": true,',
      '      "memoryAvailable": true,',
      '      "gpuAvailable": false,',
      '      "diskAvailable": true,',
      '      "portsAvailable": true',
      '    }',
      '  }',
    ]),
    spacer(80),

    heading("POST /api/v1/import/deploy", HeadingLevel.HEADING_2),
    bodyText("Deploy all agents from a validated IR. Returns a deployment job ID for tracking progress via WebSocket or polling."),
    spacer(40),

    heading("Request", HeadingLevel.HEADING_3),
    ...codeBlock([
      '  POST /api/v1/import/deploy',
      '  Content-Type: application/json',
      '  Authorization: Bearer <api_key>',
      '',
      '  {',
      '    "importId": "imp_abc123",',
      '    "graph": { /* Final HiveAgentGraph */ },',
      '    "options": {',
      '      "startAfterDeploy": true,',
      '      "skipOnError": true,',
      '      "groupName": "Imported Workflow"',
      '    }',
      '  }',
    ]),
    spacer(40),

    heading("Response (202 Accepted)", HeadingLevel.HEADING_3),
    ...codeBlock([
      '  {',
      '    "deploymentId": "dep_xyz789",',
      '    "status": "queued",',
      '    "agents": [',
      '      { "id": "agent-1", "name": "Webhook Input", "status": "queued" },',
      '      { "id": "agent-2", "name": "LLM Processor", "status": "queued" },',
      '      ...',
      '    ],',
      '    "wsChannel": "/ws/deployments/dep_xyz789",',
      '    "pollUrl": "/api/v1/deployments/dep_xyz789"',
      '  }',
    ]),
    spacer(80),

    heading("GET /api/v1/import/platforms", HeadingLevel.HEADING_2),
    bodyText("Returns the list of supported platforms with version ranges and capabilities."),
    spacer(40),

    heading("Response (200 OK)", HeadingLevel.HEADING_3),
    ...codeBlock([
      '  {',
      '    "platforms": [',
      '      {',
      '        "id": "n8n",',
      '        "name": "N8N",',
      '        "formats": ["json"],',
      '        "supportLevel": "full",',
      '        "minVersion": "0.200.0",',
      '        "maxVersion": "1.x",',
      '        "nodeTypesSupported": 52,',
      '        "description": "Visual workflow automation"',
      '      },',
      '      ...',
      '    ]',
      '  }',
    ]),
  ];
}

// ============================================================================
// SECTION 12: EXPORT FROM HIVE
// ============================================================================

function buildSection12() {
  return [
    heading("12. Export from Hive", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("Hive supports exporting agent configurations in multiple formats for sharing, backup, and interoperability."),

    heading("Export Formats", HeadingLevel.HEADING_2),
    spacer(40),

    makeTable(
      ["Export Type", "Format", "Contents", "Use Case"],
      [
        ["Single Agent", "JSON (.json)", "Agent configuration, resource allocation, environment variables, model selection. Secrets exported as references only.", "Duplicate an agent, share a template, create a backup of a specific agent configuration."],
        ["Agent Group", "Docker Compose (.yml)", "All agents in the group as services, with networks, volumes, and dependencies. Secrets exported as environment variable placeholders.", "Deploy the same agent group on another Hive instance or run outside Hive using Docker Compose."],
        ["Pipeline", "Hive Pipeline (.hive.json)", "Complete pipeline definition including agents, edges, transforms, and conditions. IR format for Hive-to-Hive sharing.", "Share complete multi-agent workflows between Hive instances or with other Hive users."],
        ["Marketplace Template", "Hive Template (.template.json)", "Agent configuration packaged with metadata (name, description, category, tags, screenshots, requirements). Sanitized for public sharing.", "Publish to Hive Marketplace for community discovery and one-click deployment."],
        ["Full Backup", "Archive (.tar.gz)", "All agents, pipelines, groups, settings, secrets (encrypted), and database dump. Complete instance snapshot.", "Disaster recovery, migration to new hardware, instance cloning."],
      ],
      [18, 20, 36, 26],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Version Tagging", HeadingLevel.HEADING_2),
    bodyText("All exports include version metadata to ensure compatibility when importing:"),
    spacer(40),

    bullet("Each export is tagged with the Hive instance version that produced it"),
    bullet("The IR schema version is embedded to handle format evolution"),
    bullet("Users can tag exports with custom version labels (e.g., 'v1.2-stable')"),
    bullet("Import engine validates version compatibility before processing"),
    bullet("Breaking changes in IR format trigger migration scripts during import"),
    spacer(80),

    heading("Export Security", HeadingLevel.HEADING_2),
    bodyText("Exports are designed to be safe for sharing without leaking sensitive information:"),
    spacer(40),

    bullet("Secret values are never included in exports (only reference names)"),
    bullet("Environment variables flagged as sensitive are replaced with placeholders"),
    bullet("Custom images from private registries include the image reference but not registry credentials"),
    bullet("User-identifying information (audit logs, user IDs) is stripped from exports"),
    bullet("Optional encryption for archive exports using a user-provided passphrase"),
    spacer(40),

    heading("Export API", HeadingLevel.HEADING_3),
    makeTable(
      ["Method", "Endpoint", "Description"],
      [
        ["GET", "/api/v1/agents/:id/export", "Export a single agent as JSON"],
        ["GET", "/api/v1/groups/:id/export?format=compose", "Export an agent group as Docker Compose"],
        ["GET", "/api/v1/pipelines/:id/export", "Export a pipeline in Hive format"],
        ["POST", "/api/v1/export/template", "Package an agent as a Marketplace template"],
        ["POST", "/api/v1/export/backup", "Create a full instance backup archive"],
      ],
      [10, 40, 50],
      { monoCol: [0, 1] }
    ),
  ];
}

// ============================================================================
// SECTION 13: SECURITY CONSIDERATIONS
// ============================================================================

function buildSection13() {
  return [
    heading("13. Security Considerations", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("The import system is designed with defense-in-depth security principles, treating all imported files as untrusted input."),

    heading("File Upload Security", HeadingLevel.HEADING_2),
    spacer(40),

    makeTable(
      ["Security Control", "Implementation", "Rationale"],
      [
        ["File Size Limit", "Maximum 10MB per upload. Enforced at reverse proxy (Traefik) and application level.", "Prevents denial-of-service via large file uploads that could exhaust memory or disk."],
        ["File Type Validation", "Only .json, .yml, .yaml, and text files accepted. MIME type and magic bytes checked.", "Prevents upload of executable files, archives, or binary payloads."],
        ["Character Encoding", "UTF-8 enforced. Files with other encodings are rejected with a clear error.", "Prevents encoding-based attacks and ensures consistent parsing."],
        ["Content Scanning", "JSON/YAML parsed in a sandboxed context with resource limits. No dynamic code execution during parsing.", "Prevents YAML deserialization attacks (e.g., YAML bombs, arbitrary object instantiation)."],
        ["Temporary Storage", "Uploaded files stored in /tmp with random names and deleted after parsing (max 5-minute TTL).", "Minimizes exposure window for uploaded content on the server filesystem."],
      ],
      [18, 44, 38],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Sandboxed Parsing", HeadingLevel.HEADING_2),
    bodyText("All parsing operations run in a sandboxed environment with strict resource constraints:"),
    spacer(40),

    bullet("Parser runs in a separate worker thread with a 30-second timeout", { bold_prefix: "Isolation: " }),
    bullet("Maximum 256MB memory allocation for the parser process", { bold_prefix: "Memory Limit: " }),
    bullet("No network access during parsing (all resolution is post-parse)", { bold_prefix: "Network Isolation: " }),
    bullet("No filesystem access beyond the uploaded file (read-only)", { bold_prefix: "FS Restriction: " }),
    bullet("JSON.parse and YAML.parse only with safe schemas; no dynamic code execution", { bold_prefix: "Safe Parsing: " }),
    bullet("YAML parsing uses safe schema (no custom tags, no object instantiation)", { bold_prefix: "Safe YAML: " }),
    spacer(80),

    heading("Credential Stripping", HeadingLevel.HEADING_2),
    bodyText("The import engine follows a strict credential handling policy:"),
    spacer(40),

    bullet("Credential values are never extracted from imported files, even if present"),
    bullet("Only credential names and types are recorded for Hive Secret placeholder creation"),
    bullet("Inline API keys or tokens detected in configuration values trigger a security warning"),
    bullet("Users are advised to rotate any credentials that may have been exposed in exported files"),
    bullet("Import audit logs record which credentials were detected but never log their values"),
    spacer(80),

    heading("Audit Logging", HeadingLevel.HEADING_2),
    bodyText("All import operations are comprehensively logged for compliance and security auditing:"),
    spacer(40),

    makeTable(
      ["Event", "Logged Data", "Retention"],
      [
        ["File Upload", "User, timestamp, file name, file size, source IP, detected platform", "1 year"],
        ["Parse Success", "User, timestamp, import ID, agent count, edge count, warning count", "1 year"],
        ["Parse Failure", "User, timestamp, error type, error message (no file content)", "1 year"],
        ["Deploy Initiated", "User, timestamp, import ID, agent names, deployment options", "1 year"],
        ["Deploy Complete", "User, timestamp, deployment ID, success/failure per agent", "1 year"],
        ["Import Deleted", "User, timestamp, import ID", "1 year"],
      ],
      [18, 52, 30],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Permission Model", HeadingLevel.HEADING_2),
    bodyText("Import operations are restricted by Hive's RBAC system:"),
    spacer(40),

    makeTable(
      ["Role", "Upload & Parse", "Preview", "Deploy", "View History", "Delete History"],
      [
        ["Admin", "Yes", "Yes", "Yes", "Yes", "Yes"],
        ["Operator", "Yes", "Yes", "Yes", "Yes", "No"],
        ["Viewer", "No", "No", "No", "Yes (own)", "No"],
      ],
      [16, 16, 16, 16, 18, 18],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Malicious File Detection", HeadingLevel.HEADING_2),
    bodyText("The parser includes checks for known attack patterns in workflow files:"),
    spacer(40),

    bullet("YAML entity expansion attacks (billion laughs / XML bomb equivalent)"),
    bullet("Deeply nested JSON structures (max depth: 50 levels)"),
    bullet("Extremely large arrays or objects (max 10,000 elements)"),
    bullet("Embedded scripts or executable code in unexpected fields"),
    bullet("Path traversal attempts in file references (../ patterns)"),
    bullet("URL references to internal network addresses (SSRF prevention)"),
  ];
}

// ============================================================================
// SECTION 14: PERFORMANCE & LIMITS
// ============================================================================

function buildSection14() {
  return [
    heading("14. Performance & Limits", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("Performance targets and resource limits ensure the import engine operates reliably under various conditions."),

    heading("Import Limits", HeadingLevel.HEADING_2),
    spacer(40),

    makeTable(
      ["Parameter", "Limit", "Rationale", "Configurable"],
      [
        ["Max Agents per Import", "50", "Prevents excessively large deployments that could overwhelm the host. Aligns with typical workflow complexity.", "Yes (Admin settings)"],
        ["Max File Size", "10 MB", "Sufficient for even the largest N8N/Dify workflows. Prevents memory exhaustion during parsing.", "Yes (Admin settings)"],
        ["Parse Timeout", "30 seconds", "Prevents parser hangs on malformed files. Most workflows parse in under 2 seconds.", "Yes (Admin settings)"],
        ["Concurrent Imports per User", "3", "Prevents a single user from monopolizing import engine resources.", "Yes (Admin settings)"],
        ["Concurrent Imports (Global)", "10", "Server-wide limit to protect against burst load during team onboarding.", "Yes (Admin settings)"],
        ["Max Edges per Import", "200", "Prevents combinatorial explosion in connection mapping. Typical workflows have 10-50 edges.", "Yes (Admin settings)"],
        ["Max Variables per Import", "100", "Limits configuration complexity. Most workflows define fewer than 20 variables.", "Yes (Admin settings)"],
        ["Max Secrets per Import", "50", "Limits secret vault growth per import operation.", "Yes (Admin settings)"],
        ["Import History Retention", "90 days", "Import records automatically cleaned up after retention period.", "Yes (Admin settings)"],
        ["Rate Limit (Upload)", "10/minute per user", "Prevents abuse of the upload endpoint.", "Yes (Admin settings)"],
      ],
      [22, 14, 46, 18],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Performance Benchmarks", HeadingLevel.HEADING_2),
    bodyText("The following benchmarks were measured on a reference system (4-core CPU, 16GB RAM, SSD storage):"),
    spacer(40),

    makeTable(
      ["Scenario", "File Size", "Agents", "Parse Time", "Memory Used"],
      [
        ["Simple N8N workflow (5 nodes)", "12 KB", "5", "120 ms", "8 MB"],
        ["Medium N8N workflow (15 nodes)", "45 KB", "15", "340 ms", "18 MB"],
        ["Complex N8N workflow (40 nodes)", "180 KB", "40", "1.2 sec", "52 MB"],
        ["LangFlow RAG pipeline", "28 KB", "8", "200 ms", "12 MB"],
        ["Flowise chatflow", "22 KB", "6", "160 ms", "10 MB"],
        ["Dify workflow app", "8 KB", "4", "90 ms", "6 MB"],
        ["Docker Compose (12 services)", "4 KB", "12", "80 ms", "5 MB"],
        ["Ollama Modelfile", "1 KB", "1", "10 ms", "2 MB"],
        ["CrewAI multi-agent config", "15 KB", "6", "250 ms", "14 MB"],
        ["AutoGen group chat config", "20 KB", "5", "220 ms", "13 MB"],
        ["Maximum load (50 agents)", "400 KB", "50", "2.8 sec", "128 MB"],
      ],
      [30, 14, 12, 16, 28],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Scalability Considerations", HeadingLevel.HEADING_2),
    bodyText("The import engine is designed to handle multiple concurrent imports without impacting the main Hive application:"),
    spacer(40),

    bullet("Parsing runs in separate worker threads, preventing main thread blocking"),
    bullet("Each parser instance has its own memory budget, preventing cross-import interference"),
    bullet("File uploads are streamed to temporary storage, not buffered in memory"),
    bullet("Deployment jobs are queued and processed sequentially per user, parallel across users"),
    bullet("Database operations during import use transactions with timeout guards"),
    bullet("Large import operations (30+ agents) trigger a warning about deployment time expectations"),
  ];
}

// ============================================================================
// SECTION 15: FUTURE ENHANCEMENTS
// ============================================================================

function buildSection15() {
  return [
    heading("15. Future Enhancements", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),
    sectionIntro("The import system roadmap includes several high-impact features planned for Phase 2 and Phase 3 of Hive's development."),

    heading("Phase 2 Enhancements (Q4 2026)", HeadingLevel.HEADING_2),
    spacer(40),

    makeTable(
      ["Enhancement", "Description", "Impact", "Effort"],
      [
        ["Live N8N Sync", "Bidirectional synchronization with a running N8N instance. Changes in N8N automatically reflected in Hive agents and vice versa. Uses N8N's API for real-time webhook updates.", "High", "Large"],
        ["Import from URL", "Paste an N8N community workflow URL or GitHub raw URL to import directly. No manual file download required. Supports N8N share links and public Dify app templates.", "Medium", "Small"],
        ["AI-Assisted Mapping", "When the parser encounters an unknown node type, an LLM analyzes the node's configuration and suggests the best Hive agent type mapping. Uses the local Ollama model.", "High", "Medium"],
        ["Template Generation", "Automatically generate reusable Hive templates from imported workflows. Parameterize common values (API keys, model names) as template variables.", "Medium", "Small"],
        ["Batch Import", "Import multiple workflow files at once. Each file is parsed independently and deployed as a separate agent group. Useful for migrating an entire N8N instance.", "Medium", "Medium"],
      ],
      [18, 46, 10, 10],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Phase 3 Enhancements (2027)", HeadingLevel.HEADING_2),
    spacer(40),

    makeTable(
      ["Enhancement", "Description", "Impact", "Effort"],
      [
        ["Import History & Re-import", "Full import history with ability to re-import updated versions of previously imported workflows. Diff view showing changes between versions.", "Medium", "Medium"],
        ["LangChain Python Parser", "Parse LangChain LCEL chains and LangServe configurations from Python source files. AST-based parsing for reliable extraction.", "Medium", "Large"],
        ["Zapier Integration", "Import Zapier Zap configurations. OAuth flow integration mapping. Multi-step Zap to multi-agent pipeline conversion.", "Medium", "Large"],
        ["Make.com Integration", "Import Make.com scenario definitions. Module mapping to Hive agents. Router and iterator pattern translation.", "Low", "Large"],
        ["Cross-Instance Import", "Import agents directly from another Hive instance via API. Secure instance-to-instance authentication. Selective import with dependency resolution.", "High", "Medium"],
        ["Visual Diff Tool", "When re-importing a workflow, show a visual diff of what changed: new agents, removed agents, modified configurations. Side-by-side comparison.", "Medium", "Medium"],
      ],
      [20, 46, 10, 10],
      { boldFirst: true }
    ),
    spacer(80),

    heading("Community-Requested Features", HeadingLevel.HEADING_2),
    bodyText("The following features have been requested by the Hive community and are under consideration:"),
    spacer(40),

    bullet("Import from Kubernetes manifests and Helm charts"),
    bullet("Terraform provider configuration import"),
    bullet("Import from Haystack pipeline YAML definitions"),
    bullet("Import from Semantic Kernel (Microsoft) configurations"),
    bullet("Export to N8N format (reverse mapping) for users who want to keep N8N as a secondary tool"),
    bullet("Import validation API for CI/CD pipelines (validate before merge)"),
    bullet("Webhook-triggered import (push a workflow file to a URL and it auto-imports)"),
  ];
}

// ============================================================================
// SECTION 16: APPENDIX
// ============================================================================

function buildSection16() {
  const n8nMappings = [
    ["n8n-nodes-base.webhook", "Input Agent (HTTP Trigger)", "Full"],
    ["n8n-nodes-base.httpRequest", "HTTP Agent", "Full"],
    ["n8n-nodes-base.code", "Script Agent", "Full"],
    ["n8n-nodes-base.if", "Router Agent", "Full"],
    ["n8n-nodes-base.switch", "Router Agent (multi-branch)", "Full"],
    ["n8n-nodes-base.merge", "Aggregator Agent", "Full"],
    ["n8n-nodes-base.set", "Transform Agent", "Full"],
    ["n8n-nodes-base.splitInBatches", "Batch Agent", "Full"],
    ["n8n-nodes-base.postgres", "DB Agent (PostgreSQL)", "Full"],
    ["n8n-nodes-base.mysql", "DB Agent (MySQL)", "Full"],
    ["n8n-nodes-base.mongoDb", "DB Agent (MongoDB)", "Full"],
    ["n8n-nodes-base.redis", "Cache Agent", "Full"],
    ["n8n-nodes-base.cron", "Input Agent (Cron Trigger)", "Full"],
    ["n8n-nodes-base.respondToWebhook", "Output Agent", "Full"],
    ["n8n-nodes-base.noOp", "(Skipped - no-op)", "Full"],
    ["n8n-nodes-base.stickyNote", "(Skipped - UI only)", "Full"],
    ["n8n-nodes-base.executeWorkflow", "Pipeline Reference", "Full"],
    ["n8n-nodes-base.wait", "Delay Agent", "Full"],
    ["n8n-nodes-base.errorTrigger", "Error Handler Agent", "Full"],
    ["n8n-nodes-base.functionItem", "Script Agent (legacy)", "Full"],
    ["n8n-nodes-base.function", "Script Agent (legacy)", "Full"],
    ["n8n-nodes-base.emailSend", "HTTP Agent (SMTP)", "Full"],
    ["n8n-nodes-base.ftp", "HTTP Agent (FTP)", "Partial"],
    ["n8n-nodes-base.ssh", "Script Agent (SSH)", "Partial"],
    ["n8n-nodes-base.xml", "Transform Agent (XML)", "Full"],
    ["n8n-nodes-base.html", "Transform Agent (HTML)", "Full"],
    ["n8n-nodes-base.crypto", "Transform Agent (Crypto)", "Full"],
    ["n8n-nodes-base.dateTime", "Transform Agent (DateTime)", "Full"],
    ["n8n-nodes-base.spreadsheetFile", "Transform Agent (CSV/XLSX)", "Full"],
    ["n8n-nodes-base.moveBinaryData", "Transform Agent (Binary)", "Full"],
    ["n8n-nodes-base.s3", "Storage Agent (S3)", "Partial"],
    ["n8n-nodes-base.googleSheets", "HTTP Agent (Google API)", "Partial"],
    ["n8n-nodes-base.googleDrive", "HTTP Agent (Google API)", "Partial"],
    ["n8n-nodes-base.slack", "HTTP Agent (Slack API)", "Partial"],
    ["n8n-nodes-base.telegram", "HTTP Agent (Telegram API)", "Partial"],
    ["n8n-nodes-base.discord", "HTTP Agent (Discord API)", "Partial"],
    ["n8n-nodes-base.microsoftTeams", "HTTP Agent (Teams API)", "Partial"],
    ["@n8n/n8n-nodes-langchain.lmChatOllama", "LLM Agent (Ollama)", "Full"],
    ["@n8n/n8n-nodes-langchain.lmChatOpenAi", "LLM Agent (OpenAI)", "Full"],
    ["@n8n/n8n-nodes-langchain.lmChatAnthropic", "LLM Agent (Anthropic)", "Full"],
    ["@n8n/n8n-nodes-langchain.lmChatGooglePalm", "LLM Agent (Google)", "Full"],
    ["@n8n/n8n-nodes-langchain.chainLlm", "Pipeline Agent (Chain)", "Full"],
    ["@n8n/n8n-nodes-langchain.chainRetrievalQa", "RAG Pipeline Agent", "Full"],
    ["@n8n/n8n-nodes-langchain.chainSummarization", "Summarization Agent", "Full"],
    ["@n8n/n8n-nodes-langchain.agent", "Orchestrator Agent", "Full"],
    ["@n8n/n8n-nodes-langchain.toolCode", "Tool Agent (Script)", "Full"],
    ["@n8n/n8n-nodes-langchain.toolHttpRequest", "Tool Agent (HTTP)", "Full"],
    ["@n8n/n8n-nodes-langchain.toolCalculator", "Tool Agent (Calc)", "Full"],
    ["@n8n/n8n-nodes-langchain.toolWikipedia", "Tool Agent (Wiki)", "Full"],
    ["@n8n/n8n-nodes-langchain.toolSerpApi", "Tool Agent (Search)", "Full"],
    ["@n8n/n8n-nodes-langchain.memoryBufferWindow", "Memory Config", "Full"],
    ["@n8n/n8n-nodes-langchain.memoryPostgresChat", "Memory Config (PG)", "Full"],
    ["@n8n/n8n-nodes-langchain.embeddingsOllama", "Embedding Config", "Full"],
    ["@n8n/n8n-nodes-langchain.embeddingsOpenAi", "Embedding Config", "Full"],
    ["@n8n/n8n-nodes-langchain.vectorStoreInMemory", "Vector Store Config", "Full"],
    ["@n8n/n8n-nodes-langchain.vectorStorePinecone", "Vector Store Config", "Full"],
    ["@n8n/n8n-nodes-langchain.vectorStorePGVector", "Vector Store Config", "Full"],
    ["@n8n/n8n-nodes-langchain.textSplitterTokenSplitter", "Text Processor Config", "Full"],
    ["@n8n/n8n-nodes-langchain.documentDefaultDataLoader", "Doc Loader Config", "Full"],
    ["@n8n/n8n-nodes-langchain.outputParserStructured", "Output Parser Config", "Full"],
  ];

  const langflowMappings = [
    ["ChatOpenAI", "LLM Agent (OpenAI-compat)", "Model name, temperature, API key"],
    ["ChatOllama", "LLM Agent (Ollama)", "Model name, base URL, parameters"],
    ["LLMChain", "Pipeline Agent", "Prompt template, memory config"],
    ["ConversationChain", "Conversational Agent", "Memory type, prompt, model ref"],
    ["AgentExecutor", "Orchestrator Agent", "Tools list, agent type, verbose mode"],
    ["SerpAPIWrapper", "Tool Agent (Search)", "API key reference, search params"],
    ["OpenAIEmbeddings", "Embedding Service Config", "Model, dimensions, API key"],
    ["OllamaEmbeddings", "Embedding Service Config", "Model, base URL"],
    ["Chroma", "Vector Store Agent", "Collection name, persist directory"],
    ["PGVector", "Vector Store Agent", "Connection string (secret), collection"],
    ["RecursiveCharacterTextSplitter", "Text Processor Config", "Chunk size, overlap"],
    ["BufferMemory", "Memory Config", "Window size, memory key"],
    ["ConversationSummaryMemory", "Memory Config", "LLM ref, max token limit"],
    ["PDFLoader", "Document Ingestion Agent", "File path, extraction mode"],
    ["DirectoryLoader", "Document Ingestion Agent", "Path, glob pattern, recursive"],
    ["StructuredOutputParser", "Transform Agent", "Schema definition, format instructions"],
    ["CustomComponent", "Generic Agent", "Custom code (manual setup required)"],
  ];

  return [
    heading("16. Appendix", HeadingLevel.HEADING_1, { pageBreakBefore: true, border: true }),

    heading("A. Complete N8N Node Type Mapping", HeadingLevel.HEADING_2),
    sectionIntro(`Complete mapping of ${n8nMappings.length} N8N node types to Hive agent types, organized by category.`),

    makeTable(
      ["N8N Node Type", "Hive Agent Type", "Support"],
      n8nMappings.map(([n8n, hive, support]) => [n8n, hive, badge(support)]),
      [40, 30, 30],
      { monoCol: [0] }
    ),
    spacer(100),

    heading("B. LangFlow Component Mapping", HeadingLevel.HEADING_2, { pageBreakBefore: true }),
    sectionIntro(`Mapping of ${langflowMappings.length} LangFlow component types to Hive equivalents.`),

    makeTable(
      ["LangFlow Component", "Hive Equivalent", "Configuration Extracted"],
      langflowMappings,
      [26, 24, 50],
      { monoCol: [0], boldFirst: true }
    ),
    spacer(100),

    heading("C. Glossary of Terms", HeadingLevel.HEADING_2, { pageBreakBefore: true }),
    spacer(40),

    makeTable(
      ["Term", "Definition"],
      [
        ["Agent", "A containerized unit of computation in Hive. Each agent runs in an isolated Docker container or Firecracker microVM and performs a specific function."],
        ["Agent Group", "A logical collection of related agents that share a network namespace and can communicate directly."],
        ["Edge", "A directional connection between two agents defining data flow in a pipeline."],
        ["GPU Sidecar", "Hive's shared inference service that provides GPU access to agents via an OpenAI-compatible API."],
        ["HiveAgentGraph", "The Intermediate Representation (IR) data structure used internally by the import engine to represent any workflow."],
        ["Import Engine", "The server-side component responsible for parsing, validating, and converting external workflow files."],
        ["Intermediate Representation (IR)", "A normalized data format that abstracts away platform-specific details, enabling a unified processing pipeline."],
        ["Parser", "A platform-specific module that reads a workflow file format and outputs a HiveAgentGraph IR."],
        ["Parser Registry", "The central registry that manages all available parsers and routes files to the correct parser."],
        ["Pipeline", "A sequence of connected agents where data flows from one agent to the next, forming a processing chain."],
        ["Port", "A named input or output on an agent through which data enters or exits."],
        ["Secret", "A sensitive value (API key, password, token) stored encrypted in Hive's vault and injected into agents at runtime."],
        ["Transform", "A data transformation expression applied to data flowing through an edge between two agents."],
        ["Workflow", "An external platform's term for a connected graph of processing nodes. Equivalent to a Hive pipeline."],
      ],
      [24, 76],
      { boldFirst: true }
    ),
  ];
}

// ============================================================================
// BUILD DOCUMENT
// ============================================================================

async function build() {
  console.log("Building 14_Hive_Workflow_Import.docx...");

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONTS.BODY,
            size: 22,
            color: COLORS.BODY_TEXT,
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "hive-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: "\u2013",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(1.0), hanging: convertInchesToTwip(0.25) },
                },
              },
            },
          ],
        },
      ],
    },
    features: {
      updateFields: true,
    },
    sections: [
      // Cover page
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: 720, right: 1080, bottom: 720, left: 1080 },
          },
          titlePage: true,
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "HIVE  |  Workflow Import & Cross-Platform Compatibility",
                    font: FONTS.HEADING,
                    size: 16,
                    color: COLORS.MUTED_TEXT,
                  }),
                ],
              }),
            ],
          }),
          first: new Header({ children: [] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.TABLE_BORDER },
                },
                children: [
                  new TextRun({
                    text: "Hive  -  Self-Hosted AI Agent OS  |  Confidential  |  Page ",
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
          first: new Footer({ children: [] }),
        },
        children: [
          ...buildTitlePage(),
          ...buildTOC(),
          ...buildSection1(),
          ...buildSection2(),
          ...buildSection3(),
          ...buildSection4(),
          ...buildSection5(),
          ...buildSection6(),
          ...buildSection7(),
          ...buildSection8(),
          ...buildSection9(),
          ...buildSection10(),
          ...buildSection11(),
          ...buildSection12(),
          ...buildSection13(),
          ...buildSection14(),
          ...buildSection15(),
          ...buildSection16(),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("G:/Hive/docs/14_Hive_Workflow_Import.docx", buffer);
  console.log("Done! Written to G:/Hive/docs/14_Hive_Workflow_Import.docx");
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

build().catch(err => {
  console.error("Build failed:", err);
  process.exit(1);
});
