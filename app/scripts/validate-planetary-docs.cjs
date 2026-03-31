/**
 * Parse all JSON Schemas under docs/schemas/*.json and OpenAPI specs under docs/openapi/*.yaml.
 * (Script name is historical: used by `npm run docs:validate-planetary` in CI.)
 * Run: npm run docs:validate-openapi-schemas (from app/).
 */
const { readFileSync, readdirSync, existsSync } = require("fs");
const { join } = require("path");
const YAML = require("yaml");

const repoRoot = join(__dirname, "..", "..");
const docsDir = join(repoRoot, "docs");
const P = "[hive]";

function main() {
  if (!existsSync(docsDir)) {
    console.error(P, "docs/ not found at", docsDir);
    process.exit(1);
  }

  const schemasDir = join(docsDir, "schemas");
  if (existsSync(schemasDir)) {
    for (const name of readdirSync(schemasDir)) {
      if (!name.endsWith(".json")) continue;
      const p = join(schemasDir, name);
      JSON.parse(readFileSync(p, "utf8"));
      console.log(P, "OK schema", name);
    }
  }

  const openapiDir = join(docsDir, "openapi");
  if (existsSync(openapiDir)) {
    for (const name of readdirSync(openapiDir)) {
      if (!/\.ya?ml$/i.test(name)) continue;
      const p = join(openapiDir, name);
      YAML.parse(readFileSync(p, "utf8"));
      console.log(P, "OK openapi", name);
    }
  }

  console.log(P, "docs:validate-openapi-schemas — all parses succeeded");
}

main();
