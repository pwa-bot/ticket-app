export function slugifyTitle(input: string, maxLen = 50): string {
  let s = input.trim().toLowerCase();
  // Basic ASCII folding for common cases
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  // Replace non-alphanum with dash
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/-+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (!s) s = "change";
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/g, "");
  return s;
}
