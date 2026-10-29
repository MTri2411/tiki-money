import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import { DEFAULT_CATEGORIES } from '@/lib/category-match';

const DB_NAME = 'so-chi-tieu.db';

const PRAGMA_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`;

/**
 * Bốn bảng của sổ lúc mới cài:
 * - tx: giao dịch chi / thu
 * - msg: tin nhắn trong cuộc chat. tx_id nối biên lai với khoản
 * - chip: nút ghi nhanh
 * - category: tên và icon danh mục
 */
const TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS tx (
    id TEXT PRIMARY KEY,
    amount INTEGER NOT NULL CHECK (amount > 0),
    direction TEXT NOT NULL CHECK (direction IN ('chi', 'thu')),
    category TEXT NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tx_date ON tx(date, created_at DESC);
  CREATE TABLE IF NOT EXISTS msg (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    text TEXT,
    payload TEXT,
    created_at INTEGER NOT NULL,
    tx_id TEXT
  );
  CREATE INDEX IF NOT EXISTS msg_created ON msg(created_at DESC);
  CREATE TABLE IF NOT EXISTS chip (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    sort INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS category (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort INTEGER NOT NULL,
    is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
    usage_count INTEGER NOT NULL DEFAULT 0
  );
`;

const LEGACY_MARKS = ['owner_id', 'user_id', 'device_id', 'updated_at', 'deleted_at'];
const KEPT_ROLES = new Set(['user', 'assistant', 'draft', 'receipt', 'deleted', 'cleared']);

type LegacySnapshot = {
  txs: { id: string; amount: number; direction: 'chi' | 'thu'; category: string; note: string | null; date: string; created_at: number }[];
  msgs: { id: string; role: string; text: string | null; payload: string | null; created_at: number }[];
  categories: { id: string; name: string; icon: string; sort: number; is_hidden: number; usage_count: number }[];
  chips: { id: string; label: string; amount: number; category: string; sort: number }[];
};

async function columnSet(db: SQLite.SQLiteDatabase, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${table}")`);
  return new Set(rows.map((row) => row.name));
}

async function firstTable(db: SQLite.SQLiteDatabase, names: string[]): Promise<string | null> {
  for (const name of names) {
    const cols = await columnSet(db, name);
    if (cols.size > 0) return name;
  }
  return null;
}

/** Sổ đồng bộ cũ còn cột owner, thiết bị hoặc xoá mềm. */
async function isLegacy(db: SQLite.SQLiteDatabase): Promise<boolean> {
  for (const table of ['tx', 'transactions']) {
    const cols = await columnSet(db, table);
    if (cols.size === 0) continue;
    return LEGACY_MARKS.some((name) => cols.has(name));
  }
  return false;
}

async function dropAll(db: SQLite.SQLiteDatabase) {
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  for (const table of tables) {
    await db.execAsync(`DROP TABLE IF EXISTS "${table.name}"`);
  }
}

function txIdFromPayload(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { txId?: unknown };
    return typeof parsed.txId === 'string' && parsed.txId ? parsed.txId : null;
  } catch {
    return null;
  }
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function intOf(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function readLegacy(db: SQLite.SQLiteDatabase): Promise<LegacySnapshot> {
  const snapshot: LegacySnapshot = { txs: [], msgs: [], categories: [], chips: [] };

  const txTable = await firstTable(db, ['tx', 'transactions']);
  if (txTable) {
    const cols = await columnSet(db, txTable);
    const where = cols.has('deleted_at') ? 'WHERE deleted_at IS NULL' : '';
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${txTable}" ${where}`);
    for (const row of rows) {
      const direction = row.direction === 'thu' ? 'thu' : row.direction === 'chi' ? 'chi' : null;
      const date = typeof row.date === 'string' ? row.date : '';
      const category = typeof row.category === 'string' ? row.category : '';
      const amount = intOf(row.amount);
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id || !direction || !category || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      snapshot.txs.push({
        id,
        amount,
        direction,
        category,
        note: textOrNull(row.note),
        date,
        created_at: intOf(row.created_at, Date.now()),
      });
    }
  }

  const msgTable = await firstTable(db, ['msg', 'messages']);
  if (msgTable) {
    const cols = await columnSet(db, msgTable);
    const where = cols.has('deleted_at') ? 'WHERE deleted_at IS NULL' : '';
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${msgTable}" ${where}`);
    for (const row of rows) {
      const id = typeof row.id === 'string' ? row.id : '';
      const role = typeof row.role === 'string' ? row.role : '';
      if (!id || !KEPT_ROLES.has(role)) continue;
      snapshot.msgs.push({
        id,
        role,
        text: textOrNull(row.text),
        payload: textOrNull(row.payload),
        created_at: intOf(row.created_at, Date.now()),
      });
    }
  }

  const categoryTable = await firstTable(db, ['category', 'categories']);
  if (categoryTable) {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${categoryTable}"`);
    for (const row of rows) {
      const id = typeof row.id === 'string' ? row.id : '';
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!id || !name) continue;
      snapshot.categories.push({
        id,
        name,
        icon: typeof row.icon === 'string' && row.icon ? row.icon : '✨',
        sort: intOf(row.sort),
        is_hidden: row.is_hidden === 1 ? 1 : 0,
        usage_count: Math.max(0, intOf(row.usage_count)),
      });
    }
  }

  const chipTable = await firstTable(db, ['chip', 'chips']);
  if (chipTable) {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${chipTable}"`);
    for (const row of rows) {
      const id = typeof row.id === 'string' ? row.id : '';
      const label = typeof row.label === 'string' ? row.label : '';
      const category = typeof row.category === 'string' ? row.category : '';
      const amount = intOf(row.amount);
      if (!id || !label || !category || amount <= 0) continue;
      snapshot.chips.push({ id, label, amount, category, sort: intOf(row.sort) });
    }
  }

  return snapshot;
}

