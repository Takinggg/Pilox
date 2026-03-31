import postgres from "postgres";

/**
 * @param {string} connectionString
 */
export function createRegistryDb(connectionString) {
  const sql = postgres(connectionString, { max: 5 });

  return {
    sql,
    async ensureTable() {
      await sql`
        CREATE TABLE IF NOT EXISTS hive_registry_records (
          handle text PRIMARY KEY,
          record jsonb NOT NULL
        )
      `;
    },
    async ensureInstancesTable() {
      await sql`
        CREATE TABLE IF NOT EXISTS hive_registry_instances (
          tenant_key text PRIMARY KEY,
          origin text NOT NULL,
          token_hash text NOT NULL,
          active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
    },
    /**
     * @param {string} tenantKey
     * @param {string} origin
     * @param {string} tokenHash sha256 hex
     */
    async insertInstance(tenantKey, origin, tokenHash) {
      await sql`
        INSERT INTO hive_registry_instances (tenant_key, origin, token_hash)
        VALUES (${tenantKey}, ${origin}, ${tokenHash})
      `;
    },
    /**
     * @param {string} tokenHash sha256 hex
     * @returns {Promise<{ tenant_key: string; origin: string; active: boolean } | null>}
     */
    async getInstanceByTokenHash(tokenHash) {
      const rows = await sql`
        SELECT tenant_key, origin, active
        FROM hive_registry_instances
        WHERE token_hash = ${tokenHash} AND active = true
        LIMIT 1
      `;
      const r = rows[0];
      if (!r) return null;
      return {
        tenant_key: r.tenant_key,
        origin: r.origin,
        active: r.active,
      };
    },
    /**
     * @returns {Promise<{ tenant_key: string; origin: string; active: boolean; created_at: string }[]>}
     */
    async listInstances() {
      const rows = await sql`
        SELECT tenant_key, origin, active, created_at
        FROM hive_registry_instances
        ORDER BY created_at ASC
      `;
      return rows.map((r) => ({
        tenant_key: r.tenant_key,
        origin: r.origin,
        active: r.active,
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
      }));
    },
    /**
     * @param {Map<string, object>} store
     */
    async hydrate(store) {
      const rows = await sql`SELECT handle, record FROM hive_registry_records`;
      for (const row of rows) {
        store.set(row.handle, row.record);
      }
    },
    /**
     * @param {string} handle
     * @param {object} record
     */
    async upsert(handle, record) {
      await sql`
        INSERT INTO hive_registry_records (handle, record)
        VALUES (${handle}, ${sql.json(record)})
        ON CONFLICT (handle) DO UPDATE SET record = EXCLUDED.record
      `;
    },
    /**
     * @param {string} handle
     */
    async deleteHandle(handle) {
      await sql`DELETE FROM hive_registry_records WHERE handle = ${handle}`;
    },
    async end() {
      await sql.end({ timeout: 5 });
    },
  };
}
