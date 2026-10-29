import { fold } from './category-match';
import { firstOfMonth, lastOfMonth, shiftIso, startOfWeek } from './db/dates';
import { rangeLabel } from './query';

export type RevisionTarget = {
  id: string;
  amount: number;
  direction: 'chi' | 'thu';
  category: string;
  note: string | null;
  date: string;
};

export type Revision = {
  txId: string;
  previousAmount: number;
  previousNote: string;
  previousCategory: string;
  previousDate: string;
  sourceMessageId?: string;
};

type EditableDraft = {
  amount: number;
  direction: 'chi' | 'thu';
  category: string;
  note: string;
  date: string;
  wantsRevision?: boolean;
  revision?: Revision;
};

export type SpokenSpan = {
  start: string;
  end: string;
  label: string;
};

/** Cùng cửa sổ với `revisionCandidates`: ngoài khoảng này sổ không đưa khoản lên để đối chiếu. */
const LOOKBACK_DAYS = 120;

const REVISION_PHRASES = [
  'khong phai',
  'sua lai',
  'sua khoan',
  'nham',
  'thuc ra',
  'doi thanh',
  'cap nhat',
  'an het',
  'uong het',
  'chi het',
  'tieu het',
  'chu khong',
  'ra la',
];

const FRESH_PHRASES = ['quen ghi', 'chua ghi', 'quen chua', 'bo sot'];

const STOP = new Set([
  'hom',
  'nay',
  'qua',
  'kia',
  'hnay',
  'tui',
  'toi',
  'minh',
  'ban',
  'mot',
  'cai',
  'vnd',
  'nghin',
  'ngan',
  'trieu',
  'het',
  'khong',
  'phai',
  'lai',
  'cho',
  'voi',
  'roi',
  'nhe',
  'nha',
  'thi',
  'da',
  'co',
  'duoc',
  'cua',
]);

const NUMBER_WORDS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  nam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
};

const WEEKDAYS = [
  { key: 'chu nhat', name: 'Chủ nhật', index: 0 },
  { key: 'thu hai', name: 'Thứ hai', index: 1 },
  { key: 'thu ba', name: 'Thứ ba', index: 2 },
  { key: 'thu tu', name: 'Thứ tư', index: 3 },
  { key: 'thu nam', name: 'Thứ năm', index: 4 },
  { key: 'thu sau', name: 'Thứ sáu', index: 5 },
  { key: 'thu bay', name: 'Thứ bảy', index: 6 },
] as const;

const COUNT = '(\\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)';
const AMOUNT = '(\\d+(?:[.,]\\d+)?)(?:\\s*(k|nghin|ngan|tr|trieu|tram))?';

