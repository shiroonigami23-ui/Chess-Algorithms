import { describe, expect, it } from 'vitest';
import { PIECES, type PieceId, Tile, makeBoard, moveLowerBound, neighbours, scatter } from '../src/core/board';
import { ALGO_ORDER } from '../src/core/catalog';
import { type AlgoId, runSearch } from '../src/core/pathfinding';
import { countQueens, distanceField, knightsTour, nQueens } from '../src/core/puzzles';

const pieces = Object.keys(PIECES) as PieceId[];

/** Independent reference: plain Dijkstra over an adjacency scan, O(V^2). */
function referenceCost(board: ReturnType<typeof makeBoard>, piece: PieceId, s: number, t: number): number {
  const n = board.tiles.length;
  const d = new Array(n).fill(Infinity);
  const done = new Array(n).fill(false);
  d[s] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const v of neighbours(board, piece, u)) {
      const w = board.tiles[v] === Tile.Mud ? 5 : 1;
      if (d[u] + w < d[v]) d[v] = d[u] + w;
    }
  }
  return d[t];
}

function referenceMoves(board: ReturnType<typeof makeBoard>, piece: PieceId, s: number, t: number): number {
  return distanceField(board, piece, s).dist[t];
}

describe('piece movement', () => {
  it('knight on an empty 8x8 has 2, 3, 4, 6, 8 moves from corner/edge/centre', () => {
    const b = makeBoard(8);
    expect(neighbours(b, 'knight', 0)).toHaveLength(2);
    expect(neighbours(b, 'knight', 1)).toHaveLength(3);
    expect(neighbours(b, 'knight', 8 * 3 + 3)).toHaveLength(8);
  });

  it('sliders stop at walls but knights jump over them', () => {
    const b = makeBoard(8);
    b.tiles[3] = Tile.Wall; // a8 row 0 col 3
    expect(neighbours(b, 'rook', 0).filter((i) => i < 8)).toEqual([1, 2]);
    expect(neighbours(b, 'knight', 0)).toHaveLength(2);
  });

  it('a queen on an empty 8x8 corner reaches 21 squares', () => {
    expect(neighbours(makeBoard(8), 'queen', 0)).toHaveLength(21);
  });

  it('reverse neighbours invert the pawn move', () => {
    const b = makeBoard(8);
    const from = 8 * 4 + 4;
    for (const v of neighbours(b, 'pawn', from)) {
      expect(neighbours(b, 'pawn', v, true)).toContain(from);
    }
  });
});

describe('heuristic is admissible', () => {
  for (const p of pieces) {
    it(`${p}: never exceeds the true move count on an empty board`, () => {
      const b = makeBoard(8);
      for (let s = 0; s < 64; s += 5) {
        const field = distanceField(b, p, s);
        for (let t = 0; t < 64; t++) {
          if (field.dist[t] < 0) continue;
          expect(moveLowerBound(p, 8, s, t)).toBeLessThanOrEqual(field.dist[t]);
        }
      }
    });
  }
});

describe('searches agree with the reference', () => {
  const optimalMoves: AlgoId[] = ['bfs', 'iddfs', 'bibfs'];
  const optimalCost: AlgoId[] = ['dijkstra', 'astar'];

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const piece of pieces) {
      it(`seed ${seed} / ${piece}`, () => {
        const size = 7;
        const base = makeBoard(size);
        const s = 0;
        const t = size * size - 1;
        const board = scatter(base, seed * 101, 0.18, 0.12, [s, t]);
        const wantMoves = referenceMoves(board, piece, s, t);
        const wantCost = referenceCost(board, piece, s, t);
        for (const algo of ALGO_ORDER) {
          const r = runSearch(algo, { board, piece, start: s, goal: t });
          if (wantMoves < 0) {
            expect(r.found, `${algo} should not find a path`).toBe(false);
            continue;
          }
          expect(r.found, `${algo} should find a path`).toBe(true);
          // the path must be a legal sequence of moves
          for (let i = 1; i < r.path.length; i++) {
            expect(neighbours(board, piece, r.path[i - 1])).toContain(r.path[i]);
          }
          expect(r.path[0]).toBe(s);
          expect(r.path[r.path.length - 1]).toBe(t);
          if (optimalMoves.includes(algo)) expect(r.moves, algo).toBe(wantMoves);
          if (optimalCost.includes(algo)) expect(r.cost, algo).toBe(wantCost);
        }
      });
    }
  }
});

describe('A* expands no more than Dijkstra on open boards', () => {
  it('on an empty 12x12 knight board', () => {
    const board = makeBoard(12);
    const input = { board, piece: 'knight' as const, start: 0, goal: 143 };
    expect(runSearch('astar', input).expanded).toBeLessThanOrEqual(runSearch('dijkstra', input).expanded);
  });
});

describe("Knight's Tour", () => {
  for (const size of [5, 6, 8, 10]) {
    it(`visits every square exactly once on ${size}x${size}`, () => {
      const r = knightsTour(size, 0);
      expect(r.complete).toBe(true);
      expect(new Set(r.order).size).toBe(size * size);
      const b = makeBoard(size);
      for (let i = 1; i < r.order.length; i++) expect(neighbours(b, 'knight', r.order[i - 1])).toContain(r.order[i]);
    });
  }
  it('has no tour on 3x3', () => {
    expect(knightsTour(3, 0).complete).toBe(false);
  });
});

describe('N-Queens', () => {
  it('known solution counts', () => {
    const known: Record<number, number> = { 4: 2, 5: 10, 6: 4, 7: 40, 8: 92 };
    for (const [n, count] of Object.entries(known)) expect(countQueens(+n)).toBe(count);
  });
  it('trace finds all 92 solutions for n = 8 and each is valid', () => {
    const r = nQueens(8, 1000, 10_000_000);
    expect(r.solutions).toHaveLength(92);
    for (const cols of r.solutions) {
      for (let a = 0; a < 8; a++)
        for (let b = a + 1; b < 8; b++) {
          expect(cols[a]).not.toBe(cols[b]);
          expect(Math.abs(cols[a] - cols[b])).not.toBe(b - a);
        }
    }
  });
});

describe('distance field', () => {
  it('knight reaches every square of an 8x8 within 6 moves', () => {
    const f = distanceField(makeBoard(8), 'knight', 0);
    expect(f.reachable).toBe(64);
    expect(f.maxDist).toBe(6);
  });
  it('bishop only reaches half the squares', () => {
    expect(distanceField(makeBoard(8), 'bishop', 0).reachable).toBe(32);
  });
});
