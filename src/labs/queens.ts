import * as THREE from 'three';
import { makeBoard, squareName } from '../core/board';
import { QUEENS_CODE } from '../core/catalog';
import { type QueensResult, countQueens, nQueens } from '../core/puzzles';
import { Board2D } from '../render/board2d';
import { COLORS, rgba } from '../render/palette';
import { clamp, fmt, h } from '../ui/dom';
import { Player } from '../ui/player';
import { createStage, currentTheme } from '../ui/stage';
import { codeView, hint, metric, panel, slider, timeline } from '../ui/widgets';
import type { Lab } from './types';

const INTERVAL = 256;
const KNOWN: Record<number, number> = { 4: 2, 5: 10, 6: 4, 7: 40, 8: 92, 9: 352, 10: 724, 11: 2680, 12: 14200 };

interface QState {
  cols: number[];
  trying: [number, number] | null;
  clash: { row: number; col: number; by: [number, number] } | null;
  removes: number;
  solved: boolean;
  line: number;
}

class QueensReplay {
  s: QState = { cols: [], trying: null, clash: null, removes: 0, solved: false, line: 0 };
  t = 0;
  private snaps: QState[] = [];
  constructor(readonly res: QueensResult) {
    this.snaps.push(this.copy(this.s));
    for (let i = 0; i < res.events.length; i++) {
      this.apply(i);
      this.t = i + 1;
      if (this.t % INTERVAL === 0) this.snaps.push(this.copy(this.s));
    }
    this.s = this.copy(this.snaps[0]);
    this.t = 0;
  }
  private copy(s: QState): QState {
    return { ...s, cols: [...s.cols], trying: s.trying && [...s.trying], clash: s.clash && { ...s.clash, by: [...s.clash.by] } };
  }
  private apply(i: number) {
    const e = this.res.events[i];
    const s = this.s;
    s.line = e.line;
    s.solved = false;
    switch (e.k) {
      case 'try':
        s.trying = [e.row, e.col];
        s.clash = null;
        break;
      case 'clash':
        s.clash = { row: e.row, col: e.col, by: e.by };
        break;
      case 'place':
        s.cols.push(e.col);
        s.trying = null;
        s.clash = null;
        break;
      case 'remove':
        s.cols.pop();
        s.removes++;
        s.trying = null;
        break;
      case 'solution':
        s.solved = true;
        break;
    }
  }
  seek(t: number) {
    t = clamp(Math.round(t), 0, this.res.events.length);
    if (t === this.t) return;
    if (t < this.t) {
      const k = Math.min(this.snaps.length - 1, Math.floor(t / INTERVAL));
      this.s = this.copy(this.snaps[k]);
      this.t = k * INTERVAL;
    }
    while (this.t < t) this.apply(this.t++);
  }
}

let n = 8;

