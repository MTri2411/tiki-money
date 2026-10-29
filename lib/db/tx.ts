import * as Crypto from 'expo-crypto';
import type * as SQLite from 'expo-sqlite';

import { bumpCategoryUsage } from './categories';
import { getDb, runDb, withWriteTransaction } from './connection';
import { localDateIso, monthKey, shiftIso } from './dates';
import { parseReceiptPayload } from './messages';
import type {
  DayTotals,
  Direction,
  DraftPayload,
  ReceiptPayload,
  Revision,
  StoredMessage,
  TxRow,
} from './types';

const TX_COLUMNS = 'id, amount, direction, category, note, date, created_at';

type Sql = SQLite.SQLiteDatabase;

export function dayTotals(date: string): Promise<DayTotals> {
  return runDb(async () => {
    const db = await getDb();
    const row = await db.getFirstAsync<DayTotals>(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'chi' THEN amount ELSE 0 END), 0) AS spend,
         COALESCE(SUM(CASE WHEN direction = 'thu' THEN amount ELSE 0 END), 0) AS income,
         COUNT(*) AS count
       FROM tx WHERE date = ?`,
      date
    );
    return {
      spend: Number(row?.spend) || 0,
      income: Number(row?.income) || 0,
      count: Number(row?.count) || 0,
    };
  });
}

/** Khoản trong 120 ngày gần nhất, dùng để gắn câu sửa vào đúng giao dịch. */
export function revisionCandidates(): Promise<TxRow[]> {
  return runDb(async () => {
    const db = await getDb();
    const since = shiftIso(localDateIso(), -120);
    return db.getAllAsync<TxRow>(
      `SELECT ${TX_COLUMNS} FROM tx WHERE date >= ? ORDER BY date DESC, created_at DESC`,
      since
    );
  });
}

/** Khoản có ngày nằm trong khoảng đóng [start, end]. */
export function txsBetween(start: string, end: string): Promise<TxRow[]> {
  return runDb(async () => {
    const db = await getDb();
    return db.getAllAsync<TxRow>(
      `SELECT ${TX_COLUMNS} FROM tx WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC`,
      start,
      end
    );
  });
}

export function receiptsForTx(txId: string): Promise<{ id: string; payload: string }[]> {
  return runDb(async () => {
    const db = await getDb();
    return db.getAllAsync<{ id: string; payload: string }>(
      `SELECT id, payload FROM msg
       WHERE role = 'receipt' AND tx_id = ?
       ORDER BY created_at ASC`,
      txId
    );
  });
}

export function txsOnDate(date: string): Promise<TxRow[]> {
  return runDb(async () => {
    const db = await getDb();
    return db.getAllAsync<TxRow>(
      `SELECT ${TX_COLUMNS} FROM tx WHERE date = ? ORDER BY created_at DESC`,
      date
    );
  });
}

export function totalsOf(rows: TxRow[]): DayTotals {
  return rows.reduce<DayTotals>(
    (sum, row) => ({
      spend: sum.spend + (row.direction === 'chi' ? row.amount : 0),
      income: sum.income + (row.direction === 'thu' ? row.amount : 0),
      count: sum.count + 1,
    }),
    { spend: 0, income: 0, count: 0 }
  );
}

/** Dữ liệu thanh đảo: tổng ngày đang xem, giao dịch ngày đó, và tổng tháng hiện tại. */
export async function loadIslandData(viewDate?: string) {
  const today = localDateIso();
  const date = viewDate ?? today;
  const rows = await runDb(async () => {
    const db = await getDb();
    return db.getAllAsync<TxRow>(`SELECT ${TX_COLUMNS} FROM tx ORDER BY date DESC, created_at DESC`);
  });
  const txs = rows.filter((row) => row.date === date);
  const start = `${monthKey(today)}-01`;
  const end = `${shiftIso(start, 32).slice(0, 7)}-01`;
  const monthRows = rows.filter((row) => row.date >= start && row.date < end);
  const month = monthRows.reduce(
    (sum, row) => ({
      spend: sum.spend + (row.direction === 'chi' ? row.amount : 0),
      income: sum.income + (row.direction === 'thu' ? row.amount : 0),
    }),
    { spend: 0, income: 0 }
  );
  return {
    today,
    viewDate: date,
    totals: totalsOf(txs),
    txs,
    month: { ...month, outflow: month.spend },
    rows,
  };
}

/** Ghi nhiều draft thành giao dịch và đổi tin nhắn tương ứng thành biên lai. */
export function confirmDraftMessages(
  entries: { messageId: string; draft: DraftPayload }[]
): Promise<{ messageId: string; txId: string; payload: ReceiptPayload }[]> {
  return runDb(async () => {
    const db = await getDb();
    const result: { messageId: string; txId: string; payload: ReceiptPayload }[] = [];
    await withWriteTransaction(db, async (txn) => {
      for (const [index, entry] of entries.entries()) {
        const txId = Crypto.randomUUID();
        const now = Date.now() + index;
        const payload: ReceiptPayload = { ...entry.draft, txId };
        await txn.runAsync(
          `INSERT INTO tx (id, amount, direction, category, note, date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          txId,
          entry.draft.amount,
          entry.draft.direction,
          entry.draft.category,
          entry.draft.note,
          entry.draft.date,
          now
        );
        await writeLinked(txn, entry.messageId, 'receipt', payload);
        await bumpCategoryUsage(txn, entry.draft.category, 1);
        result.push({ messageId: entry.messageId, txId, payload });
      }
    });
    return result;
  });
}

