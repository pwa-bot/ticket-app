"use client";

export interface AutoMergeSettings {
  globalDefault: boolean;
  repoOverrides: Record<string, boolean>; // "owner/repo" -> enabled
}

const STORAGE_KEY = "ticketapp.autoMergeSettings.v1";

const DEFAULT_SETTINGS: AutoMergeSettings = {
  globalDefault: true, // Auto-merge enabled by default
  repoOverrides: {},
};

export function loadAutoMergeSettings(): AutoMergeSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AutoMergeSettings>;
    return {
      globalDefault: parsed.globalDefault ?? DEFAULT_SETTINGS.globalDefault,
      repoOverrides: parsed.repoOverrides ?? DEFAULT_SETTINGS.repoOverrides,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAutoMergeSettings(settings: AutoMergeSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function setGlobalAutoMerge(enabled: boolean): void {
  const settings = loadAutoMergeSettings();
  settings.globalDefault = enabled;
  saveAutoMergeSettings(settings);
}

export function setRepoAutoMergeOverride(repo: string, enabled: boolean | null): void {
  const settings = loadAutoMergeSettings();
  if (enabled === null) {
    // Remove override, use global default
    delete settings.repoOverrides[repo];
  } else {
    settings.repoOverrides[repo] = enabled;
  }
  saveAutoMergeSettings(settings);
}

export function shouldAutoMerge(repo: string): boolean {
  const settings = loadAutoMergeSettings();
  
  // Check for repo-specific override first
  if (repo in settings.repoOverrides) {
    return settings.repoOverrides[repo];
  }
  
  // Fall back to global default
  return settings.globalDefault;
}

export function getRepoAutoMergeSetting(repo: string): { value: boolean; source: "global" | "repo" } {
  const settings = loadAutoMergeSettings();
  
  if (repo in settings.repoOverrides) {
    return { value: settings.repoOverrides[repo], source: "repo" };
  }
  
  return { value: settings.globalDefault, source: "global" };
}
