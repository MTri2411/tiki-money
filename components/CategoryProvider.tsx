import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { iconForEntry } from '@/lib/category-match';
import {
  categories as loadCategories,
  hideCategory,
  saveCategory,
  type CategoryRow,
} from '@/lib/db';

type CategoryContextValue = {
  categories: CategoryRow[];
  allCategories: CategoryRow[];
  ready: boolean;
  refresh: () => Promise<void>;
  save: (input: { id?: string; name: string; icon: string; hidden?: boolean }) => Promise<void>;
  hide: (id: string, hidden?: boolean) => Promise<void>;
  iconFor: (name: string, detail?: string | null) => string;
};

const CategoryContext = createContext<CategoryContextValue | null>(null);

export function CategoryProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setRows(await loadCategories(true));
  }, []);

  useEffect(() => {
    let mounted = true;
    loadCategories(true)
      .then((next) => {
        if (mounted) setRows(next);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const save = useCallback(async (input: { id?: string; name: string; icon: string; hidden?: boolean }) => {
    await saveCategory(input);
    await refresh();
  }, [refresh]);

  const hide = useCallback(async (id: string, hidden = true) => {
    await hideCategory(id, hidden);
    await refresh();
  }, [refresh]);

  const value = useMemo<CategoryContextValue>(() => {
    const icons = new Map(rows.map((row) => [row.name, row.icon]));
    return {
      categories: rows.filter((row) => Number(row.is_hidden) === 0),
      allCategories: rows,
      ready,
      refresh,
      save,
      hide,
      iconFor: (name, detail) => iconForEntry(name, icons.get(name), detail),
    };
  }, [hide, ready, refresh, rows, save]);

  return <CategoryContext.Provider value={value}>{children}</CategoryContext.Provider>;
}

export function useCategories() {
  const value = useContext(CategoryContext);
  if (!value) throw new Error('useCategories must be used within CategoryProvider');
  return value;
}
