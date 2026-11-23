import { PIECES, type PieceId } from '../core/board';
import type { Player } from './player';
import { asset, clamp, fmt, h } from './dom';

export const icon = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 6l-7 6 7 6z" fill="currentColor"/><path d="M6 6h2v12H6z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 6l7 6-7 6z" fill="currentColor"/><path d="M16 6h2v12h-2z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14 7l-5 5 5 5z" fill="currentColor"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M10 7l5 5-5 5z" fill="currentColor"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M7 7h9l-2-2 1.4-1.4L20 8l-4.6 4.4L14 11l2-2H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5zm10 10H8l2 2-1.4 1.4L4 16l4.6-4.4L10 13l-2 2h9a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5z" fill="currentColor"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M18 8a3 3 0 1 0-2.8-4L8.9 7.2a3 3 0 1 0 0 4.6l6.3 3.2A3 3 0 1 0 16 13l-6.4-3.2a3 3 0 0 0 0-1.6L16 5a3 3 0 0 0 2 3z" fill="currentColor"/></svg>',
  dice: '<svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4-3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill="currentColor"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="M16.2 3.6l4.2 4.2a2 2 0 0 1 0 2.8L11 20H5l-1.6-1.6a2 2 0 0 1 0-2.8l10-10a2 2 0 0 1 2.8 0z" fill="currentColor"/></svg>',
};

export interface Seg<T extends string | number> {
  el: HTMLElement;
  set(v: T): void;
}

export function seg<T extends string | number>(
  options: { value: T; label: string; title?: string; color?: string }[],
  value: T,
  onChange: (v: T) => void,
  cls = '',
): Seg<T> {
  const el = h('div.seg', { role: 'radiogroup', class: cls });
  const buttons = options.map((o) => {
    const b = h('button', {
      type: 'button',
      role: 'radio',
      title: o.title ?? '',
      style: o.color ? { '--c': o.color } : undefined,
      onclick: () => {
        set(o.value);
        onChange(o.value);
      },
    }, o.label);
    el.append(b);
    return [o.value, b] as const;
  });
  const set = (v: T) => {
    for (const [val, b] of buttons) {
      b.classList.toggle('on', val === v);
      b.setAttribute('aria-checked', String(val === v));
    }
  };
  set(value);
  return { el, set };
}

export function slider(label: string, min: number, max: number, value: number, onInput: (v: number) => void, show: (v: number) => string = String) {
  const out = h('output', null, show(value));
  const input = h('input', { type: 'range', min, max, value, step: 1 });
  const paint = () => input.style.setProperty('--p', `${((+input.value - min) / (max - min)) * 100}%`);
  input.addEventListener('input', () => {
    out.textContent = show(+input.value);
    paint();
    onInput(+input.value);
  });
  paint();
  const el = h('label.slider', null, h('span', null, label), out, input);
  return {
    el,
    set(v: number) {
      input.value = String(v);
      out.textContent = show(v);
      paint();
    },
  };
}

export function panel(title: string, ...children: (Node | string | null | false)[]) {
  return h('section.panel', null, h('header', null, h('h3', null, title)), ...children);
}

export interface Metric {
  el: HTMLElement;
  set(v: string | number, sub?: string): void;
}

export function metric(label: string, accent?: string): Metric {
  const val = h('b', null, '–');
  const sub = h('small', null, '');
  const el = h('div.metric', { style: accent ? { '--c': accent } : undefined }, h('span', null, label), val, sub);
  return {
    el,
    set(v, s = '') {
      val.textContent = typeof v === 'number' ? fmt(v) : v;
      sub.textContent = s;
    },
  };
}

export function pieceRow(current: PieceId, onPick: (p: PieceId) => void, only?: PieceId[]) {
  const el = h('div.pieces', { role: 'radiogroup' });
  const btns = new Map<PieceId, HTMLElement>();
  for (const id of (only ?? (Object.keys(PIECES) as PieceId[]))) {
    const info = PIECES[id];
    const b = h('button', {
      type: 'button',
      title: `${info.name}: ${info.note}`,
      onclick: () => {
        set(id);
        onPick(id);
      },
    }, h('img', { src: asset(`pieces/maestro/${info.sprite}.svg`), alt: info.name, draggable: false }), h('span', null, info.name));
    btns.set(id, b);
    el.append(b);
  }
  const set = (id: PieceId) => btns.forEach((b, k) => b.classList.toggle('on', k === id));
  set(current);
  return { el, set };
}