async function writeLegacy(db: SQLite.SQLiteDatabase, snapshot: LegacySnapshot) {
  for (const row of snapshot.txs) {
    await db.runAsync(
      'INSERT OR IGNORE INTO tx (id, amount, direction, category, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      row.id,
      row.amount,
      row.direction,
      row.category,
      row.note,
      row.date,
      row.created_at
    );
  }
  for (const row of snapshot.msgs) {
    await db.runAsync(
      'INSERT OR IGNORE INTO msg (id, role, text, payload, created_at, tx_id) VALUES (?, ?, ?, ?, ?, ?)',
      row.id,
      row.role,
      row.text,
      row.payload,
      row.created_at,
      txIdFromPayload(row.payload)
    );
  }
  for (const row of snapshot.categories) {
    await db.runAsync(
      `INSERT INTO category (id, name, icon, sort, is_hidden, usage_count) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, sort = excluded.sort,
         is_hidden = excluded.is_hidden, usage_count = excluded.usage_count`,
      row.id,
      row.name,
      row.icon,
      row.sort,
      row.is_hidden,
      row.usage_count
    );
  }
  for (const row of snapshot.chips) {
    await db.runAsync(
      'INSERT OR IGNORE INTO chip (id, label, amount, category, sort) VALUES (?, ?, ?, ?, ?)',
      row.id,
      row.label,
      row.amount,
      row.category,
      row.sort
    );
  }
}

async function seedCategories(db: SQLite.SQLiteDatabase) {
  for (const item of DEFAULT_CATEGORIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO category (id, name, icon, sort, is_hidden, usage_count)
       VALUES (?, ?, ?, ?, 0, 0)`,
      item.id,
      item.name,
      item.icon,
      item.sort
    );
  }
}

/** Chip mẫu chỉ khi sổ chưa có nút nào, giống lần đầu mở app. */
async function seedChips(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM chip');
  if (row && row.n > 0) return;
  const seeds = [
    { label: 'Trà sữa 35k', amount: 35000, category: 'Đồ uống', sort: 0 },
    { label: 'Cơm trưa 55k', amount: 55000, category: 'Ăn uống', sort: 1 },
    { label: 'Đổ xăng 70k', amount: 70000, category: 'Xăng', sort: 2 },
    { label: 'Gửi xe 5k', amount: 5000, category: 'Đi lại', sort: 3 },
  ];
  for (const chip of seeds) {
    await db.runAsync(
      'INSERT INTO chip (id, label, amount, category, sort) VALUES (?, ?, ?, ?, ?)',
      Crypto.randomUUID(),
      chip.label,
      chip.amount,
      chip.category,
      chip.sort
    );
  }
}

/** Index tạo sau ALTER. CREATE TABLE IF NOT EXISTS không thêm cột vào bảng msg đã có. */
async function ensureTxId(db: SQLite.SQLiteDatabase) {
  const cols = await columnSet(db, 'msg');
  if (!cols.has('tx_id')) {
    await db.execAsync('ALTER TABLE msg ADD COLUMN tx_id TEXT');
  }
  await db.execAsync('CREATE INDEX IF NOT EXISTS msg_tx ON msg(tx_id)');
}

async function backfillTxId(db: SQLite.SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: string; payload: string | null }>(
    `SELECT id, payload FROM msg WHERE tx_id IS NULL AND role IN ('receipt', 'deleted') AND payload IS NOT NULL`
  );
  for (const row of rows) {
    const txId = txIdFromPayload(row.payload);
    if (!txId) continue;
    await db.runAsync('UPDATE msg SET tx_id = ? WHERE id = ?', txId, row.id);
  }
}

async function recountUsage(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    UPDATE category SET usage_count = (
      SELECT COUNT(*) FROM tx WHERE tx.category = category.name
    );
  `);
}

export async function openLedger(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(PRAGMA_SQL);
  if (await isLegacy(db)) {
    const snapshot = await readLegacy(db);
    await db.withTransactionAsync(async () => {
      await dropAll(db);
      await db.execAsync(TABLES_SQL);
      await writeLegacy(db, snapshot);
    });
    await db.execAsync('PRAGMA user_version = 0');
  } else {
    await db.execAsync(TABLES_SQL);
  }
  await ensureTxId(db);
  await db.execAsync(`DELETE FROM msg WHERE role = 'card'`);
  await backfillTxId(db);
  await seedCategories(db);
  await seedChips(db);
  await recountUsage(db);
  return db;
}
