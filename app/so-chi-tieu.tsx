import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthProvider';
import { AssistantMessage, ClearedChat, DayMarker, DeleteTurnDialog, UserBubble } from '@/components/Bubble';
import { BundleCard, type BundleEntry } from '@/components/BundleCard';
import { useCategories } from '@/components/CategoryProvider';
import { Composer } from '@/components/Composer';
import { DraftCard } from '@/components/DraftCard';
import { DynamicIsland, type IslandAlert } from '@/components/DynamicIsland';
import { ErrorRow } from '@/components/ErrorRow';
import { QuickChips } from '@/components/QuickChips';
import { SideBar, type ChatDayRow } from '@/components/SideBar';
import { Thinking } from '@/components/Thinking';
import { UpdateCard } from '@/components/UpdateCard';
import {
    commitRevision,
    confirmDraftMessages,
    deleteRecorded,
    discardThread,
    formatDayMarker,
    formatDdMm,
    formatTargetDate,
    insertMsg,
    isoFromCreatedAt,
    chips as loadChips,
    loadIslandData,
    localDateIso,
    parseDraftPayload,
    parseReceiptPayload,
    parseVoicePayload,
    receiptsForTx,
    recentMessages,
    resetAllData,
    restoreRecorded,
    revertDraftMessages,
    revertRevision,
    saveReceiptEdit,
    totalsOf,
    updateMsg,
    type ChipRow,
    type DayTotals,
    type Draft,
    type DraftPayload,
    type ReceiptPayload,
    type StoredMessage,
    type TxRow,
    type VoicePayload,
} from '@/lib/db';
import { GeminiError, parseAudio, parseMessage, type ChatTurn, type GeminiErrorKind, type Intent } from '@/lib/gemini';
import { formatVndCompact } from '@/lib/money';
import {
    clearVoiceRecordings,
    deleteRecordings,
    fileUriToBase64,
    persistRecording,
    voicePlaceholder,
} from '@/lib/voice';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

type ThreadItem =
  | { id: string; kind: 'user'; text: string; createdAt: number; voice?: VoicePayload }
  | { id: string; kind: 'assistant'; text: string; createdAt: number; intent?: Intent }
  | { id: string; kind: 'thinking' }
  | {
      id: string;
      kind: 'error';
      cause: GeminiErrorKind;
      retryText?: string;
      audio?: { base64: string; durationSec: number; mimeType?: string };
    }
  | { id: string; kind: 'draft'; draft: DraftPayload; createdAt: number }
  | { id: string; kind: 'receipt'; payload: ReceiptPayload; createdAt: number }
  | { id: string; kind: 'deleted'; payload: ReceiptPayload; createdAt: number }
  | { id: string; kind: 'cleared'; createdAt: number };

const THINKING_ID = 'thinking';
const PURGE_AFTER_MS = 8_000;

type CardItem = Extract<ThreadItem, { kind: 'draft' | 'receipt' | 'deleted' }>;

function toBundleEntry(item: CardItem): BundleEntry {
  if (item.kind === 'draft') {
    return { id: item.id, draft: item.draft, status: 'pending' };
  }
  if (item.kind === 'receipt') {
    return { id: item.id, draft: item.payload, status: 'saved' };
  }
  return { id: item.id, draft: item.payload, status: 'deleted' };
}

function isCardKind(kind: ThreadItem['kind']) {
  return kind === 'draft' || kind === 'receipt' || kind === 'deleted';
}

function cardRevision(card: CardItem) {
  return card.kind === 'draft' ? card.draft.revision : card.payload.revision;
}

function cardIsUpdateReply(card: CardItem) {
  const revision = cardRevision(card);
  if (!revision) return false;
  return Boolean(revision.sourceMessageId) || card.kind === 'draft';
}

function findTurn(items: ThreadItem[], cardId: string) {
  const idx = items.findIndex((item) => item.id === cardId);
  if (idx < 0) {
    return { userId: undefined as string | undefined, assistantId: undefined as string | undefined, cardIds: [] as string[] };
  }
  let start = idx;
  while (start > 0 && isCardKind(items[start - 1].kind)) start -= 1;
  let end = idx;
  while (end + 1 < items.length && isCardKind(items[end + 1].kind)) end += 1;
  const cardIds = items.slice(start, end + 1).map((item) => item.id);
  let cursor = start - 1;
  let assistantId: string | undefined;
  let userId: string | undefined;
  if (cursor >= 0 && items[cursor].kind === 'assistant') {
    assistantId = items[cursor].id;
    cursor -= 1;
  }
  if (cursor >= 0 && items[cursor].kind === 'user') {
    userId = items[cursor].id;
  }
  return { userId, assistantId, cardIds };
}

function collectTurn(items: ThreadItem[], messageId: string): ThreadItem[] {
  const idx = items.findIndex((item) => item.id === messageId);
  if (idx < 0) return [];
  let start = idx;
  const current = items[idx];
  if (
    (current.kind === 'assistant' || current.kind === 'error') &&
    idx > 0 &&
    items[idx - 1].kind === 'user'
  ) {
    start = idx - 1;
  }
  const collected: ThreadItem[] = [];
  for (let i = start; i < items.length; i += 1) {
    const row = items[i];
    if (i > start && (row.kind === 'user' || row.kind === 'cleared')) break;
    collected.push(row);
  }
  return collected;
}

