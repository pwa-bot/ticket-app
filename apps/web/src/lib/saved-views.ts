"use client";

export interface SavedView {
  id: string;
  name: string;
  repo: string | null; // null = all repos
  query: string;
  createdAt: string;
}

interface SavedViewsStore {
  views: SavedView[];
}

const STORAGE_KEY = "ticketapp.savedViews.v1";

function generateId(): string {
  return `sv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const store = JSON.parse(raw) as SavedViewsStore;
    return store.views ?? [];
  } catch {
    return [];
  }
}

function persistViews(views: SavedView[]): void {
  if (typeof window === "undefined") return;
  
  const store: SavedViewsStore = { views };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function saveView(name: string, query: string, repo: string | null): SavedView {
  const views = loadSavedViews();
  const newView: SavedView = {
    id: generateId(),
    name,
    repo,
    query,
    createdAt: new Date().toISOString(),
  };
  views.push(newView);
  persistViews(views);
  return newView;
}

export function deleteView(id: string): void {
  const views = loadSavedViews().filter((v) => v.id !== id);
  persistViews(views);
}

export function renameView(id: string, name: string): void {
  const views = loadSavedViews().map((v) => 
    v.id === id ? { ...v, name } : v
  );
  persistViews(views);
}

export function getViewsForRepo(repo: string | null): SavedView[] {
  return loadSavedViews().filter((v) => v.repo === repo || v.repo === null);
}
