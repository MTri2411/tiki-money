/**
 * Tin nhắn trong cuộc chat nằm ở bảng msg.
 * payload là JSON: draft chưa lưu, biên lai đã lưu, hoặc file ghi âm.
 */
import * as Crypto from 'expo-crypto';

import { getDb, runDb } from './connection';
import { normalizeIso } from './dates';
import type { Draft, DraftPayload, MsgRole, ReceiptPayload, Revision, StoredMessage, VoicePayload } from './types';

const MSG_COLUMNS = 'id, role, text, payload, created_at';

function linkedTxId(role: MsgRole, payload: string | null): string | null {
  if (role !== 'receipt' && role !== 'deleted') return null;
  return parseReceiptPayload(payload)?.txId ?? null;
}

/** Không truyền limit thì trả cả hội thoại, cũ đến mới. Có limit thì lấy mới nhất rồi đảo lại. */
export function recentMessages(limit?: number): Promise<StoredMessage[]> {
  return runDb(async () => {
    const db = await getDb();
    if (limit == null) {
      return db.getAllAsync<StoredMessage>(
        `SELECT ${MSG_COLUMNS} FROM msg ORDER BY created_at ASC`
      );
    }
    const rows = await db.getAllAsync<StoredMessage>(
      `SELECT ${MSG_COLUMNS} FROM msg ORDER BY created_at DESC LIMIT ?`,
      limit
    );
    return rows.reverse();
  });
}

/** Ghi một tin. id và thời điểm có thể truyền vào khi hoàn tác hoặc phát lại. */
export function insertMsg(input: {
  id?: string;
  role: MsgRole;
  text?: string | null;
  payload?: string | null;
  created_at?: number;
}): Promise<StoredMessage> {
  return runDb(async () => {
    const db = await getDb();
    const row: StoredMessage = {
      id: input.id ?? Crypto.randomUUID(),
      role: input.role,
      text: input.text ?? null,
      payload: input.payload ?? null,
      created_at: input.created_at ?? Date.now(),
    };
    await db.runAsync(
      'INSERT INTO msg (id, role, text, payload, created_at, tx_id) VALUES (?, ?, ?, ?, ?, ?)',
      row.id,
      row.role,
      row.text,
      row.payload,
      row.created_at,
      linkedTxId(row.role, row.payload)
    );
    return row;
  });
}

/** Sửa role, chữ hoặc payload. Trường không truyền thì giữ nguyên giá trị đang lưu. */
export function updateMsg(
  id: string,
  patch: Partial<Pick<StoredMessage, 'role' | 'text' | 'payload'>>
): Promise<void> {
  return runDb(async () => {
    const db = await getDb();
    const current = await db.getFirstAsync<StoredMessage>(
      `SELECT ${MSG_COLUMNS} FROM msg WHERE id = ?`,
      id
    );
    if (!current) throw new Error(`Không tìm thấy tin nhắn ${id}`);
    const role = patch.role ?? current.role;
    const text = patch.text === undefined ? current.text : patch.text;
    const payload = patch.payload === undefined ? current.payload : patch.payload;
    await db.runAsync(
      'UPDATE msg SET role = ?, text = ?, payload = ?, tx_id = ? WHERE id = ?',
      role,
      text,
      payload,
      linkedTxId(role, payload),
      id
    );
  });
}

/** Bản sửa chỉ hợp lệ khi đủ id khoản cũ và số tiền, danh mục, ngày trước đó. */
function isRevision(value: Draft['revision']): value is Revision {
  return Boolean(
    value &&
      typeof value.txId === 'string' &&
      value.txId &&
      typeof value.previousAmount === 'number' &&
      typeof value.previousCategory === 'string' &&
      typeof value.previousDate === 'string'
  );
}

/** Đọc payload draft. Trả null nếu JSON hỏng hoặc thiếu số tiền, hướng, danh mục, ngày. */
export function parseDraftPayload(raw: string | null): DraftPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftPayload;
    if (
      typeof parsed.amount !== 'number' ||
      parsed.amount <= 0 ||
      (parsed.direction !== 'chi' && parsed.direction !== 'thu') ||
      typeof parsed.category !== 'string' ||
      !normalizeIso(parsed.date)
    ) return null;
    if (!isRevision(parsed.revision)) delete parsed.revision;
    delete parsed.wantsRevision;
    return parsed;
  } catch {
    return null;
  }
}

/** Đọc biên lai đã lưu. Ngoài các trường của draft còn bắt buộc có txId. */
export function parseReceiptPayload(raw: string | null): ReceiptPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ReceiptPayload;
    if (
      !parsed.txId ||
      typeof parsed.amount !== 'number' ||
      parsed.amount <= 0 ||
      (parsed.direction !== 'chi' && parsed.direction !== 'thu') ||
      typeof parsed.category !== 'string' ||
      !normalizeIso(parsed.date)
    ) return null;
    if (!isRevision(parsed.revision)) delete parsed.revision;
    return parsed;
  } catch {
    return null;
  }
}

/** Đọc tin thoại. Chỉ nhận payload có kind là voice và có đường dẫn file. */
export function parseVoicePayload(raw: string | null): VoicePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VoicePayload>;
    if (parsed.kind !== 'voice' || typeof parsed.uri !== 'string' || !parsed.uri) return null;
    return {
      kind: 'voice',
      uri: parsed.uri,
      durationSec: typeof parsed.durationSec === 'number' ? parsed.durationSec : 0,
      mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : undefined,
    };
  } catch {
    return null;
  }
}
