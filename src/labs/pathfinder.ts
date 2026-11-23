import * as THREE from 'three';
import { PIECES, Tile, squareName } from '../core/board';
import { ALGOS, ALGO_ORDER } from '../core/catalog';
import { type AlgoId, type PathResult, dijkstra, runSearch } from '../core/pathfinding';
import { PathReplay, Status } from '../core/replay';
import { COLORS, mix, rgba } from '../render/palette';
import { Scene3D } from '../render/scene3d';
import { clamp, fmt, h } from '../ui/dom';
import { Player } from '../ui/player';
import { createStage } from '../ui/stage';
import { moveEndpoint, paint, randomise, clearBoard, resize, setPiece, setup, subscribe } from '../ui/store';
import { codeView, hint, icon, metric, panel, pieceRow, seg, slider, timeline } from '../ui/widgets';
import type { Lab } from './types';

type Tool = 'wall' | 'mud' | 'erase' | 'start' | 'goal';
let algo: AlgoId = 'astar';

export const pathfinderLab: Lab = {
  id: 'pathfinder',
  title: 'Pathfinder',
  tagline: 'Watch one algorithm think',
  blurb: 'Draw walls and mud, drag the start and goal, then replay any of 7 search algorithms frame by frame, in 2D or as a rising space-time landscape.',
  accent: '#38bdf8',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h4a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h8"/></svg>',

  mount({ stage: stageEl, side, dock }) {
    const stage = createStage(stageEl);
    const { board2d } = stage;
    const player = new Player();
    const tl = timeline(player, { unit: 'event' });
    dock.append(tl.el);

    let result: PathResult;
    let replay: PathReplay;
    let optimalCost = 0;
    let tool: Tool = 'wall';
    let hover = -1;
    let drag: 'paint' | 'start' | 'goal' | null = null;
    let paintTile: number = Tile.Wall;
    let showTree = true;
    let showNumbers = true;
    let tube: THREE.Mesh | null = null;
    let tubeKey = '';
    let beaconS: THREE.Group | null = null;
    let beaconG: THREE.Group | null = null;
    let pieceSpr: THREE.Sprite | null = null;
    let pieceKey = '';

    // ---------------------------------------------------------------- side panel
    const pieces = pieceRow(setup.piece, (p) => setPiece(p));
    const pieceNote = h('p.hint');
    const sizeSl = slider('Board size', 4, 16, setup.board.size, (v) => resize(v), (v) => `${v}×${v}`);
    const toolSeg = seg<Tool>(
      [
        { value: 'wall', label: 'Wall', title: 'Blocks sliders; knights jump over it' },
        { value: 'mud', label: 'Mud', title: 'Entering costs 5 instead of 1' },
        { value: 'erase', label: 'Erase' },
        { value: 'start', label: 'Start' },
        { value: 'goal', label: 'Goal' },
      ],
      tool,
      (t) => (tool = t),
      'mini',
    );
    const algoSeg = seg<AlgoId>(
      ALGO_ORDER.map((id) => ({ value: id, label: ALGOS[id].short, color: ALGOS[id].color, title: ALGOS[id].name })),
      algo,
      (a) => {
        algo = a;
        refresh(true);
      },
      'algos',
    );
    const algoName = h('h4');
    const algoBlurb = h('p.blurb');
    const algoInsight = h('p.insight');
    const algoTags = h('div.tags');
    const treeToggle = h('label.check', null, h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => (showTree = (e.target as HTMLInputElement).checked) }), 'Parent arrows');
    const numToggle = h('label.check', null, h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => (showNumbers = (e.target as HTMLInputElement).checked) }), 'Cost numbers');
    const m = {
      moves: metric('Moves', COLORS.path),
      cost: metric('Cost'),
      expanded: metric('Expanded', COLORS.closed),
      generated: metric('Generated', COLORS.open),
      frontier: metric('Frontier'),
      time: metric('Compute'),
    };
    const code = codeView(ALGOS[algo].code);
    const verdict = h('div.verdict');

    side.append(
      panel('Piece', pieces.el, pieceNote),
      panel(
        'Board',
        sizeSl.el,
        toolSeg.el,
        h('div.row', null,
          h('button.btn', { type: 'button', html: `${icon.dice}<span>Random</span>`, onclick: () => randomise() }),
          h('button.btn', { type: 'button', html: `${icon.eraser}<span>Clear</span>`, onclick: () => clearBoard() }),
          h('button.btn', { type: 'button', html: `${icon.share}<span>Share</span>`, onclick: () => share() }),
        ),
        hint('Drag on the board to draw. Drag the green or pink square to move it.'),
      ),
      panel('Algorithm', algoSeg.el, algoName, algoBlurb, algoTags, algoInsight, h('div.row.checks', null, treeToggle, numToggle)),
      panel('Result', verdict, h('div.metrics', null, m.moves.el, m.cost.el, m.expanded.el, m.generated.el, m.frontier.el, m.time.el)),
      panel('Pseudocode', code.el),
    );

    function share() {
      navigator.clipboard?.writeText(location.href).catch(() => undefined);
      toast('Link copied');
    }

    function toast(msg: string) {
      const t = h('div.toast', null, msg);
      stageEl.append(t);
      setTimeout(() => t.remove(), 1600);
    }

    // ---------------------------------------------------------------- compute
    function refresh(play: boolean) {
      const input = { board: setup.board, piece: setup.piece, start: setup.start, goal: setup.goal };
      result = runSearch(algo, input);
      replay = new PathReplay(result, setup.board.tiles.length);
      const ref = dijkstra(input);
      optimalCost = ref.found ? ref.cost : 0;
      player.setLength(replay.length);
      if (play) player.play();
      else player.seek(replay.length);
      const a = ALGOS[algo];
      algoName.textContent = a.name;
      algoBlurb.textContent = a.blurb;
      algoInsight.textContent = a.insight;
      algoTags.replaceChildren(
        h('span', { style: { '--c': a.color } }, a.family),
        h('span', null, `Optimal: ${a.optimal}`),
        h('span', null, a.time),
        h('span', null, `Space ${a.space}`),
      );
      code.setLines(a.code);
      pieceNote.textContent = PIECES[setup.piece].note;
      m.moves.set(result.found ? result.moves : '–', result.found ? '' : 'no route');
      m.cost.set(result.found ? result.cost : '–', result.found && optimalCost ? (result.cost === optimalCost ? 'optimal ✓' : `+${result.cost - optimalCost} vs optimal`) : '');
      m.expanded.set(result.expanded, `of ${setup.board.tiles.length} squares`);
      m.generated.set(result.generated);
      m.frontier.set(result.maxFrontier);
      m.time.set(result.ms < 1 ? '<1 ms' : `${result.ms.toFixed(1)} ms`);
      verdict.className = `verdict ${result.found ? 'ok' : 'bad'}`;
      verdict.textContent = result.found
        ? `${result.moves} move${result.moves === 1 ? '' : 's'} · ${squareName(setup.board.size, setup.start)} → ${squareName(setup.board.size, setup.goal)}`
        : result.truncated
          ? 'Gave up: trace too long to record'
          : `${PIECES[setup.piece].name} cannot reach ${squareName(setup.board.size, setup.goal)} from here`;
      build3DExtras();
    }

    const unsub = subscribe(() => {
      pieces.set(setup.piece);
      sizeSl.set(setup.board.size);
      stage.scene?.setBoard(setup.board, board2d.theme);
      refresh(false);
    });

    // ---------------------------------------------------------------- 3D extras
    function build3DExtras() {
      const sc = stage.scene;
      if (!sc || !result) return;
      const key = `${result.path.join(',')}|${setup.board.size}`;
      if (key !== tubeKey) {
        sc.dispose3(tube);
        tube = null;
        tubeKey = key;
        if (result.path.length > 1) {
          const pts = result.path.map((c) => sc.cellPos(c, 0.4));
          tube = sc.tube(pts, COLORS.path, 0.05);
          Scene3D.reveal(tube, 0);
        }
      }
      if (!beaconS) {
        beaconS = sc.beacon(COLORS.start, 1.1);
        beaconG = sc.beacon(COLORS.goal, 2.8);
      }
      beaconS.position.copy(sc.cellPos(setup.start, 0.16));
      beaconG!.position.copy(sc.cellPos(setup.goal, 0.16));
      const pk = `${setup.piece}`;
      if (!pieceSpr || pk !== pieceKey) {
        sc.dispose3(pieceSpr);
        pieceSpr = sc.billboard(PIECES[setup.piece].sprite, 1.15);
        pieceKey = pk;
      }
    }

    function enter3D() {
      const sc = stage.ensureScene();
      sc.setBoard(setup.board, board2d.theme);
      tubeKey = '';
      beaconS = beaconG = null;
      pieceSpr = null;
      sc.onFrame = (_dt, time) => {
        if (beaconS) (beaconS.userData.ring as THREE.Mesh).scale.setScalar(1 + Math.sin(time * 3) * 0.08);
        if (beaconG) (beaconG.userData.ring as THREE.Mesh).scale.setScalar(1 + Math.sin(time * 3 + 1.5) * 0.12);
      };
      build3DExtras();
    }
    stage.onMode((mode) => {
      if (mode === '3d') enter3D();
    });
    stage.onTheme((t) => stage.scene?.setBoard(setup.board, t));
    if (stage.mode === '3d') enter3D();

    // ---------------------------------------------------------------- interaction
    const act = (cell: number, down: boolean) => {
      if (cell < 0) return;
      if (down) {
        if (cell === setup.start) drag = 'start';
        else if (cell === setup.goal) drag = 'goal';
        else if (tool === 'start' || tool === 'goal') {
          moveEndpoint(tool, cell);
          return;
        } else {
          drag = 'paint';
          paintTile = tool === 'wall' ? Tile.Wall : tool === 'mud' ? Tile.Mud : Tile.Empty;
          // clicking an already-painted square with the same tool erases it
          if (setup.board.tiles[cell] === paintTile && paintTile !== Tile.Empty) paintTile = Tile.Empty;
        }
      }
      if (drag === 'paint') paint(cell, paintTile);
      else if (drag) moveEndpoint(drag, cell);
    };
    const canvas = board2d.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      act(board2d.hit(e), true);
    });
    canvas.addEventListener('pointermove', (e) => {
      hover = board2d.hit(e);
      if (drag) act(hover, false);
    });
    canvas.addEventListener('pointerup', () => (drag = null));
    canvas.addEventListener('pointerleave', () => (hover = -1));
    // 3D: click (without orbit-drag) to paint
    let down3: { x: number; y: number } | null = null;
    const l3 = stageEl.querySelector('.l3d') as HTMLElement;
    l3.addEventListener('pointerdown', (e) => (down3 = { x: e.clientX, y: e.clientY }));
    l3.addEventListener('pointerup', (e) => {
      if (!down3 || !stage.scene) return;
      if (Math.hypot(e.clientX - down3.x, e.clientY - down3.y) < 5) {
        const cell = stage.scene.pick(e);
        if (cell >= 0) {
          drag = null;
          act(cell, true);
          drag = null;
        }
      }
      down3 = null;
    });

    // ---------------------------------------------------------------- render
    const frame = (dt: number) => {
      player.tick(dt);
      if (!replay) return;
      replay.seek(player.t);
      code.set(replay.line);
      if (stage.mode === '2d') draw2D();
      else draw3D();
    };

    function pathProgress(): number {
      // fraction of the final path revealed, with sub-event smoothing
      const pe = result.path.length;
      if (!pe) return 0;
      const firstPathEvent = result.events.length - pe;
      const f = player.t - firstPathEvent;
      return clamp(f / Math.max(1, pe - 1), 0, 1);
    }

    function draw2D() {
      board2d.fit(setup.board.size);
      board2d.clear();
      board2d.drawBoard(setup.board);
      const ctx = board2d.ctx;
      const n = setup.board.tiles.length;
      const a = ALGOS[algo];
      const cs = board2d.cell;
      const pulse = (Math.sin(performance.now() / 380) + 1) / 2;
      for (let i = 0; i < n; i++) {
        const st = replay.status[i];
        if (st === Status.Unseen) continue;
        const k = clamp(replay.g[i] / replay.maxG, 0, 1);
        const base = replay.side[i] === 1 ? '#f472b6' : a.color;
        if (st === Status.Open) {
          board2d.fillCell(i, rgba(COLORS.open, 0.2 + 0.1 * pulse), 1);
          board2d.glowCell(i, base, 0.55);
          board2d.ring(i, rgba(base, 0.55), 1.2, -0.15);
        } else {
          board2d.fillCell(i, mix(base, '#7c3aed', k * 0.75).replace('rgb', 'rgba').replace(')', ',.34)'), 1);
        }
      }
      // parent arrows
      if (showTree && cs >= 24) {
        for (let i = 0; i < n; i++) {
          const p = replay.parent[i];
          if (p >= 0 && replay.status[i] !== Status.Unseen && replay.status[i] !== Status.Path) {
            board2d.arrow(p, i, 'rgba(255,255,255,.22)', 1);
          }
        }
      }
      if (showNumbers && cs >= 34) {
        for (let i = 0; i < n; i++) {
          if (replay.status[i] !== Status.Unseen && i !== setup.start) {
            board2d.text(i, fmt(replay.g[i]), 'rgba(255,255,255,.62)', 0.27);
          }
        }
      }
      if (replay.meet >= 0) board2d.ring(replay.meet, '#ffffff', 2.5, pulse);
      // final path
      const pp = pathProgress();
      if (pp > 0) board2d.trail(result.path, COLORS.path, Math.max(2.5, cs * 0.08), pp * (result.path.length - 1));
      // endpoints + piece
      board2d.glowCell(setup.goal, COLORS.goal, 0.9);
      board2d.ring(setup.goal, COLORS.goal, 2.5, pulse);
      board2d.ring(setup.goal, rgba(COLORS.goal, 0.35), 1.5, pulse + 0.6);
      board2d.glowCell(setup.start, COLORS.start, 0.8);
      board2d.ring(setup.start, COLORS.start, 2.5, 0);
      let pieceAt = setup.start;
      if (pp > 0 && result.path.length > 1) pieceAt = result.path[Math.min(result.path.length - 1, Math.round(pp * (result.path.length - 1)))];
      board2d.piece(pieceAt, PIECES[setup.piece].sprite, 0.84, 0, 1, () => undefined);
      // hover readout
      ctx.save();
      if (hover >= 0) {
        board2d.ring(hover, 'rgba(255,255,255,.55)', 1.5, 0);
        const st = replay.status[hover];
        const txt = `${squareName(setup.board.size, hover)}${st !== Status.Unseen ? ` · cost ${fmt(replay.g[hover])}` : ''}${setup.board.tiles[hover] === Tile.Mud ? ' · mud' : setup.board.tiles[hover] === Tile.Wall ? ' · wall' : ''}`;
        stage.overlay.dataset.hover = txt;
      } else stage.overlay.dataset.hover = '';
      ctx.restore();
    }

    const cOpen = new THREE.Color();
    const cClosed = new THREE.Color();
    function draw3D() {
      const sc = stage.scene;
      if (!sc || sc.size !== setup.board.size) return;
      const n = setup.board.tiles.length;
            const hs = 1.15 / Math.max(3, replay.maxG);
      const pulse = (Math.sin(performance.now() / 350) + 1) / 2;
      for (let i = 0; i < n; i++) {
        const st = replay.status[i];
        if (setup.board.tiles[i] === Tile.Wall) continue;
        if (st === Status.Unseen) {
          sc.restCell(i);
          continue;
        }
        const k = clamp(replay.g[i] / replay.maxG, 0, 1);
        const hgt = 0.1 + replay.g[i] * hs;
        if (st === Status.Open) {
          cOpen.set(replay.side[i] === 1 ? '#f472b6' : COLORS.open).multiplyScalar(1.3 + 0.35 * pulse);
          sc.setCell(i, hgt + 0.12 * pulse, [cOpen.r, cOpen.g, cOpen.b]);
        } else if (st === Status.Closed) {
          // cool ramp (cyan -> violet -> magenta) keeps explored squares readable for every algorithm colour
          cClosed.setHSL((replay.side[i] === 1 ? 330 : 200 + k * 100) / 360, 0.72, 0.4 + 0.06 * (1 - k));
          sc.setCell(i, hgt, [cClosed.r, cClosed.g, cClosed.b]);
        } else {
          sc.setCell(i, hgt + 0.08, [2.0, 1.45, 0.3]);
        }
      }
      if (beaconS) beaconS.position.copy(sc.cellPos(setup.start, sc.topOf(setup.start)));
      if (beaconG) beaconG.position.copy(sc.cellPos(setup.goal, sc.topOf(setup.goal)));
      const pp = pathProgress();
      Scene3D.reveal(tube, pp);
      if (pieceSpr) {
        let at = setup.start;
        if (pp > 0 && result.path.length > 1) at = result.path[Math.min(result.path.length - 1, Math.round(pp * (result.path.length - 1)))];
        const target = sc.cellPos(at, sc.topOf(at) + 0.12 + 0.08 * Math.sin(performance.now() / 420));
        pieceSpr.position.lerp(target, 0.22);
      }
    }

    stage.loop(frame);
    // overlay chip
    const chip = h('div.chip.live');
    stage.overlay.append(chip);
    const chipTimer = setInterval(() => {
      const a = ALGOS[algo];
      chip.style.setProperty('--c', a.color);
      const hov = stage.overlay.dataset.hover;
      chip.textContent = hov ? `${a.short} · ${hov}` : `${a.short} · ${a.family}`;
    }, 120);

    refresh(true);
    return () => {
      clearInterval(chipTimer);
      unsub();
      tl.dispose();
      stage.dispose();
    };
  },
};
