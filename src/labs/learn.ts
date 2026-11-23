import { PIECES, type PieceId, makeBoard, scatter, rng } from '../core/board';
import { ALGOS, ALGO_ORDER } from '../core/catalog';
import { type AlgoId, dijkstra, runSearch } from '../core/pathfinding';
import { clamp, fmt, h } from '../ui/dom';
import { codeView, icon, panel, pieceRow, seg, slider } from '../ui/widgets';
import type { Lab } from './types';

type MetricKey = 'expanded' | 'moves' | 'cost' | 'optimal';

interface Agg {
  runs: number;
  found: number;
  expanded: number;
  moves: number;
  cost: number;
  optimal: number;
  ms: number;
}

const METRICS: Record<MetricKey, { label: string; hint: string; lowerIsBetter: boolean; get: (a: Agg) => number; fmt: (v: number) => string }> = {
  expanded: { label: 'Squares expanded', hint: 'Average work done. Lower is better.', lowerIsBetter: true, get: (a) => a.expanded / Math.max(1, a.found), fmt: (v) => v.toFixed(1) },
  moves: { label: 'Path length (moves)', hint: 'Average number of moves in the path found.', lowerIsBetter: true, get: (a) => a.moves / Math.max(1, a.found), fmt: (v) => v.toFixed(2) },
  cost: { label: 'Path cost', hint: 'Average cost with mud counted as 5. Lower is better.', lowerIsBetter: true, get: (a) => a.cost / Math.max(1, a.found), fmt: (v) => v.toFixed(2) },
  optimal: { label: 'Found the cheapest path', hint: 'Share of runs where the path cost equals the true minimum.', lowerIsBetter: false, get: (a) => (a.optimal / Math.max(1, a.found)) * 100, fmt: (v) => `${v.toFixed(0)}%` },
};

const CHOOSE: [string, string, AlgoId[]][] = [
  ['Need the fewest moves and every square costs the same?', 'BFS, Bi-BFS or IDDFS. Bi-BFS is the fastest of the three when both ends are known.', ['bfs', 'bibfs', 'iddfs']],
  ['Some squares cost more than others?', "Dijkstra (no heuristic available) or A* (when you can bound the remaining cost).", ['dijkstra', 'astar']],
  ['Speed matters more than perfection?', 'Greedy best-first: often the fewest expansions, with no guarantee about the path.', ['greedy']],
  ['Memory is tight, or you only need *a* route?', 'DFS, or IDDFS when you also want shortest paths. Both keep memory proportional to path depth.', ['dfs', 'iddfs']],
];

let piece: PieceId = 'knight';
let size = 10;
let wallPct = 18;
let mudPct = 10;
let trials = 120;
let metric: MetricKey = 'expanded';
let results: Record<string, Agg> | null = null;

