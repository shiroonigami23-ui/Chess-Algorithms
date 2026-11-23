import * as THREE from 'three';
import { PIECES, Tile } from '../core/board';
import { type FieldResult, distanceField } from '../core/puzzles';
import { COLORS } from '../render/palette';
import { clamp, h } from '../ui/dom';
import { Player } from '../ui/player';
import { createStage } from '../ui/stage';
import { clearBoard, moveEndpoint, paint, randomise, resize, setPiece, setup, subscribe } from '../ui/store';
import { hint, icon, metric, panel, pieceRow, slider, timeline } from '../ui/widgets';
import type { Lab } from './types';

const RAMP = ['#7c5cff', '#38bdf8', '#34d399', '#fbbf24', '#fb7185'].map((c) => new THREE.Color(c));
const SUBSTEPS = 14;

function ramp(f: number, out = new THREE.Color()) {
  const x = clamp(f, 0, 1) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return out.copy(RAMP[i]).lerp(RAMP[i + 1], x - i);
}

const FACTS: Record<string, string> = {
  knight: 'On an empty 8×8 board a knight reaches every square within 6 moves. Colour flips on every jump, so the wave alternates light and dark squares.',
  king: 'The king’s wave is a perfect square ring: distance is the Chebyshev metric max(|Δr|, |Δc|).',
  rook: 'Any square is at most 2 rook moves away, and the wave is a plus-shaped cross that fills in on move 2. Walls matter a lot here.',
  bishop: 'A bishop is locked to one colour, so exactly half the board is unreachable from the start square, however long you wait.',
  queen: 'Rook + bishop: everything is within 2 moves on an open board. Place walls to see how fragile that is.',
  pawn: 'This pawn only marches up the board, so squares behind it (or off to the side by more than it can climb) are never reachable.',
};

