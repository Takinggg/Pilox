# Hive — Plan de Correction Enterprise

**Document** : Plan d'action pour corriger les défauts identifiés dans l'audit  
**Date** : 27 Mars 2026  
**Statut** : En attente d'implémentation

> Note (Docker-first): ce document est un **plan** et peut contenir des exemples de chemins “appliance” (ex: `/etc/hive/...`) qui ne s’appliquent pas à un déploiement **100% Docker**. Pour l’ops Docker, voir plutôt `SERVER_INSTALL.md` / `PRODUCTION.md`.

---

## Table des matières

1. [Résumé des Actions](#1-résumé-des-actions)
2. [Détail des Corrections](#2-détail-des-corrections)
3. [Implémentation MFA](#3-implémentation-mfa)
4. [Implémentation Workflow Sandbox](#4-implémentation-workflow-sandbox)
5. [Correction Error Swallowing](#5-correction-error-swallowing)
6. [Correction Race Conditions](#6-correction-race-conditions)
7. [Tests E2E Plan](#7-tests-e2e-plan)
8. [HA Stack Setup](#8-ha-stack-setup)
9. [Backup Automation](#9-backup-automation)
10. [Helm Chart Hive App](#10-helm-chart-hive-app)

---

## 1. Résumé des Actions

### Priorité 0 — Critique (Avant Prod)

| ID | Action | Impact | Effort | Status |
|----|--------|--------|--------|--------|
| P0-1 | MFA TOTP | 🔴 Sécurité | 3-5j | ⏳ |
| P0-2 | Workflow Sandbox | 🔴 Sandbox escape | 2-3j | ⏳ |
| P0-3 | Command Injection Fix | 🟠 VM compromise | 1-2j | ⏳ |

### Priorité 1 — High (Sprint 1)

| ID | Action | Impact | Effort | Status |
|----|--------|--------|--------|--------|
| P1-1 | Error Logging (254 instances) | 🟠 Forensics | 1-2j | ⏳ |
| P1-2 | Distributed Locking | 🟠 Concurrence | 2-3j | ⏳ |
| P1-3 | E2E Tests (10+ scenarios) | 🟠 Coverage | 1-2 sem | ⏳ |

### Priorité 2 — Medium (Sprint 2-3)

| ID | Action | Impact | Effort | Status |
|----|--------|--------|--------|--------|
| P2-1 | PostgreSQL Replication | 🟡 HA | 2-3j | ⏳ |
| P2-2 | Redis Sentinel | 🟡 HA | 2-3j | ⏳ |
| P2-3 | Backup Automation | 🟡 Compliance | 1-2j | ⏳ |
| P2-4 | Helm Chart (Core) | 🟡 Deployment | 3-5j | ⏳ |

---

## 2. Détail des Corrections

### Fichiers à Modifier

```
app/src/lib/
├── auth.ts                    # + MFA methods
├── authorize.ts               # + error logging
├── session-security.ts        # + atomic operations
├── workflow-executor.ts       # + sandbox
├── cloud-hypervisor.ts       # + validation
├── redis.ts                  # + shutdown cleanup
├── mfa.ts                    # [NEW] TOTP implementation
├── workflow-sandbox.ts        # [NEW] VM2 sandbox
└── distributed-lock.ts       # [NEW] Redlock

app/src/app/api/
├── auth/verify-mfa/route.ts  # [NEW] MFA verification
├── agents/[id]/route.ts      # + distributed lock
└── backups/
    └── schedule/route.ts     # [NEW] Backup scheduling

docker/
├── docker-compose.prod.yml    # + backup service
└── docker-compose.ha.yml      # [NEW] HA configuration

deploy/helm/
└── hive-app/                 # [NEW] Core app chart
```

---

## 3. Implémentation MFA

### 3.1 Dépendances à Ajouter

```bash
cd app
npm install otplib qrcode
npm install -D @types/qrcode
```

### 3.2 Nouveau Fichier: `app/src/lib/mfa.ts`

```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Hive Contributors. See LICENSE for details.

import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { encryptSecret, decryptSecret } from './secrets-crypto';

export interface MFASetupResult {
  secret: string;
  otpauthUrl: string;
  qrCode: string;
}

export interface MFAVerifyResult {
  valid: boolean;
  remainingAttempts: number;
}

const MAX_MFA_ATTEMPTS = 3;
const MFA_COOLDOWN_SECONDS = 300;

export async function generateMFASecret(userId: string): Promise<MFASetupResult> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(secret, 'Hive', userId);
  const qrCode = await QRCode.toDataURL(otpauthUrl);
  
  await db.update(users)
    .set({ 
      mfaSecret: encryptSecret(secret),
      mfaEnabled: false,
      mfaPendingSecret: encryptSecret(secret),
    })
    .where(eq(users.id, userId));
  
  return { secret, otpauthUrl, qrCode };
}

export async function enableMFA(userId: string, token: string): Promise<boolean> {
  const [user] = await db.select({ mfaPendingSecret: users.mfaPendingSecret })
    .from(users)
    .where(eq(users.id, userId));
  
  if (!user?.mfaPendingSecret) {
    return false;
  }
  
  const secret = decryptSecret(user.mfaPendingSecret);
  const isValid = authenticator.verify({ token, secret });
  
  if (isValid) {
    await db.update(users)
      .set({ 
        mfaSecret: user.mfaPendingSecret,
        mfaEnabled: true,
        mfaPendingSecret: null,
      })
      .where(eq(users.id, userId));
  }
  
  return isValid;
}

export async function verifyMFA(userId: string, token: string): Promise<MFAVerifyResult> {
  const [user] = await db.select({
    mfaSecret: users.mfaSecret,
    mfaAttempts: users.mfaAttempts,
    mfaLockoutUntil: users.mfaLockoutUntil,
  }).from(users).where(eq(users.id, userId));
  
  if (!user?.mfaSecret || !user.mfaEnabled) {
    return { valid: true, remainingAttempts: MAX_MFA_ATTEMPTS };
  }
  
  if (user.mfaLockoutUntil && new Date(user.mfaLockoutUntil) > new Date()) {
    return { valid: false, remainingAttempts: 0 };
  }
  
  const secret = decryptSecret(user.mfaSecret);
  const isValid = authenticator.verify({ token, secret });
  const attempts = (user.mfaAttempts || 0) + 1;
  
  if (isValid) {
    await db.update(users)
      .set({ mfaAttempts: 0, mfaLockoutUntil: null })
      .where(eq(users.id, userId));
    return { valid: true, remainingAttempts: MAX_MFA_ATTEMPTS };
  }
  
  const lockoutUntil = attempts >= MAX_MFA_ATTEMPTS
    ? new Date(Date.now() + MFA_COOLDOWN_SECONDS * 1000)
    : null;
  
  await db.update(users)
    .set({ mfaAttempts: attempts, mfaLockoutUntil: lockoutUntil })
    .where(eq(users.id, userId));
  
  return {
    valid: false,
    remainingAttempts: Math.max(0, MAX_MFA_ATTEMPTS - attempts),
  };
}

export function disableMFA(userId: string): Promise<void> {
  return db.update(users)
    .set({ mfaSecret: null, mfaEnabled: false, mfaPendingSecret: null })
    .where(eq(users.id, userId)) as unknown as Promise<void>;
}
```

### 3.3 Migration de Base de Données

```typescript
// app/drizzle/0023_add_mfa_fields.ts
import { pgTable, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const addMFAFields = pgTable('users', {
  mfaEnabled: boolean('mfa_enabled').default(false),
  mfaSecret: text('mfa_secret'),  // encrypted
  mfaPendingSecret: text('mfa_pending_secret'),  // encrypted
  mfaAttempts: integer('mfa_attempts').default(0),
  mfaLockoutUntil: timestamp('mfa_lockout_until'),
});
```

### 3.4 Route API MFA

```typescript
// app/src/app/api/auth/mfa/setup/route.ts
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { generateMFASecret } from '@/lib/mfa';

export async function POST() {
  const auth = await authorize('viewer');
  if (!auth.authorized) {
    return auth.response;
  }
  
  const result = await generateMFASecret(auth.user.id);
  return NextResponse.json(result);
}

// app/src/app/api/auth/mfa/enable/route.ts
export async function POST(request: Request) {
  const auth = await authorize('viewer');
  if (!auth.authorized) return auth.response;
  
  const { token } = await request.json();
  const enabled = await enableMFA(auth.user.id, token);
  
  if (!enabled) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }
  
  return NextResponse.json({ success: true });
}

// app/src/app/api/auth/mfa/verify/route.ts
export async function POST(request: Request) {
  const { userId, token } = await request.json();
  const result = await verifyMFA(userId, token);
  return NextResponse.json(result);
}
```

---

## 4. Implémentation Workflow Sandbox

### 4.1 Dépendances à Ajouter

```bash
cd app
npm install vm2
npm install -D @types/vm2
```

### 4.2 Nouveau Fichier: `app/src/lib/workflow-sandbox.ts`

```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Hive Contributors. See LICENSE for details.

import { NodeVM, VMScript } from 'vm2';
import { createModuleLogger } from './logger';

const log = createModuleLogger('workflow-sandbox');

interface SandboxOptions {
  timeout?: number;
  memoryLimit?: number;
}

interface SandboxContext {
  variables: Record<string, unknown>;
  console: {
    log: (...args: unknown[]) => string;
    error: (...args: unknown[]) => string;
    warn: (...args: unknown[]) => string;
    info: (...args: unknown[]) => string;
  };
  JSON: typeof JSON;
  Math: typeof Math;
  Date: typeof Date;
  Array: typeof Array;
  Object: typeof Object;
  String: typeof String;
  Number: typeof Number;
  Boolean: typeof Boolean;
  RegExp: typeof RegExp;
  parseInt: typeof parseInt;
  parseFloat: typeof parseFloat;
  isNaN: typeof isNaN;
  isFinite: typeof isFinite;
  encodeURIComponent: typeof encodeURIComponent;
  decodeURIComponent: typeof decodeURIComponent;
}

export class WorkflowSandbox {
  private vm: NodeVM;
  private consoleOutput: { level: string; message: string }[] = [];

  constructor(options: SandboxOptions = {}) {
    const timeout = options.timeout ?? 5000;
    const memoryLimit = options.memoryLimit ?? 128;

    this.consoleOutput = [];

    this.vm = new NodeVM({
      timeout,
      memoryLimit,
      sandbox: {},
      eval: false,
      wasm: false,
      env: {},
      argv: [],
      fixAsync: true,
      sourceExtensions: ['js', 'ts'],
      strict: true,
    });
  }

  async execute(code: string, variables: Record<string, unknown>): Promise<{
    result: unknown;
    logs: { level: string; message: string }[];
  }> {
    this.consoleOutput = [];

    const sandbox: SandboxContext = {
      variables: { ...variables },
      console: {
        log: (...args: unknown[]) => {
          const msg = args.map(String).join(' ');
          this.consoleOutput.push({ level: 'log', message: msg });
          return msg;
        },
        error: (...args: unknown[]) => {
          const msg = args.map(String).join(' ');
          this.consoleOutput.push({ level: 'error', message: msg });
          return msg;
        },
        warn: (...args: unknown[]) => {
          const msg = args.map(String).join(' ');
          this.consoleOutput.push({ level: 'warn', message: msg });
          return msg;
        },
        info: (...args: unknown[]) => {
          const msg = args.map(String).join(' ');
          this.consoleOutput.push({ level: 'info', message: msg });
          return msg;
        },
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
    };

    const wrappedCode = `
      'use strict';
      const variables = __variables__;
      const console = __console__;
      ${code}
    `;

    try {
      const script = new VMScript(wrappedCode);
      const fn = this.vm.run(script);
      
      // Inject sandbox into VM
      this.vm.sandbox.__variables__ = sandbox.variables;
      this.vm.sandbox.__console__ = sandbox.console;

      const result = await fn();

      // Extract updated variables
      const updatedVariables = this.vm.sandbox.__variables__ as Record<string, unknown>;

      return {
        result,
        variables: updatedVariables,
        logs: [...this.consoleOutput],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('Sandbox execution failed', { error: errorMessage, code: code.substring(0, 100) });
      
      return {
        result: undefined,
        variables: sandbox.variables,
        logs: [...this.consoleOutput, { level: 'error', message: errorMessage }],
        error: errorMessage,
      };
    }
  }

  destroy(): void {
    // Cleanup if needed
    this.consoleOutput = [];
  }
}

export async function executeInSandbox(
  code: string,
  variables: Record<string, unknown>,
  options?: SandboxOptions
): Promise<{ result: unknown; variables: Record<string, unknown>; logs: { level: string; message: string }[] }> {
  const sandbox = new WorkflowSandbox(options);
  try {
    return await sandbox.execute(code, variables);
  } finally {
    sandbox.destroy();
  }
}
```

### 4.3 Modification de workflow-executor.ts

```typescript
// Remplacer la ligne ~810
// AVANT (DANGEREUX):
// const fn = new Function('variables', 'console', code);
// const result = fn(variables, sandboxConsole);

// APRÈS (SÉCURISÉ):
import { executeInSandbox } from './workflow-sandbox';

async function executeCodeNode(node: WorkflowNode, variables: Record<string, unknown>) {
  const { codeContent, timeoutSeconds = 5 } = node.data;
  
  if (!codeContent) {
    throw new Error('Code node missing codeContent');
  }

  const execution = await executeInSandbox(
    codeContent,
    variables,
    { timeout: timeoutSeconds * 1000 }
  );

  if (execution.error) {
    throw new Error(`Sandbox error: ${execution.error}`);
  }

  return {
    result: execution.result,
    variables: execution.variables,
    logs: execution.logs,
  };
}
```

---

## 5. Correction Error Swallowing

### 5.1 Logger Centralisé

```typescript
// app/src/lib/error-logger.ts
import { createModuleLogger } from './logger';

const errorLog = createModuleLogger('error-logger');

export interface ErrorLogContext {
  module: string;
  operation: string;
  [key: string]: unknown;
}

export async function logErrorSafe<T>(
  operation: () => Promise<T>,
  context: ErrorLogContext
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    errorLog.error('Operation failed', {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : String(error),
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

export function wrapCatchWithLog<T>(
  promise: Promise<T>,
  context: ErrorLogContext
): Promise<T | null> {
  return logErrorSafe(() => promise, context);
}
```

### 5.2 Correction de authorize.ts

```typescript
// AVANT:
// db.insert(auditLogs).values({...}).catch(() => {});

// APRÈS:
import { wrapCatchWithLog } from './error-logger';

const auditContext = { module: 'authorize', operation: 'audit_log' };

// Remplacer chaque .catch(() => {}) par:
wrapCatchWithLog(
  db.insert(auditLogs).values({
    action: "auth.token_failed",
    resource: "api_token",
    details: { reason: "invalid_token" },
    ipAddress: ip,
  }),
  { ...auditContext, action: 'auth.token_failed' }
);
```

### 5.3 Script de Remplacement (pour référence)

```bash
# Utiliser sed ou grep pour trouver toutes les instances:
grep -rn "\.catch(() => {})" app/src/
grep -rn "\.catch((_)" app/src/

# Pattern à remplacer:
# .catch(() => {}) → .catch((err) => log.error('...', { error: err }))
```

---

## 6. Correction Race Conditions

### 6.1 Nouveau Fichier: `app/src/lib/distributed-lock.ts`

```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Hive Contributors. See LICENSE for details.

import { redis } from './redis';
import { createModuleLogger } from './logger';

const log = createModuleLogger('distributed-lock');

export interface LockOptions {
  retryCount?: number;
  retryDelay?: number;
  retryJitter?: number;
  lockTimeout?: number;
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
  lockTimeout: 30000,
};

export class DistributedLock {
  private key: string;
  private value: string;
  private options: Required<LockOptions>;

  constructor(key: string, options: LockOptions = {}) {
    this.key = `lock:${key}`;
    this.value = `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async acquire(): Promise<boolean> {
    const { retryCount, retryDelay, retryJitter, lockTimeout } = this.options;
    
    for (let attempt = 0; attempt < retryCount; attempt++) {
      const result = await redis.set(this.key, this.value, {
        NX: true,
        PX: lockTimeout,
      });

      if (result === 'OK') {
        log.debug('Lock acquired', { key: this.key, attempt });
        return true;
      }

      if (attempt < retryCount - 1) {
        const delay = retryDelay + Math.random() * retryJitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    log.warn('Failed to acquire lock', { key: this.key, attempts: retryCount });
    return false;
  }

  async release(): Promise<boolean> {
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await redis.eval(luaScript, {
        keys: [this.key],
        arguments: [this.value],
      });
      
      const released = result === 1;
      if (released) {
        log.debug('Lock released', { key: this.key });
      }
      return released;
    } catch (error) {
      log.error('Error releasing lock', { key: this.key, error });
      return false;
    }
  }

  async extend(ttlMs: number): Promise<boolean> {
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const result = await redis.eval(luaScript, {
        keys: [this.key],
        arguments: [this.value, ttlMs],
      });
      return result === 1;
    } catch (error) {
      log.error('Error extending lock', { key: this.key, error });
      return false;
    }
  }
}

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  const lock = new DistributedLock(key, options);
  
  const acquired = await lock.acquire();
  if (!acquired) {
    throw new Error(`Failed to acquire lock: ${key}`);
  }

  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

// Atomic counter with locking
export async function atomicIncrement(key: string): Promise<number> {
  const luaScript = `
    local current = redis.call('GET', KEYS[1])
    local next = (tonumber(current) or 0) + 1
    redis.call('SET', KEYS[1], next)
    return next
  `;
  
  const result = await redis.eval(luaScript, {
    keys: [`counter:${key}`],
    arguments: [],
  });
  
  return Number(result);
}
```

### 6.2 Correction session-security.ts

```typescript
// AVANT:
// await redis.incr(`hive:security_version:${userId}`);

// APRÈS:
import { atomicIncrement } from './distributed-lock';

export async function incrementSecurityVersion(userId: string): Promise<number> {
  return await atomicIncrement(`security_version:${userId}`);
}
```

---

## 7. Tests E2E Plan

### 7.1 Structure des Tests

```
app/e2e/
├── auth.spec.ts           # Login, register, MFA, password reset
├── agents.spec.ts         # Create, update, delete, run
├── workflows.spec.ts       # Workflow creation, execution
├── marketplace.spec.ts     # (existant)
├── billing.spec.ts        # (existant)
├── federation.spec.ts      # Mesh federation setup
└── settings.spec.ts       # User settings, API tokens
```

### 7.2 Test Auth Complet

```typescript
// app/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login with valid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('[name="email"]', 'admin@hive.local');
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD!);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('[name="email"]', 'admin@hive.local');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toContainText('Invalid');
  });

  test('MFA setup flow', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('[name="email"]', 'admin@hive.local');
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD!);
    await page.click('button[type="submit"]');
    
    // Go to settings
    await page.goto('/settings/security');
    
    // Enable MFA
    await page.click('button:has-text("Enable MFA")');
    await expect(page.locator('[data-testid="mfa-qr-code"]')).toBeVisible();
    
    // This would need a real TOTP token in CI
  });

  test('rate limiting after failed attempts', async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await page.goto('/auth/login');
      await page.fill('[name="email"]', 'admin@hive.local');
      await page.fill('[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
    }
    
    await expect(page.locator('[role="alert"]')).toContainText('Too many requests');
  });

  test('password reset flow', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.fill('[name="email"]', 'admin@hive.local');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Check your email')).toBeVisible();
  });
});
```

### 7.3 Test Agents Complet

```typescript
// app/e2e/agents.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Agent Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/auth/login');
    await page.fill('[name="email"]', 'admin@hive.local');
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD!);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('create new agent', async ({ page }) => {
    await page.goto('/agents');
    await page.click('button:has-text("Create Agent")');
    
    await page.fill('[name="name"]', 'Test Agent');
    await page.fill('[name="description"]', 'E2E Test Agent');
    await page.selectOption('[name="hypervisor"]', 'docker');
    
    await page.click('button:has-text("Create")');
    await expect(page.locator('text=Test Agent')).toBeVisible();
  });

  test('agent lifecycle (create, start, stop, delete)', async ({ page }) => {
    const agentName = `lifecycle-${Date.now()}`;
    
    // Create
    await page.goto('/agents');
    await page.click('button:has-text("Create Agent")');
    await page.fill('[name="name"]', agentName);
    await page.click('button:has-text("Create")');
    await expect(page.locator(`text=${agentName}`)).toBeVisible();
    
    // Start
    const agentRow = page.locator(`text=${agentName}`).locator('..');
    await agentRow.click('button:has-text("Start")');
    await expect(agentRow.locator('[data-status="running"]')).toBeVisible({ timeout: 30000 });
    
    // Stop
    await agentRow.click('button:has-text("Stop")');
    await expect(agentRow.locator('[data-status="stopped"]')).toBeVisible({ timeout: 30000 });
    
    // Delete
    await agentRow.click('button:has-text("Delete")');
    await page.click('button:has-text("Confirm")');
    await expect(page.locator(`text=${agentName}`)).not.toBeVisible();
  });

  test('agent with invalid config shows validation errors', async ({ page }) => {
    await page.goto('/agents');
    await page.click('button:has-text("Create Agent")');
    
    // Try to create without name
    await page.click('button:has-text("Create")');
    await expect(page.locator('[role="alert"]')).toContainText('name');
  });
});
```

### 7.4 Configuration Playwright

```typescript
// app/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

