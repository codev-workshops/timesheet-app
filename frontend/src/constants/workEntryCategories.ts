export const WORK_ENTRY_CATEGORIES = ['development', 'meeting', 'research', 'admin', 'other'] as const;

export type WorkEntryCategory = (typeof WORK_ENTRY_CATEGORIES)[number];

export const formatCategory = (category: string | null | undefined): string =>
  category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Uncategorized';
