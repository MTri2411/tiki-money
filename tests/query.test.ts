import { describe, expect, it } from 'vitest';

import { firstOfMonth, lastOfMonth, shiftIso, startOfWeek } from '../lib/db/dates';
import { monthToDate, normalizeQuery, rangeLabel, speakLedger } from '../lib/query';

const today = '2026-10-06';
const categories = ['Ăn uống', 'Đồ uống', 'Xăng'];

describe('khoảng hỏi sổ', () => {
  it('dùng tháng này khi không có ngày', () => {
    expect(normalizeQuery(null, today, categories)).toEqual({
      ...monthToDate(today),
      category: null,
    });
  });

  it('nhận danh mục đúng tên và đảo ngày nếu ngược', () => {
    expect(
      normalizeQuery({ start: '2026-10-06', end: '2026-10-01', category: 'Đồ uống' }, today, categories)
    ).toEqual({ start: '2026-10-01', end: '2026-10-06', category: 'Đồ uống' });
  });

  it('bỏ danh mục không có trong sổ', () => {
    expect(normalizeQuery({ start: '2026-10-06', end: '2026-10-06', category: 'Nợ' }, today, categories).category).toBe(
      null
    );
  });
});

describe('câu trả lời có số', () => {
  it('nói hôm nay và khoản cà phê', () => {
    const text = speakLedger({
      start: today,
      end: today,
      category: 'Đồ uống',
      today,
      rows: [
        { amount: 35000, direction: 'chi', category: 'Đồ uống' },
        { amount: 55000, direction: 'chi', category: 'Ăn uống' },
      ],
    });
    expect(text).toBe('Hôm nay bạn đã chi 35.000đ cho Đồ uống, gồm 1 khoản.');
  });

  it('nói hôm qua và ngày mai khi chưa có khoản', () => {
    expect(speakLedger({ start: shiftIso(today, -1), end: shiftIso(today, -1), category: null, today, rows: [] })).toBe(
      'Hôm qua chưa có khoản nào.'
    );
    expect(speakLedger({ start: shiftIso(today, 1), end: shiftIso(today, 1), category: null, today, rows: [] })).toBe(
      'Ngày mai chưa có khoản nào.'
    );
    const monday = startOfWeek(today);
    expect(rangeLabel(shiftIso(monday, 7), shiftIso(monday, 13), today)).toBe('Tuần sau');
    const next = firstOfMonth(today, 1);
    expect(rangeLabel(next, lastOfMonth(next), today)).toBe('Tháng sau');
    expect(
      speakLedger({ start: next, end: lastOfMonth(next), category: null, today, rows: [] })
    ).toBe('Tháng sau chưa có khoản nào.');
  });

  it('nói tháng này khi chưa có khoản', () => {
    expect(rangeLabel('2026-10-01', today, today)).toBe('Tháng này');
    expect(
      speakLedger({ start: '2026-10-01', end: today, category: null, today, rows: [] })
    ).toBe('Tháng này chưa có khoản nào.');
  });

  it('cộng chi và thu', () => {
    const text = speakLedger({
      start: '2026-09-01',
      end: '2026-09-30',
      category: null,
      today,
      rows: [
        { amount: 120000, direction: 'chi', category: 'Ăn uống' },
        { amount: 8000000, direction: 'thu', category: 'Thu nhập' },
      ],
    });
    expect(text).toContain('chi 120.000đ và thu 8.000.000đ');
    expect(text).toContain('2 khoản');
    expect(rangeLabel('2026-09-01', '2026-09-30', today)).toBe('Tháng trước');
  });
});
