// Any EXPO_PUBLIC_ variable is inlined into the JavaScript bundle at build time
// and can be extracted from a shipped binary. That is acceptable for a personal
// or internal build, not for public distribution. Because ENDPOINT is one
// constant, moving to a server proxy later is a one-line change — point it at a
// webhook or edge function that holds the key and forwards the same body.

import { categoryGuide, refineDrafts } from '@/lib/category-match';
import {
  categories,
  isCategory,
  localDateIso,
  revisionCandidates,
  txsBetween,
  type Category,
  type Direction,
  type Draft,
  type TxRow,
} from '@/lib/db';
import { normalizeQuery, speakLedger } from '@/lib/query';
import { planRevisions } from '@/lib/revise';

export type Intent = 'record' | 'query' | 'off_topic';

const ENDPOINT =
  process.env.EXPO_PUBLIC_GEMINI_ENDPOINT ||
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

const BACKUP_ENDPOINT =
  process.env.EXPO_PUBLIC_GEMINI_BACKUP_ENDPOINT ||
  ENDPOINT.replace(/models\/[^/:]+/, 'models/gemini-3.5-flash');

/** Mỗi lần gọi chỉ chờ từng này. Hết giờ thì bỏ kết nối treo và thử model dự phòng. */
const ATTEMPT_MS = 20_000;

export type GeminiErrorKind = 'network' | 'auth' | 'rate' | 'bad-response';

export class GeminiError extends Error {
  kind: GeminiErrorKind;
  status?: number;
  constructor(kind: GeminiErrorKind, message?: string, status?: number) {
    super(message ?? kind);
    this.name = 'GeminiError';
    this.kind = kind;
    this.status = status;
  }
}

function logGemini(label: string, extra?: unknown) {
  if (!__DEV__) return;
  if (extra === undefined) {
    console.log(`[gemini] ${label}`);
    return;
  }
  console.log(`[gemini] ${label}`, extra);
}

function keyMeta(key: string) {
  if (!key) return { present: false, length: 0, prefix: '' };
  return {
    present: true,
    length: key.length,
    prefix: key.slice(0, 4),
  };
}

function googleErrorDetail(json: unknown): {
  code?: number;
  status?: string;
  message?: string;
} | null {
  if (!json || typeof json !== 'object') return null;
  const err = (json as { error?: { code?: number; status?: string; message?: string } }).error;
  if (!err || typeof err !== 'object') return null;
  return {
    code: typeof err.code === 'number' ? err.code : undefined,
    status: typeof err.status === 'string' ? err.status : undefined,
    message: typeof err.message === 'string' ? err.message : undefined,
  };
}

export function errorCopy(kind: GeminiErrorKind): string {
  switch (kind) {
    case 'network':
      return 'Mình không kết nối được. Kiểm tra mạng rồi thử lại nhé.';
    case 'auth':
      return 'Khoá API không hợp lệ. Kiểm tra lại cấu hình.';
    case 'rate':
      return 'Đang quá tải. Thử lại sau vài giây.';
    default:
      return 'Có lỗi khi xử lý câu này. Thử lại giúp mình.';
  }
}

export type ChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  intent?: Intent | null;
};

export type ParseResult = {
  reply: string;
  drafts: Draft[];
  intent: Intent;
};

type ModelQuery = { start: string; end: string; category: string };

type ModelResult = ParseResult & {
  query: ModelQuery | null;
};

const REFUSAL =
  'Mình chỉ giúp bạn ghi và xem thu chi. Bạn nói một khoản nhé, ví dụ cà phê 30k.';

const ADVICE_REFUSAL = 'Mình chỉ tính trên số bạn đã ghi thôi.';

function schemaFor(categoryNames: string[]) {
  return {
  type: 'OBJECT',
  propertyOrdering: ['intent', 'reply', 'drafts', 'query'],
  required: ['intent', 'reply', 'drafts'],
  properties: {
    intent: { type: 'STRING', enum: ['record', 'query', 'off_topic'] },
    reply: { type: 'STRING' },
    query: {
      type: 'OBJECT',
      properties: {
        start: { type: 'STRING' },
        end: { type: 'STRING' },
        category: { type: 'STRING' },
      },
    },
    drafts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        propertyOrdering: [
          'amount',
          'direction',
          'category',
          'note',
          'date',
          'confidence',
          'revise',
        ],
        required: ['amount', 'direction', 'category', 'note', 'date', 'revise'],
        properties: {
          amount: { type: 'INTEGER' },
          direction: { type: 'STRING', enum: ['chi', 'thu'] },
          category: { type: 'STRING', enum: categoryNames },
          note: { type: 'STRING' },
          date: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          revise: { type: 'BOOLEAN' },
        },
      },
    },
  },
  } as const;
}

