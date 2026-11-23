import * as THREE from 'three';
import { PIECES, makeBoard, neighbours, squareName } from '../core/board';
import { TOUR_CODE } from '../core/catalog';
import { type TourResult, knightsTour } from '../core/puzzles';
import { COLORS, rgba } from '../render/palette';
import { clamp, fmt, h } from '../ui/dom';
import { Player } from '../ui/player';
import { createStage } from '../ui/stage';
import { hint, codeView, metric, panel, slider, timeline } from '../ui/widgets';
import type { Lab } from './types';

const INTERVAL = 256;

/** Scrubbable view of a tour trace: the current path stack after `t` events. */
class TourReplay {
  stack: number[] = [];
  backtracks = 0;
  line = 0;
  lastUndo = -1;
  t = 0;
  private snaps: { stack: number[]; backtracks: number; line: number; lastUndo: number }[] = [];

  constructor(readonly res: TourResult) {
    this.snaps.push({ stack: [], backtracks: 0, line: 0, lastUndo: -1 });
    for (let i = 0; i < res.events.length; i++) {
      this.apply(i);
      this.t = i + 1;
      if (this.t % INTERVAL === 0) this.snaps.push({ stack: [...this.stack], backtracks: this.backtracks, line: this.line, lastUndo: this.lastUndo });
    }
    this.reset();
  }

  private reset() {
    this.stack = [];
    this.backtracks = 0;
    this.line = 0;
    this.lastUndo = -1;
    this.t = 0;
  }

  private apply(i: number) {
    const e = this.res.events[i];
    this.line = e.line;
    if (e.k === 'place') {
      this.stack.push(e.cell);
      this.lastUndo = -1;
    } else {
      this.stack.pop();
      this.backtracks++;
      this.lastUndo = e.cell;
    }
  }

  seek(t: number) {
    t = clamp(Math.round(t), 0, this.res.events.length);
    if (t === this.t) return;
    if (t < this.t) {
      const k = Math.min(this.snaps.length - 1, Math.floor(t / INTERVAL));
      const s = this.snaps[k];
      this.stack = [...s.stack];
      this.backtracks = s.backtracks;
      this.line = s.line;
      this.lastUndo = s.lastUndo;
      this.t = k * INTERVAL;
    }
    while (this.t < t) this.apply(this.t++);
  }
}

function stepColour(k: number, n: number, out = new THREE.Color()) {
  return out.setHSL((190 + (k / Math.max(1, n - 1)) * 150) / 360, 0.85, 0.56);
}

let size = 8;
let start = 0;