export const fieldLab: Lab = {
  id: 'field',
  title: 'Reach',
  tagline: 'Distance fields & wavefronts',
  blurb: 'Pick any piece and any square and watch the wavefront of "moves needed" spread. The 3D view turns it into a terrain you can orbit.',
  accent: '#34d399',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6" opacity=".7"/><circle cx="12" cy="12" r="10" opacity=".4"/></svg>',

  mount({ stage: stageEl, side, dock }) {
    const stage = createStage(stageEl, { label3D: '3D · Terrain' });
    const { board2d } = stage;
    const player = new Player();
    const tl = timeline(player, { label: () => `distance ${(player.t / SUBSTEPS).toFixed(1)}` });
    dock.append(tl.el);

    let field: FieldResult;
    let tool: 'source' | 'wall' = 'source';
    let showNums = true;
    let hover = -1;
    let painting = false;
    let paintTo: number = Tile.Wall;

    const pieces = pieceRow(setup.piece, (p) => setPiece(p));
    const sizeSl = slider('Board size', 4, 16, setup.board.size, (v) => resize(v), (v) => `${v}×${v}`);
    const mReach = metric('Reachable', COLORS.start);
    const mMax = metric('Furthest', COLORS.path);
    const mUnreach = metric('Unreachable', COLORS.danger);
    const mAvg = metric('Average');
    const fact = h('p.insight');
    const toolBtns = {
      source: h('button.btn.on', { type: 'button', onclick: () => setTool('source') }, 'Move source'),
      wall: h('button.btn', { type: 'button', onclick: () => setTool('wall') }, 'Draw walls'),
    };
    const setTool = (t: 'source' | 'wall') => {
      tool = t;
      toolBtns.source.classList.toggle('on', t === 'source');
      toolBtns.wall.classList.toggle('on', t === 'wall');
    };
    const legend = h('div.legend', null, h('span', null, '0'), h('i'), h('span', null, 'far'));
    legend.querySelector('i')!.setAttribute(
      'style',
      `background:linear-gradient(90deg,${RAMP.map((c) => `#${c.getHexString()}`).join(',')})`,
    );

    side.append(
      panel('Piece', pieces.el),
      panel(
        'Board',
        sizeSl.el,
        h('div.row', null, toolBtns.source, toolBtns.wall),
        h('div.row', null,
          h('button.btn', { type: 'button', html: `${icon.dice}<span>Random</span>`, onclick: () => randomise(0.18, 0) }),
          h('button.btn', { type: 'button', html: `${icon.eraser}<span>Clear</span>`, onclick: () => clearBoard() }),
        ),
        h('label.check', null, h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => (showNums = (e.target as HTMLInputElement).checked) }), 'Distance numbers'),
        hint('Click a square to move the source. Switch to "Draw walls" to carve obstacles.'),
      ),
      panel('What to notice', fact),
      panel('Field', legend, h('div.metrics', null, mReach.el, mMax.el, mUnreach.el, mAvg.el)),
    );

    function recompute(play: boolean) {
      field = distanceField(setup.board, setup.piece, setup.start);
      player.setLength((field.maxDist + 1) * SUBSTEPS);
      player.baseRate = 16;
      if (play) player.play();
      else player.seek(player.length);
      const n = setup.board.tiles.length;
      const open = setup.board.tiles.reduce((a, t) => a + (t === Tile.Wall ? 0 : 1), 0);
      let sum = 0;
      for (const i of field.order) sum += field.dist[i];
      mReach.set(field.reachable, `of ${open} open`);
      mMax.set(field.maxDist, 'moves');
      mUnreach.set(open - field.reachable, n - open ? `${n - open} walls` : '');
      mAvg.set((sum / Math.max(1, field.reachable)).toFixed(2));
      fact.textContent = FACTS[setup.piece];
    }

    const unsub = subscribe(() => {
      pieces.set(setup.piece);
      sizeSl.set(setup.board.size);
      stage.scene?.setBoard(setup.board, board2d.theme);
      recompute(false);
    });

    function enter3D() {
      const sc = stage.ensureScene();
      sc.setBoard(setup.board, board2d.theme);
      sc.onFrame = null;
    }
    stage.onMode((m) => m === '3d' && enter3D());
    stage.onTheme((t) => stage.scene?.setBoard(setup.board, t));
    if (stage.mode === '3d') enter3D();

    const click = (cell: number, down: boolean) => {
      if (cell < 0) return;
      if (tool === 'source') {
        moveEndpoint('start', cell === setup.goal ? setup.start : cell);
        return;
      }
      if (down) {
        painting = true;
        paintTo = setup.board.tiles[cell] === Tile.Wall ? Tile.Empty : Tile.Wall;
      }
      if (painting) paint(cell, paintTo);
    };
    board2d.canvas.addEventListener('pointerdown', (e) => {
      board2d.canvas.setPointerCapture(e.pointerId);
      click(board2d.hit(e), true);
    });
    board2d.canvas.addEventListener('pointermove', (e) => {
      hover = board2d.hit(e);
      if (painting || (tool === 'source' && e.buttons === 1)) click(hover, false);
    });
    board2d.canvas.addEventListener('pointerup', () => (painting = false));
    board2d.canvas.addEventListener('pointerleave', () => (hover = -1));
    const l3 = stageEl.querySelector('.l3d') as HTMLElement;
    let down: { x: number; y: number } | null = null;
    l3.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    l3.addEventListener('pointerup', (e) => {
      if (down && stage.scene && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        click(stage.scene.pick(e), true);
        painting = false;
      }
      down = null;
    });

    const wave = () => player.t / SUBSTEPS;

    function draw2D() {
      board2d.fit(setup.board.size);
      board2d.clear();
      board2d.drawBoard(setup.board);
      const n = setup.board.tiles.length;
      const w = wave();
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const d = field.dist[i];
        if (d < 0 || setup.board.tiles[i] === Tile.Wall) continue;
        if (d > w) continue;
        const k = clamp(w - d, 0, 1);
        ramp(d / Math.max(1, field.maxDist), col);
        board2d.fillCell(i, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${0.18 + 0.62 * k})`, 1);
        if (k < 1) board2d.glowCell(i, `#${col.getHexString()}`, 1 - k);
        if (showNums && board2d.cell >= 30) board2d.text(i, String(d), `rgba(255,255,255,${0.35 + k * 0.5})`, 0.34);
      }
      board2d.glowCell(setup.start, COLORS.start, 0.9);
      board2d.ring(setup.start, COLORS.start, 2.5, (Math.sin(performance.now() / 300) + 1) / 2);
      board2d.piece(setup.start, PIECES[setup.piece].sprite, 0.86);
      if (hover >= 0) {
        board2d.ring(hover, 'rgba(255,255,255,.5)', 1.5, 0);
        const d = field.dist[hover];
        stage.overlay.dataset.hover = setup.board.tiles[hover] === Tile.Wall ? 'wall' : d < 0 ? 'unreachable' : `${d} move${d === 1 ? '' : 's'} away`;
      } else stage.overlay.dataset.hover = '';
    }

    let pieceSpr: THREE.Sprite | null = null;
    let pieceKey = '';
    function draw3D() {
      const sc = stage.scene;
      if (!sc || sc.size !== setup.board.size) return;
      const n = setup.board.tiles.length;
      const w = wave();
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const d = field.dist[i];
        if (setup.board.tiles[i] === Tile.Wall) continue;
        if (d < 0 || d > w) {
          sc.restCell(i);
          continue;
        }
        const k = clamp(w - d, 0, 1);
        ramp(d / Math.max(1, field.maxDist), col);
        const lift = 0.1 + (d / Math.max(1, field.maxDist)) * 1.7 * (0.4 + 0.6 * k);
        const g = 0.95 + (1 - k) * 0.9;
        sc.setCell(i, lift, [col.r * g, col.g * g, col.b * g]);
      }
      if (!pieceSpr || pieceKey !== setup.piece) {
        sc.dispose3(pieceSpr);
        pieceSpr = sc.billboard(PIECES[setup.piece].sprite, 1.2);
        pieceKey = setup.piece;
      }
      const target = sc.cellPos(setup.start, sc.topOf(setup.start) + 0.15 + 0.08 * Math.sin(performance.now() / 400));
      pieceSpr.position.lerp(target, 0.25);
    }

    stage.loop((dt) => {
      player.tick(dt);
      if (!field) return;
      if (stage.mode === '2d') draw2D();
      else draw3D();
    });

    recompute(true);
    return () => {
      unsub();
      tl.dispose();
      stage.dispose();
    };
  },
};
