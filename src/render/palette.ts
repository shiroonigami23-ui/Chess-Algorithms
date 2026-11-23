export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  wall: string;
  mud: string;
  grid: string;
  label: string;
}

export const THEMES: BoardTheme[] = [
  { id: 'obsidian', name: 'Obsidian', light: '#1b2030', dark: '#121624', wall: '#05060a', mud: '#5b4636', grid: 'rgba(255,255,255,.05)', label: 'rgba(255,255,255,.35)' },
  { id: 'marble', name: 'Marble', light: '#dfe3ee', dark: '#9aa5c0', wall: '#2a2f45', mud: '#a9835a', grid: 'rgba(0,0,0,.08)', label: 'rgba(20,24,40,.55)' },
  { id: 'neon', name: 'Neon Grid', light: '#0d1b2a', dark: '#091421', wall: '#020409', mud: '#4a2c5d', grid: 'rgba(56,189,248,.18)', label: 'rgba(56,189,248,.55)' },
];

export const COLORS = {
  start: '#34d399',
  goal: '#f472b6',
  open: '#38bdf8',
  closed: '#7c8cff',
  path: '#fbbf24',
  danger: '#fb7185',
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${f(r1, r2)},${f(g1, g2)},${f(b1, b2)})`;
}

export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
