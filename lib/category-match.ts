export const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Ăn uống', icon: '🍜', sort: 0 },
  { id: 'drink', name: 'Đồ uống', icon: '🧋', sort: 1 },
  { id: 'transport', name: 'Đi lại', icon: '🛵', sort: 2 },
  { id: 'fuel', name: 'Xăng', icon: '⛽', sort: 3 },
  { id: 'vehicle', name: 'Bảo dưỡng xe', icon: '🛠️', sort: 4 },
  { id: 'grocery', name: 'Tạp hoá', icon: '🛒', sort: 5 },
  { id: 'bills', name: 'Hoá đơn', icon: '💡', sort: 6 },
  { id: 'home', name: 'Nhà ở', icon: '🏠', sort: 7 },
  { id: 'health', name: 'Sức khoẻ', icon: '💊', sort: 8 },
  { id: 'beauty', name: 'Làm đẹp', icon: '💇', sort: 9 },
  { id: 'shopping', name: 'Mua sắm', icon: '🛍️', sort: 10 },
  { id: 'entertainment', name: 'Giải trí', icon: '🎬', sort: 11 },
  { id: 'education', name: 'Học tập', icon: '📚', sort: 12 },
  { id: 'family', name: 'Gia đình', icon: '👪', sort: 13 },
  { id: 'pet', name: 'Thú cưng', icon: '🐾', sort: 14 },
  { id: 'travel', name: 'Du lịch', icon: '✈️', sort: 15 },
  { id: 'income', name: 'Thu nhập', icon: '💰', sort: 16 },
  { id: 'other', name: 'Khác', icon: '✨', sort: 17 },
] as const;

const CATEGORY_DEFAULT_ICON = Object.fromEntries(
  DEFAULT_CATEGORIES.map((item) => [item.name, item.icon])
) as Record<string, string>;

type Rule = {
  category: string;
  icon: string;
  income?: boolean;
  phrases: string[];
};

