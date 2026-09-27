/** Kinetic text states → keyed tokens. A key names an actor across states, so the same word in the next state moves instead of re-entering. */
export interface Token {
  key: string;
  text?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
  accent?: boolean | undefined;
  enter?: string | undefined;
  /** Start a new line before this token. */
  newline: boolean;
}
export interface AuthoredToken { text?: string | undefined; icon?: string | undefined; key?: string | undefined; color?: string | undefined;
  accent?: boolean | undefined; enter?: string | undefined; newline?: boolean | undefined }

/** "Anything you can do in a {globe} browser\nnext line" → tokens (words, {icon} tokens, newline markers). */
export function tokenize(text: string): AuthoredToken[] {
  const out: AuthoredToken[] = [];
  let newline = false;
  for (const part of text.split(/(\{[^{}\s]+\}|\r?\n|\s+)/u)) {
    if (!part) continue;
    if (/^\r?\n$/u.test(part)) { newline = true; continue; }
    if (/^\s+$/u.test(part)) continue;
    const icon = /^\{([^{}\s]+)\}$/u.exec(part);
    out.push({ ...(icon ? { icon: icon[1]! } : { text: part }), ...(newline ? { newline: true } : {}) });
    newline = false;
  }
  return out;
}

/** Default key: lowercased text (or "icon:name") + "#" + occurrence within the state; an explicit key wins. */
export function assignKeys(tokens: AuthoredToken[]): Token[] {
  const seen = new Map<string, number>();
  return tokens.map((t) => {
    const base = t.text !== undefined ? t.text.toLowerCase() : `icon:${t.icon ?? ""}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { key: t.key ?? `${base}#${n}`, text: t.text, icon: t.icon, color: t.color, accent: t.accent, enter: t.enter, newline: t.newline === true };
  });
}