---

## 8. HA Stack Setup

### 8.1 docker-compose.ha.yml

```yaml
version: '3.8'

services:
  # PostgreSQL Primary
  postgres_primary:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: hive
    command: >
      postgres
      -c wal_level=replica
      -c max_wal_senders=10
      -c hot_standby=on
      -c wal_keep_size=1GB
      -c max_replication_slots=10
    volumes:
      - postgres_primary:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d hive"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - hive-network
    restart: unless-stopped

  # PostgreSQL Replica
  postgres_replica:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: hive
    command: >
      postgres
      -c hot_standby=on
      -c primary_conninfo=host=postgres_primary port=5432 user=postgres password=${POSTGRES_PASSWORD}
    depends_on:
      postgres_primary:
        condition: service_healthy
    volumes:
      - postgres_replica:/var/lib/postgresql/data
    networks:
      - hive-network
    restart: unless-stopped

  # Redis Sentinel for HA
  redis_primary:
    image: redis:7-alpine
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --appendonly yes
      --appendfsync everysec
    volumes:
      - redis_primary:/data
    networks:
      - hive-network
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis_replica:
    image: redis:7-alpine
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --replicaof redis_primary 6379
      --appendonly yes
    depends_on:
      redis_primary:
        condition: service_healthy
    volumes:
      - redis_replica:/data
    networks:
      - hive-network
    restart: unless-stopped

  redis_sentinel:
    image: redis:7-alpine
    command: >
      redis-sentinel
      /usr/local/etc/redis/sentinel.conf
    volumes:
      - ./sentinel.conf:/usr/local/etc/redis/sentinel.conf
      - sentinel_data:/data
    depends_on:
      - redis_primary
      - redis_replica
    networks:
      - hive-network
    restart: unless-stopped

  # Traefik Load Balancer
  traefik:
    image: traefik:v3.0
    command:
      - --api.dashboard=true
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
      - --log.level=INFO
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt
    networks:
      - hive-network
    restart: unless-stopped

  # Hive Application (3 replicas)
  hive_app:
    image: ${HIVE_IMAGE:-hive/app:latest}
    environment:
      DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@postgres_primary:5432/hive
      DATABASE_URL_REPLICA: postgres://postgres:${POSTGRES_PASSWORD}@postgres_replica:5432/hive
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis_primary:6379
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_URL: https://${HIVE_DOMAIN}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      NODE_ENV: production
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - agent_data:/var/lib/hive/agents
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.hive.rule=Host(`${HIVE_DOMAIN}`)"
      - "traefik.http.routers.hive.tls=true"
      - "traefik.http.routers.hive.tls.certresolver=letsencrypt"
      - "traefik.http.services.hive.loadbalancer.server.port=3000"
      - "traefik.http.services.hive.loadbalancer.sticky.cookie=true"
      - "traefik.http.services.hive.loadbalancer.sticky.cookie.name=hive_session"
    networks:
      - hive-network
    depends_on:
      postgres_primary:
        condition: service_healthy
      redis_primary:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # Backup Service
  backup:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      BACKUP_SCHEDULE: "0 2 * * *"
      BACKUP_RETENTION_DAYS: 30
    volumes:
      - ./backup.sh:/backup.sh
      - backups:/backups
      - postgres_primary:/var/lib/postgresql/data:ro
    command: /bin/sh -c "while true; do at -f /backup.sh now; sleep 86400; done"
    networks:
      - hive-network
    restart: unless-stopped

volumes:
  postgres_primary:
  postgres_replica:
  redis_primary:
  redis_replica:
  sentinel_data:
  letsencrypt:
  backups:
  agent_data:

networks:
  hive-network:
    driver: bridge
```

