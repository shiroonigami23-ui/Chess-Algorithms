import { PIECES, Tile, squareName } from '../core/board';
import { ALGOS, ALGO_ORDER } from '../core/catalog';
import { type AlgoId, type PathResult, runSearch } from '../core/pathfinding';
import { PathReplay, Status } from '../core/replay';
import { Board2D } from '../render/board2d';
import { COLORS, mix, rgba } from '../render/palette';
import { clamp, fmt, h } from '../ui/dom';
import { Player } from '../ui/player';
import { currentTheme } from '../ui/stage';
import { clearBoard, moveEndpoint, paint, randomise, resize, setPiece, setup, subscribe } from '../ui/store';
import { hint, icon, panel, pieceRow, seg, slider, timeline } from '../ui/widgets';
import type { Lab } from './types';

interface Racer {
  id: AlgoId;
  result: PathResult;
  replay: PathReplay;
  closeIdx: number[];
  /** time (in expansions) at which the racer has revealed its whole path */
  total: number;
  board: Board2D;
  card: HTMLElement;
  stat: HTMLElement;
  badge: HTMLElement;
}

const PATH_RATE = 0.35; // path cells revealed per expansion tick

let chosen = new Set<AlgoId>(['bfs', 'dfs', 'dijkstra', 'astar', 'greedy', 'bibfs']);

