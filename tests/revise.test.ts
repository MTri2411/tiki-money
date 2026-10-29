import { describe, expect, it } from 'vitest';

import { firstOfMonth, lastOfMonth, shiftIso } from '../lib/db/dates';
import {
  isRevisionSpeech,
  matchRevision,
  planRevisions,
  spokenSpan,
  type RevisionTarget,
} from '../lib/revise';

const today = '2026-09-23';
const yesterday = '2026-09-22';

function tx(patch: Partial<RevisionTarget> & Pick<RevisionTarget, 'id' | 'note'>): RevisionTarget {
  return {
    amount: 90000,
    direction: 'chi',
    category: 'Ăn uống',
    date: yesterday,
    ...patch,
  };
}

describe('nhận ra câu sửa khoản cũ', () => {
  it('coi à và ăn hết là sửa', () => {
    expect(isRevisionSpeech('À hôm qua tui ăn hết 120')).toBe(true);
    expect(isRevisionSpeech('sửa khoản cà phê hôm qua thành 40k')).toBe(true);
  });

  it('không sửa khi người dùng quên ghi', () => {
    expect(isRevisionSpeech('à quên ghi hôm qua ăn 120')).toBe(false);
  });

  it('không sửa một khoản mới nói bình thường', () => {
    expect(isRevisionSpeech('hôm qua tui ăn 120')).toBe(false);
  });

  it('cập nhật đúng bữa ăn hôm qua', () => {
    const found = matchRevision(
      'À hôm qua tui ăn hết 120',
      {
        amount: 120000,
        direction: 'chi',
        category: 'Ăn uống',
        note: 'ăn',
        date: yesterday,
        wantsRevision: true,
      },
      [tx({ id: 'food', note: 'ăn' }), tx({ id: 'fuel', note: 'đổ xăng', category: 'Xăng', amount: 70000 })],
      today
    );
    expect(found).toMatchObject({
      kind: 'match',
      revision: { txId: 'food', previousAmount: 90000 },
    });
  });

  it('hỏi lại khi có hai khoản ăn giống nhau', () => {
    const found = matchRevision(
      'À hôm qua tui ăn hết 120',
      {
        amount: 120000,
        direction: 'chi',
        category: 'Ăn uống',
        note: 'ăn',
        date: yesterday,
      },
      [tx({ id: 'sang', note: 'ăn sáng' }), tx({ id: 'trua', note: 'ăn trưa', amount: 55000 })],
      today
    );
    expect(found.kind).toBe('ambiguous');
  });

  it('chọn cà phê khi câu nói chỉ rõ khoản đó', () => {
    const found = matchRevision(
      'sửa khoản cà phê hôm qua thành 40k',
      {
        amount: 40000,
        direction: 'chi',
        category: 'Đồ uống',
        note: 'cà phê',
        date: yesterday,
      },
      [
        tx({ id: 'meal', note: 'cơm' }),
        tx({ id: 'cafe', note: 'cà phê', category: 'Đồ uống', amount: 30000 }),
      ],
      today
    );
    expect(found).toMatchObject({ kind: 'match', revision: { txId: 'cafe', previousAmount: 30000 } });
  });
});

describe('gắn bản sửa vào khoản nháp', () => {
  it('đưa ngày về hôm qua rồi gắn khoản đã lưu', () => {
    const planned = planRevisions(
      'À hôm qua tui ăn hết 120',
      [
        {
          amount: 120000,
          direction: 'chi' as const,
          category: 'Ăn uống',
          note: 'ăn',
          date: today,
          confidence: 0.8,
        },
      ],
      [tx({ id: 'food', note: 'ăn' })],
      today
    );
    expect(planned.drafts[0]).toMatchObject({
      date: yesterday,
      revision: { txId: 'food', previousAmount: 90000 },
    });
    expect(planned.reply).toContain('90k');
    expect(planned.reply).toContain('120k');
  });

  it('giữ khoản mới khi không có dấu hiệu sửa', () => {
    const planned = planRevisions(
      'hôm qua tui ăn 120',
      [
        {
          amount: 120000,
          direction: 'chi' as const,
          category: 'Ăn uống',
          note: 'ăn',
          date: yesterday,
        },
      ],
      [tx({ id: 'food', note: 'ăn' })],
      today
    );
    expect(planned.drafts[0].revision).toBeUndefined();
    expect(planned.reply).toBeNull();
  });
});