export const tourLab: Lab = {
  id: 'tour',
  title: "Knight's Tour",
  tagline: 'Every square, exactly once',
  blurb: "Watch a knight visit all squares of the board with Warnsdorff's rule and backtracking. Pick any start square and any board from 5×5 to 12×12.",
  accent: '#a78bfa',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M8 20c0-4 0-6-2-8l5-8c4 0 7 3 7 7 0 3-2 4-4 5 0 2 1 3 1 4"/><circle cx="12" cy="8" r=".6"/></svg>',

  mount({ stage: stageEl, side, dock }) {
    const stage = createStage(stageEl, { label3D: '3D · Ascent' });
    const { board2d } = stage;
    const player = new Player();
    const tl = timeline(player, { unit: 'move' });
    dock.append(tl.el);

    let res: TourResult;
    let replay: TourReplay;
    let showDegrees = true;
    let tube: THREE.Mesh | null = null;
    let tubeSig = '';
    let knight: THREE.Sprite | null = null;
    let from3 = new THREE.Vector3();
    let hover = -1;

    const sizeSl = slider('Board size', 5, 12, size, (v) => {
      size = v;
      start = Math.min(start, v * v - 1);
      recompute(true);
    }, (v) => `${v}×${v}`);
    const mSteps = metric('Visited', COLORS.start);
    const mBack = metric('Backtracks', COLORS.danger);
    const mEvents = metric('Events');
    const mClosed = metric('Closed?');
    const verdict = h('div.verdict');
    const code = codeView(TOUR_CODE);
    const degToggle = h('label.check', null, h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => (showDegrees = (e.target as HTMLInputElement).checked) }), 'Show onward-move counts');

    side.append(
      panel(
        'Setup',
        sizeSl.el,
        h('div.row', null, h('button.btn', { type: 'button', onclick: () => { start = (Math.random() * size * size) | 0; recompute(true); } }, 'Random start')),
        degToggle,
        hint('Click a square to choose where the knight begins.'),
      ),
      panel(
        "Warnsdorff's rule",
        h('p.blurb', null, 'From each square, jump to the unvisited square that has the fewest onward moves. It hugs the edges first and leaves the easy centre squares for last.'),
        h('p.insight', null, 'Pure Warnsdorff almost never gets stuck on boards up to ~50×50; backtracking is the safety net, and the red flashes show it being used.'),
      ),
      panel('Result', verdict, h('div.metrics', null, mSteps.el, mBack.el, mEvents.el, mClosed.el)),
      panel('Pseudocode', code.el),
    );

    function recompute(play: boolean) {
      res = knightsTour(size, start);
      replay = new TourReplay(res);
      player.setLength(res.events.length);
      if (play) player.play();
      else player.seek(res.events.length);
      const n = size * size;
      mSteps.set(res.order.length, `of ${n}`);
      mBack.set(res.backtracks);
      mEvents.set(res.events.length);
      mClosed.set(res.complete ? (res.closed ? 'Yes ✓' : 'Open') : '–', res.closed ? 'returns to start' : '');
      verdict.className = `verdict ${res.complete ? 'ok' : 'bad'}`;
      verdict.textContent = res.complete
        ? `Tour found from ${squareName(size, start)}${res.closed ? ' · closed' : ''}`
        : `No tour from ${squareName(size, start)} on ${size}×${size}`;
      stage.scene?.setBoard(makeBoard(size), board2d.theme);
      tubeSig = '';
    }

    function enter3D() {
      const sc = stage.ensureScene();
      sc.setBoard(makeBoard(size), board2d.theme);
      if (!knight) knight = sc.billboard(PIECES.knight.sprite, 1.25);
      sc.onFrame = null;
    }
    stage.onMode((m) => m === '3d' && enter3D());
    stage.onTheme((t) => stage.scene?.setBoard(makeBoard(size), t));
    if (stage.mode === '3d') enter3D();

    board2d.canvas.addEventListener('pointermove', (e) => (hover = board2d.hit(e)));
    board2d.canvas.addEventListener('pointerleave', () => (hover = -1));
    board2d.canvas.addEventListener('pointerdown', (e) => {
      const c = board2d.hit(e);
      if (c >= 0) {
        start = c;
        recompute(true);
      }
    });
    const l3 = stageEl.querySelector('.l3d') as HTMLElement;
    let down: { x: number; y: number } | null = null;
    l3.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    l3.addEventListener('pointerup', (e) => {
      if (down && stage.scene && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const c = stage.scene.pick(e);
        if (c >= 0) {
          start = c;
          recompute(true);
        }
      }
      down = null;
    });

    const board = () => makeBoard(size);
    const degree = (cell: number, visited: Set<number>) => neighbours(board(), 'knight', cell).filter((v) => !visited.has(v)).length;

    function draw2D() {
      board2d.fit(size);
      board2d.clear();
      const b = board();
      board2d.drawBoard(b);
      const n = size * size;
      const stack = replay.stack;
      const visited = new Set(stack);
      const col = new THREE.Color();
      stack.forEach((c, k) => {
        stepColour(k, n, col);
        board2d.fillCell(c, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},.3)`, 1);
      });
      if (stack.length > 1) {
        for (let k = 1; k < stack.length; k++) {
          stepColour(k, n, col);
          board2d.trail([stack[k - 1], stack[k]], `#${col.getHexString()}`, Math.max(2, board2d.cell * 0.06), 1, false);
        }
      }
      if (board2d.cell >= 26) stack.forEach((c, k) => board2d.text(c, String(k + 1), 'rgba(255,255,255,.55)', 0.26));
      const cur = stack[stack.length - 1] ?? start;
      if (showDegrees && stack.length && !player.done) {
        const opts = neighbours(b, 'knight', cur).filter((v) => !visited.has(v));
        const degs = opts.map((v) => degree(v, visited));
        const best = Math.min(...degs);
        opts.forEach((v, i) => {
          board2d.ring(v, degs[i] === best ? COLORS.start : 'rgba(255,255,255,.35)', degs[i] === best ? 2.5 : 1.2, 0);
          board2d.text(v, String(degs[i]), degs[i] === best ? COLORS.start : 'rgba(255,255,255,.7)', 0.34);
        });
      }
      if (replay.lastUndo >= 0) {
        board2d.glowCell(replay.lastUndo, COLORS.danger, 1.2);
        board2d.ring(replay.lastUndo, COLORS.danger, 3, 0.4);
      }
      board2d.glowCell(start, COLORS.start, 0.7);
      board2d.piece(cur, PIECES.knight.sprite, 0.86);
      if (res.closed && player.done && stack.length === n) {
        board2d.trail([stack[n - 1], stack[0]], rgba(COLORS.path, 0.9), Math.max(2, board2d.cell * 0.05), 1);
      }
      if (hover >= 0) {
        board2d.ring(hover, 'rgba(255,255,255,.5)', 1.5, 0);
        stage.overlay.dataset.hover = `${squareName(size, hover)} · click to start here`;
      } else stage.overlay.dataset.hover = '';
    }

    function draw3D() {
      const sc = stage.scene;
      if (!sc || sc.size !== size) return;
      const n = size * size;
      const stack = replay.stack;
      const col = new THREE.Color();
      const inStack = new Map<number, number>();
      stack.forEach((c, k) => inStack.set(c, k));
      for (let i = 0; i < n; i++) {
        const k = inStack.get(i);
        if (k === undefined) sc.restCell(i);
        else {
          stepColour(k, n, col);
          const top = k === stack.length - 1;
          sc.setCell(i, 0.12 + (k / n) * 2.0, [col.r * (top ? 1.9 : 0.85), col.g * (top ? 1.9 : 0.85), col.b * (top ? 1.9 : 0.85)]);
        }
      }
      if (replay.lastUndo >= 0) sc.setCellHex(replay.lastUndo, 0.4, COLORS.danger, 1.6);
      // path tube
      const sig = stack.join(',');
      if (sig !== tubeSig) {
        tubeSig = sig;
        sc.dispose3(tube);
        tube = null;
        if (stack.length > 1) {
          const pts = stack.map((c) => sc.cellPos(c, sc.topOf(c) + 0.25));
          const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
          const geo = new THREE.TubeGeometry(curve, Math.max(6, pts.length * 5), 0.035, 8, false);
          tube = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.path).multiplyScalar(1.4) }));
          sc.world.add(tube);
        }
      }
      if (knight) {
        const cur = stack[stack.length - 1] ?? start;
        const target = sc.cellPos(cur, sc.topOf(cur) + 0.15);
        const dist = knight.position.distanceTo(target);
        if (dist > 2.5) from3.copy(knight.position);
        knight.position.lerp(target, 0.25);
        knight.position.y += Math.sin(clamp(1 - dist / 2.5, 0, 1) * Math.PI) * 0.22;
      }
    }

    let tb = 0;
    stage.loop((dt) => {
      player.tick(dt);
      if (!replay) return;
      replay.seek(player.t);
      code.set(replay.line);
      mSteps.set(replay.stack.length, `of ${size * size}`);
      mBack.set(replay.backtracks);
      tb += dt;
      if (stage.mode === '2d') draw2D();
      else draw3D();
    });

    recompute(true);
    return () => {
      tl.dispose();
      stage.dispose();
      void fmt;
    };
  },
};