### 8.2 sentinel.conf

```
sentinel monitor hive-redis redis_primary 6379 2
sentinel down-after-milliseconds hive-redis 5000
sentinel failover-timeout hive-redis 60000
sentinel parallel-syncs hive-redis 1
requirepass ${REDIS_PASSWORD}
```

### 8.3 backup.sh

```bash
#!/bin/sh
set -e

BACKUP_DIR="/backups"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hive_backup_${DATE}.sql.gz"

# Create backup
pg_dump -h postgres_primary -U postgres -d hive | gzip > "${BACKUP_FILE}"

# Upload to S3 if configured
if [ -n "$AWS_S3_BUCKET" ]; then
    aws s3 cp "${BACKUP_FILE}" "s3://${AWS_S3_BUCKET}/hive/${DATE}/"
fi

# Cleanup old backups
find "${BACKUP_DIR}" -name "hive_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup completed: ${BACKUP_FILE}"
```

---

## 9. Backup Automation

### 9.1 Route API Backup Schedule

```typescript
// app/src/app/api/backups/schedule/route.ts
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authorize';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface BackupScheduleConfig {
  schedule: string;  // cron expression
  retentionDays: number;
  s3Bucket?: string;
  enabled: boolean;
}

// Default: Daily at 2 AM
const DEFAULT_SCHEDULE = '0 2 * * *';
const DEFAULT_RETENTION = 30;

export async function GET() {
  const auth = await authorize('admin');
  if (!auth.authorized) return auth.response;

  // Read current backup config
  const config = await readBackupConfig();
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  const auth = await authorize('admin');
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const config: BackupScheduleConfig = {
    schedule: body.schedule ?? DEFAULT_SCHEDULE,
    retentionDays: body.retentionDays ?? DEFAULT_RETENTION,
    s3Bucket: body.s3Bucket,
    enabled: body.enabled ?? true,
  };

  await writeBackupConfig(config);
  await restartBackupService();

  return NextResponse.json({ success: true, config });
}

export async function POST() {
  const auth = await authorize('admin');
  if (!auth.authorized) return auth.response;

  // Trigger immediate backup
  try {
    const { stdout, stderr } = await execAsync('/usr/local/bin/backup.sh');
    return NextResponse.json({
      success: true,
      output: stdout,
      errors: stderr,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

async function readBackupConfig(): Promise<BackupScheduleConfig> {
  const configPath = '/etc/hive/backup.conf';
  // Implementation to read config file
  return {
    schedule: DEFAULT_SCHEDULE,
    retentionDays: DEFAULT_RETENTION,
    enabled: true,
  };
}

async function writeBackupConfig(config: BackupScheduleConfig): Promise<void> {
  // Implementation to write config file
}

async function restartBackupService(): Promise<void> {
  // Implementation to restart backup cron/container
}
```