const RULES: Rule[] = [
  { category: 'Ăn uống', icon: '🍜', phrases: ['grabfood', 'grab food', 'shopeefood', 'cơm tấm', 'hủ tiếu', 'bún bò', 'bánh mì', 'ăn sáng', 'ăn trưa', 'ăn tối', 'đồ ăn'] },
  { category: 'Ăn uống', icon: '🍿', phrases: ['ăn vặt'] },
  { category: 'Ăn uống', icon: '🍜', phrases: ['cơm', 'phở', 'bún', 'cháo', 'lẩu', 'buffet'] },
  { category: 'Đồ uống', icon: '🧋', phrases: ['trà sữa', 'trasua'] },
  { category: 'Đồ uống', icon: '☕', phrases: ['cà phê', 'cafe', 'caphe', 'coffee', 'bạc xỉu', 'trà đá', 'trà tắc', 'trà đào', 'sinh tố', 'nước ngọt'] },
  { category: 'Xăng', icon: '⛽', phrases: ['đổ xăng', 'bơm xăng', 'xăng xe', 'tiền xăng', 'xăng'] },
  { category: 'Bảo dưỡng xe', icon: '🛢️', phrases: ['thay nhớt', 'dầu nhớt', 'dầu máy', 'nhớt'] },
  { category: 'Bảo dưỡng xe', icon: '🧽', phrases: ['rửa xe'] },
  { category: 'Bảo dưỡng xe', icon: '🔧', phrases: ['sửa xe', 'thay lốp', 'thay vỏ', 'vá vỏ', 'vá xe', 'ruột xe', 'phụ tùng', 'gara', 'bảo dưỡng'] },
  { category: 'Đi lại', icon: '🅿️', phrases: ['gửi xe', 'giữ xe'] },
  { category: 'Đi lại', icon: '🚌', phrases: ['xe bus', 'xe buýt', 'xe khách'] },
  { category: 'Đi lại', icon: '🚕', phrases: ['taxi', 'xe ôm'] },
  { category: 'Đi lại', icon: '🛵', phrases: ['grab', 'grap'] },
  { category: 'Tạp hoá', icon: '🛒', phrases: ['siêu thị', 'tạp hoá', 'tạp hóa', 'đi chợ', 'bách hoá', 'winmart', 'coopmart'] },
  { category: 'Hoá đơn', icon: '📱', phrases: ['tiền điện thoại', 'cước điện thoại', 'nạp thẻ', 'nạp điện thoại'] },
  { category: 'Hoá đơn', icon: '💡', phrases: ['tiền điện', 'tiền nước', 'tiền mạng', 'internet', 'wifi', 'hoá đơn', 'hóa đơn'] },
  { category: 'Nhà ở', icon: '🏠', phrases: ['tiền nhà', 'thuê nhà', 'tiền phòng', 'tiền trọ', 'tiền phòng trọ'] },
  { category: 'Sức khoẻ', icon: '💊', phrases: ['nhà thuốc', 'thuốc', 'khám bệnh', 'bệnh viện', 'nha khoa', 'phòng khám'] },
  { category: 'Làm đẹp', icon: '💇', phrases: ['cắt tóc', 'gội đầu', 'mỹ phẩm', 'làm đẹp', 'nail', 'spa'] },
  { category: 'Mua sắm', icon: '🛍️', phrases: ['quần áo', 'shopee', 'lazada', 'tiktok shop', 'mua sắm', 'tiki'] },
  { category: 'Giải trí', icon: '🎤', phrases: ['karaoke'] },
  { category: 'Giải trí', icon: '🍻', phrases: ['nhậu', 'bia', 'rượu'] },
  { category: 'Giải trí', icon: '🎬', phrases: ['xem phim', 'vé phim', 'chơi game', 'netflix', 'game'] },
  { category: 'Học tập', icon: '📚', phrases: ['học phí', 'học thêm', 'mua sách', 'khoá học', 'khóa học'] },
  { category: 'Gia đình', icon: '🎁', phrases: ['lì xì', 'mừng cưới', 'tiền mừng', 'biếu'] },
  { category: 'Gia đình', icon: '👪', phrases: ['bố mẹ', 'tiền cho con', 'gia đình'] },
  { category: 'Thú cưng', icon: '🐾', phrases: ['thú cưng', 'thức ăn thú cưng', 'pet'] },
  { category: 'Du lịch', icon: '✈️', phrases: ['vé máy bay', 'khách sạn', 'du lịch'] },
  { category: 'Thu nhập', icon: '💰', income: true, phrases: ['tiền lương', 'lương tháng', 'tiền thưởng', 'lương', 'freelance'] },
];

const GUIDE: { category: string; examples: string }[] = [
  { category: 'Xăng', examples: 'xăng, đổ xăng, bơm xăng' },
  { category: 'Bảo dưỡng xe', examples: 'nhớt, dầu máy, sửa xe, rửa xe, vá vỏ, phụ tùng' },
  { category: 'Đi lại', examples: 'grab, taxi, xe bus, xe ôm, gửi xe' },
  { category: 'Đồ uống', examples: 'cà phê, trà sữa, trà đá, sinh tố' },
  { category: 'Ăn uống', examples: 'cơm, phở, bún, bánh mì, ăn sáng, ăn trưa, ăn vặt' },
  { category: 'Tạp hoá', examples: 'siêu thị, tạp hoá, đi chợ' },
  { category: 'Hoá đơn', examples: 'tiền điện, tiền nước, internet, wifi, điện thoại' },
  { category: 'Nhà ở', examples: 'tiền nhà, thuê nhà, tiền trọ' },
  { category: 'Sức khoẻ', examples: 'thuốc, khám bệnh, nha khoa' },
  { category: 'Làm đẹp', examples: 'cắt tóc, nail, mỹ phẩm, spa' },
  { category: 'Mua sắm', examples: 'shopee, quần áo' },
  { category: 'Giải trí', examples: 'xem phim, karaoke, game, bia, nhậu' },
  { category: 'Học tập', examples: 'học phí, sách, khoá học' },
  { category: 'Gia đình', examples: 'biếu, bố mẹ, lì xì' },
  { category: 'Thú cưng', examples: 'thú cưng' },
  { category: 'Du lịch', examples: 'du lịch, vé máy bay, khách sạn' },
  { category: 'Thu nhập', examples: 'lương, tiền thưởng, freelance' },
];