function systemPrompt(today: string, categoryNames: string[]) {
  const guide = categoryGuide(categoryNames);
  return `You extract money records from casual Vietnamese speech for a personal expense app.
Today is ${today}, timezone Asia/Ho_Chi_Minh. Currency is Vietnamese đồng.
Return only JSON matching the schema. Never write prose outside the JSON.
Resolve every relative date to an absolute yyyy-mm-dd: "hôm nay", "hôm qua", "hôm kia", "thứ hai tuần trước", "3 ngày trước", "đầu tháng". When no date is mentioned, use today.
Vietnamese money shorthand: "35k" is 35000, "150 nghìn" and "150 ngàn" are 150000, "1tr" and "1 triệu" are 1000000, "45.000" is 45000, "2 trăm" is 200000. A bare number below 1000 means thousands, so "150" is 150000. Return whole numbers only.
One sentence may contain several records, for example "sáng ăn 45k trưa 55k" — return one object per record.
direction is "thu" only for money arriving: lương, thưởng, được trả lại, bán hàng. Everything else is "chi".
category must be one of these values, ordered by the user's recent habits: ${categoryNames.join(', ')}. Prefer "Khác" over inventing one.
${guide}
note is a short Vietnamese phrase naming what the money was for, at most six words, with no amount inside it.
intent is record when the user is logging or correcting a transaction, query when they ask about amounts already saved, off_topic otherwise.
drafts is only for one-off chi or thu. When intent is query or off_topic, drafts is empty.
When intent is query, set query.start and query.end to inclusive yyyy-mm-dd bounds for the period they asked about. When they name a category, set query.category to that exact category name, otherwise an empty string. Do not put digits in reply. The app replaces reply with the total from the ledger.
revise is true only when the user is changing a saved record ("không phải", "chứ không", "sửa thành", "nhầm"), otherwise false. The app checks the ledger and drops the draft when that period has no matching record.
Dates after today are not on the ledger yet. Still resolve "ngày mai", "ngày kia", "tuần sau", "tháng sau" to yyyy-mm-dd, and do not describe that money as already saved.
confidence is your own certainty from 0 to 1 that the amount and category are right.
This app only records and reviews the user's own spending and income. Nothing else.
When the message is news, politics, weather, study help, coding, jokes, or general knowledge, set intent to off_topic, leave drafts empty, and reply exactly: "${REFUSAL}"
For advice you cannot know from the user's own records — borrowing, interest, investing, insurance, tax, prices, or whether to repay debt — set intent to off_topic, drafts empty, and reply exactly: "${ADVICE_REFUSAL}"
reply is at most two short Vietnamese sentences, plain, no emoji, calling the user "bạn" and itself "mình". When drafts is not empty, say what you understood and ask the user to check.
Never invent an amount the user did not say.`;
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Chỉ gửi vài lượt gần nhất có chữ, để câu hỏi không kéo theo cả sổ chat. */
function historyContents(history: ChatTurn[]) {
  const filtered = history.filter((turn) => turn.text.trim()).slice(-12);
  return filtered.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }] as GeminiPart[],
  }));
}

function classifyHttp(status: number): GeminiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429 || status === 503) return 'rate';
  return 'bad-response';
}

function overloaded(status: number) {
  return status === 429 || status === 503;
}

/** Model dự phòng chỉ suy nghĩ ở mức thấp nhất, để hạn mức token còn cho JSON. */
function withoutThinking(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...(body as Record<string, unknown>) };
  const config = copy.generationConfig;
  if (!config || typeof config !== 'object') return copy;
  copy.generationConfig = {
    ...(config as Record<string, unknown>),
    thinkingConfig: { thinkingLevel: 'minimal' },
  };
  return copy;
}

