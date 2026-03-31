import type { User } from "@pilox/a2a-sdk/server";

/**
 * Maps an authenticated Pilox caller to the A2A `User` model.
 * `userName` should be stable for audit/rate-limit keys: prefer UUID from `users.id`,
 * else email; internal service uses `pilox-internal` (see `api/a2a/jsonrpc/route.ts`).
 */
export class PiloxA2AUser implements User {
  constructor(
    private readonly authenticated: boolean,
    private readonly name: string
  ) {}

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  get userName(): string {
    return this.name;
  }
}