---

## 10. Helm Chart Hive App

### 10.1 Structure

```
deploy/helm/hive-app/
├── Chart.yaml
├── values.yaml
├── values.production.yaml
├── values.staging.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── pvc.yaml
│   └── servicemonitor.yaml
└── .helmignore
```

### 10.2 Chart.yaml

```yaml
apiVersion: v2
name: hive-app
description: Hive AI Agent Infrastructure Platform
type: application
version: 1.0.0
appVersion: "2026.03"
keywords:
  - ai
  - agents
  - infrastructure
  - self-hosted
maintainers:
  - name: Hive Contributors
    url: https://github.com/Takinggg/Hive
dependencies:
  - name: postgresql
    version: "14.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
  - name: redis
    version: "19.0.0"
    repository: "https://charts.bitnami.com/bitnami"
    condition: redis.enabled
```

### 10.3 values.yaml

```yaml
replicaCount: 3

image:
  repository: hive/app
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 3000

ingress:
  enabled: true
  className: traefik
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
  hosts:
    - host: hive.local
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: hive-tls
      hosts:
        - hive.local

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 1000m
    memory: 2Gi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

persistence:
  enabled: true
  size: 50Gi
  storageClass: fast-ssd

config:
  # Required - set via --set or secrets
  databaseUrl: ""
  redisUrl: ""
  authSecret: ""
  encryptionKey: ""
  authUrl: ""

postgresql:
  enabled: true
  auth:
    postgresPassword: ""
    database: hive
  primary:
    persistence:
      size: 100Gi
  readReplicas:
    replicaCount: 2

redis:
  enabled: true
  auth:
    password: ""
  master:
    persistence:
      size: 10Gi
  replica:
    replicaCount: 2

monitoring:
  enabled: true
  prometheusRule:
    enabled: true
  serviceMonitor:
    enabled: true

backup:
  enabled: false
  schedule: "0 2 * * *"
  retentionDays: 30
  s3:
    enabled: false
    bucket: ""
    region: ""
```

