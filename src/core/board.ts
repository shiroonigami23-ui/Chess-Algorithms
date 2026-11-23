/**
 * Board model and chess-piece move generation.
 *
 * Cells are addressed by a flat index `i = r * size + c` so traces stay small
 * and typed arrays can be used everywhere.
 */

export type PieceId = 'knight' | 'king' | 'rook' | 'bishop' | 'queen' | 'pawn';

export const Tile = { Empty: 0, Wall: 1, Mud: 2 } as const;
export type TileKind = (typeof Tile)[keyof typeof Tile];

/** Movement cost of entering a tile. Walls are never entered. */
export const TILE_COST: Record<number, number> = { 0: 1, 1: Infinity, 2: 5 };

export interface Board {
  size: number;
  tiles: Uint8Array;
}

export interface PieceInfo {
  id: PieceId;
  name: string;
  glyph: string;
  sprite: string;
  slides: boolean;
  deltas: ReadonlyArray<readonly [number, number]>;
  note: string;
}

const ORTHO = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

export const PIECES: Record<PieceId, PieceInfo> = {
  knight: {
    id: 'knight', name: 'Knight', glyph: '♞', sprite: 'wN', slides: false,
    deltas: [[2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]],
    note: 'Jumps in an L, so walls never block it. The classic graph-search piece.',
  },
  king: {
    id: 'king', name: 'King', glyph: '♚', sprite: 'wK', slides: false,
    deltas: [...ORTHO, ...DIAG],
    note: 'One step in any of 8 directions: an 8-connected grid.',
  },
  rook: {
    id: 'rook', name: 'Rook', glyph: '♜', sprite: 'wR', slides: true,
    deltas: ORTHO,
    note: 'Slides any distance along ranks and files until blocked.',
  },
  bishop: {
    id: 'bishop', name: 'Bishop', glyph: '♝', sprite: 'wB', slides: true,
    deltas: DIAG,
    note: 'Slides diagonally and can only ever reach squares of its own colour.',
  },
  queen: {
    id: 'queen', name: 'Queen', glyph: '♛', sprite: 'wQ', slides: true,
    deltas: [...ORTHO, ...DIAG],
    note: 'Rook plus bishop. Reaches almost anything in two moves.',
  },
  pawn: {
    id: 'pawn', name: 'Pawn', glyph: '♟', sprite: 'wP', slides: false,
    deltas: [[-1, 0], [-1, -1], [-1, 1]],
    note: 'Only moves up the board (here: straight or diagonal forward), so many goals are unreachable.',
  },
};

export function makeBoard(size: number): Board {
  return { size, tiles: new Uint8Array(size * size) };
}

export function cloneBoard(b: Board): Board {
  return { size: b.size, tiles: new Uint8Array(b.tiles) };
}

export const idx = (size: number, r: number, c: number) => r * size + c;
export const rc = (size: number, i: number): [number, number] => [Math.floor(i / size), i % size];

export function squareName(size: number, i: number): string {
  const [r, c] = rc(size, i);
  const file = String.fromCharCode(97 + c);
  return `${file}${size - r}`;
}

/**
 * Neighbours of cell `i` for `piece`, honouring walls (sliders stop at walls).
 * With `reverse`, returns the squares that can move *to* `i` (only differs for the pawn).
 */
export function neighbours(board: Board, piece: PieceId, i: number, reverse = false): number[] {
  const { size, tiles } = board;
  const [r, c] = rc(size, i);
  const info = PIECES[piece];
  const out: number[] = [];
  for (const [d0, d1] of info.deltas) {
    const dr = reverse ? -d0 : d0;
    const dc = reverse ? -d1 : d1;
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      const j = nr * size + nc;
      if (tiles[j] === Tile.Wall) break;
      out.push(j);
      if (!info.slides) break;
      nr += dr;
      nc += dc;
    }
  }
  return out;
}

export function cost(board: Board, to: number): number {
  return TILE_COST[board.tiles[to]];
}

/**
 * Admissible lower bound on the number of moves `piece` needs between two
 * squares on an empty board. Multiplied by the cheapest tile cost (1) it
 * never overestimates, so A* stays optimal on any board we draw.
 */
export function moveLowerBound(piece: PieceId, size: number, a: number, b: number): number {
  const [r1, c1] = rc(size, a);
  const [r2, c2] = rc(size, b);
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  if (dr === 0 && dc === 0) return 0;
  switch (piece) {
    case 'king':
      return Math.max(dr, dc);
    case 'rook':
      return (dr > 0 ? 1 : 0) + (dc > 0 ? 1 : 0);
    case 'bishop':
      return dr === dc ? 1 : 2;
    case 'queen':
      return dr === 0 || dc === 0 || dr === dc ? 1 : 2;
    case 'pawn':
      return Math.max(dr, dc);
    case 'knight': {
      // Each knight move changes |dr|+|dc| by at most 3 and each axis by at most 2.
      return Math.max(Math.ceil(dr / 2), Math.ceil(dc / 2), Math.ceil((dr + dc) / 3));
    }
  }
}

/** Seeded PRNG (mulberry32) so random boards are shareable by seed. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scatter(board: Board, seed: number, wallRate: number, mudRate: number, keep: number[]): Board {
  const next = makeBoard(board.size);
  const rand = rng(seed);
  for (let i = 0; i < next.tiles.length; i++) {
    if (keep.includes(i)) continue;
    const x = rand();
    next.tiles[i] = x < wallRate ? Tile.Wall : x < wallRate + mudRate ? Tile.Mud : Tile.Empty;
  }
  return next;
}