/** Hoàn tác xác nhận: xoá khoản và đưa tin về draft trong cùng một transaction. */
export function revertDraftMessages(
  entries: { messageId: string; txId: string; draft: DraftPayload }[]
): Promise<void> {
  return runDb(async () => {
    const db = await getDb();
    await withWriteTransaction(db, async (txn) => {
      for (const entry of entries) {
        await removeTxs(txn, [entry.txId]);
        await writeLinked(txn, entry.messageId, 'draft', entry.draft);
      }
    });
  });
}

export function commitRevision(
  messageId: string,
  draft: DraftPayload
): Promise<{ saved: ReceiptPayload; siblings: { id: string; before: string; after: ReceiptPayload }[] }> {
  const revision = draft.revision;
  if (!revision?.txId) return Promise.reject(new Error('Thiếu khoản cần sửa'));
  return runDb(async () => {
    const db = await getDb();
    let saved!: ReceiptPayload;
    const siblings: { id: string; before: string; after: ReceiptPayload }[] = [];
    await withWriteTransaction(db, async (txn) => {
      const previous = await txn.getFirstAsync<{ id: string }>(
        'SELECT id FROM tx WHERE id = ?',
        revision.txId
      );
      if (!previous) throw new Error('Không tìm thấy khoản');
      await applyTxPatch(txn, revision.txId, draft);
      const rows = await txn.getAllAsync<{ id: string; payload: string }>(
        `SELECT id, payload FROM msg WHERE tx_id = ? AND id != ? AND role = 'receipt' ORDER BY created_at ASC`,
        revision.txId,
        messageId
      );
      for (const row of rows) {
        const current = parseReceiptPayload(row.payload);
        if (!current) continue;
        const after = priceOnSibling(current, draft, revision);
        siblings.push({ id: row.id, before: row.payload, after });
        await writeLinked(txn, row.id, 'receipt', after);
      }
      saved = { ...draft, txId: revision.txId };
      await writeLinked(txn, messageId, 'receipt', saved);
    });
    return { saved, siblings };
  });
}

export function revertRevision(
  messageId: string,
  draft: DraftPayload,
  siblings: { id: string; payload: string }[]
): Promise<void> {
  const revision = draft.revision;
  if (!revision?.txId) return Promise.reject(new Error('Thiếu khoản cần sửa'));
  return runDb(async () => {
    const db = await getDb();
    await withWriteTransaction(db, async (txn) => {
      await applyTxPatch(txn, revision.txId, {
        amount: revision.previousAmount,
        direction: draft.direction,
        category: revision.previousCategory,
        note: revision.previousNote,
        date: revision.previousDate,
      });
      for (const row of siblings) {
        const payload = parseReceiptPayload(row.payload);
        if (!payload) continue;
        await writeLinked(txn, row.id, 'receipt', payload);
      }
      await writeLinked(txn, messageId, 'draft', draft);
    });
  });
}

