/**
 * Graph-search algorithms over a chessboard. Each one runs to completion and
 * records a *trace*: an ordered list of events the renderers replay. Because
 * the whole trace exists up front, the timeline can be scrubbed backwards and
 * forwards, and the 3D time-stack can show every moment at once.
 */
import { type Board, type PieceId, cost, moveLowerBound, neighbours } from './board';
import { MinHeap } from './heap';

export type AlgoId = 'bfs' | 'dfs' | 'iddfs' | 'dijkstra' | 'astar' | 'greedy' | 'bibfs';

export type PathEvent =
  /** cell entered the frontier (open list) */
  | { k: 'open'; cell: number; from: number; g: number; side: 0 | 1; line: number }
  /** cell taken off the frontier and expanded */
  | { k: 'close'; cell: number; g: number; side: 0 | 1; line: number }
  /** iterative deepening starts a new depth limit; previous marks are wiped */
  | { k: 'reset'; depth: number; line: number }
  /** the two frontiers of a bidirectional search touched */
  | { k: 'meet'; cell: number; line: number }
  /** one square of the final path is revealed */
  | { k: 'path'; cell: number; index: number; line: number };

export interface PathResult {
  algo: AlgoId;
  events: PathEvent[];
  path: number[];
  found: boolean;
  /** number of moves in the path */
  moves: number;
  /** sum of tile costs along the path (mud = 5) */
  cost: number;
  expanded: number;
  generated: number;
  maxFrontier: number;
  ms: number;
  truncated: boolean;
}

export interface SearchInput {
  board: Board;
  piece: PieceId;
  start: number;
  goal: number;
}

const EVENT_CAP = 250_000;

function finish(
  algo: AlgoId,
  input: SearchInput,
  events: PathEvent[],
  parent: Int32Array | null,
  path: number[] | null,
  stats: { expanded: number; generated: number; maxFrontier: number; t0: number; truncated?: boolean },
  pathLine: number,
): PathResult {
  let p = path;
  if (!p && parent) {
    p = [];
    if (parent[input.goal] !== -2) {
      for (let c = input.goal; c !== -1; c = parent[c]) p.push(c);
      p.reverse();
    }
  }
  p = p ?? [];
  if (p.length && p[0] !== input.start) p = [];
  p.forEach((cell, index) => events.push({ k: 'path', cell, index, line: pathLine }));
  let total = 0;
  for (let i = 1; i < p.length; i++) total += cost(input.board, p[i]);
  return {
    algo,
    events,
    path: p,
    found: p.length > 0,
    moves: Math.max(0, p.length - 1),
    cost: total,
    expanded: stats.expanded,
    generated: stats.generated,
    maxFrontier: stats.maxFrontier,
    ms: performance.now() - stats.t0,
    truncated: !!stats.truncated,
  };
}

/** parent array: -2 = unseen, -1 = root */
function newParents(n: number) {
  const a = new Int32Array(n);
  a.fill(-2);
  return a;
}

export function bfs(input: SearchInput): PathResult {
  const { board, piece, start, goal } = input;
  const t0 = performance.now();
  const n = board.tiles.length;
  const parent = newParents(n);
  const depth = new Int32Array(n);
  const events: PathEvent[] = [];
  const queue = new Int32Array(n);
  let head = 0, tail = 0, expanded = 0, generated = 1, maxFrontier = 1;
  parent[start] = -1;
  queue[tail++] = start;
  events.push({ k: 'open', cell: start, from: -1, g: 0, side: 0, line: 2 });
  while (head < tail) {
    const u = queue[head++];
    expanded++;
    events.push({ k: 'close', cell: u, g: depth[u], side: 0, line: 4 });
    if (u === goal) break;
    for (const v of neighbours(board, piece, u)) {
      if (parent[v] !== -2) continue;
      parent[v] = u;
      depth[v] = depth[u] + 1;
      queue[tail++] = v;
      generated++;
      events.push({ k: 'open', cell: v, from: u, g: depth[v], side: 0, line: 7 });
    }
    maxFrontier = Math.max(maxFrontier, tail - head);
  }
  return finish('bfs', input, events, parent, null, { expanded, generated, maxFrontier, t0 }, 9);
}

