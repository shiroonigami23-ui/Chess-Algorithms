/**
 * Backtracking puzzles and distance fields: Knight's Tour, N-Queens and the
 * move-distance field of any piece.
 */
import { type Board, type PieceId, makeBoard, neighbours, rc } from './board';

// ---------------------------------------------------------------- Knight's Tour

export type TourEvent =
  | { k: 'place'; cell: number; step: number; options: number; line: number }
  | { k: 'undo'; cell: number; step: number; line: number };

export interface TourResult {
  events: TourEvent[];
  order: number[];
  complete: boolean;
  closed: boolean;
  backtracks: number;
  truncated: boolean;
}

/**
 * Warnsdorff's rule (always jump to the square with the fewest onward moves),
 * wrapped in backtracking so it still finishes on boards where the plain rule
 * gets stuck. Ties are broken by distance from the centre (Pohl's refinement).
 */
export function knightsTour(size: number, start: number, budget = 400_000): TourResult {
  const board = makeBoard(size);
  const n = size * size;
  const seen = new Uint8Array(n);
  const order: number[] = [];
  const events: TourEvent[] = [];
  let backtracks = 0;
  let truncated = false;
  const adj = Array.from({ length: n }, (_, i) => neighbours(board, 'knight', i));
  const free = (i: number) => adj[i].reduce((a, j) => a + (seen[j] ? 0 : 1), 0);
  const mid = (size - 1) / 2;
  const centre = (i: number) => {
    const [r, c] = rc(size, i);
    return -((r - mid) ** 2 + (c - mid) ** 2);
  };

  const go = (u: number): boolean => {
    if (events.length > budget) { truncated = true; return false; }
    seen[u] = 1;
    order.push(u);
    const options = adj[u].filter((v) => !seen[v]);
    events.push({ k: 'place', cell: u, step: order.length, options: options.length, line: 3 });
    if (order.length === n) return true;
    options.sort((a, b) => free(a) - free(b) || centre(a) - centre(b));
    for (const v of options) if (go(v)) return true;
    if (truncated) return false;
    seen[u] = 0;
    order.pop();
    backtracks++;
    events.push({ k: 'undo', cell: u, step: order.length + 1, line: 8 });
    return false;
  };

  const complete = go(start);
  const closed = complete && adj[order[n - 1]].includes(order[0]);
  return { events, order: complete ? order : [...order], complete, closed, backtracks, truncated };
}

// ---------------------------------------------------------------- N-Queens

export type QueenEvent =
  | { k: 'try'; row: number; col: number; line: number }
  | { k: 'clash'; row: number; col: number; by: [number, number]; line: number }
  | { k: 'place'; row: number; col: number; line: number }
  | { k: 'remove'; row: number; col: number; line: number }
  | { k: 'solution'; cols: number[]; index: number; line: number };

export interface QueensResult {
  events: QueenEvent[];
  solutions: number[][];
  nodes: number;
  truncated: boolean;
}

/** Row-by-row backtracking with column/diagonal occupancy sets. */
export function nQueens(n: number, maxSolutions = 1, budget = 300_000): QueensResult {
  const events: QueenEvent[] = [];
  const cols: number[] = [];
  const solutions: number[][] = [];
  const usedCol = new Uint8Array(n);
  const usedD1 = new Uint8Array(2 * n);
  const usedD2 = new Uint8Array(2 * n);
  let nodes = 0;
  let truncated = false;

  const attacker = (row: number, col: number): [number, number] => {
    for (let r = 0; r < row; r++) {
      const c = cols[r];
      if (c === col || Math.abs(c - col) === row - r) return [r, c];
    }
    return [-1, -1];
  };

  const place = (row: number): boolean => {
    if (row === n) {
      solutions.push([...cols]);
      events.push({ k: 'solution', cols: [...cols], index: solutions.length, line: 3 });
      return solutions.length >= maxSolutions;
    }
    for (let col = 0; col < n; col++) {
      if (events.length > budget) { truncated = true; return true; }
      nodes++;
      events.push({ k: 'try', row, col, line: 5 });
      if (usedCol[col] || usedD1[row + col] || usedD2[row - col + n]) {
        events.push({ k: 'clash', row, col, by: attacker(row, col), line: 6 });
        continue;
      }
      usedCol[col] = usedD1[row + col] = usedD2[row - col + n] = 1;
      cols.push(col);
      events.push({ k: 'place', row, col, line: 7 });
      if (place(row + 1)) return true;
      cols.pop();
      usedCol[col] = usedD1[row + col] = usedD2[row - col + n] = 0;
      events.push({ k: 'remove', row, col, line: 9 });
    }
    return false;
  };

  place(0);
  return { events, solutions, nodes, truncated };
}

/** Counts all N-Queens solutions without recording events (bitmask backtracking). */
export function countQueens(n: number): number {
  const all = (1 << n) - 1;
  const go = (cols: number, d1: number, d2: number): number => {
    if (cols === all) return 1;
    let count = 0;
    let free = all & ~(cols | d1 | d2);
    while (free) {
      const bit = free & -free;
      free ^= bit;
      count += go(cols | bit, ((d1 | bit) << 1) & all, (d2 | bit) >> 1);
    }
    return count;
  };
  return go(0, 0, 0);
}

// ---------------------------------------------------------------- Distance field

export interface FieldResult {
  /** moves needed to reach each cell, -1 if unreachable */
  dist: Int32Array;
  /** cells in the order the BFS wavefront reached them */
  order: number[];
  maxDist: number;
  reachable: number;
}

export function distanceField(board: Board, piece: PieceId, source: number): FieldResult {
  const n = board.tiles.length;
  const dist = new Int32Array(n).fill(-1);
  const order: number[] = [source];
  dist[source] = 0;
  for (let h = 0; h < order.length; h++) {
    const u = order[h];
    for (const v of neighbours(board, piece, u)) {
      if (dist[v] !== -1) continue;
      dist[v] = dist[u] + 1;
      order.push(v);
    }
  }
  let maxDist = 0;
  for (const d of dist) maxDist = Math.max(maxDist, d);
  return { dist, order, maxDist, reachable: order.length };
}