const day = '2026-10-27';

function meal(patch: Partial<RevisionTarget> & Pick<RevisionTarget, 'id'>): RevisionTarget {
  return {
    amount: 50000,
    direction: 'chi',
    category: 'Ăn uống',
    note: 'ăn',
    date: shiftIso(day, -1),
    ...patch,
  };
}

function draft(patch: { amount?: number; date?: string; note?: string; wantsRevision?: boolean } = {}) {
  return {
    amount: patch.amount ?? 100000,
    direction: 'chi' as const,
    category: 'Ăn uống',
    note: patch.note ?? 'ăn',
    date: patch.date ?? day,
    wantsRevision: patch.wantsRevision,
  };
}

describe('khoảng ngày trong câu nói', () => {
  it('đọc một mốc quá khứ hoặc tương lai', () => {
    expect(spokenSpan('hôm qua tui ăn', day)).toMatchObject({ start: '2026-10-26', end: '2026-10-26', label: 'Hôm qua' });
    expect(spokenSpan('ngày mai ăn', day)).toMatchObject({ start: '2026-10-28', label: 'Ngày mai' });
    expect(spokenSpan('ngày kia', day)).toMatchObject({ start: '2026-10-29', label: 'Ngày kia' });
    expect(spokenSpan('3 ngày trước', day)).toMatchObject({ start: '2026-10-24', label: '3 ngày trước' });
    expect(spokenSpan('hai ngày nữa', day)).toMatchObject({ start: '2026-10-29', label: 'Ngày kia' });
    expect(spokenSpan('cuối tháng tiền nhà', day)).toMatchObject({ start: '2026-10-31', label: 'Cuối tháng' });
    expect(spokenSpan('đầu tháng', day)).toMatchObject({ start: '2026-10-01', label: 'Đầu tháng' });
  });

  it('đọc cả tuần và cả tháng', () => {
    expect(spokenSpan('tuần trước', day)).toEqual({ start: '2026-10-19', end: '2026-10-25', label: 'Tuần trước' });
    expect(spokenSpan('tuần sau ăn', day)).toEqual({ start: '2026-11-02', end: '2026-11-08', label: 'Tuần sau' });
    expect(spokenSpan('tháng trước', day)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
      label: 'Tháng trước',
    });
    expect(spokenSpan('tháng sau', day)).toEqual({
      start: firstOfMonth(day, 1),
      end: lastOfMonth(firstOfMonth(day, 1)),
      label: 'Tháng sau',
    });
    expect(spokenSpan('thứ hai tuần trước', day)?.start).toBe('2026-10-19');
  });

  it('bỏ qua khi câu có hai mốc khác nhau', () => {
    expect(spokenSpan('hôm qua và hôm nay', day)).toBeNull();
    expect(spokenSpan('', day)).toBeNull();
  });
});

