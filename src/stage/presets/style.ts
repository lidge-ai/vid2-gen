/** One visual system for the UI presets (030): dark and light variants, overridable per layer. */
export interface ComponentStyle {
  fill: string; stroke: string; strokeWidth: number; radius: number; glow?: string | undefined;
  text: string; muted: string; accent: string; track: string; shadow: string;
}

export const DARK: ComponentStyle = { fill: "#1C1C1ECC", stroke: "#FFFFFF1F", strokeWidth: 1.5, radius: 999, glow: "#5AC8FA26",
  text: "#F5F5F7", muted: "#8E8E93", accent: "#5AC8FA", track: "#FFFFFF14", shadow: "#00000080" };
export const LIGHT: ComponentStyle = { fill: "#FFFFFFF2", stroke: "#0000001A", strokeWidth: 1.5, radius: 999, glow: undefined,
  text: "#1C1C1E", muted: "#6E6E73", accent: "#0A84FF", track: "#0000000D", shadow: "#0000001F" };

export function componentStyle(theme: "dark" | "light", over: { [K in keyof ComponentStyle]?: ComponentStyle[K] | undefined } = {}): ComponentStyle {
  const base = theme === "light" ? LIGHT : DARK;
  const out: ComponentStyle = { ...base };
  for (const [k, v] of Object.entries(over)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  return out;
}