async function postOnce(
  body: unknown,
  signal: AbortSignal,
  endpoint = ENDPOINT
): Promise<{ status: number; json: unknown }> {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
  if (!key) {
    logGemini('missing EXPO_PUBLIC_GEMINI_API_KEY — reload app after editing .env');
    throw new GeminiError('auth', 'missing EXPO_PUBLIC_GEMINI_API_KEY');
  }
  const started = Date.now();
  logGemini('request', { endpoint, key: keyMeta(key) });
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logGemini('fetch failed', {
      endpoint,
      aborted: signal.aborted,
      ms: Date.now() - started,
      detail,
    });
    if (err instanceof GeminiError) throw err;
    throw new GeminiError(
      'network',
      signal.aborted ? `aborted: ${detail}` : detail
    );
  }
  let json: unknown = null;
  try {
    json = await response.json();
  } catch (parseErr) {
    logGemini('response is not JSON', {
      status: response.status,
      ms: Date.now() - started,
      detail: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    json = null;
  }
  if (!response.ok) {
    logGemini('HTTP error', {
      status: response.status,
      ms: Date.now() - started,
      google: googleErrorDetail(json),
      body: json,
    });
  } else {
    logGemini('HTTP ok', { status: response.status, ms: Date.now() - started });
  }
  return { status: response.status, json };
}

/**
 * Một lần gọi có bộ đếm giờ riêng.
 * Trên iOS, abort không cắt fetch ngay, nên hết giờ thì bỏ promise đó và đi tiếp.
 */
async function attempt(
  endpoint: string,
  payload: unknown,
  externalSignal?: AbortSignal
): Promise<{ status: number; json: unknown }> {
  if (externalSignal?.aborted) throw new GeminiError('network', 'aborted');
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = postOnce(payload, controller.signal, endpoint);
  pending.catch(() => undefined);
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        logGemini(`timeout after ${ATTEMPT_MS}ms`, { endpoint });
        controller.abort();
        reject(new GeminiError('network', `timeout after ${ATTEMPT_MS}ms`));
      }, ATTEMPT_MS);
      pending.then(resolve, (err: unknown) => {
        if (externalSignal?.aborted) reject(new GeminiError('network', 'aborted'));
        else reject(err);
      });
    });
  } finally {
    if (timer) clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

function canUseBackup(err: unknown, externalSignal?: AbortSignal): boolean {
  if (externalSignal?.aborted) return false;
  if (BACKUP_ENDPOINT === ENDPOINT) return false;
  return err instanceof GeminiError && err.kind === 'network' && err.message !== 'aborted';
}

async function request(body: unknown, externalSignal?: AbortSignal): Promise<ModelResult> {
  const call = (endpoint: string, payload: unknown) => attempt(endpoint, payload, externalSignal);

  const withBackup = async (endpoint: string, payload: unknown) => {
    try {
      return await call(endpoint, payload);
    } catch (err) {
      if (!canUseBackup(err, externalSignal)) throw err;
      logGemini('primary unreachable, trying backup', {
        endpoint: BACKUP_ENDPOINT,
        detail: err instanceof Error ? err.message : String(err),
      });
      return call(BACKUP_ENDPOINT, withoutThinking(payload));
    }
  };

  let { status, json } = await withBackup(ENDPOINT, body);
  if (overloaded(status) && BACKUP_ENDPOINT !== ENDPOINT) {
    logGemini('primary overloaded, trying backup', { status, endpoint: BACKUP_ENDPOINT });
    if (externalSignal?.aborted) throw new GeminiError('network', 'aborted');
    ({ status, json } = await call(BACKUP_ENDPOINT, withoutThinking(body)));
  }
  if (status === 400 || status === 401) {
    const google = googleErrorDetail(json);
    throw new GeminiError(
      classifyHttp(status),
      google?.message ?? `HTTP ${status}`,
      status
    );
  }
  if (!status || status >= 400) {
    const google = googleErrorDetail(json);
    throw new GeminiError(
      classifyHttp(status),
      google?.message ?? `HTTP ${status}`,
      status
    );
  }
  return await parseResponse(json);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (!isPositiveInt(d.amount)) return null;
  if (!isIsoDate(d.date)) return null;
  if (d.direction !== 'chi' && d.direction !== 'thu') return null;
  if (typeof d.category !== 'string' || !isCategory(d.category)) return null;
  const note = typeof d.note === 'string' ? d.note : '';
  const confidence = typeof d.confidence === 'number' ? d.confidence : 1;
  return {
    amount: d.amount,
    direction: d.direction as Direction,
    category: d.category as Category,
    note,
    date: d.date,
    confidence,
    wantsRevision: d.revise === true,
  };
}

function guardReply(reply: string): string {
  const clean = reply.trim();
  if (!clean) return '';
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(' ');
}

function readQuery(raw: unknown): ModelQuery | null {
  if (!raw || typeof raw !== 'object') return null;
  const query = raw as { start?: unknown; end?: unknown; category?: unknown };
  if (typeof query.start !== 'string' || typeof query.end !== 'string') return null;
  return {
    start: query.start,
    end: query.end,
    category: typeof query.category === 'string' ? query.category.trim() : '',
  };
}

async function parseResponse(json: unknown): Promise<ModelResult> {
  if (!json || typeof json !== 'object') {
    logGemini('empty or non-object response', json);
    throw new GeminiError('bad-response', 'empty or non-object response');
  }
  const root = json as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  const candidate = root.candidates?.[0];
  if (!candidate) {
    logGemini('no candidates in response', json);
    throw new GeminiError('bad-response', 'no candidates');
  }
  if (candidate.finishReason === 'SAFETY') {
    logGemini('blocked finishReason', candidate.finishReason);
    throw new GeminiError('bad-response', `finishReason ${candidate.finishReason}`);
  }
  const text =
    candidate.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('') || undefined;
  if (!text) {
    logGemini('missing candidate text', candidate);
    throw new GeminiError('bad-response', 'missing candidate text');
  }
  let parsed: {
    reply?: unknown;
    drafts?: unknown;
    intent?: unknown;
    query?: unknown;
  };
  try {
    parsed = JSON.parse(text) as {
      reply?: unknown;
      drafts?: unknown;
      intent?: unknown;
      query?: unknown;
    };
  } catch (err) {
    logGemini('model JSON parse failed', {
      detail: err instanceof Error ? err.message : String(err),
      text: text.slice(0, 400),
    });
    throw new GeminiError('bad-response', 'model JSON parse failed');
  }
  const drafts = Array.isArray(parsed.drafts)
    ? parsed.drafts.map(sanitizeDraft).filter((d): d is Draft => d !== null)
    : [];
  const intent = resolveIntent(parsed.intent, drafts);
  if (intent === 'off_topic') {
    const advice = typeof parsed.reply === 'string' && parsed.reply === ADVICE_REFUSAL;
    return { reply: advice ? ADVICE_REFUSAL : REFUSAL, drafts: [], intent, query: null };
  }
  if (intent === 'query') {
    return { reply: '', drafts: [], intent, query: readQuery(parsed.query) };
  }
  const reply = guardReply(typeof parsed.reply === 'string' ? parsed.reply : '');
  return { reply, drafts, intent, query: null };
}

function resolveIntent(value: unknown, drafts: Draft[]): Intent {
  if (value === 'record' || value === 'query' || value === 'off_topic') return value;
  return drafts.length > 0 ? 'record' : 'off_topic';
}

function withContext(parts: GeminiPart[], context: string): GeminiPart[] {
  const index = parts.findIndex((part) => 'text' in part);
  if (index < 0) return [{ text: context }, ...parts];
  return parts.map((part, at) => (at === index && 'text' in part ? { text: `${context}\n\n${part.text}` } : part));
}

function generationBody(userParts: GeminiPart[], history: ChatTurn[], categoryNames: string[], context: string) {
  const parts = context ? withContext(userParts, context) : userParts;
  return {
    systemInstruction: { parts: [{ text: systemPrompt(localDateIso(), categoryNames) }] },
    contents: [
      ...historyContents(history),
      { role: 'user', parts },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schemaFor(categoryNames),
      temperature: 0.2,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };
}

/** Gắn bản sửa vào draft nếu câu nói đang chỉnh một khoản đã lưu. */
function applyPlan(result: ModelResult, speech: string, names: string[], txs: TxRow[]): ParseResult {
  const planned = planRevisions(speech, refineDrafts(result.drafts, speech, names), txs, localDateIso());
  return { reply: planned.reply ?? result.reply, drafts: planned.drafts, intent: result.intent };
}

async function finish(result: ModelResult, speech: string, names: string[]): Promise<ParseResult> {
  if (result.intent === 'query') {
    const today = localDateIso();
    const spec = normalizeQuery(result.query, today, names);
    const rows = await txsBetween(spec.start, spec.end);
    return { reply: speakLedger({ ...spec, today, rows }), drafts: [], intent: 'query' };
  }
  const txs = await revisionCandidates();
  const heard = speech.trim() || result.drafts.map((draft) => draft.note).filter(Boolean).join(' ');
  return applyPlan(result, heard, names, txs);
}

export async function parseMessage(
  text: string,
  history: ChatTurn[],
  signal?: AbortSignal
): Promise<ParseResult> {
  const rows = await categories();
  const names = rows.map((row) => row.name);
  const result = await request(generationBody([{ text }], history, names, ''), signal);
  return finish(result, text, names);
}

export async function parseAudio(
  base64: string,
  history: ChatTurn[],
  signal?: AbortSignal,
  mimeType = 'audio/mp4'
): Promise<ParseResult> {
  const rows = await categories();
  const names = rows.map((row) => row.name);
  const result = await request(
    generationBody(
      [
        { inlineData: { mimeType, data: base64 } },
        { text: 'Ghi lại các khoản tiền trong đoạn ghi âm này. Nếu người nói đang hỏi số đã ghi, đặt intent là query và điền query. Nếu người nói đang sửa một khoản đã lưu, đặt revise là true.' },
      ],
      history,
      names,
      ''
    ),
    signal
  );
  return finish(result, '', names);
}