export const queensLab: Lab = {
  id: 'queens',
  title: 'N-Queens',
  tagline: 'Backtracking, made visible',
  blurb: 'Place N queens so none attack each other. Watch the search try a square, hit a clash, back up and try again, then browse every solution.',
  accent: '#fbbf24',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l3 8h10l3-8-4.5 4L12 5l-3.5 7z"/><path d="M6 20h12"/></svg>',

  mount({ stage: stageEl, side, dock }) {
    const stage = createStage(stageEl, { label3D: '3D · Towers' });
    const { board2d } = stage;
    const player = new Player();
    const tl = timeline(player, { unit: 'event' });
    dock.append(tl.el);

    let res: QueensResult;
    let replay: QueensReplay;
    let total = 0;
    let towers: THREE.Sprite[] = [];
    let flash = 0;
    let galleryOn = false;

    const gallery = h('div.gallery');
    gallery.hidden = true;
    stageEl.append(gallery);

    const nSl = slider('Board size (N)', 4, 12, n, (v) => {
      n = v;
      recompute(true);
    }, (v) => `${v}×${v}`);
    const mPlaced = metric('Placed', COLORS.path);
    const mTried = metric('Tried');
    const mBack = metric('Backtracks', COLORS.danger);
    const mTotal = metric('Solutions', COLORS.start);
    const verdict = h('div.verdict');
    const code = codeView(QUEENS_CODE);
    const galleryBtn = h('button.btn', { type: 'button', onclick: () => toggleGallery() }, 'Show all solutions');

    side.append(
      panel('Setup', nSl.el, galleryBtn, hint('Queens are placed row by row. A square is skipped if any queen above shares its column or a diagonal.')),
      panel(
        'Why it is fast',
        h('p.blurb', null, 'Instead of testing all N^N placements, the search abandons a partial board the moment it breaks a rule. That prunes almost the whole tree.'),
        h('p.insight', null, 'For N = 8 there are 92 solutions (12 distinct up to rotation and reflection). The count explodes: 14,200 at N = 12.'),
      ),
      panel('Result', verdict, h('div.metrics', null, mPlaced.el, mTried.el, mBack.el, mTotal.el)),
      panel('Pseudocode', code.el),
    );

    function recompute(play: boolean) {
      res = nQueens(n, 1);
      replay = new QueensReplay(res);
      total = KNOWN[n] ?? countQueens(n);
      player.setLength(res.events.length);
      if (play) player.play();
      else player.seek(res.events.length);
      mTotal.set(total, `for N = ${n}`);
      mTried.set(res.nodes);
      verdict.className = 'verdict ok';
      verdict.textContent = res.solutions.length ? `First solution after ${fmt(res.nodes)} tries` : `No solution for N = ${n}`;
      stage.scene?.setBoard(makeBoard(n), board2d.theme);
      for (const t of towers) stage.scene?.dispose3(t);
      towers = [];
      if (galleryOn) renderGallery();
    }

    function toggleGallery() {
      galleryOn = !galleryOn;
      gallery.hidden = !galleryOn;
      galleryBtn.textContent = galleryOn ? 'Back to the search' : 'Show all solutions';
      if (galleryOn) renderGallery();
    }

    function renderGallery() {
      const all = nQueens(n, 120, 20_000_000).solutions;
      gallery.replaceChildren(
        h('div.gallery-head', null, `${fmt(total)} solutions for N = ${n}`, all.length < total ? h('small', null, ` · showing the first ${all.length}`) : null),
        h(
          'div.gallery-grid',
          { style: { '--cols': Math.max(4, Math.min(12, Math.round(Math.sqrt(all.length) * 1.4))) } },
          ...all.map((cols) => {
            const c = h('canvas', { width: 120, height: 120 });
            const b = new Board2D(c);
            b.theme = currentTheme();
            b.size = n;
            b.cell = Math.floor(120 / n);
            b.canvas.style.width = '100%';
            const ctx = c.getContext('2d')!;
            for (let r = 0; r < n; r++) {
              for (let k = 0; k < n; k++) {
                ctx.fillStyle = (r + k) % 2 ? b.theme.dark : b.theme.light;
                ctx.fillRect(k * b.cell, r * b.cell, b.cell, b.cell);
              }
            }
            ctx.fillStyle = COLORS.path;
            cols.forEach((col, r) => {
              ctx.beginPath();
              ctx.arc(col * b.cell + b.cell / 2, r * b.cell + b.cell / 2, b.cell * 0.34, 0, Math.PI * 2);
              ctx.fill();
            });
            return h('div.mini', null, c);
          }),
        ),
      );
    }

    function enter3D() {
      const sc = stage.ensureScene();
      sc.setBoard(makeBoard(n), board2d.theme);
      sc.onFrame = null;
    }
    stage.onMode((m) => m === '3d' && enter3D());
    stage.onTheme((t) => stage.scene?.setBoard(makeBoard(n), t));
    if (stage.mode === '3d') enter3D();

    const attacked = (cols: number[]) => {
      const set = new Set<number>();
      cols.forEach((c, r) => {
        for (let i = 0; i < n; i++) {
          set.add(r * n + i);
          set.add(i * n + c);
          const d = i - r;
          if (c + d >= 0 && c + d < n) set.add(i * n + c + d);
          if (c - d >= 0 && c - d < n) set.add(i * n + c - d);
        }
      });
      return set;
    };

    function draw2D() {
      const s = replay.s;
      board2d.fit(n);
      board2d.clear();
      board2d.drawBoard(makeBoard(n));
      const att = attacked(s.cols);
      att.forEach((cell) => board2d.fillCell(cell, rgba(COLORS.danger, 0.07), 0));
      if (s.cols.length < n) {
        const row = s.cols.length;
        for (let c = 0; c < n; c++) board2d.fillCell(row * n + c, 'rgba(56,189,248,.07)', 0);
      }
      if (s.clash) {
        const cell = s.clash.row * n + s.clash.col;
        board2d.fillCell(cell, rgba(COLORS.danger, 0.4), 1);
        const [ar, ac] = s.clash.by;
        if (ar >= 0) board2d.trail([cell, ar * n + ac], COLORS.danger, 3, 1);
        board2d.text(cell, '✕', COLORS.danger, 0.6);
      } else if (s.trying) {
        board2d.ring(s.trying[0] * n + s.trying[1], COLORS.open, 3, 0.2);
      }
      s.cols.forEach((c, r) => board2d.piece(r * n + c, 'wQ', 0.88, 0, 1, () => undefined));
      if (s.solved) {
        flash = 1;
      }
      if (flash > 0) {
        for (let r = 0; r < n; r++) board2d.glowCell(r * n + (s.cols[r] ?? 0), COLORS.start, flash);
        flash = Math.max(0, flash - 0.01);
      }
    }

    function draw3D() {
      const sc = stage.scene;
      if (!sc || sc.size !== n) return;
      const s = replay.s;
      const att = attacked(s.cols);
      for (let i = 0; i < n * n; i++) {
        if (att.has(i)) sc.setCellHex(i, 0.04, COLORS.danger, 0.55);
        else sc.restCell(i);
      }
      if (s.clash) sc.setCellHex(s.clash.row * n + s.clash.col, 0.5, COLORS.danger, 1.7);
      else if (s.trying) sc.setCellHex(s.trying[0] * n + s.trying[1], 0.4, COLORS.open, 1.6);
      s.cols.forEach((c, r) => sc.setCellHex(r * n + c, 0.35, s.solved ? COLORS.start : COLORS.path, s.solved ? 1.8 : 1.15));
      while (towers.length < n) towers.push(sc.billboard('wQ', 1.2));
      towers.forEach((t, r) => {
        const c = s.cols[r];
        t.visible = c !== undefined;
        if (c !== undefined) {
          const target = sc.cellPos(r * n + c, sc.topOf(r * n + c) + 0.1);
          if (t.position.lengthSq() === 0) t.position.copy(target).setY(target.y + 2.5);
          t.position.lerp(target, 0.25);
        } else t.position.set(0, 0, 0);
      });
    }

    stage.loop((dt) => {
      player.tick(dt);
      if (!replay) return;
      replay.seek(player.t);
      code.set(replay.s.line);
      mPlaced.set(replay.s.cols.length, `of ${n}`);
      mBack.set(replay.s.removes);
      if (galleryOn) return;
      if (stage.mode === '2d') draw2D();
      else draw3D();
    });

    recompute(true);
    void squareName;
    return () => {
      tl.dispose();
      stage.dispose();
    };
  },
};
