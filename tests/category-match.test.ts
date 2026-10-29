import { describe, expect, it } from 'vitest';

import {
  categoryGuide,
  fold,
  iconForEntry,
  matchSpend,
  refineDrafts,
} from '../lib/category-match';

const names = [
  'Ăn uống',
  'Đồ uống',
  'Đi lại',
  'Xăng',
  'Bảo dưỡng xe',
  'Tạp hoá',
  'Hoá đơn',
  'Nhà ở',
  'Sức khoẻ',
  'Làm đẹp',
  'Mua sắm',
  'Giải trí',
  'Học tập',
  'Gia đình',
  'Thú cưng',
  'Du lịch',
  'Thu nhập',
  'Khác',
];

describe('nhận diện khoản chi từ câu nói', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(fold('Đổ xăng')).toBe('do xang');
    expect(fold('thay nhớt')).toBe('thay nhot');
  });

  it('gắn xăng, nhớt và sửa xe với icon khác nhau', () => {
    expect(matchSpend('đổ xăng 70k')).toMatchObject({ category: 'Xăng', icon: '⛽' });
    expect(matchSpend('thay nhớt')).toMatchObject({ category: 'Bảo dưỡng xe', icon: '🛢️' });
    expect(matchSpend('sửa xe máy')).toMatchObject({ category: 'Bảo dưỡng xe', icon: '🔧' });
    expect(matchSpend('rửa xe')).toMatchObject({ category: 'Bảo dưỡng xe', icon: '🧽' });
  });

  it('không nhầm sữa chua với sửa xe', () => {
    expect(matchSpend('sữa chua 15k')).toBeNull();
  });

  it('tách đồ uống, đi lại và thu nhập', () => {
    expect(matchSpend('trà sữa')).toMatchObject({ category: 'Đồ uống', icon: '🧋' });
    expect(matchSpend('cà phê sữa')).toMatchObject({ category: 'Đồ uống', icon: '☕' });
    expect(matchSpend('gửi xe')).toMatchObject({ category: 'Đi lại', icon: '🅿️' });
    expect(matchSpend('lương tháng')).toMatchObject({ category: 'Thu nhập', icon: '💰', income: true });
  });

  it('ưu tiên cụm dài hơn', () => {
    expect(matchSpend('grabfood 45k')?.category).toBe('Ăn uống');
    expect(matchSpend('grab 45k')?.category).toBe('Đi lại');
  });

  it('map lại danh mục khi ghi một khoản', () => {
    const [draft] = refineDrafts(
      [{ amount: 70000, direction: 'chi' as const, category: 'Đi lại', note: 'chi tiêu', date: '2026-09-23', confidence: 1 }],
      'đổ xăng 70k',
      names
    );
    expect(draft.category).toBe('Xăng');
  });

  it('không lấy từ của khoản khác trong cùng một câu', () => {
    const drafts = refineDrafts(
      [
        { direction: 'chi' as const, category: 'Khác', note: 'Ăn phở' },
        { direction: 'chi' as const, category: 'Đi lại', note: 'Đổ xăng' },
      ],
      'ăn phở 45k đổ xăng 70k',
      names
    );
    expect(drafts.map((item) => item.category)).toEqual(['Ăn uống', 'Xăng']);
  });

  it('lương được ghi là khoản thu', () => {
    const [draft] = refineDrafts(
      [{ direction: 'chi' as const, category: 'Khác', note: 'Lương' }],
      'lương 15tr',
      names
    );
    expect(draft).toMatchObject({ category: 'Thu nhập', direction: 'thu' });
  });

  it('giữ danh mục cũ nếu nhóm mới đang bị ẩn', () => {
    const [draft] = refineDrafts(
      [{ direction: 'chi' as const, category: 'Đi lại', note: 'Đổ xăng' }],
      'đổ xăng',
      ['Đi lại', 'Khác']
    );
    expect(draft.category).toBe('Đi lại');
  });
});

describe('icon hiển thị theo lời ghi', () => {
  it('khoản xăng cũ trong Đi lại vẫn hiện cây xăng', () => {
    expect(iconForEntry('Đi lại', '🛵', 'Đổ xăng 70k')).toBe('⛽');
  });

  it('giữ icon người dùng đã chọn cho đúng danh mục', () => {
    expect(iconForEntry('Xăng', '🟢', 'đổ xăng')).toBe('🟢');
  });

  it('nhớt và sửa xe khác icon dù cùng danh mục', () => {
    expect(iconForEntry('Bảo dưỡng xe', '🛠️', 'thay nhớt')).toBe('🛢️');
    expect(iconForEntry('Bảo dưỡng xe', '🛠️', 'sửa xe')).toBe('🔧');
  });

  it('không đè icon khi người dùng chọn danh mục khác', () => {
    expect(iconForEntry('Gia đình', '👪', 'đổ xăng')).toBe('👪');
  });
});

describe('gợi ý cho mô hình', () => {
  it('chỉ nêu danh mục đang bật', () => {
    const guide = categoryGuide(['Xăng', 'Ăn uống']);
    expect(guide).toContain('đổ xăng');
    expect(guide).not.toContain('Thu nhập');
  });
});
