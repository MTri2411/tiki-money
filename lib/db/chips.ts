import { getDb, runDb } from './connection';
import type { ChipRow } from './types';

/** Nút ghi nhanh, xếp theo thứ tự người dùng thấy trên composer. */
export function chips(): Promise<ChipRow[]> {
  return runDb(async () => {
    const db = await getDb();
    return db.getAllAsync<ChipRow>(
      'SELECT id, label, amount, category, sort FROM chip ORDER BY sort ASC'
    );
  });
}
