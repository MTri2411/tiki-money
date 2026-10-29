import * as SQLite from 'expo-sqlite';

import { openLedger } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * expo-sqlite không cho một câu lệnh kết thúc trong lúc câu khác đang ghi.
 * Mọi tác vụ đi qua hàng đợi này để chạy lần lượt trên một kết nối.
 */
let dbChain: Promise<void> = Promise.resolve();

export function runDb<T>(task: () => Promise<T>): Promise<T> {
  const run = dbChain.then(task, task);
  dbChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  // Giữ promise cục bộ: callback catch gán dbPromise = null, nên biến module không còn được thu hẹp kiểu.
  const opening = openLedger().catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  dbPromise = opening;
  return opening;
}

export async function withWriteTransaction(
  db: SQLite.SQLiteDatabase,
  task: (txn: SQLite.SQLiteDatabase) => Promise<void>
) {
  await db.withTransactionAsync(() => task(db));
}