function storedToItem(row: StoredMessage): ThreadItem | null {
  if (row.role === 'user') {
    const voice = parseVoicePayload(row.payload) ?? undefined;
    return { id: row.id, kind: 'user', text: row.text ?? '', createdAt: row.created_at, voice };
  }
  if (row.role === 'assistant') {
    const meta = parseMeta(row.payload);
    return {
      id: row.id,
      kind: 'assistant',
      text: row.text ?? '',
      createdAt: row.created_at,
      intent: meta.intent,
    };
  }
  if (row.role === 'draft') {
    const draft = parseDraftPayload(row.payload);
    if (!draft) return null;
    return { id: row.id, kind: 'draft', draft, createdAt: row.created_at };
  }
  if (row.role === 'receipt' || row.role === 'deleted') {
    const payload = parseReceiptPayload(row.payload);
    if (!payload) return null;
    return { id: row.id, kind: row.role, payload, createdAt: row.created_at };
  }
  if (row.role === 'cleared') {
    return { id: row.id, kind: 'cleared', createdAt: row.created_at };
  }
  return null;
}

function toHistory(items: ThreadItem[]): ChatTurn[] {
  return items
    .filter((item): item is Extract<ThreadItem, { kind: 'user' | 'assistant' }> => {
      return item.kind === 'user' || item.kind === 'assistant';
    })
    .map((item) => ({ role: item.kind, text: item.text, intent: item.kind === 'assistant' ? item.intent : undefined }));
}

function parseMeta(raw: string | null): { intent?: Intent } {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { intent?: string };
    if (parsed.intent === 'record' || parsed.intent === 'query' || parsed.intent === 'off_topic') {
      return { intent: parsed.intent };
    }
    return {};
  } catch {
    return {};
  }
}

function itemDate(item: ThreadItem, today: string) {
  if (item.kind === 'thinking' || item.kind === 'error') return today;
  return isoFromCreatedAt(item.createdAt);
}

function buildChatDays(items: ThreadItem[], today: string): ChatDayRow[] {
  const map = new Map<string, ChatDayRow>();
  const order: string[] = [];
  const seenTx = new Set<string>();
  for (const item of items) {
    if (item.kind === 'thinking' || item.kind === 'error') continue;
    const date = itemDate(item, today);
    let day = map.get(date);
    if (!day) {
      day = { date, label: formatDayMarker(date, today), spend: 0, income: 0, count: 0 };
      map.set(date, day);
      order.push(date);
    }
    day.count += 1;
    if (item.kind === 'receipt' && !seenTx.has(item.payload.txId)) {
      seenTx.add(item.payload.txId);
      if (item.payload.direction === 'chi') day.spend += item.payload.amount;
      else day.income += item.payload.amount;
    }
  }
  return order.reverse().map((date) => map.get(date)!);
}

export default function SoChiTieuScreen() {
  return (
    <SafeAreaProvider>
      <SoChiTieuBody />
    </SafeAreaProvider>
  );
}

