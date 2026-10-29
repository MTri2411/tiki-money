import { firstOfMonth, formatDdMm, lastOfMonth, shiftIso, startOfWeek } from '@/lib/db/dates';
import { formatVnd } from '@/lib/money';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type QueryRange = {
  start: string;
  end: string;
  category: string | null;
};

type QueryRow = {
  amount: number;
  direction: 'chi' | 'thu';
  category: string;
};

/** Từ ngày đầu tháng đến hôm nay, dùng khi mô hình không trả khoảng ngày hợp lệ. */
export function monthToDate(today: string): { start: string; end: string } {
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

export function normalizeQuery(
  raw: { start?: string; end?: string; category?: string } | null,
  today: string,
  categories: readonly string[]
): QueryRange {
  const fallback = monthToDate(today);
  const category = raw?.category && categories.includes(raw.category) ? raw.category : null;
  if (!raw || !raw.start || !raw.end || !ISO.test(raw.start) || !ISO.test(raw.end)) {
    return { ...fallback, category };
  }
  const start = raw.start <= raw.end ? raw.start : raw.end;
  const end = raw.start <= raw.end ? raw.end : raw.start;
  return { start, end, category };
}

export function rangeLabel(start: string, end: string, today: string): string {
  if (start === end && start === today) return 'Hôm nay';
  if (start === end && start === shiftIso(today, -1)) return 'Hôm qua';
  if (start === end && start === shiftIso(today, -2)) return 'Hôm kia';
  if (start === end && start === shiftIso(today, 1)) return 'Ngày mai';
  if (start === end && start === shiftIso(today, 2)) return 'Ngày kia';
  if (start === end) return `Ngày ${formatDdMm(start)}`;
  const monthStart = `${today.slice(0, 7)}-01`;
  if (start === monthStart && end === today) return 'Tháng này';
  const prevEnd = shiftIso(monthStart, -1);
  const prevStart = `${prevEnd.slice(0, 7)}-01`;
  if (start === prevStart && end === prevEnd) return 'Tháng trước';
  const nextStart = firstOfMonth(today, 1);
  if (start === nextStart && end === lastOfMonth(nextStart)) return 'Tháng sau';
  const monday = startOfWeek(today);
  if (start === shiftIso(monday, -7) && end === shiftIso(monday, -1)) return 'Tuần trước';
  if (start === shiftIso(monday, 7) && end === shiftIso(monday, 13)) return 'Tuần sau';
  if (start === monday && end === today) return 'Tuần này';
  if (start.endsWith('-01') && start.slice(0, 7) === end.slice(0, 7)) {
    return `Tháng ${start.slice(5, 7)}/${start.slice(0, 4)}`;
  }
  return `Từ ${formatDdMm(start)} đến ${formatDdMm(end)}`;
}

/** Câu trả lời có số, tính từ các khoản đã ghi trong khoảng ngày. */
export function speakLedger(input: QueryRange & { today: string; rows: QueryRow[] }): string {
  const rows = input.category ? input.rows.filter((row) => row.category === input.category) : input.rows;
  const label = rangeLabel(input.start, input.end, input.today);
  const scope = input.category ? ` cho ${input.category}` : '';
  if (rows.length === 0) {
    return input.category ? `${label} chưa có khoản ${input.category}.` : `${label} chưa có khoản nào.`;
  }
  let spend = 0;
  let income = 0;
  for (const row of rows) {
    if (row.direction === 'chi') spend += row.amount;
    else income += row.amount;
  }
  const parts: string[] = [];
  if (spend > 0) parts.push(`chi ${formatVnd(spend)}đ`);
  if (income > 0) parts.push(`thu ${formatVnd(income)}đ`);
  if (parts.length === 0) parts.push('chi 0đ');
  const count = rows.length === 1 ? '1 khoản' : `${rows.length} khoản`;
  return `${label} bạn đã ${parts.join(' và ')}${scope}, gồm ${count}.`;
}
