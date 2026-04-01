# Contributing to Pilox

## Architecture

```
app/src/
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/        # Authenticated pages (sidebar layout)
│   │   ├── agents/         # Agent list + detail
│   │   ├── models/         # Model catalog + installed
│   │   ├── marketplace/    # Marketplace catalog, registries, deploy
│   │   ├── monitoring/     # System metrics
│   │   ├── observability/  # Prometheus + Tempo dashboards
│   │   ├── security/       # Audit logs, sessions, secrets
│   │   ├── settings/       # Instance configuration (16 panels)
│   │   └── docs/           # In-app documentation
│   ├── api/                # 105 API routes
│   │   ├── agents/         # Agent CRUD, lifecycle, chat, tools
│   │   ├── mesh/           # Federation, peer discovery, WAN
│   │   ├── billing/        # Wallet, ledger, Stripe
│   │   └── ...
│   ├── auth/               # Login, register, MFA, forgot password
│   └── setup/              # First-boot setup wizard
├── components/
│   ├── dashboard/          # Sidebar, global modals
│   ├── workflow/           # Canvas, nodes, config panel
│   ├── modals/             # Create wizard, import, delete confirm
│   ├── settings/           # Extracted settings panels
│   └── ui/                 # shadcn primitives (button, input, etc.)
├── db/
│   └── schema.ts           # Drizzle ORM schema (single source of truth)
└── lib/
    ├── auth.ts             # NextAuth configuration
    ├── authorize.ts        # RBAC authorization middleware
    ├── billing/            # Wallet, usage metering
    ├── workflow/            # Executor engine + node handlers
    │   └── nodes/          # One file per node type
    ├── mesh-*.ts           # Federation, peer health, WAN signing
    └── ...
```

## Patterns

### API Routes
Every route follows this pattern:
```typescript
export async function POST(req: Request, { params }) {
  return withHttpServerSpan(req, "POST /api/...", async () => {
    const auth = await authorize("operator");
    if (!auth.authorized) return auth.response;
    // ... logic
    return NextResponse.json(result);
  });
}
```

### Adding a Workflow Node
1. Create handler: `lib/workflow/nodes/my-node.ts`
2. Add type to `lib/workflow/types.ts` (WorkflowNode.type + StepType)
3. Register in `lib/workflow/execute.ts` (switch case)
4. Add to canvas palette: `components/workflow/WorkflowCanvas.tsx`
5. Add config UI: `components/workflow/NodeConfigPanel.tsx`
6. Add to flow converter: `components/workflow/utils/flow-converter.ts`
7. Add icon + color: `components/workflow/nodes/AgentStepNode.tsx`

### Adding an API Route
1. Create `app/api/my-route/route.ts`
2. Use `authorize()` for auth, `withHttpServerSpan()` for tracing
3. Use `readJsonBodyLimited()` for POST body parsing
4. Add rate limiting with `checkRateLimit()`
5. Use `writeAuditLog()` for mutations

### Code Style Rules
- **Max 500 lines per file** — split into sub-components if larger
- **One component per file** — no multi-component files
- **Props over context** for data flow between components
- **No inline styles** — use Tailwind + CSS variables
- **No hardcoded colors** — use `--pilox-*` CSS tokens
- **English only** — no French or other languages in code/UI

## Development

```bash
# Start infra
cd app && docker compose up -d

# Start dev server
npm run dev

# Type check
npx tsc --noEmit

# Run tests
npx vitest run
```

## Known Large Files (Refactor Targets)

These files exceed the 500-line guideline. PRs that split them are welcome:

| File | Lines | How to split |
|------|-------|-------------|
| `agents/[id]/page.tsx` | 2174 | Extract each tab (overview, chat, logs, config, metrics, tools) into `agents/[id]/tabs/*.tsx` |
| `settings/page.tsx` | 1878 | Extract remaining inline panels like `llm-providers-panel.tsx` |
| `create-agent-wizard.tsx` | 1000 | Extract each step into `modals/wizard-steps/*.tsx` |
| `NodeConfigPanel.tsx` | 977 | Extract per-node-type config sections into `workflow/configs/*.tsx` |
| `llm-model-catalog.ts` | 2316 | Move data to `data/model-catalog.json`, keep types in `.ts` |

## Security

- All mutations require `authorize()` check
- Secrets encrypted with AES-256-GCM via `encryptSecret()`/`decryptSecret()`
- Rate limiting on all public and federation endpoints
- MFA enforcement in `authorize()` — pre-MFA sessions blocked
- Docker containers: seccomp profile, no-new-privileges, CapDrop ALL
- Federation: JWT with JTI anti-replay, signed manifests, IP allowlists