function SoChiTieuBody() {
  const router = useRouter();
  const { account, signOut } = useAuth();
  const { refresh: refreshCategories } = useCategories();
  const insets = useSafeAreaInsets();
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const scrollRef = useRef<ScrollView>(null);
  const dayOffsets = useRef<Record<string, number>>({});
  const cardOffsets = useRef<Record<string, number>>({});
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinBottom = useRef(true);
  const contentHeight = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const purgeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const purging = useRef(new Set<string>());
  const itemsRef = useRef<ThreadItem[]>([]);
  const undoRef = useRef<(() => Promise<void>) | null>(null);
  const ledgerRef = useRef<TxRow[]>([]);
  const islandDateRef = useRef(localDateIso());

  const [items, setItems] = useState<ThreadItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      if (linkTimer.current) clearTimeout(linkTimer.current);
    },
    []
  );
  const [chipRows, setChipRows] = useState<ChipRow[]>([]);
  const [totals, setTotals] = useState<DayTotals>({ spend: 0, income: 0, count: 0 });
  const [dayTxs, setDayTxs] = useState<TxRow[]>([]);
  const [islandDate, setIslandDate] = useState(localDateIso);
  const [monthSpend, setMonthSpend] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthOutflow, setMonthOutflow] = useState(0);
  const [inFlight, setInFlight] = useState(false);
  const [alert, setAlert] = useState<IslandAlert | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(localDateIso);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<
    { kind: 'turn'; id: string } | { kind: 'day'; date: string; label: string } | { kind: 'reset' } | null
  >(null);

  const scrollToEnd = useCallback(() => {
    if (!pinBottom.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const applyIslandDate = useCallback((date: string) => {
    islandDateRef.current = date;
    const txs = ledgerRef.current.filter((row) => row.date === date);
    setIslandDate(date);
    setDayTxs(txs);
    setTotals(totalsOf(txs));
    setSelectedDay(date);
  }, []);

  const visibleDayFromScroll = (y: number, viewportH: number) => {
    const entries = Object.entries(dayOffsets.current).sort((a, b) => a[1] - b[1]);
    if (entries.length === 0) return null;
    if (pinBottom.current) return entries[entries.length - 1][0];
    const probe = y + Math.min(72, viewportH * 0.22);
    let current = entries[0][0];
    for (const [date, top] of entries) {
      if (top <= probe) current = date;
      else break;
    }
    return current;
  };

  const onThreadScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    pinBottom.current =
      contentSize.height - layoutMeasurement.height - contentOffset.y < 80;
    const date = visibleDayFromScroll(contentOffset.y, layoutMeasurement.height);
    if (date && date !== islandDateRef.current) applyIslandDate(date);
  };

  const onThreadContentSizeChange = (_w: number, h: number) => {
    const grew = h > contentHeight.current + 8;
    contentHeight.current = h;
    if (grew) scrollToEnd();
  };

  const refreshIsland = useCallback(async () => {
    const data = await loadIslandData(islandDateRef.current);
    ledgerRef.current = data.rows;
    setMonthSpend(data.month.spend);
    setMonthIncome(data.month.income);
    setMonthOutflow(data.month.outflow);
    applyIslandDate(data.viewDate);
    await refreshCategories();
  }, [applyIslandDate, refreshCategories]);

  useEffect(() => {
    let cancelled = false;
    const activePurgeTimers = purgeTimers.current;
    (async () => {
      setItems([]);
      ledgerRef.current = [];
      const [rows, loadedChips] = await Promise.all([recentMessages(), loadChips()]);
      if (cancelled) return;
      setItems(rows.map(storedToItem).filter((row): row is ThreadItem => row !== null));
      setChipRows(loadedChips);
      await refreshIsland();
      scrollToEnd();
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      timers.current.forEach(clearTimeout);
      activePurgeTimers.forEach(clearTimeout);
      activePurgeTimers.clear();
    };
  }, [refreshIsland, scrollToEnd]);

  const pushTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, reduceMotion ? 0 : ms);
    timers.current.push(id);
  };

  const cancelPurge = (id: string) => {
    const timer = purgeTimers.current.get(id);
    if (timer) clearTimeout(timer);
    purgeTimers.current.delete(id);
  };

  const finalizeDelete = async (id: string) => {
    cancelPurge(id);
    if (purging.current.has(id)) return;
    const snapshot = itemsRef.current;
    const current = snapshot.find((item) => item.id === id);
    if (!current || current.kind !== 'deleted') return;
    purging.current.add(id);

    const turn = findTurn(snapshot, id);
    const hasLive = turn.cardIds.some((cardId) => {
      const item = snapshot.find((row) => row.id === cardId);
      return item?.kind === 'draft' || item?.kind === 'receipt';
    });

    const removeIds = new Set<string>([id]);
    if (!hasLive) {
      if (turn.userId) removeIds.add(turn.userId);
      if (turn.assistantId) removeIds.add(turn.assistantId);
      for (const cardId of turn.cardIds) {
        const item = snapshot.find((row) => row.id === cardId);
        if (item?.kind === 'deleted') removeIds.add(cardId);
      }
    }

    const unique = [...removeIds];
    for (const rid of unique) cancelPurge(rid);
    const row = await discardThread(unique, [], hasLive ? undefined : 'Đã xoá đoạn chat');
    const cleared: ThreadItem | null = row
      ? { id: row.id, kind: 'cleared', createdAt: row.created_at }
      : null;

    setItems((list) => {
      const firstIdx = list.findIndex((item) => unique.includes(item.id));
      const next = list.filter((item) => !unique.includes(item.id));
      if (cleared && firstIdx >= 0) {
        const removedBefore = list.slice(0, firstIdx).filter((item) => unique.includes(item.id)).length;
        next.splice(firstIdx - removedBefore, 0, cleared);
      } else if (cleared) {
        next.push(cleared);
      }
      return next;
    });
    purging.current.delete(id);
  };

  const schedulePurge = (id: string, wait = PURGE_AFTER_MS) => {
    cancelPurge(id);
    const timer = setTimeout(() => {
      purgeTimers.current.delete(id);
      void finalizeDelete(id);
    }, Math.max(0, wait));
    purgeTimers.current.set(id, timer);
  };

  const appendItems = (next: ThreadItem | ThreadItem[]) => {
    pinBottom.current = true;
    setItems((prev) => prev.concat(next));
    scrollToEnd();
  };

  useEffect(() => {
    const now = Date.now();
    for (const item of items) {
      if (item.kind !== 'deleted') continue;
      if (purgeTimers.current.has(item.id) || purging.current.has(item.id)) continue;
      const deletedAt = item.payload.deletedAt ?? item.createdAt;
      const left = PURGE_AFTER_MS - (now - deletedAt);
      if (left <= 0) void finalizeDelete(item.id);
      else schedulePurge(item.id, left);
    }
    // finalizeDelete/schedulePurge intentionally read the latest refs; adding their
    // render-time identities would restart every pending undo timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const historyBeforeLastUser = (list: ThreadItem[]) => {
    const turns = toHistory(list);
    return turns.slice(0, -1).slice(-6);
  };

  const runParse = async (
    list: ThreadItem[],
    source:
      | { type: 'text'; text: string }
      | { type: 'audio'; base64: string; durationSec: number; mimeType?: string },
    userId?: string
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setInFlight(true);
    appendItems({ id: THINKING_ID, kind: 'thinking' });
    try {
      const history = historyBeforeLastUser(list);
      const result =
        source.type === 'text'
          ? await parseMessage(source.text, history, controller.signal)
          : await parseAudio(source.base64, history, controller.signal, source.mimeType);
      setItems((prev) => prev.filter((item) => item.kind !== 'thinking'));
      const reply = await insertMsg({
        role: 'assistant',
        text: result.reply,
        payload: JSON.stringify({ intent: result.intent }),
      });
      appendItems({
        id: reply.id,
        kind: 'assistant',
        text: result.reply,
        createdAt: reply.created_at,
        intent: result.intent,
      });
      if (source.type === 'audio' && userId) {
        const notes = result.drafts.map((d) => d.note).filter(Boolean).join(', ');
        if (notes) {
          await updateMsg(userId, { text: notes });
          setItems((prev) =>
            prev.map((item) => (item.id === userId && item.kind === 'user' ? { ...item, text: notes } : item))
          );
        }
      }
      if (result.drafts.length > 0) {
        const groupId = result.drafts.length > 1 ? Crypto.randomUUID() : undefined;
        pushTimer(async () => {
          try {
            const created: ThreadItem[] = [];
            for (const draft of result.drafts) {
              const sourceId = draft.revision
                ? (await receiptsForTx(draft.revision.txId))[0]?.id
                : undefined;
              const payload: DraftPayload = {
                ...draft,
                groupId,
                revision: draft.revision
                  ? { ...draft.revision, sourceMessageId: sourceId }
                  : undefined,
              };
              const row = await insertMsg({ role: 'draft', payload: JSON.stringify(payload) });
              created.push({ id: row.id, kind: 'draft', draft: payload, createdAt: row.created_at });
            }
            appendItems(created);
          } finally {
            setInFlight(false);
          }
        }, 220);
      } else {
        setInFlight(false);
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('[so-chi-tieu] parse failed', err);
      }
      setItems((prev) => prev.filter((item) => item.kind !== 'thinking'));
      const kind: GeminiErrorKind = err instanceof GeminiError ? err.kind : 'network';
      appendItems({
        id: Crypto.randomUUID(),
        kind: 'error',
        cause: kind,
        retryText: source.type === 'text' ? source.text : undefined,
        audio:
          source.type === 'audio'
            ? { base64: source.base64, durationSec: source.durationSec, mimeType: source.mimeType }
            : undefined,
      });
      setInFlight(false);
    }
  };

  const onSend = async (text: string) => {
    setActiveUserId(null);
    const row = await insertMsg({ role: 'user', text });
    const userItem: ThreadItem = { id: row.id, kind: 'user', text, createdAt: row.created_at };
    const next = [...items, userItem];
    appendItems(userItem);
    await runParse(next, { type: 'text', text });
  };

  const onAudio = async (clip: {
    uri: string;
    base64: string;
    durationSec: number;
    mimeType: string;
  }) => {
    const id = Crypto.randomUUID();
    const savedUri = await persistRecording(clip.uri, id);
    const voice: VoicePayload = {
      kind: 'voice',
      uri: savedUri,
      durationSec: clip.durationSec,
      mimeType: clip.mimeType,
    };
    const text = voicePlaceholder(clip.durationSec);
    const row = await insertMsg({
      id,
      role: 'user',
      text,
      payload: JSON.stringify(voice),
    });
    const userItem: ThreadItem = { id: row.id, kind: 'user', text, createdAt: row.created_at, voice };
    const next = [...items, userItem];
    appendItems(userItem);
    await runParse(
      next,
      { type: 'audio', base64: clip.base64, durationSec: clip.durationSec, mimeType: clip.mimeType },
      row.id
    );
  };

  const onRetry = async (item: Extract<ThreadItem, { kind: 'error' }>) => {
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    const list = items.filter((row) => row.id !== item.id);
    if (item.audio) {
      await runParse(list, { type: 'audio', ...item.audio });
      return;
    }
    if (item.retryText) {
      await runParse(list, { type: 'text', text: item.retryText });
    }
  };

  const stripFollowUp = async (userId: string, patchText?: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    const snapshot = itemsRef.current;
    const idx = snapshot.findIndex((item) => item.id === userId);
    const follow: ThreadItem[] = [];
    if (idx >= 0) {
      for (let i = idx + 1; i < snapshot.length; i += 1) {
        const item = snapshot[i];
        if (item.kind === 'user' || item.kind === 'cleared') break;
        follow.push(item);
      }
    }
    const ids = follow.map((item) => item.id);
    const persistIds = follow.flatMap((item) =>
      item.kind === 'thinking' || item.kind === 'error' ? [] : [item.id]
    );
    const txIds = follow.flatMap((item) =>
      item.kind === 'receipt' || item.kind === 'deleted' ? [item.payload.txId] : []
    );
    for (const item of follow) {
      if (item.kind === 'deleted') cancelPurge(item.id);
    }
    if (persistIds.length || txIds.length) await discardThread(persistIds, txIds);
    const next = snapshot
      .filter((item) => item.kind !== 'thinking' && !ids.includes(item.id))
      .map((item) =>
        patchText !== undefined && item.id === userId && item.kind === 'user'
          ? { ...item, text: patchText }
          : item
      );
    setItems(next);
    if (follow.some((item) => item.kind === 'receipt' || item.kind === 'deleted')) {
      await refreshIsland();
    }
    return next;
  };

  const onRetryUser = async (userId: string) => {
    if (inFlight) return;
    setActiveUserId(null);
    const user = itemsRef.current.find((item) => item.id === userId && item.kind === 'user');
    if (!user || user.kind !== 'user') return;
    const cleaned = await stripFollowUp(userId);
    if (user.voice) {
      try {
        const base64 = await fileUriToBase64(user.voice.uri);
        await runParse(
          cleaned,
          {
            type: 'audio',
            base64,
            durationSec: user.voice.durationSec,
            mimeType: user.voice.mimeType,
          },
          userId
        );
      } catch (err) {
        if (__DEV__) console.error('[so-chi-tieu] retry voice failed', err);
      }
      return;
    }
    if (!user.text.trim()) return;
    await runParse(cleaned, { type: 'text', text: user.text });
  };

  const onEditUser = async (userId: string, text: string) => {
    const nextText = text.trim();
    if (!nextText || inFlight) return;
    setActiveUserId(null);
    await updateMsg(userId, { text: nextText });
    const cleaned = await stripFollowUp(userId, nextText);
    await runParse(cleaned, { type: 'text', text: nextText });
  };

  const requestDeleteTurn = (messageId: string) => {
    setActiveUserId(null);
    setDeletePrompt({ kind: 'turn', id: messageId });
  };

  const deleteTurn = async (messageId: string) => {
    setDeletePrompt(null);
    setActiveUserId(null);
    const snapshot = itemsRef.current;
    const turn = collectTurn(snapshot, messageId);
    if (turn.length === 0) return;

    if (turn.some((item) => item.kind === 'thinking')) {
      abortRef.current?.abort();
      abortRef.current = null;
      setInFlight(false);
    }

    const persistIds: string[] = [];
    const txIds: string[] = [];
    const voiceUris: string[] = [];
    for (const item of turn) {
      if (item.kind === 'thinking' || item.kind === 'error') continue;
      persistIds.push(item.id);
      if (item.kind === 'receipt' || item.kind === 'deleted') txIds.push(item.payload.txId);
      if (item.kind === 'deleted') cancelPurge(item.id);
      if (item.kind === 'user' && item.voice) voiceUris.push(item.voice.uri);
    }

    const row = await discardThread(persistIds, txIds, 'Đã xoá đoạn chat');
    if (voiceUris.length) await deleteRecordings(voiceUris);

    const removeIds = new Set(turn.map((item) => item.id));
    const cleared: ThreadItem | null = row
      ? { id: row.id, kind: 'cleared', createdAt: row.created_at }
      : null;

    setItems((list) => {
      const firstIdx = list.findIndex((item) => removeIds.has(item.id));
      const next = list.filter((item) => !removeIds.has(item.id));
      if (!cleared) return next;
      if (firstIdx >= 0) {
        const removedBefore = list.slice(0, firstIdx).filter((item) => removeIds.has(item.id)).length;
        next.splice(firstIdx - removedBefore, 0, cleared);
      } else {
        next.push(cleared);
      }
      return next;
    });

    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const deleteDay = async (date: string) => {
    setDeletePrompt(null);
    setActiveUserId(null);
    const snapshot = itemsRef.current;
    const todayIso = localDateIso();
    const dayItems = snapshot.filter((item) => itemDate(item, todayIso) === date);
    if (dayItems.length === 0) return;

    if (dayItems.some((item) => item.kind === 'thinking')) {
      abortRef.current?.abort();
      abortRef.current = null;
      setInFlight(false);
    }

    const persistIds: string[] = [];
    const txIds: string[] = [];
    const voiceUris: string[] = [];
    for (const item of dayItems) {
      if (item.kind === 'thinking' || item.kind === 'error') continue;
      persistIds.push(item.id);
      if (item.kind === 'receipt' || item.kind === 'deleted') txIds.push(item.payload.txId);
      if (item.kind === 'deleted') cancelPurge(item.id);
      if (item.kind === 'user' && item.voice) voiceUris.push(item.voice.uri);
    }

    await discardThread(persistIds, txIds);
    if (voiceUris.length) await deleteRecordings(voiceUris);

    const removeIds = new Set(dayItems.map((item) => item.id));
    setItems((list) => list.filter((item) => !removeIds.has(item.id)));

    if (islandDateRef.current === date) {
      islandDateRef.current = todayIso;
      pinBottom.current = true;
    }

    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const resetData = async () => {
    setDeletePrompt(null);
    setActiveUserId(null);
    abortRef.current?.abort();
    abortRef.current = null;
    setInFlight(false);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    purgeTimers.current.forEach(clearTimeout);
    purgeTimers.current.clear();
    purging.current.clear();
    undoRef.current = null;
    setAlert(null);
    await resetAllData();
    await clearVoiceRecordings();
    const todayIso = localDateIso();
    setItems([]);
    islandDateRef.current = todayIso;
    pinBottom.current = true;
    contentHeight.current = 0;
    dayOffsets.current = {};
    ledgerRef.current = [];
    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onChip = async (chip: ChipRow) => {
    if (inFlight) return;
    setActiveUserId(null);
    const user = await insertMsg({ role: 'user', text: chip.label });
    const replyText = `Mình ghi ${chip.label}. Kiểm tra giúp mình trước khi lưu nhé.`;
    const assistant = await insertMsg({ role: 'assistant', text: replyText });
    const draft: DraftPayload = {
      amount: chip.amount,
      direction: 'chi',
      category: chip.category,
      note: chip.label.replace(/\s+\d+\s*k$/i, '').trim() || chip.label,
      date: localDateIso(),
      confidence: 1,
    };
    const draftRow = await insertMsg({ role: 'draft', payload: JSON.stringify(draft) });
    appendItems([
      { id: user.id, kind: 'user', text: chip.label, createdAt: user.created_at },
      { id: assistant.id, kind: 'assistant', text: replyText, createdAt: assistant.created_at },
      { id: draftRow.id, kind: 'draft', draft, createdAt: draftRow.created_at },
    ]);
  };

  const fireAlert = (next: IslandAlert, undo: () => Promise<void>) => {
    undoRef.current = undo;
    setAlert(next);
  };

  const onUndo = useCallback(() => {
    void undoRef.current?.();
  }, []);

  const onAlertFinished = useCallback(() => {
    setAlert(null);
    undoRef.current = null;
  }, []);

  const confirmDraft = async (id: string, draft: DraftPayload) => {
    if (draft.revision) {
      await confirmRevision(id, draft);
      return;
    }
    const [{ txId, payload }] = await confirmDraftMessages([{ messageId: id, draft }]);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { id, kind: 'receipt', payload, createdAt: item.kind === 'draft' ? item.createdAt : Date.now() } : item
      )
    );
    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const today = localDateIso();
    fireAlert(
      {
        title: draft.date === today ? 'Đã lưu vào hôm nay' : `Đã lưu vào ${formatDdMm(draft.date)}`,
        subtitle: draft.category,
      },
      async () => {
        await revertDraftMessages([{ messageId: id, txId, draft }]);
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { id, kind: 'draft', draft, createdAt: item.kind === 'receipt' ? item.createdAt : Date.now() } : item
          )
        );
        await refreshIsland();
      }
    );
  };

  const confirmGroup = async (group: Extract<ThreadItem, { kind: 'draft' }>[]) => {
    const drafts = group.map((item) => item.draft);
    const confirmed = await confirmDraftMessages(
      group.map((item) => ({ messageId: item.id, draft: item.draft }))
    );
    const receipts: { id: string; payload: ReceiptPayload; createdAt: number }[] = [];
    for (let i = 0; i < group.length; i += 1) {
      const item = group[i];
      const payload = confirmed[i].payload;
      receipts.push({ id: item.id, payload, createdAt: item.createdAt });
    }
    const idSet = new Set(group.map((item) => item.id));
    setItems((prev) =>
      prev.map((item) => {
        const found = receipts.find((row) => row.id === item.id);
        return found ? { id: found.id, kind: 'receipt', payload: found.payload, createdAt: found.createdAt } : item;
      })
    );
    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    fireAlert({ title: `Đã lưu ${group.length} khoản`, subtitle: drafts[0]?.category ?? '' }, async () => {
      await revertDraftMessages(
        confirmed.map((row, index) => ({
          messageId: row.messageId,
          txId: row.txId,
          draft: group[index].draft,
        }))
      );
      setItems((prev) =>
        prev.map((item) => {
          if (!idSet.has(item.id)) return item;
          const original = group.find((row) => row.id === item.id);
          if (!original) return item;
          return { id: original.id, kind: 'draft', draft: original.draft, createdAt: original.createdAt };
        })
      );
      await refreshIsland();
    });
  };

  const confirmRevision = async (id: string, draft: DraftPayload) => {
    const revision = draft.revision;
    if (!revision) return;
    const { saved, siblings } = await commitRevision(id, draft);
    const siblingAfter = new Map(siblings.map((row) => [row.id, row.after]));
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { id, kind: 'receipt' as const, payload: saved, createdAt: item.kind === 'draft' ? item.createdAt : Date.now() };
        }
        const after = siblingAfter.get(item.id);
        if (!after || item.kind !== 'receipt') return item;
        return { ...item, payload: after };
      })
    );
    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    fireAlert(
      {
        title: `Đã sửa ${formatTargetDate(draft.date)}`,
        subtitle: `${formatVndCompact(revision.previousAmount)} → ${formatVndCompact(draft.amount)}`,
      },
      async () => {
        await revertRevision(
          id,
          draft,
          siblings.map((row) => ({ id: row.id, payload: row.before }))
        );
        setItems((prev) =>
          prev.map((item) => {
            if (item.id === id) {
              return { id, kind: 'draft' as const, draft, createdAt: item.kind === 'receipt' ? item.createdAt : Date.now() };
            }
            const sibling = siblings.find((row) => row.id === item.id);
            if (!sibling || item.kind !== 'receipt') return item;
            const restored = parseReceiptPayload(sibling.before);
            return restored ? { ...item, payload: restored } : item;
          })
        );
        await refreshIsland();
      }
    );
  };

  const saveEdit = async (id: string, next: Draft) => {
    const current = items.find((item) => item.id === id);
    if (current?.kind === 'receipt') {
      const payload: ReceiptPayload = {
        ...current.payload,
        ...next,
        revision: next.revision ?? current.payload.revision,
      };
      const updated = await saveReceiptEdit(id, payload);
      const byId = new Map(updated.map((row) => [row.id, row.payload]));
      setItems((prev) =>
        prev.map((item) => {
          const saved = byId.get(item.id);
          return saved && item.kind === 'receipt' ? { ...item, payload: saved } : item;
        })
      );
      await refreshIsland();
      return;
    }
    const groupId = current?.kind === 'draft' ? current.draft.groupId : undefined;
    const revision = next.revision ?? (current?.kind === 'draft' ? current.draft.revision : undefined);
    const payload: DraftPayload = { ...next, groupId, revision };
    await updateMsg(id, { payload: JSON.stringify(payload) });
    setItems((prev) =>
      prev.map((item) => (item.id === id && item.kind === 'draft' ? { ...item, draft: payload } : item))
    );
  };

  const deleteSaved = async (id: string, payload: ReceiptPayload, createdAt: number) => {
    const deletedAt = Date.now();
    const updated = await deleteRecorded([payload.txId], deletedAt, [id]);
    const byId = new Map(updated.map((row) => [row.id, row.payload]));
    setItems((prev) =>
      prev.map((item) => {
        const next = byId.get(item.id);
        if (!next) return item;
        return {
          id: item.id,
          kind: 'deleted' as const,
          payload: next,
          createdAt: item.kind === 'receipt' || item.kind === 'deleted' ? item.createdAt : createdAt,
        };
      })
    );
    schedulePurge(id);
    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const undoDelete = async (id: string, payload: ReceiptPayload, createdAt: number) => {
    const related = items.filter(
      (item): item is Extract<ThreadItem, { kind: 'deleted' }> =>
        item.kind === 'deleted' && item.payload.txId === payload.txId
    );
    if (!related.some((item) => item.id === id)) {
      related.push({ id, kind: 'deleted', payload, createdAt });
    }
    for (const item of related) cancelPurge(item.id);
    const restored = await restoreRecorded(related.map((item) => ({ id: item.id, payload: item.payload })));
    const byId = new Map(restored.map((row) => [row.id, row.payload]));
    setItems((prev) =>
      prev.map((item) => {
        const next = byId.get(item.id);
        if (!next) return item;
        const stamp = item.kind === 'deleted' ? item.createdAt : createdAt;
        return { id: item.id, kind: 'receipt' as const, payload: next, createdAt: stamp };
      })
    );
    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const confirmBundle = async (run: CardItem[]) => {
    const drafts = run.filter((item): item is Extract<CardItem, { kind: 'draft' }> => item.kind === 'draft');
    if (drafts.length === 0) return;
    await confirmGroup(drafts);
  };

  const deleteSavedBundle = async (run: CardItem[]) => {
    const receipts = run.filter((item): item is Extract<CardItem, { kind: 'receipt' }> => item.kind === 'receipt');
    if (receipts.length === 0) return;
    const deletedAt = Date.now();
    const updated = await deleteRecorded(
      receipts.map((item) => item.payload.txId),
      deletedAt,
      receipts.map((item) => item.id)
    );
    const byId = new Map(updated.map((row) => [row.id, row.payload]));
    setItems((prev) =>
      prev.map((item) => {
        const next = byId.get(item.id);
        if (!next || item.kind !== 'receipt') return item;
        return { id: item.id, kind: 'deleted' as const, payload: next, createdAt: item.createdAt };
      })
    );
    schedulePurge(receipts[0].id);
    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const undoDeleteBundle = async (run: CardItem[]) => {
    const deleted = run.filter((item): item is Extract<CardItem, { kind: 'deleted' }> => item.kind === 'deleted');
    if (deleted.length === 0) return;
    for (const item of deleted) cancelPurge(item.id);
    const restored = await restoreRecorded(deleted.map((item) => ({ id: item.id, payload: item.payload })));
    const byId = new Map(restored.map((row) => [row.id, row.payload]));
    setItems((prev) =>
      prev.map((item) => {
        const next = byId.get(item.id);
        if (!next || item.kind !== 'deleted') return item;
        return { id: item.id, kind: 'receipt' as const, payload: next, createdAt: item.createdAt };
      })
    );
    await refreshIsland();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const today = localDateIso();
  const empty = items.length === 0;
  const chatDays = useMemo(() => buildChatDays(items, today), [items, today]);

  const openSidebar = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSidebarOpen(true);
  };

  const closeSidebar = () => setSidebarOpen(false);

  const jumpToCard = (id: string) => {
    const y = cardOffsets.current[id];
    if (y == null) return;
    pinBottom.current = false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: !reduceMotion });
    setLinkedId(id);
    if (linkTimer.current) clearTimeout(linkTimer.current);
    linkTimer.current = setTimeout(() => {
      setLinkedId((current) => (current === id ? null : current));
    }, 1000);
  };

  const onSelectDay = (date: string) => {
    pinBottom.current = date === today;
    applyIslandDate(date);
    setSidebarOpen(false);
    const jump = () => {
      const y = dayOffsets.current[date];
      if (y == null) return;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: !reduceMotion });
    };
    if (reduceMotion) {
      requestAnimationFrame(jump);
      return;
    }
    setTimeout(jump, 360);
  };

  const renderThread = () => {
    const nodes: ReactNode[] = [];
    let lastDate = '';
    let i = 0;

    const maybeDay = (item: ThreadItem) => {
      const date = itemDate(item, today);
      if (date !== lastDate) {
        const lead = lastDate === '';
        lastDate = date;
        nodes.push(
          <View
            key={`day-${date}`}
            onLayout={(e) => {
              dayOffsets.current[date] = e.nativeEvent.layout.y;
            }}
          >
            <DayMarker label={formatDayMarker(date, today)} lead={lead} />
          </View>
        );
      }
    };

    while (i < items.length) {
      const item = items[i];
      if (isCardKind(item.kind)) {
        const run: CardItem[] = [];
        while (i < items.length && isCardKind(items[i].kind)) {
          const card = items[i] as CardItem;
          if (run.length > 0 && (cardIsUpdateReply(run[0]) || cardIsUpdateReply(card))) break;
          run.push(card);
          i += 1;
        }
        maybeDay(run[0]);
        if (run.length === 1) {
          const card = run[0];
          const revision = card.kind === 'draft' ? card.draft.revision : card.payload.revision;
          const sourceId = revision?.sourceMessageId;
          nodes.push(
            <View
              key={card.id}
              onLayout={(e) => {
                cardOffsets.current[card.id] = e.nativeEvent.layout.y;
              }}
            >
              {cardIsUpdateReply(card) ? (
                <UpdateCard
                  draft={card.kind === 'draft' ? card.draft : card.payload}
                  saved={card.kind === 'receipt'}
                  deleted={card.kind === 'deleted'}
                  highlighted={linkedId === card.id}
                  onOpenSource={sourceId ? () => jumpToCard(sourceId) : undefined}
                  onConfirm={card.kind === 'draft' ? () => void confirmDraft(card.id, card.draft) : undefined}
                  onSaveEdit={(next) => void saveEdit(card.id, next)}
                  onDelete={
                    card.kind === 'receipt'
                      ? () => void deleteSaved(card.id, card.payload, card.createdAt)
                      : undefined
                  }
                  onUndo={
                    card.kind === 'deleted'
                      ? () => void undoDelete(card.id, card.payload, card.createdAt)
                      : undefined
                  }
                  undoUntil={
                    card.kind === 'deleted'
                      ? (card.payload.deletedAt ?? card.createdAt) + PURGE_AFTER_MS
                      : undefined
                  }
                />
              ) : card.kind === 'draft' ? (
                <DraftCard
                  draft={card.draft}
                  at={card.createdAt}
                  highlighted={linkedId === card.id}
                  onConfirm={() => void confirmDraft(card.id, card.draft)}
                  onSaveEdit={(next) => void saveEdit(card.id, next)}
                />
              ) : card.kind === 'receipt' ? (
                <DraftCard
                  draft={card.payload}
                  at={card.createdAt}
                  saved
                  highlighted={linkedId === card.id}
                  onSaveEdit={(next) => void saveEdit(card.id, next)}
                  onDelete={() => void deleteSaved(card.id, card.payload, card.createdAt)}
                />
              ) : (
                <DraftCard
                  draft={card.payload}
                  at={card.createdAt}
                  deleted
                  highlighted={linkedId === card.id}
                  undoUntil={(card.payload.deletedAt ?? card.createdAt) + PURGE_AFTER_MS}
                  onUndo={() => void undoDelete(card.id, card.payload, card.createdAt)}
                />
              )}
            </View>
          );
        } else {
          const deletedAt = run
            .map((card) => (card.kind === 'deleted' ? card.payload.deletedAt ?? card.createdAt : undefined))
            .find((value) => typeof value === 'number');
          nodes.push(
            <BundleCard
              key={`b-${run[0].id}`}
              entries={run.map(toBundleEntry)}
              at={run[0].createdAt}
              onConfirm={() => void confirmBundle(run)}
              onSaveEntry={(id, next) => saveEdit(id, next)}
              onDelete={() => void deleteSavedBundle(run)}
              onUndo={() => void undoDeleteBundle(run)}
              undoUntil={deletedAt !== undefined ? deletedAt + PURGE_AFTER_MS : undefined}
            />
          );
        }
        continue;
      }

      maybeDay(item);
      if (item.kind === 'user') {
        nodes.push(
          <UserBubble
            key={item.id}
            text={item.text}
            at={item.createdAt}
            voice={item.voice}
            active={activeUserId === item.id}
            busy={inFlight}
            onToggle={() => setActiveUserId((id) => (id === item.id ? null : item.id))}
            onRetry={() => void onRetryUser(item.id)}
            onEdit={(next) => void onEditUser(item.id, next)}
            onDeleteRequest={() => requestDeleteTurn(item.id)}
          />
        );
      } else if (item.kind === 'assistant') {
        nodes.push(
          <AssistantMessage
            key={item.id}
            text={item.text}
            at={item.createdAt}
            onDeleteRequest={() => requestDeleteTurn(item.id)}
          />
        );
      } else if (item.kind === 'thinking') {
        nodes.push(<Thinking key={item.id} />);
      } else if (item.kind === 'error') {
        nodes.push(<ErrorRow key={item.id} kind={item.cause} onRetry={() => void onRetry(item)} />);
      } else if (item.kind === 'cleared') {
        nodes.push(<ClearedChat key={item.id} />);
      }
      i += 1;
    }
    return nodes;
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          pointerEvents="box-none"
          style={[styles.header, { marginTop: insets.top }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sidebarOpen ? 'Đóng menu' : 'Mở menu'}
            accessibilityState={{ expanded: sidebarOpen }}
            hitSlop={8}
            onPress={() => (sidebarOpen ? closeSidebar() : openSidebar())}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
          >
            <Feather name="menu" size={21} color={tokens.ink2} />
          </Pressable>
          {/* <Pressable
            accessibilityRole="button"
            accessibilityLabel="Giao diện"
            hitSlop={8}
            onPress={cycleMode}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
          >
            <Feather name="sliders" size={21} color={tokens.ink2} />
          </Pressable> */}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.thread, empty && styles.threadEmpty]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={onThreadContentSizeChange}
          onScroll={onThreadScroll}
          onScrollBeginDrag={() => setActiveUserId(null)}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {empty ? (
            <View style={styles.empty}>
              <Feather name="message-circle" size={34} color={tokens.ink3} />
              <Text style={styles.emptyTitle}>Chưa có khoản nào</Text>
              <Text style={styles.emptyHint}>
                Gõ hoặc nói một câu, ví dụ {'"'}cà phê 30k{'"'}.
              </Text>
            </View>
          ) : (
            renderThread()
          )}
        </ScrollView>

        <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <QuickChips chips={chipRows} disabled={inFlight} onPick={(chip) => void onChip(chip)} />
          <Composer
            inFlight={inFlight}
            onSend={(text) => void onSend(text)}
            onAudio={(clip) => void onAudio(clip)}
          />
        </View>
      </KeyboardAvoidingView>

      <DynamicIsland
        topOffset={insets.top + 9}
        date={islandDate}
        totals={totals}
        txs={dayTxs}
        monthSpend={monthSpend}
        monthOutflow={monthOutflow}
        forecast={null}
        alert={alert}
        onUndo={onUndo}
        onAlertFinished={onAlertFinished}
      />

      <SideBar
        open={sidebarOpen}
        days={chatDays}
        selectedDate={selectedDay}
        monthSpend={monthSpend}
        monthIncome={monthIncome}
        account={account}
        onManageCategories={() => {
          closeSidebar();
          router.push('/danh-muc');
        }}
        onSignIn={() => {
          closeSidebar();
          router.push('/dang-nhap');
        }}
        onSignOut={() => void signOut()}
        onClose={closeSidebar}
        onSelectDay={onSelectDay}
        onDeleteDay={(day) => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setDeletePrompt({ kind: 'day', date: day.date, label: day.label });
        }}
        onResetData={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setDeletePrompt({ kind: 'reset' });
        }}
      />

      <DeleteTurnDialog
        visible={deletePrompt !== null}
        title={
          deletePrompt?.kind === 'reset'
            ? 'Reset toàn bộ dữ liệu?'
            : deletePrompt?.kind === 'day'
              ? `Xoá ${deletePrompt.label}?`
              : 'Xoá đoạn chat?'
        }
        body={
          deletePrompt?.kind === 'reset'
            ? 'Mọi tin nhắn và khoản thu chi sẽ bị xoá về 0. Không hoàn tác được.'
            : deletePrompt?.kind === 'day'
              ? 'Mọi tin nhắn, câu trả lời và khoản đã lưu trong ngày này sẽ bị xoá. Thu chi sẽ được tính lại.'
              : undefined
        }
        onCancel={() => setDeletePrompt(null)}
        onConfirm={() => {
          if (deletePrompt?.kind === 'turn') void deleteTurn(deletePrompt.id);
          if (deletePrompt?.kind === 'day') void deleteDay(deletePrompt.date);
          if (deletePrompt?.kind === 'reset') void resetData();
        }}
      />
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.paper,
    },
    flex: {
      flex: 1,
    },
    header: {
      height: 52,
      paddingHorizontal: 12,
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconPressed: {
      backgroundColor: t.surface2,
    },
    thread: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 10,
      overflow: 'visible',
    },
    threadEmpty: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    empty: {
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: {
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      color: t.ink2,
    },
    emptyHint: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13.5,
      color: t.ink3,
      maxWidth: 250,
      textAlign: 'center',
      lineHeight: 20,
    },
    dock: {},
  });
}