export function dfs(input: SearchInput): PathResult {
  const { board, piece, start, goal } = input;
  const t0 = performance.now();
  const n = board.tiles.length;
  const parent = newParents(n);
  const depth = new Int32Array(n);
  const done = new Uint8Array(n);
  const events: PathEvent[] = [];
  const stack: number[] = [start];
  let expanded = 0, generated = 1, maxFrontier = 1;
  parent[start] = -1;
  events.push({ k: 'open', cell: start, from: -1, g: 0, side: 0, line: 2 });
  while (stack.length) {
    const u = stack.pop()!;
    if (done[u]) continue;
    done[u] = 1;
    expanded++;
    events.push({ k: 'close', cell: u, g: depth[u], side: 0, line: 4 });
    if (u === goal) break;
    // push in reverse so the first listed move is explored first
    const ns = neighbours(board, piece, u);
    for (let i = ns.length - 1; i >= 0; i--) {
      const v = ns[i];
      if (done[v]) continue;
      parent[v] = u;
      depth[v] = depth[u] + 1;
      stack.push(v);
      generated++;
      events.push({ k: 'open', cell: v, from: u, g: depth[v], side: 0, line: 7 });
    }
    maxFrontier = Math.max(maxFrontier, stack.length);
  }
  return finish('dfs', input, events, parent, null, { expanded, generated, maxFrontier, t0 }, 9);
}

/**
 * Iterative deepening DFS. Each round is a depth-limited DFS; a per-round
 * "best depth seen" table prunes re-visits so large boards stay tractable.
 */
export function iddfs(input: SearchInput): PathResult {
  const { board, piece, start, goal } = input;
  const t0 = performance.now();
  const n = board.tiles.length;
  const events: PathEvent[] = [];
  let expanded = 0, generated = 0, maxFrontier = 0;
  let truncated = false;
  const best = new Int32Array(n);
  const onPath = new Uint8Array(n);
  const path: number[] = [];

  const dls = (u: number, d: number, limit: number): boolean => {
    if (events.length > EVENT_CAP) { truncated = true; return false; }
    expanded++;
    events.push({ k: 'close', cell: u, g: d, side: 0, line: 6 });
    path.push(u);
    onPath[u] = 1;
    maxFrontier = Math.max(maxFrontier, path.length);
    if (u === goal) return true;
    if (d < limit) {
      for (const v of neighbours(board, piece, u)) {
        if (onPath[v] || best[v] <= d + 1) continue;
        best[v] = d + 1;
        generated++;
        events.push({ k: 'open', cell: v, from: u, g: d + 1, side: 0, line: 8 });
        if (dls(v, d + 1, limit)) return true;
      }
    }
    path.pop();
    onPath[u] = 0;
    return false;
  };

  for (let limit = 0; limit < n; limit++) {
    events.push({ k: 'reset', depth: limit, line: 2 });
    best.fill(0x7fffffff);
    best[start] = 0;
    events.push({ k: 'open', cell: start, from: -1, g: 0, side: 0, line: 3 });
    generated++;
    const before = expanded;
    if (dls(start, 0, limit)) {
      return finish('iddfs', input, events, null, [...path], { expanded, generated, maxFrontier, t0 }, 4);
    }
    // nothing new was reachable at this depth: goal is unreachable
    if (truncated || expanded - before === 0) break;
    if (limit > 0 && !growsBeyond(best, limit)) break;
  }
  return finish('iddfs', input, events, null, [], { expanded, generated, maxFrontier, t0, truncated }, 4);
}

function growsBeyond(best: Int32Array, limit: number) {
  for (let i = 0; i < best.length; i++) if (best[i] === limit) return true;
  return false;
}

type Priority = 'dijkstra' | 'astar' | 'greedy';

