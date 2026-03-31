#!/usr/bin/env node
/**
 * extract-langflow-components.mjs
 *
 * Extracts Langflow component definitions into a JSON catalog.
 * Primary source: pre-built component_index.json from lfx package.
 * Fallback: Regex parsing of Python source files.
 *
 * Usage: node scripts/extract-langflow-components.mjs [--clone-dir <path>]
 * Env: LANGFLOW_CLONE_DIR — default: <repo>/langflow-clone
 * Output: app/src/lib/langflow-component-catalog.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliLog, cliErr } from "./cli-prefix.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const args = process.argv.slice(2);
let cloneDirOverride = null;
const cdi = args.indexOf("--clone-dir");
if (cdi !== -1 && args[cdi + 1]) cloneDirOverride = path.resolve(args[cdi + 1]);

const OUTPUT_PATH = path.resolve(__dirname, "../src/lib/langflow-component-catalog.json");

function simplifyInputType(t) {
  const m = {
    StrInput: "string", MessageTextInput: "string", MultilineInput: "string",
    SecretStrInput: "secret", IntInput: "number", FloatInput: "number",
    SliderInput: "number", BoolInput: "boolean", DropdownInput: "options",
    MultiselectInput: "options", HandleInput: "handle", FileInput: "file",
    DictInput: "dict", NestedDictInput: "dict", DataInput: "data",
    TableInput: "table", CodeInput: "code", PromptInput: "prompt", LinkInput: "link",
  };
  return m[t] || t || "string";
}

function templateToInputs(tpl) {
  if (!tpl || typeof tpl !== "object") return [];
  const inputs = [];
  for (const [key, f] of Object.entries(tpl)) {
    if (key === "_type" || key === "code") continue;
    if (typeof f !== "object" || f === null) continue;
    if (f.show === false) continue;
    const entry = {
      name: f.name || key,
      label: f.display_name || key,
      type: simplifyInputType(f._input_type),
      required: f.required || false,
    };
    if (f.info) entry.description = f.info;
    inputs.push(entry);
  }
  return inputs;
}

function normalizeOutputs(outputs) {
  if (!Array.isArray(outputs)) return [];
  return outputs.map((o) => {
    const entry = { name: o.name, label: o.display_name, types: o.types || [] };
    if (o.method) entry.method = o.method;
    return entry;
  });
}

function findPyFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findPyFiles(fp));
    else if (entry.name.endsWith(".py")) results.push(fp);
  }
  return results;
}

function main() {
  const CLONE_DIR =
    cloneDirOverride ||
    (process.env.LANGFLOW_CLONE_DIR
      ? path.resolve(process.env.LANGFLOW_CLONE_DIR)
      : path.join(REPO_ROOT, "langflow-clone"));
  const INDEX_PATH = path.join(CLONE_DIR, "src/lfx/src/lfx/_assets/component_index.json");
  const COMPONENTS_DIR = path.join(CLONE_DIR, "src/lfx/src/lfx/components");

  cliLog("=== Langflow Component Catalog Extractor ===\n");
  const raw = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  const catalog = [];

  for (const [category, components] of raw.entries) {
    for (const [compName, comp] of Object.entries(components)) {
      catalog.push({
        name: compName,
        label: comp.display_name || compName,
        type: (comp.base_classes && comp.base_classes[0]) || "Component",
        category,
        description: comp.description || "",
        icon: comp.icon || "",
        source: "langflow",
        beta: comp.beta || false,
        legacy: comp.legacy || false,
        toolMode: comp.tool_mode || false,
        inputs: templateToInputs(comp.template),
        outputs: normalizeOutputs(comp.outputs),
      });
    }
  }
  cliLog("[info] Extracted " + catalog.length + " components from component_index.json");

  if (fs.existsSync(COMPONENTS_DIR)) {
    const pyFiles = findPyFiles(COMPONENTS_DIR);
    cliLog("[info] Found " + pyFiles.length + " Python files to scan");
    const CLASS_RE = /^class\s+(\w+)\s*\(([^)]*)\)\s*:/gm;
    const DN_RE = /display_name\s*[:=]\s*(?:str\s*=\s*)?["']([^"']+)["']/;
    const DESC_RE = /description\s*[:=]\s*(?:str\s*=\s*)?["']([^"']+)["']/;
    const ICON_RE2 = /icon\s*[:=]\s*(?:str\s*=\s*)?["']([^"']+)["']/;
    const NAME_RE = /^\s+name\s*[:=]\s*(?:str\s*=\s*)?["']([^"']+)["']/m;
    const INPUT_RE = /(\w+Input)\s*\(\s*\n?\s*name\s*=\s*["']([^"']+)["'](?:[\s\S]*?display_name\s*=\s*["']([^"']+)["'])?(?:[\s\S]*?info\s*=\s*["']([^"']*?)["'])?/g;

    const indexNames = new Set(catalog.map(c => c.name));
    let extra = 0;

    for (const filePath of pyFiles) {
      if (path.basename(filePath).startsWith("_")) continue;
      const content = fs.readFileSync(filePath, "utf8");
      const relPath = path.relative(COMPONENTS_DIR, filePath);
      const category = relPath.split(path.sep)[0] || "unknown";

      let match;
      CLASS_RE.lastIndex = 0;
      while ((match = CLASS_RE.exec(content)) !== null) {
        const className = match[1];
        const bases = match[2];
        if (!bases.includes("Component") && !bases.includes("Model") &&
            !bases.includes("LCVectorStore")) continue;

        const classStart = match.index;
        const nextClass = content.indexOf("\nclass ", classStart + 1);
        const classBody = nextClass !== -1 ? content.slice(classStart, nextClass) : content.slice(classStart);

        const displayName = (classBody.match(DN_RE) || [])[1] || className.replace(/Component$/, "");
        const description = (classBody.match(DESC_RE) || [])[1] || "";
        const icon = (classBody.match(ICON_RE2) || [])[1] || "";
        const compName = (classBody.match(NAME_RE) || [])[1] || className.replace(/Component$/, "");

        if (indexNames.has(compName)) continue;

        const inputs = [];
        INPUT_RE.lastIndex = 0;
        let im;
        while ((im = INPUT_RE.exec(classBody)) !== null) {
          const entry = { name: im[2], label: im[3] || im[2], type: simplifyInputType(im[1]), required: false };
          if (im[4]) entry.description = im[4];
          inputs.push(entry);
        }

        catalog.push({
          name: compName, label: displayName,
          type: bases.split(",")[0].trim(), category,
          description, icon, source: "langflow",
          beta: false, legacy: false, toolMode: false,
          inputs, outputs: [],
        });
        indexNames.add(compName);
        extra++;
      }
    }
    if (extra > 0) cliLog("[info] Found " + extra + " additional components from Python files");
  }

  catalog.sort((a, b) => {
    const c = a.category.localeCompare(b.category);
    return c !== 0 ? c : a.name.localeCompare(b.name);
  });

  const categories = [...new Set(catalog.map(c => c.category))];
  cliLog("\n=== Summary ===");
  cliLog("Total components: " + catalog.length);
  cliLog("Categories (" + categories.length + "): " + categories.join(", "));

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2), "utf8");
  cliLog("\n[done] Wrote " + catalog.length + " components to " + OUTPUT_PATH);
}

try {
  main();
} catch (e) {
  cliErr("extract-langflow-components:", e instanceof Error ? e.message : e);
  process.exit(1);
}