export const raceLab: Lab = {
  id: 'race',
  title: 'Race',
  tagline: 'Who finds it first?',
  blurb: 'Run several algorithms side by side on the same board. They advance in lockstep by squares expanded, so the winner is the one that does the least work.',
  accent: '#f472b6',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',

  mount({ stage, side, dock }) {
    stage.classList.add('stage', 'race');
    const grid = h('div.race-grid');
    stage.append(grid);
    const player = new Player();
    const tl = timeline(player, { label: () => `${fmt(Math.round(player.t))} / ${fmt(Math.round(player.length))} expansions` });
    dock.append(tl.el);

    let racers: Racer[] = [];
    let tool: 'wall' | 'mud' | 'erase' | 'start' | 'goal' = 'wall';
    let drag: 'paint' | 'start' | 'goal' | null = null;
    let paintTile: number = Tile.Wall;

    const pieces = pieceRow(setup.piece, (p) => setPiece(p));
    const sizeSl = slider('Board size', 4, 16, Math.min(setup.board.size, 12), (v) => resize(v), (v) => `${v}×${v}`);
    const toolSeg = seg(
      [
        { value: 'wall' as const, label: 'Wall' },
        { value: 'mud' as const, label: 'Mud' },
        { value: 'erase' as const, label: 'Erase' },
        { value: 'start' as const, label: 'Start' },
        { value: 'goal' as const, label: 'Goal' },
      ],
      tool,
      (t) => (tool = t),
      'mini',
    );
    const picks = h('div.algo-picks');
    const board = h('div.leaderboard');
    const refreshPicks = () => {
      picks.replaceChildren(
        ...ALGO_ORDER.map((id) =>
          h('button.pick', {
            type: 'button',
            class: chosen.has(id) ? 'on' : '',
            style: { '--c': ALGOS[id].color },
            title: ALGOS[id].name,
            onclick: () => {
              if (chosen.has(id) && chosen.size > 2) chosen.delete(id);
              else chosen.add(id);
              refreshPicks();
              rebuild(true);
            },
          }, h('i'), ALGOS[id].short),
        ),
      );
    };
    refreshPicks();

    side.append(
      panel('Piece', pieces.el),
      panel(
        'Board',
        sizeSl.el,
        toolSeg.el,
        h('div.row', null,
          h('button.btn', { type: 'button', html: `${icon.dice}<span>Random</span>`, onclick: () => randomise() }),
          h('button.btn', { type: 'button', html: `${icon.eraser}<span>Clear</span>`, onclick: () => clearBoard() }),
        ),
        hint('Click or drag on any board to edit. All racers update together.'),
      ),
      panel('Contenders', picks),
      panel('Leaderboard', board),
    );

    function rebuild(play: boolean) {
      grid.replaceChildren();
      const ids = ALGO_ORDER.filter((id) => chosen.has(id));
      grid.dataset.count = String(ids.length);
      racers = ids.map((id) => {
        const input = { board: setup.board, piece: setup.piece, start: setup.start, goal: setup.goal };
        const result = runSearch(id, input);
        const replay = new PathReplay(result, setup.board.tiles.length);
        const closeIdx: number[] = [];
        result.events.forEach((e, i) => e.k === 'close' && closeIdx.push(i));
        const first = result.events.length - result.path.length;
        const total = result.expanded + result.path.length / PATH_RATE;
        const canvas = h('canvas');
        const b = new Board2D(canvas);
        const badge = h('span.badge', null, '');
        const stat = h('div.stat');
        const card = h(
          'div.racer',
          { style: { '--c': ALGOS[id].color } },
          h('header', null, h('i'), h('b', null, ALGOS[id].name), badge),
          h('div.cv', null, canvas),
          stat,
        );
        void first;
        grid.append(card);
        const pointer = (e: PointerEvent, down: boolean) => {
          const cell = b.hit(e);
          if (cell < 0) return;
          if (down) {
            if (cell === setup.start) drag = 'start';
            else if (cell === setup.goal) drag = 'goal';
            else if (tool === 'start' || tool === 'goal') return void moveEndpoint(tool, cell);
            else {
              drag = 'paint';
              paintTile = tool === 'wall' ? Tile.Wall : tool === 'mud' ? Tile.Mud : Tile.Empty;
              if (setup.board.tiles[cell] === paintTile && paintTile !== Tile.Empty) paintTile = Tile.Empty;
            }
          }
          if (drag === 'paint') paint(cell, paintTile);
          else if (drag) moveEndpoint(drag, cell);
        };
        canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointer(e, true); });
        canvas.addEventListener('pointermove', (e) => drag && pointer(e, false));
        canvas.addEventListener('pointerup', () => (drag = null));
        return { id, result, replay, closeIdx, total, board: b, card, stat, badge };
      });
      const longest = Math.max(...racers.map((r) => r.total));
      player.setLength(Math.ceil(longest) + 2);
      player.baseRate = 6;
      if (play) player.play();
      else player.seek(player.length);
      renderBoard(true);
    }

    function eventsAt(r: Racer, T: number): number {
      const { result } = r;
      const nonPath = result.events.length - result.path.length;
      if (T < result.expanded) return T <= 0 ? 0 : (r.closeIdx[Math.floor(T) - 1] ?? 0) + 1;
      const into = (T - result.expanded) * PATH_RATE;
      return nonPath + clamp(Math.floor(into) + (into > 0 ? 1 : 0), 0, result.path.length);
    }

    function finishTime(r: Racer) {
      return r.result.expanded + (r.result.path.length ? 0 : 0);
    }

    function renderBoard(force = false) {
      const order = [...racers].sort((a, b) => (b.result.found ? 1 : 0) - (a.result.found ? 1 : 0) || finishTime(a) - finishTime(b));
      const T = player.t;
      const rows: HTMLElement[] = [];
      order.forEach((r, rank) => {
        const done = T >= finishTime(r);
        r.card.classList.toggle('done', done);
        r.card.classList.toggle('winner', done && rank === 0 && r.result.found);
        r.badge.textContent = done ? (r.result.found ? ['1st', '2nd', '3rd'][rank] ?? `${rank + 1}th` : 'no path') : '';
        const exp = Math.min(r.result.expanded, Math.floor(T));
        r.stat.innerHTML = `<span><b>${fmt(exp)}</b> expanded</span><span><b>${r.result.found ? r.result.moves : '–'}</b> moves</span><span><b>${r.result.found ? r.result.cost : '–'}</b> cost</span>`;
        const max = Math.max(...racers.map((x) => x.result.expanded), 1);
        rows.push(
          h('div.lrow', { style: { '--c': ALGOS[r.id].color, '--w': `${(r.result.expanded / max) * 100}%` } },
            h('em', null, String(rank + 1)),
            h('span', null, ALGOS[r.id].short),
            h('div.bar', null, h('i')),
            h('b', null, fmt(r.result.expanded)),
          ),
        );
      });
      if (force || rows.length !== board.childElementCount || Math.floor(T * 4) % 4 === 0) board.replaceChildren(...rows);
    }

    const unsub = subscribe(() => {
      pieces.set(setup.piece);
      sizeSl.set(setup.board.size);
      rebuild(false);
    });

    let lastStamp = '';
    const loop = () => {
      requestAnimationFrame(loop);
    };
    void loop;

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      player.tick(dt);
      const stamp = `${Math.round(player.t * 10)}|${setup.board.size}|${racers.length}`;
      for (const r of racers) {
        r.replay.seek(eventsAt(r, player.t));
        drawRacer(r);
      }
      if (stamp !== lastStamp) {
        lastStamp = stamp;
        renderBoard();
      }
    };
    raf = requestAnimationFrame(frame);

    function drawRacer(r: Racer) {
      const b = r.board;
      b.theme = currentTheme();
      b.fit(setup.board.size, false);
      b.clear();
      b.drawBoard(setup.board);
      const n = setup.board.tiles.length;
      const col = ALGOS[r.id].color;
      for (let i = 0; i < n; i++) {
        const st = r.replay.status[i];
        if (st === Status.Unseen) continue;
        const k = clamp(r.replay.g[i] / r.replay.maxG, 0, 1);
        if (st === Status.Open) b.fillCell(i, rgba(r.replay.side[i] === 1 ? '#f472b6' : COLORS.open, 0.35), 1);
        else b.fillCell(i, mix(col, '#7c3aed', k * 0.7).replace('rgb', 'rgba').replace(')', ',.4)'), 1);
      }
      const pe = r.result.path.length;
      if (pe > 1) {
        const first = r.result.events.length - pe;
        const prog = clamp((r.replay.t - first) / Math.max(1, pe - 1), 0, 1);
        if (prog > 0) b.trail(r.result.path, COLORS.path, Math.max(2, b.cell * 0.09), prog * (pe - 1));
      }
      b.ring(setup.goal, COLORS.goal, 2, 0);
      b.ring(setup.start, COLORS.start, 2, 0);
      b.piece(setup.start, PIECES[setup.piece].sprite, 0.8);
      void squareName;
    }

    rebuild(true);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      tl.dispose();
      stage.replaceChildren();
      stage.classList.remove('stage', 'race');
    };
  },
};
