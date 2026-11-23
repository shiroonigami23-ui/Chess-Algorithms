/** Tiny hyperscript helper: h('div.card', {onclick}, child, 'text') */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}`,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = (spec as string).split('.');
  const el = document.createElement(tag) as HTMLElementTagNameMap[K];
  if (classes.length) el.className = classes.join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v as Record<string, string | number>)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, String(val));
          else (el.style as unknown as Record<string, string>)[prop] = String(val);
        }
      }
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'class') el.className += ` ${v}`;
      else if (k in el && k !== 'list') (el as unknown as Attrs)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function fmt(n: number, d = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`;