### 10.4 templates/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "hive-app.fullname" . }}
  labels:
    {{- include "hive-app.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "hive-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "hive-app.selectorLabels" . | nindent 8 }}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "{{ .Values.service.port }}"
        prometheus.io/path: "/api/metrics"
    spec:
      {{- with .Values.podSecurityContext }}
      securityContext:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          livenessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "hive-app.fullname" . }}
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "hive-app.fullname" . }}
                  key: redis-url
            - name: AUTH_SECRET
              valueFrom:
                secretKeyRef:
                  name: {{ include "hive-app.fullname" . }}
                  key: auth-secret
            - name: ENCRYPTION_KEY
              valueFrom:
                secretKeyRef:
                  name: {{ include "hive-app.fullname" . }}
                  key: encryption-key
            - name: AUTH_URL
              value: "https://{{ .Values.ingress.hosts[0].host }}"
            - name: NODE_ENV
              value: production
          volumeMounts:
            - name: docker-socket
              mountPath: /var/run/docker.sock
            {{- if .Values.persistence.enabled }}
            - name: agent-data
              mountPath: /var/lib/hive/agents
            {{- end }}
      volumes:
        - name: docker-socket
          hostPath:
            path: /var/run/docker.sock
            type: Socket
        {{- if .Values.persistence.enabled }}
        - name: agent-data
          persistentVolumeClaim:
            claimName: {{ include "hive-app.fullname" . }}
        {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

---

## Checklist d'Implémentation

### Phase 1: Sécurité (Semaine 1-2)
- [ ] Ajouter dépendances MFA (`otplib`, `qrcode`)
- [ ] Créer `mfa.ts` avec TOTP
- [ ] Ajouter champs MFA à la DB (migration)
- [ ] Créer routes API MFA (`/api/auth/mfa/*`)
- [ ] Modifier UI Settings pour MFA
- [ ] Ajouter dépendances sandbox (`vm2`)
- [ ] Créer `workflow-sandbox.ts`
- [ ] Modifier `workflow-executor.ts` pour utiliser sandbox
- [ ] Corriger error swallowing dans `authorize.ts`
- [ ] Corriger error swallowing dans `cloud-hypervisor.ts`
- [ ] Corriger error swallowing dans `firecracker.ts`
- [ ] Créer `error-logger.ts` helper
- [ ] Créer `distributed-lock.ts`
- [ ] Corriger race condition dans `session-security.ts`

### Phase 2: Tests (Semaine 3-4)
- [ ] Créer `playwright.config.ts`
- [ ] Écrire `auth.spec.ts` (5 tests)
- [ ] Écrire `agents.spec.ts` (5 tests)
- [ ] Écrire `workflows.spec.ts` (3 tests)
- [ ] Écrire `federation.spec.ts` (3 tests)
- [ ] Run et corriger tous les tests

### Phase 3: HA (Semaine 5-6)
- [ ] Créer `docker-compose.ha.yml`
- [ ] Configurer PostgreSQL replication
- [ ] Configurer Redis Sentinel
- [ ] Configurer Traefik load balancing
- [ ] Configurer sticky sessions
- [ ] Tester failover
- [ ] Créer backup service
- [ ] Tester backup/restore

### Phase 4: Kubernetes (Semaine 7-8)
- [ ] Créer structure Helm chart
- [ ] Créer `Chart.yaml`
- [ ] Créer `values.yaml`
- [ ] Créer templates
- [ ] Tester installation
- [ ] Documenter upgrade process

---

*Document généré le 27 Mars 2026*
*Plan de correction complet pour Hive Enterprise Grade*