/** Sửa một biên lai và mọi biên lai cùng khoản. */
export function saveReceiptEdit(
  messageId: string,
  next: ReceiptPayload
): Promise<{ id: string; payload: ReceiptPayload }[]> {
  return runDb(async () => {
    const db = await getDb();
    const updated: { id: string; payload: ReceiptPayload }[] = [];
    await withWriteTransaction(db, async (txn) => {
      await applyTxPatch(txn, next.txId, next);
      const rows = await txn.getAllAsync<{ id: string; payload: string }>(
        `SELECT id, payload FROM msg WHERE role = 'receipt' AND (tx_id = ? OR id = ?) ORDER BY created_at ASC`,
        next.txId,
        messageId
      );
      const seen = new Set<string>();
      for (const row of rows) {
        seen.add(row.id);
        const payload =
          row.id === messageId
            ? next
            : mergeReceipt(parseReceiptPayload(row.payload), next);
        if (!payload) continue;
        await writeLinked(txn, row.id, 'receipt', payload);
        updated.push({ id: row.id, payload });
      }
      if (!seen.has(messageId)) {
        await writeLinked(txn, messageId, 'receipt', next);
        updated.push({ id: messageId, payload: next });
      }
    });
    return updated;
  });
}

/** Xoá khoản và đánh dấu mọi biên lai của chúng là đã xoá. */
export function deleteRecorded(
  txIds: string[],
  deletedAt: number,
  messageIds: string[] = []
): Promise<{ id: string; payload: ReceiptPayload }[]> {
  return runDb(async () => {
    const db = await getDb();
    const updated: { id: string; payload: ReceiptPayload }[] = [];
    await withWriteTransaction(db, async (txn) => {
      const ids = unique(txIds);
      await removeTxs(txn, ids);
      const marks = ids.map(() => '?').join(',');
      const messageMarks = unique(messageIds);
      const rows =
        ids.length === 0
          ? []
          : await txn.getAllAsync<{ id: string; payload: string }>(
              `SELECT id, payload FROM msg
               WHERE role = 'receipt' AND (tx_id IN (${marks})${messageMarks.length ? ` OR id IN (${messageMarks.map(() => '?').join(',')})` : ''})
               ORDER BY created_at ASC`,
              ...ids,
              ...messageMarks
            );
      for (const row of rows) {
        const current = parseReceiptPayload(row.payload);
        if (!current) continue;
        const payload: ReceiptPayload = { ...current, deletedAt };
        await writeLinked(txn, row.id, 'deleted', payload);
        updated.push({ id: row.id, payload });
      }
    });
    return updated;
  });
}

/** Đưa khoản và biên lai đã xoá trở lại. Mỗi txId chỉ được cộng usage một lần. */
export function restoreRecorded(
  items: { id: string; payload: ReceiptPayload }[]
): Promise<{ id: string; payload: ReceiptPayload }[]> {
  return runDb(async () => {
    const db = await getDb();
    const restored: { id: string; payload: ReceiptPayload }[] = [];
    await withWriteTransaction(db, async (txn) => {
      const groups = new Map<string, { id: string; payload: ReceiptPayload }[]>();
      for (const item of items) {
        const list = groups.get(item.payload.txId) ?? [];
        list.push(item);
        groups.set(item.payload.txId, list);
      }
      for (const [txId, group] of groups) {
        const source = group[0].payload;
        await upsertTx(txn, txId, source);
        const rows = await txn.getAllAsync<{ id: string; payload: string }>(
          `SELECT id, payload FROM msg WHERE role = 'deleted' AND tx_id = ?`,
          txId
        );
        const pending = new Map<string, ReceiptPayload>();
        for (const item of group) pending.set(item.id, item.payload);
        for (const row of rows) {
          const parsed = parseReceiptPayload(row.payload);
          if (parsed && !pending.has(row.id)) pending.set(row.id, parsed);
        }
        for (const [id, payload] of pending) {
          const next: ReceiptPayload = { ...payload };
          delete next.deletedAt;
          await writeLinked(txn, id, 'receipt', next);
          restored.push({ id, payload: next });
        }
      }
    });
    return restored;
  });
}

/**
 * Xoá tin và các khoản đi kèm.
 * clearedText thì chèn một tin đánh dấu vào cùng transaction.
 */