const LOOSER: Record<string, readonly string[]> = {
  'Ăn uống': ['Đồ uống', 'Tạp hoá', 'Khác'],
  'Đồ uống': ['Ăn uống', 'Khác'],
  'Xăng': ['Đi lại', 'Bảo dưỡng xe', 'Khác'],
  'Bảo dưỡng xe': ['Đi lại', 'Khác'],
  'Đi lại': ['Khác'],
  'Tạp hoá': ['Mua sắm', 'Ăn uống', 'Khác'],
  'Hoá đơn': ['Nhà ở', 'Khác'],
  'Nhà ở': ['Hoá đơn', 'Gia đình', 'Khác'],
  'Sức khoẻ': ['Khác'],
  'Làm đẹp': ['Mua sắm', 'Sức khoẻ', 'Khác'],
  'Mua sắm': ['Khác'],
  'Giải trí': ['Ăn uống', 'Khác'],
  'Học tập': ['Gia đình', 'Khác'],
  'Gia đình': ['Khác'],
  'Thú cưng': ['Gia đình', 'Mua sắm', 'Khác'],
  'Du lịch': ['Đi lại', 'Giải trí', 'Khác'],
  'Thu nhập': ['Khác', 'Gia đình'],
};

export type SpendMatch = {
  category: string;
  icon: string;
  income: boolean;
};

type IndexedRule = SpendMatch & { pattern: RegExp };

const INDEX: IndexedRule[] = RULES.flatMap((rule) =>
  rule.phrases.map((phrase) => ({
    category: rule.category,
    icon: rule.icon,
    income: rule.income === true,
    phrase: fold(phrase),
  }))
)
  .sort((a, b) => b.phrase.length - a.phrase.length)
  .map(({ phrase, ...rule }) => ({
    ...rule,
    pattern: new RegExp(`(?:^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?:[^a-z0-9]|$)`),
  }));

export function fold(input: string): string {
  return input
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchSpend(text: string): SpendMatch | null {
  const folded = fold(text);
  if (!folded) return null;
  for (const rule of INDEX) {
    if (rule.pattern.test(folded)) {
      return { category: rule.category, icon: rule.icon, income: rule.income };
    }
  }
  return null;
}

export function iconForEntry(
  categoryName: string,
  categoryIcon: string | undefined,
  detail?: string | null
): string {
  const hinted = detail?.trim() ? matchSpend(detail) : null;
  const agrees =
    hinted !== null &&
    (hinted.category === categoryName || (LOOSER[hinted.category] ?? []).includes(categoryName));
  if (!hinted || !agrees) return categoryIcon || '✨';
  const generic = hinted.icon === CATEGORY_DEFAULT_ICON[hinted.category];
  if (generic && hinted.category === categoryName && categoryIcon) return categoryIcon;
  return hinted.icon;
}

type SpendDraft = {
  category: string;
  direction: 'chi' | 'thu';
  note: string;
};

export function refineDrafts<T extends SpendDraft>(
  drafts: T[],
  sourceText: string,
  allowed: readonly string[]
): T[] {
  const names = new Set(allowed);
  return drafts.map((draft) => {
    const hint = matchSpend(draft.note) ?? (drafts.length === 1 ? matchSpend(sourceText) : null);
    if (!hint || !names.has(hint.category)) return draft;
    return {
      ...draft,
      category: hint.category,
      direction: hint.income ? 'thu' : draft.direction,
    };
  });
}

export function categoryGuide(allowed: readonly string[]): string {
  const names = new Set(allowed);
  const lines = GUIDE.filter((item) => names.has(item.category)).map(
    (item) => `- ${item.examples} → ${item.category}`
  );
  if (lines.length === 0) return '';
  const income = names.has('Thu nhập') ? '\nThu nhập always uses direction thu.' : '';
  return `When the wording clearly matches, use that category:\n${lines.join('\n')}${income}`;
}