function hasPhrase(folded: string, phrase: string): boolean {
  const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${body}(?:[^a-z0-9]|$)`).test(folded);
}

export function isRevisionSpeech(speech: string): boolean {
  const folded = fold(speech);
  if (!folded || hasFreshSpeech(folded)) return false;
  if (/^a(?:\s|$)/.test(folded)) return true;
  return REVISION_PHRASES.some((phrase) => hasPhrase(folded, phrase));
}

function hasFreshSpeech(folded: string): boolean {
  return FRESH_PHRASES.some((phrase) => hasPhrase(folded, phrase));
}

/** Quên ghi thắng cờ sửa của mô hình: đó là khoản mới, không phải sửa khoản đã có. */
function wantsEdit(speech: string, draft: EditableDraft): boolean {
  const folded = fold(speech);
  if (folded && hasFreshSpeech(folded)) return false;
  return draft.wantsRevision === true || isRevisionSpeech(speech);
}

function pushSpan(found: SpokenSpan[], span: SpokenSpan) {
  if (found.some((item) => item.start === span.start && item.end === span.end)) return;
  found.push(span);
}

function daySpan(day: string, label: string): SpokenSpan {
  return { start: day, end: day, label };
}

function readCount(raw: string): number | null {
  const named = NUMBER_WORDS[raw];
  if (named) return named;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 3660) return null;
  return n;
}

function relativeLabel(n: number, forward: boolean): string {
  if (!forward && n === 1) return 'Hôm qua';
  if (!forward && n === 2) return 'Hôm kia';
  if (forward && n === 1) return 'Ngày mai';
  if (forward && n === 2) return 'Ngày kia';
  return forward ? `${n} ngày nữa` : `${n} ngày trước`;
}

function isForward(dir: string): boolean {
  return dir === 'sau' || dir === 'nua' || dir === 'toi';
}

function weekSpan(today: string, offsetWeeks: number, label: string): SpokenSpan {
  const monday = shiftIso(startOfWeek(today), offsetWeeks * 7);
  const end = offsetWeeks === 0 ? today : shiftIso(monday, 6);
  return { start: monday, end, label };
}

function monthSpan(today: string, delta: number, label: string, clipToToday: boolean): SpokenSpan {
  const start = firstOfMonth(today, delta);
  const end = clipToToday ? today : lastOfMonth(start);
  return { start, end, label };
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (lastOfMonth(iso) < iso) return null;
  return iso;
}

function addRelativeDays(folded: string, today: string, found: SpokenSpan[]) {
  const pattern = new RegExp(`(?:^|[^a-z0-9])${COUNT}\\s+ngay\\s+(truoc|roi|sau|nua|toi)(?:[^a-z0-9]|$)`, 'g');
  for (const match of folded.matchAll(pattern)) {
    const n = readCount(match[1]);
    if (!n) continue;
    const forward = isForward(match[2]);
    pushSpan(found, daySpan(shiftIso(today, forward ? n : -n), relativeLabel(n, forward)));
  }
}

function addCalendarDates(folded: string, today: string, found: SpokenSpan[]) {
  const year = Number(today.slice(0, 4));
  for (const match of folded.matchAll(/(?:^|[^a-z0-9])(\d{4})-(\d{2})-(\d{2})(?:[^a-z0-9]|$)/g)) {
    const iso = isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) pushSpan(found, daySpan(iso, rangeLabel(iso, iso, today)));
  }
  for (const match of folded.matchAll(
    /(?:^|[^a-z0-9])ngay\s+(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}))?(?:[^a-z0-9]|$)/g
  )) {
    const iso = isoFromParts(match[3] ? Number(match[3]) : year, Number(match[2]), Number(match[1]));
    if (iso) pushSpan(found, daySpan(iso, rangeLabel(iso, iso, today)));
  }
  for (const match of folded.matchAll(
    /(?:^|[^a-z0-9])ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})(?:\s+nam\s+(\d{4}))?(?:[^a-z0-9]|$)/g
  )) {
    const iso = isoFromParts(match[3] ? Number(match[3]) : year, Number(match[2]), Number(match[1]));
    if (iso) pushSpan(found, daySpan(iso, rangeLabel(iso, iso, today)));
  }
}

function addWeekdays(folded: string, today: string, found: SpokenSpan[]) {
  const pattern = new RegExp(
    `(?:^|[^a-z0-9])(${WEEKDAYS.map((item) => item.key).join('|')})(?:\\s+tuan\\s+(truoc|roi|nay|sau|toi))?(?:[^a-z0-9]|$)`,
    'g'
  );
  for (const match of folded.matchAll(pattern)) {
    const row = WEEKDAYS.find((item) => item.key === match[1]);
    if (!row) continue;
    const week = match[2];
    let monday = startOfWeek(today);
    if (week === 'truoc' || week === 'roi') monday = shiftIso(monday, -7);
    if (week === 'sau' || week === 'toi') monday = shiftIso(monday, 7);
    const delta = row.index === 0 ? 6 : row.index - 1;
    let day = shiftIso(monday, delta);
    if (!week && day > today) day = shiftIso(day, -7);
    let label: string = row.name;
    if (week === 'truoc' || week === 'roi') label = `${row.name} tuần trước`;
    if (week === 'sau' || week === 'toi') label = `${row.name} tuần sau`;
    if (week === 'nay') label = `${row.name} tuần này`;
    if (day === today) label = 'Hôm nay';
    pushSpan(found, daySpan(day, label));
  }
}

function addWeeks(folded: string, today: string, found: SpokenSpan[]) {
  const edge = folded.match(/(?:^|[^a-z0-9])(dau|cuoi)\s+tuan(?:\s+(truoc|roi|nay|sau|toi))?(?:[^a-z0-9]|$)/);
  if (edge) {
    let monday = startOfWeek(today);
    const which = edge[2];
    if (which === 'truoc' || which === 'roi') monday = shiftIso(monday, -7);
    if (which === 'sau' || which === 'toi') monday = shiftIso(monday, 7);
    const day = edge[1] === 'dau' ? monday : shiftIso(monday, 6);
    const suffix = which === 'truoc' || which === 'roi' ? ' trước' : which === 'sau' || which === 'toi' ? ' sau' : '';
    const label = day === today ? 'Hôm nay' : `${edge[1] === 'dau' ? 'Đầu' : 'Cuối'} tuần${suffix}`;
    pushSpan(found, daySpan(day, label));
    return;
  }
  const counted = folded.match(
    new RegExp(`(?:^|[^a-z0-9])${COUNT}\\s+tuan\\s+(truoc|roi|sau|nua|toi)(?:[^a-z0-9]|$)`)
  );
  if (counted) {
    const n = readCount(counted[1]);
    if (!n) return;
    const forward = isForward(counted[2]);
    if (n === 1) {
      pushSpan(found, weekSpan(today, forward ? 1 : -1, forward ? 'Tuần sau' : 'Tuần trước'));
      return;
    }
    const monday = shiftIso(startOfWeek(today), (forward ? n : -n) * 7);
    pushSpan(found, {
      start: monday,
      end: shiftIso(monday, 6),
      label: forward ? `${n} tuần nữa` : `${n} tuần trước`,
    });
    return;
  }
  if (hasPhrase(folded, 'tuan sau') || hasPhrase(folded, 'tuan toi')) {
    pushSpan(found, weekSpan(today, 1, 'Tuần sau'));
  }
  if (hasPhrase(folded, 'tuan truoc') || hasPhrase(folded, 'tuan roi')) {
    pushSpan(found, weekSpan(today, -1, 'Tuần trước'));
  }
  if (hasPhrase(folded, 'tuan nay')) pushSpan(found, weekSpan(today, 0, 'Tuần này'));
}

function addMonths(folded: string, today: string, found: SpokenSpan[]) {
  const edge = folded.match(/(?:^|[^a-z0-9])(dau|cuoi)\s+thang(?:\s+(truoc|roi|nay|sau|toi))?(?:[^a-z0-9]|$)/);
  if (edge) {
    const which = edge[2];
    const delta = which === 'sau' || which === 'toi' ? 1 : which === 'truoc' || which === 'roi' ? -1 : 0;
    const bounds = monthSpan(today, delta, '', false);
    const day = edge[1] === 'dau' ? bounds.start : bounds.end;
    const suffix = delta === 1 ? ' sau' : delta === -1 ? ' trước' : '';
    const label = day === today ? 'Hôm nay' : `${edge[1] === 'dau' ? 'Đầu' : 'Cuối'} tháng${suffix}`;
    pushSpan(found, daySpan(day, label));
    return;
  }
  const counted = folded.match(
    new RegExp(`(?:^|[^a-z0-9])${COUNT}\\s+thang\\s+(truoc|roi|sau|nua|toi)(?:[^a-z0-9]|$)`)
  );
  if (counted) {
    const n = readCount(counted[1]);
    if (!n) return;
    const forward = isForward(counted[2]);
    if (n === 1) {
      pushSpan(found, monthSpan(today, forward ? 1 : -1, forward ? 'Tháng sau' : 'Tháng trước', false));
      return;
    }
    const start = firstOfMonth(today, forward ? n : -n);
    pushSpan(found, {
      start,
      end: lastOfMonth(start),
      label: forward ? `${n} tháng nữa` : `${n} tháng trước`,
    });
    return;
  }
  if (hasPhrase(folded, 'thang sau') || hasPhrase(folded, 'thang toi')) {
    pushSpan(found, monthSpan(today, 1, 'Tháng sau', false));
  }
  if (hasPhrase(folded, 'thang truoc') || hasPhrase(folded, 'thang roi')) {
    pushSpan(found, monthSpan(today, -1, 'Tháng trước', false));
  }
  if (hasPhrase(folded, 'thang nay')) pushSpan(found, monthSpan(today, 0, 'Tháng này', true));
}

function addYears(folded: string, today: string, found: SpokenSpan[]) {
  const year = Number(today.slice(0, 4));
  const counted = folded.match(
    new RegExp(`(?:^|[^a-z0-9])${COUNT}\\s+nam\\s+(truoc|roi|sau|nua|toi)(?:[^a-z0-9]|$)`)
  );
  if (counted) {
    const n = readCount(counted[1]);
    if (!n) return;
    const forward = isForward(counted[2]);
    const y = year + (forward ? n : -n);
    const start = `${y}-01-01`;
    pushSpan(found, {
      start,
      end: `${y}-12-31`,
      label: n === 1 ? (forward ? 'Năm sau' : 'Năm trước') : forward ? `${n} năm nữa` : `${n} năm trước`,
    });
    return;
  }
  if (hasPhrase(folded, 'nam sau') || hasPhrase(folded, 'nam toi')) {
    pushSpan(found, { start: `${year + 1}-01-01`, end: `${year + 1}-12-31`, label: 'Năm sau' });
  }
  if (hasPhrase(folded, 'nam truoc') || hasPhrase(folded, 'nam roi') || hasPhrase(folded, 'nam ngoai')) {
    pushSpan(found, { start: `${year - 1}-01-01`, end: `${year - 1}-12-31`, label: 'Năm trước' });
  }
  if (hasPhrase(folded, 'nam nay')) {
    pushSpan(found, { start: `${year}-01-01`, end: today, label: 'Năm nay' });
  }
}

/** Một khoảng ngày nếu câu chỉ đúng một mốc. Hai mốc khác nhau thì bỏ, để dùng ngày trên nháp. */
export function spokenSpan(speech: string, today: string): SpokenSpan | null {
  const folded = fold(speech);
  if (!folded) return null;
  const found: SpokenSpan[] = [];
  addRelativeDays(folded, today, found);
  if (hasPhrase(folded, 'hom kia')) pushSpan(found, daySpan(shiftIso(today, -2), 'Hôm kia'));
  if (hasPhrase(folded, 'hom qua') || hasPhrase(folded, 'hom truoc')) {
    pushSpan(found, daySpan(shiftIso(today, -1), 'Hôm qua'));
  }
  if (hasPhrase(folded, 'hnay') || hasPhrase(folded, 'hom nay')) pushSpan(found, daySpan(today, 'Hôm nay'));
  if (hasPhrase(folded, 'ngay mai')) pushSpan(found, daySpan(shiftIso(today, 1), 'Ngày mai'));
  if (hasPhrase(folded, 'ngay kia') || hasPhrase(folded, 'ngay mot')) {
    pushSpan(found, daySpan(shiftIso(today, 2), 'Ngày kia'));
  }
  addCalendarDates(folded, today, found);
  const weekdayCount = found.length;
  addWeekdays(folded, today, found);
  if (found.length === weekdayCount) addWeeks(folded, today, found);
  addMonths(folded, today, found);
  addYears(folded, today, found);
  if (found.length !== 1) return null;
  return found[0];
}

export function spokenDay(speech: string, today: string): string | null {
  const span = spokenSpan(speech, today);
  if (!span || span.start !== span.end) return null;
  return span.start;
}

function spanFromDate(date: string, today: string): SpokenSpan {
  return daySpan(date, rangeLabel(date, date, today));
}

function withSpanDate<T extends EditableDraft>(draft: T, span: SpokenSpan): T {
  if (span.start === span.end) return { ...draft, date: span.start };
  if (draft.date >= span.start && draft.date <= span.end) return draft;
  return { ...draft, date: span.end };
}

function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP.has(token));
}

function scoreMatch(draft: EditableDraft, tx: RevisionTarget, speech: string): number {
  let score = 0;
  if (tx.category === draft.category) score += 5;
  const known = new Set(tokens(`${tx.note ?? ''} ${tx.category}`));
  const wanted = new Set([...tokens(draft.note), ...tokens(speech)]);
  let shared = 0;
  for (const token of wanted) {
    if (known.has(token)) shared += 1;
  }
  score += shared * 3;
  if (tx.amount !== draft.amount) score += 1;
  return score;
}

function parseAmount(number: string, unit?: string): number | null {
  const compact = number.trim();
  if (!unit && /^\d{1,3}(?:\.\d{3})+$/.test(compact)) return Number(compact.replace(/\./g, ''));
  const value = Number(compact.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === 'k' || unit === 'nghin' || unit === 'ngan') return Math.round(value * 1000);
  if (unit === 'tr' || unit === 'trieu') return Math.round(value * 1_000_000);
  if (unit === 'tram') return Math.round(value * 100_000);
  if (value < 1000) return Math.round(value * 1000);
  return Math.round(value);
}

/** Số tiền người dùng phủ nhận, ví dụ "chứ không phải 50k". Bỏ qua nếu trùng số mới. */
function deniedAmount(speech: string, nextAmount: number): number | null {
  const folded = fold(speech);
  const patterns = [
    new RegExp(`khong\\s+phai\\s+${AMOUNT}`, 'g'),
    new RegExp(`chu\\s+khong(?:\\s+phai)?\\s+${AMOUNT}`, 'g'),
    new RegExp(`nham\\s+${AMOUNT}`, 'g'),
    new RegExp(`tu\\s+${AMOUNT}\\s+(?:thanh|len|xuong)`, 'g'),
  ];
  const amounts = new Set<number>();
  for (const pattern of patterns) {
    for (const match of folded.matchAll(pattern)) {
      const amount = parseAmount(match[1], match[2]);
      if (amount && amount !== nextAmount) amounts.add(amount);
    }
  }
  if (amounts.size !== 1) return null;
  return [...amounts][0];
}

function toRevision(tx: RevisionTarget): Revision {
  return {
    txId: tx.id,
    previousAmount: tx.amount,
    previousNote: tx.note ?? '',
    previousCategory: tx.category,
    previousDate: tx.date,
  };
}

export type RevisionMatch =
  | { kind: 'match'; revision: Revision }
  | { kind: 'ambiguous'; category: string }
  | { kind: 'missing'; denied: number | null; inWindow: RevisionTarget[] }
  | { kind: 'none' };

export function matchRevision(
  speech: string,
  draft: EditableDraft,
  txs: RevisionTarget[],
  today: string,
  span?: SpokenSpan | null
): RevisionMatch {
  if (!wantsEdit(speech, draft)) return { kind: 'none' };
  const window = span ?? spokenSpan(speech, today) ?? spanFromDate(draft.date, today);
  const inWindow = txs.filter(
    (tx) => tx.date >= window.start && tx.date <= window.end && tx.direction === draft.direction
  );
  const denied = deniedAmount(speech, draft.amount);
  const pool = denied == null ? inWindow : inWindow.filter((tx) => tx.amount === denied);
  if (pool.length === 0) return { kind: 'missing', denied, inWindow };
  const ranked = pool
    .map((tx) => ({ tx, score: scoreMatch(draft, tx, speech) }))
    .filter((item) => item.score >= 5 || item.score >= 3)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return { kind: 'missing', denied, inWindow };
  const [best, second] = ranked;
  if (second && best.score - second.score < 3) {
    return { kind: 'ambiguous', category: draft.category };
  }
  return { kind: 'match', revision: toRevision(best.tx) };
}

export function speakAmount(amount: number): string {
  if (amount > 0 && amount % 1_000_000 === 0) return `${amount / 1_000_000} triệu`;
  if (amount > 0 && amount % 1000 === 0) return `${amount / 1000}k`;
  return `${amount}đ`;
}

function entryName(draft: { note: string; category: string }): string {
  return draft.note.trim() || draft.category;
}

function relatedTxs(draft: EditableDraft, rows: RevisionTarget[]): RevisionTarget[] {
  const wanted = new Set([...tokens(draft.note), ...tokens(draft.category)]);
  return rows.filter((tx) => {
    if (tx.category === draft.category) return true;
    return tokens(`${tx.note ?? ''} ${tx.category}`).some((token) => wanted.has(token));
  });
}

function phraseDay(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function missingReply(
  span: SpokenSpan,
  draft: EditableDraft,
  found: { denied: number | null; inWindow: RevisionTarget[] },
  today: string
): string {
  const name = entryName(draft);
  if (span.start > today) return `${span.label} chưa tới, nên mình không sửa khoản ${name} được.`;
  const others = relatedTxs(draft, found.inWindow).filter(
    (tx) => found.denied == null || tx.amount !== found.denied
  );
  if (found.denied != null && others.length === 1) {
    const shown = others[0].note?.trim() || name;
    return `${span.label} khoản ${shown} đang là ${speakAmount(others[0].amount)}. Mình chưa thấy khoản ${speakAmount(found.denied)} để sửa.`;
  }
  if (found.denied != null && others.length > 1) {
    return `${span.label} mình thấy ${others.length} khoản ${name}, chưa có khoản ${speakAmount(found.denied)}. Bạn nói rõ khoản nào.`;
  }
  if (span.start < shiftIso(today, -LOOKBACK_DAYS)) {
    return `Mình chỉ đối chiếu 120 ngày gần nhất và không thấy khoản ${name} để sửa.`;
  }
  const target = speakAmount(draft.amount);
  const described = found.denied != null ? `${name} ${speakAmount(found.denied)}` : `${name} nào`;
  const lead = `${span.label} chưa có khoản ${described}, nên mình không sửa thành ${target} được.`;
  if (span.start !== span.end) return lead;
  return `${lead} Nếu muốn ghi mới, bạn nói ghi ${phraseDay(span.label)} ${name} ${target}.`;
}

function futureRecordReply(span: SpokenSpan, draft: EditableDraft): string {
  return `${span.label} chưa tới, sổ chưa có khoản ${entryName(draft)}. Bạn ghi lại khi đã chi nhé.`;
}

type PlannedDraft<T> = Omit<T, 'wantsRevision'> & { revision?: Revision };

export function planRevisions<T extends EditableDraft>(
  speech: string,
  drafts: T[],
  txs: RevisionTarget[],
  today: string
): { drafts: PlannedDraft<T>[]; reply: string | null } {
  const speechSpan = drafts.length === 1 ? spokenSpan(speech, today) : null;
  const next: PlannedDraft<T>[] = [];
  const lines: string[] = [];
  const questions: string[] = [];
  for (const draft of drafts) {
    const span = speechSpan ?? spanFromDate(draft.date, today);
    const dated = withSpanDate(draft, span);
    const { wantsRevision: _ignored, ...rest } = dated;
    const intent = wantsEdit(speech, draft);
    if (span.start > today && !intent) {
      questions.push(futureRecordReply(span, dated));
      continue;
    }
    const found = matchRevision(speech, dated, txs, today, span);
    if (found.kind === 'match') {
      const date = span.start === span.end ? dated.date : found.revision.previousDate;
      next.push({ ...rest, date, revision: found.revision });
      const name = entryName(draft);
      lines.push(
        `Mình sửa khoản ${name} từ ${speakAmount(found.revision.previousAmount)} thành ${speakAmount(draft.amount)}.`
      );
      continue;
    }
    if (found.kind === 'ambiguous') {
      const where = span.start === span.end ? 'cùng ngày' : 'trong khoảng này';
      questions.push(`Mình thấy vài khoản ${found.category} ${where}. Bạn nói rõ khoản nào để mình sửa.`);
      continue;
    }
    if (found.kind === 'missing') {
      questions.push(missingReply(span, dated, found, today));
      continue;
    }
    next.push(rest);
  }
  if (lines.length === 0 && questions.length === 0) return { drafts: next, reply: null };
  const reply = [...lines, ...new Set(questions)].join(' ');
  const closing = next.length > 0 ? ' Bạn xác nhận giúp mình.' : '';
  return { drafts: next, reply: `${reply}${closing}` };
}
