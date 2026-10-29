export type CategoryIcon = {
  emoji: string;
  tint: string;
};

export const CATEGORY_ICON_CHOICES: CategoryIcon[] = [
  { emoji: '🍜', tint: '#FFE3C2' },
  { emoji: '🍿', tint: '#FFE8C7' },
  { emoji: '🧋', tint: '#F8D7E8' },
  { emoji: '☕', tint: '#F3D7C3' },
  { emoji: '🛵', tint: '#D9E6FF' },
  { emoji: '🚌', tint: '#D5E8F8' },
  { emoji: '🚕', tint: '#FFE7A8' },
  { emoji: '🅿️', tint: '#D7E4F5' },
  { emoji: '⛽', tint: '#FFE0CC' },
  { emoji: '🛢️', tint: '#F3E0C4' },
  { emoji: '🔧', tint: '#E4E7EE' },
  { emoji: '🧽', tint: '#D7F3EA' },
  { emoji: '🛠️', tint: '#E5E7EB' },
  { emoji: '🛒', tint: '#D9F5E3' },
  { emoji: '💡', tint: '#FFF1C2' },
  { emoji: '📱', tint: '#D9E8FF' },
  { emoji: '🧾', tint: '#E4DEFF' },
  { emoji: '🏠', tint: '#D8F3E8' },
  { emoji: '💊', tint: '#FFD9DE' },
  { emoji: '💇', tint: '#F8D6EA' },
  { emoji: '🛍️', tint: '#FFD6E8' },
  { emoji: '🎬', tint: '#E6DEFF' },
  { emoji: '🎤', tint: '#F3D4F0' },
  { emoji: '🍻', tint: '#FFE1B5' },
  { emoji: '📚', tint: '#D7E8FF' },
  { emoji: '👪', tint: '#D8F0E4' },
  { emoji: '🎁', tint: '#FFD8DE' },
  { emoji: '🐾', tint: '#F8E2C8' },
  { emoji: '✈️', tint: '#D4F0FF' },
  { emoji: '💰', tint: '#E5F6D4' },
  { emoji: '🚗', tint: '#D9E6FF' },
  { emoji: '🎮', tint: '#E3DCFF' },
  { emoji: '💼', tint: '#DCE6F0' },
  { emoji: '✨', tint: '#F3E7D4' },
];

const LEGACY_CATEGORY_ICONS: Record<string, string> = {
  coffee: '🍜',
  navigation: '🚗',
  tool: '🛠️',
  'file-text': '🧾',
  heart: '💊',
  'shopping-bag': '🛍️',
  film: '🎬',
  home: '🏠',
  gift: '🎁',
  book: '📚',
  briefcase: '💼',
  'more-horizontal': '✨',
};

export function resolveCategoryIcon(icon: string): CategoryIcon {
  const emoji = LEGACY_CATEGORY_ICONS[icon] ?? icon;
  return (
    CATEGORY_ICON_CHOICES.find((item) => item.emoji === emoji) ?? {
      emoji: emoji || '✨',
      tint: '#F3E7D4',
    }
  );
}

export const legacyCategoryIcons = LEGACY_CATEGORY_ICONS;