function bestFirst(input: SearchInput, mode: Priority): PathResult {
  const { board, piece, start, goal } = input;
  const t0 = performance.now();
  const n = board.tiles.length;
  const parent = newParents(n);
  const g = new Float64Array(n).fill(Infinity);
  const closed = new Uint8Array(n);
  const events: PathEvent[] = [];
  const h = (i: number) => moveLowerBound(piece, board.size, i, goal);
  const key = (i: number) => (mode === 'dijkstra' ? g[i] : mode === 'astar' ? g[i] + h(i) : h(i));
  // tie-break on h so A* heads toward the goal on plateaus
  const heap = new MinHeap();
  let expanded = 0, generated = 1, maxFrontier = 1;
  g[start] = 0;
  parent[start] = -1;
  heap.push(start, key(start), h(start));
  events.push({ k: 'open', cell: start, from: -1, g: 0, side: 0, line: 2 });
  while (heap.size) {
    const u = heap.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    expanded++;
    events.push({ k: 'close', cell: u, g: g[u], side: 0, line: 4 });
    if (u === goal) break;
    for (const v of neighbours(board, piece, u)) {
      if (closed[v]) continue;
      const ng = g[u] + cost(board, v);
      if (mode === 'greedy' ? parent[v] !== -2 : ng >= g[v]) continue;
      g[v] = ng;
      parent[v] = u;
      heap.push(v, key(v), h(v));
      generated++;
      events.push({ k: 'open', cell: v, from: u, g: ng, side: 0, line: 8 });
    }
    maxFrontier = Math.max(maxFrontier, heap.size);
  }
  return finish(mode, input, events, parent, null, { expanded, generated, maxFrontier, t0 }, 10);
}

export const dijkstra = (i: SearchInput) => bestFirst(i, 'dijkstra');
export const astar = (i: SearchInput) => bestFirst(i, 'astar');
export const greedy = (i: SearchInput) => bestFirst(i, 'greedy');

/** Bidirectional BFS: grow one layer from each end in turn until they touch. */
export function bibfs(input: SearchInput): PathResult {
  const { board, piece, start, goal } = input;
  const t0 = performance.now();
  const n = board.tiles.length;
  const par = [newParents(n), newParents(n)];
  const dist = [new Int32Array(n), new Int32Array(n)];
  const events: PathEvent[] = [];
  let frontier: number[][] = [[start], [goal]];
  par[0][start] = -1;
  par[1][goal] = -1;
  events.push({ k: 'open', cell: start, from: -1, g: 0, side: 0, line: 2 });
  events.push({ k: 'open', cell: goal, from: -1, g: 0, side: 1, line: 2 });
  let expanded = 0, generated = 2, maxFrontier = 2;
  let meet = start === goal ? start : -1;
  while (meet < 0 && frontier[0].length && frontier[1].length) {
    // expand the smaller side: the standard balancing rule
    const s = frontier[0].length <= frontier[1].length ? 0 : 1;
    const other = 1 - s;
    const next: number[] = [];
    for (const u of frontier[s]) {
      expanded++;
      events.push({ k: 'close', cell: u, g: dist[s][u], side: s as 0 | 1, line: 5 });
      for (const v of neighbours(board, piece, u, s === 1)) {
        if (par[s][v] !== -2) continue;
        par[s][v] = u;
        dist[s][v] = dist[s][u] + 1;
        generated++;
        events.push({ k: 'open', cell: v, from: u, g: dist[s][v], side: s as 0 | 1, line: 7 });
        if (par[other][v] !== -2) { meet = v; break; }
        next.push(v);
      }
      if (meet >= 0) break;
    }
    frontier[s] = next;
    maxFrontier = Math.max(maxFrontier, frontier[0].length + frontier[1].length);
  }
  let path: number[] = [];
  if (meet >= 0) {
    events.push({ k: 'meet', cell: meet, line: 8 });
    const left: number[] = [];
    for (let c = meet; c !== -1; c = par[0][c]) left.push(c);
    left.reverse();
    const right: number[] = [];
    for (let c = par[1][meet]; c !== -1 && c !== -2; c = par[1][c]) right.push(c);
    path = [...left, ...right];
  }
  return finish('bibfs', input, events, null, path, { expanded, generated, maxFrontier, t0 }, 9);
}

export const SEARCHES: Record<AlgoId, (i: SearchInput) => PathResult> = {
  bfs, dfs, iddfs, dijkstra, astar, greedy, bibfs,
};

export function runSearch(algo: AlgoId, input: SearchInput): PathResult {
  return SEARCHES[algo](input);
}