export function discardThread(
  messageIds: string[],
  txIds: string[],
  clearedText?: string
): Promise<StoredMessage | null> {
  return runDb(async () => {
    const db = await getDb();
    let cleared: StoredMessage | null = null;
    await withWriteTransaction(db, async (txn) => {
      await removeTxs(txn, unique(txIds));
      const ids = unique(messageIds);
      if (ids.length > 0) {
        const marks = ids.map(() => '?').join(',');
        await txn.runAsync(`DELETE FROM msg WHERE id IN (${marks})`, ...ids);
      }
      if (clearedText) {
        cleared = {
          id: Crypto.randomUUID(),
          role: 'cleared',
          text: clearedText,
          payload: null,
          created_at: Date.now(),
        };
        await txn.runAsync(
          'INSERT INTO msg (id, role, text, payload, created_at, tx_id) VALUES (?, ?, ?, ?, ?, NULL)',
          cleared.id,
          cleared.role,
          cleared.text,
          cleared.payload,
          cleared.created_at
        );
      }
    });
    return cleared;
  });
}

/** Xoá hết giao dịch và tin nhắn. usage_count được tính lại từ sổ trống. */
export function resetAllData(): Promise<void> {
  return runDb(async () => {
    const db = await getDb();
    await db.execAsync('DELETE FROM tx; DELETE FROM msg; UPDATE category SET usage_count = 0;');
  });
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

async function applyTxPatch(
  txn: Sql,
  id: string,
  patch: { amount: number; direction: Direction; category: string; note?: string | null; date: string }
) {
  const previous = await txn.getFirstAsync<{ category: string }>('SELECT category FROM tx WHERE id = ?', id);
  await txn.runAsync(
    'UPDATE tx SET amount = ?, direction = ?, category = ?, note = ?, date = ? WHERE id = ?',
    patch.amount,
    patch.direction,
    patch.category,
    patch.note ?? null,
    patch.date,
    id
  );
  if (previous && previous.category !== patch.category) {
    await bumpCategoryUsage(txn, previous.category, -1);
    await bumpCategoryUsage(txn, patch.category, 1);
  }
}

async function upsertTx(
  txn: Sql,
  id: string,
  input: { amount: number; direction: Direction; category: string; note?: string | null; date: string }
) {
  const existing = await txn.getFirstAsync<{ category: string }>('SELECT category FROM tx WHERE id = ?', id);
  if (existing) {
    await applyTxPatch(txn, id, input);
    return;
  }
  await txn.runAsync(
    `INSERT INTO tx (id, amount, direction, category, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.amount,
    input.direction,
    input.category,
    input.note ?? null,
    input.date,
    Date.now()
  );
  await bumpCategoryUsage(txn, input.category, 1);
}

async function removeTxs(txn: Sql, ids: string[]) {
  if (ids.length === 0) return;
  const marks = ids.map(() => '?').join(',');
  const rows = await txn.getAllAsync<{ category: string }>(
    `SELECT category FROM tx WHERE id IN (${marks})`,
    ...ids
  );
  await txn.runAsync(`DELETE FROM tx WHERE id IN (${marks})`, ...ids);
  for (const row of rows) await bumpCategoryUsage(txn, row.category, -1);
}

async function writeLinked(
  txn: Sql,
  id: string,
  role: 'draft' | 'receipt' | 'deleted',
  payload: DraftPayload | ReceiptPayload
) {
  const txId = role === 'draft' ? null : 'txId' in payload ? payload.txId : null;
  await txn.runAsync(
    'UPDATE msg SET role = ?, payload = ?, tx_id = ? WHERE id = ?',
    role,
    JSON.stringify(payload),
    txId,
    id
  );
}

function priceOnSibling(current: ReceiptPayload, draft: DraftPayload, revision: Revision): ReceiptPayload {
  const sourceMessageId = current.revision?.sourceMessageId;
  return {
    ...current,
    amount: draft.amount,
    direction: draft.direction,
    category: draft.category,
    note: draft.note,
    date: draft.date,
    revision: {
      txId: revision.txId,
      previousAmount: revision.previousAmount,
      previousNote: revision.previousNote,
      previousCategory: revision.previousCategory,
      previousDate: revision.previousDate,
      ...(sourceMessageId ? { sourceMessageId } : {}),
    },
  };
}

function mergeReceipt(current: ReceiptPayload | null, next: ReceiptPayload): ReceiptPayload | null {
  if (!current) return null;
  return {
    ...current,
    amount: next.amount,
    direction: next.direction,
    category: next.category,
    note: next.note,
    date: next.date,
  };
}
