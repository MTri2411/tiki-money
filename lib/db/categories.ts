import * as Crypto from 'expo-crypto';

import { getDb, runDb, withWriteTransaction } from './connection';
import type { CategoryRow } from './types';

/** Danh mục đang hiện trước, danh mục dùng nhiều xếp lên trên. */
export function categories(includeHidden = false): Promise<CategoryRow[]> {
  return runDb(async () => {
    const db = await getDb();
    return db.getAllAsync<CategoryRow>(
      `SELECT id, name, icon, sort, is_hidden, usage_count
       FROM category
       ${includeHidden ? '' : 'WHERE is_hidden = 0'}
       ORDER BY usage_count DESC, sort ASC, name COLLATE NOCASE ASC`
    );
  });
}

export function saveCategory(input: {
  id?: string;
  name: string;
  icon: string;
  hidden?: boolean;
}): Promise<CategoryRow> {
  return runDb(async () => {
    const name = input.name.trim();
    if (!name) throw new Error('Nhập tên danh mục');
    const db = await getDb();
    let id = input.id ?? '';
    await withWriteTransaction(db, async (txn) => {
      const existing = await txn.getFirstAsync<{ id: string; name: string }>(
        input.id
          ? 'SELECT id, name FROM category WHERE id = ?'
          : 'SELECT id, name FROM category WHERE name = ? COLLATE NOCASE LIMIT 1',
        input.id ?? name
      );
      id = existing?.id ?? input.id ?? Crypto.randomUUID();
      if (existing) {
        if (existing.name !== name) {
          await txn.runAsync('UPDATE tx SET category = ? WHERE category = ?', name, existing.name);
          await txn.runAsync('UPDATE chip SET category = ? WHERE category = ?', name, existing.name);
        }
        await txn.runAsync(
          'UPDATE category SET name = ?, icon = ?, is_hidden = ? WHERE id = ?',
          name,
          input.icon,
          input.hidden ? 1 : 0,
          id
        );
      } else {
        const max = await txn.getFirstAsync<{ value: number }>(
          'SELECT COALESCE(MAX(sort), -1) + 1 AS value FROM category'
        );
        await txn.runAsync(
          'INSERT INTO category (id, name, icon, sort, is_hidden, usage_count) VALUES (?, ?, ?, ?, ?, 0)',
          id,
          name,
          input.icon,
          max?.value ?? 0,
          input.hidden ? 1 : 0
        );
      }
    });
    const saved = await db.getFirstAsync<CategoryRow>(
      'SELECT id, name, icon, sort, is_hidden, usage_count FROM category WHERE id = ?',
      id
    );
    if (!saved) throw new Error('Không đọc được danh mục vừa lưu');
    return saved;
  });
}

export async function hideCategory(id: string, hidden = true): Promise<void> {
  const current = (await categories(true)).find((row) => row.id === id);
  if (!current) return;
  await saveCategory({ id, name: current.name, icon: current.icon, hidden });
}

/** Cộng hoặc trừ số lần một tên danh mục được ghi vào sổ. */
export async function bumpCategoryUsage(
  db: SQLiteDatabase,
  name: string,
  delta: number
): Promise<void> {
  await db.runAsync(
    'UPDATE category SET usage_count = MAX(0, usage_count + ?) WHERE name = ?',
    delta,
    name
  );
}

type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;