describe('sửa khoảng chưa có dữ liệu', () => {
  it('không sửa hôm qua thành 100k khi chưa có bữa ăn', () => {
    const planned = planRevisions('hôm qua tui ăn 100k chứ không phải 50k', [draft()], [], day);
    expect(planned.drafts).toEqual([]);
    expect(planned.reply).toContain('Hôm qua chưa có khoản ăn');
    expect(planned.reply).toContain('100k');
    expect(planned.reply).toContain('ghi hôm qua ăn 100k');
  });

  it('sửa đúng bữa 50k khi hôm qua có khoản đó', () => {
    const planned = planRevisions(
      'hôm qua tui ăn 100k chứ không phải 50k',
      [draft()],
      [meal({ id: 'food' })],
      day
    );
    expect(planned.drafts[0]).toMatchObject({
      date: '2026-10-26',
      amount: 100000,
      revision: { txId: 'food', previousAmount: 50000 },
    });
    expect(planned.reply).toContain('50k');
    expect(planned.reply).toContain('100k');
  });

  it('không đổi bữa khác số khi người dùng nói không phải 50k', () => {
    const planned = planRevisions(
      'hôm qua tui ăn 100k chứ không phải 50k',
      [draft()],
      [meal({ id: 'food', amount: 80000 })],
      day
    );
    expect(planned.drafts).toEqual([]);
    expect(planned.reply).toContain('80k');
    expect(planned.reply).toContain('50k');
  });

  it('không lấy khoản xăng 50k để sửa thành bữa ăn', () => {
    const planned = planRevisions(
      'hôm qua tui ăn 100k chứ không phải 50k',
      [draft()],
      [meal({ id: 'fuel', note: 'đổ xăng', category: 'Xăng', amount: 50000 })],
      day
    );
    expect(planned.drafts).toEqual([]);
    expect(planned.reply).toContain('ăn');
    expect(planned.reply?.includes('Xăng')).toBe(false);
  });

  it('vẫn ghi mới khi hôm qua trống và câu không phải lời sửa', () => {
    const planned = planRevisions('hôm qua tui ăn 100k', [draft({ wantsRevision: false })], [], day);
    expect(planned.drafts).toHaveLength(1);
    expect(planned.drafts[0].date).toBe('2026-10-26');
    expect(planned.drafts[0].revision).toBeUndefined();
    expect(planned.reply).toBeNull();
  });

  it('quên ghi vẫn là khoản mới dù mô hình bật cờ sửa', () => {
    const planned = planRevisions(
      'à quên ghi hôm qua ăn 100k chứ không phải 50k',
      [draft({ wantsRevision: true })],
      [],
      day
    );
    expect(planned.drafts).toHaveLength(1);
    expect(planned.drafts[0].revision).toBeUndefined();
  });

  it('không sửa tháng trước khi cả tháng không có bữa ăn', () => {
    const planned = planRevisions('tháng trước tui ăn 100k chứ không phải 50k', [draft()], [], day);
    expect(planned.drafts).toEqual([]);
    expect(planned.reply).toContain('Tháng trước');
  });

  it('sửa bữa trong tháng trước và giữ ngày của khoản đó', () => {
    const planned = planRevisions(
      'tháng trước tui ăn 100k chứ không phải 50k',
      [draft()],
      [meal({ id: 'sept', date: '2026-09-12' })],
      day
    );
    expect(planned.drafts[0]).toMatchObject({
      date: '2026-09-12',
      revision: { txId: 'sept', previousAmount: 50000 },
    });
  });

  it('ghi bù tháng trước vào ngày trong tháng đó', () => {
    const planned = planRevisions('tháng trước tui ăn 100k', [draft()], [], day);
    expect(planned.drafts[0].date).toBe('2026-09-30');
    expect(planned.drafts[0].revision).toBeUndefined();
  });

  it('không ghi và không sửa ngày mai', () => {
    const fresh = planRevisions('ngày mai tui ăn 100k', [draft({ date: '2026-10-28' })], [], day);
    expect(fresh.drafts).toEqual([]);
    expect(fresh.reply).toContain('Ngày mai chưa tới');

    const correction = planRevisions(
      'ngày mai tui ăn 100k chứ không phải 50k',
      [draft({ date: day })],
      [],
      day
    );
    expect(correction.drafts).toEqual([]);
    expect(correction.reply).toContain('không sửa');
  });

  it('không ghi tuần sau hay tháng sau', () => {
    expect(planRevisions('tuần sau đổ xăng 70k', [draft({ note: 'đổ xăng' })], [], day).drafts).toEqual([]);
    expect(planRevisions('tháng sau lương 20 triệu', [draft({ note: 'lương', amount: 20000000 })], [], day).reply).toContain(
      'Tháng sau'
    );
  });

  it('không sửa ngày cũ hơn 120 ngày khi không thấy khoản', () => {
    const planned = planRevisions('121 ngày trước ăn 100k chứ không phải 50k', [draft()], [], day);
    expect(planned.drafts).toEqual([]);
    expect(planned.reply).toContain('120 ngày');
  });

  it('hỏi lại khi tháng trước có hai bữa cùng số', () => {
    const planned = planRevisions(
      'tháng trước ăn 100k chứ không phải 50k',
      [draft()],
      [meal({ id: 'a', date: '2026-09-02' }), meal({ id: 'b', date: '2026-09-18', note: 'cơm' })],
      day
    );
    expect(planned.drafts).toEqual([]);
    expect(planned.reply).toContain('khoản nào');
  });
});