export const learnLab: Lab = {
  id: 'learn',
  title: 'Arena',
  tagline: 'Benchmark & learn',
  blurb: 'Run every algorithm over hundreds of random boards and compare work done, path quality and optimality, then read how each one works.',
  accent: '#fb923c',
  layout: 'page',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',

  mount({ stage }) {
    stage.classList.add('page', 'learn');
    let cancelled = false;
    let running = false;

    const bars = h('div.bars');
    const progress = h('div.progress', null, h('i'));
    const note = h('p.hint');
    const runBtn = h('button.btn.primary', { type: 'button', onclick: () => run() }, 'Run benchmark');
    const metricSeg = seg(
      (Object.keys(METRICS) as MetricKey[]).map((k) => ({ value: k, label: METRICS[k].label })),
      metric,
      (k) => {
        metric = k;
        paintBars();
      },
      'mini accent wrap',
    );
    const pieces = pieceRow(piece, (p) => (piece = p), ['knight', 'king', 'rook', 'bishop', 'queen']);

    const controls = panel(
      'Arena settings',
      pieces.el,
      slider('Board size', 5, 14, size, (v) => (size = v), (v) => `${v}×${v}`).el,
      slider('Walls', 0, 40, wallPct, (v) => (wallPct = v), (v) => `${v}%`).el,
      slider('Mud', 0, 40, mudPct, (v) => (mudPct = v), (v) => `${v}%`).el,
      slider('Random boards', 20, 400, trials, (v) => (trials = v), (v) => String(v)).el,
      runBtn,
      progress,
    );

    const chart = h('section.panel.chart', null, h('header', null, h('h3', null, 'Results')), metricSeg.el, note, bars);

    const refs = h(
      'div.ref-grid',
      null,
      ...ALGO_ORDER.map((id) => {
        const a = ALGOS[id];
        const cv = codeView(a.code);
        const open = h('details', null, h('summary', null, 'Pseudocode'), cv.el);
        return h(
          'article.ref',
          { style: { '--c': a.color } },
          h('header', null, h('i'), h('h4', null, a.name), h('span.fam', null, a.family)),
          h('p', null, a.blurb),
          h(
            'dl',
            null,
            h('div', null, h('dt', null, 'Finds'), h('dd', null, a.optimal)),
            h('div', null, h('dt', null, 'Time'), h('dd', null, a.time)),
            h('div', null, h('dt', null, 'Space'), h('dd', null, a.space)),
            h('div', null, h('dt', null, 'Complete'), h('dd', null, a.complete)),
          ),
          h('p.insight', null, a.insight),
          open,
        );
      }),
    );

    const choose = h(
      'div.choose',
      null,
      ...CHOOSE.map(([q, a, ids]) =>
        h('div.q', null, h('b', null, q), h('p', null, a), h('div.dots', null, ...ids.map((id) => h('span', { style: { '--c': ALGOS[id].color } }, ALGOS[id].short)))),
      ),
    );

    stage.append(
      h('div.page-inner', null,
        h('header.page-head', null,
          h('span.eyebrow', null, 'ARENA'),
          h('h1', null, 'Which algorithm wins?'),
          h('p', null, 'Same random boards, same start and goal for every contender. Mud costs 5 so weighted and unweighted searches pull apart.'),
        ),
        h('div.arena', null, controls, chart),
        h('h2', null, 'How each one works'),
        refs,
        h('h2', null, 'Which should I use?'),
        choose,
      ),
    );

    function paintBars() {
      const m = METRICS[metric];
      note.textContent = results ? m.hint : 'Press “Run benchmark” to compare all algorithms on fresh random boards.';
      if (!results) {
        bars.replaceChildren(h('div.empty', null, 'No results yet'));
        return;
      }
      const ids = ALGO_ORDER.filter((id) => results![id]?.found);
      const vals = ids.map((id) => m.get(results![id]));
      const max = Math.max(...vals, 1e-9);
      const best = m.lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
      const order = ids.map((id, i) => ({ id, v: vals[i] })).sort((a, b) => (m.lowerIsBetter ? a.v - b.v : b.v - a.v));
      bars.replaceChildren(
        ...order.map(({ id, v }) =>
          h('div.bar-row', { style: { '--c': ALGOS[id].color, '--w': `${clamp((v / max) * 100, 1.5, 100)}%` }, class: v === best ? 'best' : '' },
            h('span.n', null, ALGOS[id].short),
            h('div.track', null, h('i')),
            h('b', null, m.fmt(v)),
            h('small', null, `${fmt(results![id].ms / Math.max(1, results![id].runs), 3)} ms`),
          ),
        ),
      );
    }

    async function run() {
      if (running) return;
      running = true;
      runBtn.textContent = 'Running…';
      runBtn.setAttribute('disabled', '');
      const agg: Record<string, Agg> = {};
      for (const id of ALGO_ORDER) agg[id] = { runs: 0, found: 0, expanded: 0, moves: 0, cost: 0, optimal: 0, ms: 0 };
      const rand = rng((Math.random() * 1e9) | 0);
      const n = size * size;
      let done = 0;
      while (done < trials && !cancelled) {
        const batchEnd = Math.min(trials, done + 6);
        for (; done < batchEnd; done++) {
          const start = Math.floor(rand() * n);
          let goal = Math.floor(rand() * n);
          if (goal === start) goal = (goal + 1) % n;
          const board = scatter(makeBoard(size), Math.floor(rand() * 1e9), wallPct / 100, mudPct / 100, [start, goal]);
          const input = { board, piece, start, goal };
          const ref = dijkstra(input);
          if (!ref.found) continue; // skip unsolvable boards so every algorithm is compared fairly
          for (const id of ALGO_ORDER) {
            const t0 = performance.now();
            const r = runSearch(id, input);
            const a = agg[id];
            a.runs++;
            a.ms += performance.now() - t0;
            if (r.found) {
              a.found++;
              a.expanded += r.expanded;
              a.moves += r.moves;
              a.cost += r.cost;
              if (r.cost === ref.cost) a.optimal++;
            }
          }
        }
        (progress.firstElementChild as HTMLElement).style.width = `${(done / trials) * 100}%`;
        results = agg;
        paintBars();
        await new Promise((r) => setTimeout(r, 0));
      }
      const solved = agg.bfs.runs;
      note.textContent = `${solved} solvable boards (of ${done}) · ${PIECES[piece].name} · ${size}×${size} · ${METRICS[metric].hint}`;
      runBtn.textContent = 'Run again';
      runBtn.removeAttribute('disabled');
      running = false;
    }

    paintBars();
    void icon;
    return () => {
      cancelled = true;
      stage.replaceChildren();
      stage.classList.remove('page', 'learn');
    };
  },
};
