#!/usr/bin/env node
/**
 * Renders one Markdown file per Hive block from knowledge/hive-blocks-v1.json for RAG ingestion.
 *
 * Usage: node scripts/render-hive-blocks-rag.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliErr } from "./cli-prefix.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../datasets/hive-copilot-v1");
const SRC = path.join(ROOT, "knowledge/hive-blocks-v1.json");
const OUT = path.join(ROOT, "knowledge/rag-chunks");

function bullet(list) {
  if (!list || !list.length) return "_—_";
  return list.map((x) => `- ${x}`).join("\n");
}

function inlineImages(list) {
  if (!list || !list.length) return "—";
  return list.map((x) => `\`${x}\``).join(", ");
}

function main() {
  const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
  fs.mkdirSync(OUT, { recursive: true });

  for (const b of data.blocks) {
    const md = `# Bloc Hive — ${b.display_name}

**Image Docker:** \`${b.image}\`  
**Rôle:** ${b.role}  
**ID:** \`${b.id}\`

## À quoi ça sert

${b.purpose}

## Quand l’utiliser

${bullet(b.when_to_use)}

## Quand ne pas l’utiliser

${bullet(b.when_not_to_use)}

## Comment ça fonctionne

${b.how_it_works}

## Enchaînements typiques

- **En amont (souvent):** ${inlineImages(b.typical_upstream)}
- **En aval (souvent):** ${inlineImages(b.typical_downstream)}

## Association avec d’autres blocs

${b.pairs_with}

## Configuration (indices)

${bullet(b.config_notes)}

## Correspondance imports (Flowise / Langflow / Dify / n8n)

${bullet(b.import_mapping)}

## Pièges à éviter

${bullet(b.pitfalls)}
`;
    const safeName = String(b.id).replace(/[^a-zA-Z0-9._-]+/g, "_");
    fs.writeFileSync(path.join(OUT, `${safeName}.md`), md, "utf8");
  }

  fs.writeFileSync(
    path.join(OUT, "README.md"),
    `# RAG chunks (Hive blocks)

Ce dossier est généré à partir de \`knowledge/hive-blocks-v1.json\`.

Régénérer les MD :

\`\`\`bash
cd app && npm run dataset:render-blocks-rag
\`\`\`
`,
    "utf8"
  );

  console.log(JSON.stringify({ chunks: data.blocks.length, out: OUT }, null, 2));
}

try {
  main();
} catch (e) {
  cliErr("render-hive-blocks-rag:", e instanceof Error ? e.message : e);
  process.exit(1);
}
