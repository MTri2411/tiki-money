import type { Revision } from '@/lib/revise';

/** Tên danh mục người dùng thấy trên sổ, ví dụ "Ăn uống". */
export type Category = string;

/** Một dòng trong bảng category. */
export type CategoryRow = {
  id: string;
  name: string;
  icon: string;
  sort: number;
  is_hidden: number;
  usage_count: number;
};

export type Direction = 'chi' | 'thu';

export type MsgRole = 'user' | 'assistant' | 'draft' | 'receipt' | 'deleted' | 'cleared';

export type { Revision };

/** Khoản tiền mô hình đề xuất, chưa ghi vào bảng tx. */
export type Draft = {
  amount: number;
  direction: Direction;
  category: Category;
  note: string;
  date: string;
  confidence: number;
  wantsRevision?: boolean;
  revision?: Revision;
};

export type DraftPayload = Draft & {
  groupId?: string;
};

/** Biên lai đã lưu: draft cộng id giao dịch trong bảng tx. */
export type ReceiptPayload = Draft & {
  txId: string;
  groupId?: string;
  deletedAt?: number;
};

export type VoicePayload = {
  kind: 'voice';
  uri: string;
  durationSec: number;
  mimeType?: string;
};

export type StoredMessage = {
  id: string;
  role: MsgRole;
  text: string | null;
  payload: string | null;
  created_at: number;
};

export type ChipRow = {
  id: string;
  label: string;
  amount: number;
  category: Category;
  sort: number;
};

export type DayTotals = {
  spend: number;
  income: number;
  count: number;
};

/** Một giao dịch đã ghi. direction chỉ còn chi hoặc thu. */
export type TxRow = {
  id: string;
  amount: number;
  direction: Direction;
  category: Category;
  note: string | null;
  date: string;
  created_at: number;
};

export function isCategory(value: string): value is Category {
  return value.trim().length > 0;
}
