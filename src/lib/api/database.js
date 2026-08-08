/**
 * SlayQL — Database API Service
 *
 * GET /api/database         → getDbStatus()
 * GET /api/database/schema  → getSchema(dbId)
 * GET /api/database/tables  → getTables(dbId)
 * POST /api/database/connect → connectDatabase(config)
 */

// ─── Mock database status ────────────────────────────────────────────────────

const MOCK_DB_STATUS = {
  id: 'spider2_sqlite_demo',
  name: 'Spider2 / SQLite',
  engine: 'SQLite',
  host: 'spider2-localdb',
  status: 'connected',     // 'connected' | 'disconnected' | 'error'
  tables: 42,
  rows: 1_240_000,
  latencyMs: 12,
  version: '3.43.2',
  lastPingedAt: new Date().toISOString(),
};

// ─── Mock schema ─────────────────────────────────────────────────────────────

const MOCK_SCHEMA = {
  databases: [
    {
      id: 'spider2_sqlite_demo',
      name: 'spider2_localdb',
      tables: [
        {
          name: 'publications',
          rowCount: 480_000,
          columns: [
            { name: 'publication_number', type: 'TEXT', isPrimaryKey: true, isForeignKey: false },
            { name: 'filing_date',         type: 'INTEGER',isPrimaryKey: false,isForeignKey: false },
            { name: 'country_code',        type: 'TEXT', isPrimaryKey: false,isForeignKey: false },
            { name: 'abstract_localized',  type: 'JSON', isPrimaryKey: false,isForeignKey: false },
          ],
        },
        {
          name: 'patent_metadata',
          rowCount: 480_000,
          columns: [
            { name: 'publication_number',  type: 'TEXT', isPrimaryKey: false,isForeignKey: true },
            { name: 'technology_category', type: 'TEXT', isPrimaryKey: false,isForeignKey: false },
            { name: 'grant_date',          type: 'INTEGER',isPrimaryKey: false,isForeignKey: false },
            { name: 'claims_count',        type: 'INTEGER',isPrimaryKey: false,isForeignKey: false },
          ],
        },
        {
          name: 'gsod2009',
          rowCount: 212_000,
          columns: [
            { name: 'stn',  type: 'TEXT',  isPrimaryKey: false, isForeignKey: true },
            { name: 'wban', type: 'TEXT',  isPrimaryKey: false, isForeignKey: false },
            { name: 'mo',   type: 'TEXT',  isPrimaryKey: false, isForeignKey: false },
            { name: 'da',   type: 'TEXT',  isPrimaryKey: false, isForeignKey: false },
            { name: 'temp', type: 'REAL',  isPrimaryKey: false, isForeignKey: false },
          ],
        },
        {
          name: 'stations',
          rowCount: 28_000,
          columns: [
            { name: 'usaf', type: 'TEXT', isPrimaryKey: true,  isForeignKey: false },
            { name: 'name', type: 'TEXT', isPrimaryKey: false, isForeignKey: false },
            { name: 'lat',  type: 'REAL', isPrimaryKey: false, isForeignKey: false },
            { name: 'lon',  type: 'REAL', isPrimaryKey: false, isForeignKey: false },
          ],
        },
        {
          name: 'technology_categories',
          rowCount: 42,
          columns: [
            { name: 'id',    type: 'INTEGER', isPrimaryKey: true,  isForeignKey: false },
            { name: 'label', type: 'TEXT',    isPrimaryKey: false, isForeignKey: false },
            { name: 'parent_id', type: 'INTEGER', isPrimaryKey: false, isForeignKey: true },
          ],
        },
      ],
    },
  ],
};

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Returns current database connection status.
 * Future: return fetch('/api/database').then(r => r.json())
 */
export async function getDbStatus() {
  await new Promise((r) => setTimeout(r, 120));
  return { ...MOCK_DB_STATUS };
}

/**
 * Returns full schema tree for a given database.
 * Future: return fetch(`/api/database/schema?dbId=${dbId}`).then(r => r.json())
 */
export async function getSchema(dbId) {
  await new Promise((r) => setTimeout(r, 80));
  const db = MOCK_SCHEMA.databases.find((d) => d.id === dbId) || MOCK_SCHEMA.databases[0];
  return db;
}

/**
 * Returns a flat list of table names and row counts.
 * Future: return fetch(`/api/database/tables?dbId=${dbId}`).then(r => r.json())
 */
export async function getTables(dbId) {
  const schema = await getSchema(dbId);
  return schema.tables.map(({ name, rowCount }) => ({ name, rowCount }));
}

/**
 * Simulates connecting to a new database.
 * Future: return fetch('/api/database/connect', { method: 'POST', body: JSON.stringify(config) }).then(r => r.json())
 */
export async function connectDatabase(config) {
  await new Promise((r) => setTimeout(r, 1500));
  return { success: true, dbId: 'spider2_sqlite_demo', message: 'Connected successfully.' };
}
