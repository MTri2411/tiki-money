/** Mọi ngày trên sổ tính theo giờ Việt Nam, không theo múi giờ máy. */
const TZ = 'Asia/Ho_Chi_Minh';
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export function localDateIso(date = new Date()): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return normalizeIso(formatted) ?? formatted.replace(/[\u200e\u200f]/g, '').trim();
}

/** Chuẩn hoá "24/9/2026" hoặc "2026-9-24" thành YYYY-MM-DD. Trả null nếu không phải ngày. */
export function normalizeIso(value: string): string | null {
  const clean = value.replace(/[\u200e\u200f\s]/g, '').trim();
  let match = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return null;
}

export function monthKey(iso = localDateIso()): string {
  return iso.slice(0, 7);
}

export function formatDdMm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function dateAtNoonHcm(iso: string): Date {
  return new Date(`${iso}T12:00:00+07:00`);
}

export function formatWeekdayDate(iso: string): string {
  const weekday = WEEKDAYS[dateAtNoonHcm(iso).getUTCDay()];
  return `${weekday}, ${formatDdMm(iso)}`;
}

export function formatDayMarker(iso: string, today = localDateIso()): string {
  if (iso === today) return `Hôm nay, ${formatDdMm(iso)}`;
  return formatWeekdayDate(iso);
}

export function shiftIso(iso: string, days: number): string {
  const date = dateAtNoonHcm(iso);
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Thứ hai của tuần chứa ngày đó. Tuần bắt đầu từ thứ hai. */
export function startOfWeek(iso: string): string {
  const day = dateAtNoonHcm(iso).getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  return shiftIso(iso, delta);
}

/** Ngày đầu tháng, cộng thêm `delta` tháng. */
export function firstOfMonth(iso: string, delta = 0): string {
  const year = Number(iso.slice(0, 4));
  const monthIndex = Number(iso.slice(5, 7)) - 1 + delta;
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function lastOfMonth(iso: string): string {
  return shiftIso(firstOfMonth(iso, 1), -1);
}

export function formatTargetDate(iso: string, today = localDateIso()): string {
  if (iso === today) return 'hôm nay';
  if (iso === shiftIso(today, -1)) return 'hôm qua';
  return formatDdMm(iso);
}

export function formatClock(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

export function formatMessageStamp(ms: number, today = localDateIso()): string {
  const iso = isoFromCreatedAt(ms);
  const clock = formatClock(ms);
  if (iso === today) return clock;
  return `${formatWeekdayDate(iso)}, ${clock}`;
}

export function formatDateTimeValue(iso: string, at: number, today = localDateIso()): string {
  const clock = formatClock(at);
  if (iso === today) return `Hôm nay, ${clock}`;
  if (iso === shiftIso(today, -1)) return `Hôm qua, ${clock}`;
  return `${formatDdMm(iso)}, ${clock}`;
}

export function isoFromCreatedAt(ms: number): string {
  return localDateIso(new Date(ms));
}