export function codeView(lines: string[]) {
  const rows: HTMLElement[] = lines.map((l, i) =>
    h('div.ln', null, h('i', null, String(i + 1)), h('code', null, l.replace(/ /g, ' ') || ' ')),
  );
  const el = h('div.code', null, ...rows);
  let cur = 0;
  return {
    el,
    set(line: number) {
      if (line === cur) return;
      rows[cur - 1]?.classList.remove('hot');
      cur = line;
      rows[cur - 1]?.classList.add('hot');
    },
    setLines(next: string[]) {
      el.replaceChildren(
        ...next.map((l, i) => h('div.ln', null, h('i', null, String(i + 1)), h('code', null, l.replace(/ /g, ' ') || ' '))),
      );
      cur = 0;
      rows.length = 0;
      el.querySelectorAll('.ln').forEach((r) => rows.push(r as HTMLElement));
    },
  };
}

export function hint(text: string) {
  return h('p.hint', null, text);
}

/** Transport bar bound to a Player. Returns the element and a disposer for key handling. */
export function timeline(player: Player, opts: { unit?: string; label?: () => string } = {}) {
  const unit = opts.unit ?? 'step';
  const playBtn = h('button.play', { type: 'button', title: 'Play / pause (Space)', html: icon.play, onclick: () => player.toggle() });
  const scrub = h('input.scrub', { type: 'range', min: 0, max: 1, step: 1, value: 0, 'aria-label': 'Timeline' });
  const readout = h('span.readout', null, '');
  const loopBtn = h('button.ghost', { type: 'button', title: 'Loop', html: icon.loop, onclick: () => { player.loop = !player.loop; sync(); } });
  const speeds = [0.25, 0.5, 1, 2, 4, 8];
  const speedSeg = seg(speeds.map((s) => ({ value: s, label: `${s}×` })), player.speed, (v) => player.setSpeed(v), 'mini');
  let dragging = false;
  scrub.addEventListener('input', () => {
    dragging = true;
    player.pause();
    player.seek(+scrub.value);
    dragging = false;
  });
  const sync = () => {
    scrub.max = String(Math.max(1, player.length));
    if (!dragging) scrub.value = String(Math.round(player.t));
    scrub.style.setProperty('--p', `${player.length ? (player.t / player.length) * 100 : 0}%`);
    playBtn.innerHTML = player.playing ? icon.pause : icon.play;
    playBtn.classList.toggle('on', player.playing);
    loopBtn.classList.toggle('on', player.loop);
    readout.textContent = opts.label ? opts.label() : `${unit} ${fmt(Math.round(player.t))} / ${fmt(player.length)}`;
  };
  const off = player.onChange(sync);
  const el = h(
    'div.transport',
    null,
    h('button.ghost', { type: 'button', title: 'Restart (Home)', html: icon.prev, onclick: () => { player.pause(); player.seek(0); } }),
    h('button.ghost', { type: 'button', title: 'Step back (←)', html: icon.back, onclick: () => player.step(-1) }),
    playBtn,
    h('button.ghost', { type: 'button', title: 'Step forward (→)', html: icon.fwd, onclick: () => player.step(1) }),
    h('button.ghost', { type: 'button', title: 'Jump to end (End)', html: icon.next, onclick: () => { player.pause(); player.seek(player.length); } }),
    scrub,
    readout,
    loopBtn,
    speedSeg.el,
  );
  const key = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && (t as HTMLInputElement).type !== 'range') return;
    if (e.key === ' ') { e.preventDefault(); player.toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); player.step(e.shiftKey ? 10 : 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); player.step(e.shiftKey ? -10 : -1); }
    else if (e.key === 'Home') { player.pause(); player.seek(0); }
    else if (e.key === 'End') { player.pause(); player.seek(player.length); }
  };
  window.addEventListener('keydown', key);
  sync();
  return { el, dispose: () => { off(); window.removeEventListener('keydown', key); }, sync, clampSpeed: (v: number) => clamp(v, 0.25, 8) };
}
