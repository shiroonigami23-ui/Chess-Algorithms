/**
 * Shared board setup. It survives navigation between labs and is mirrored in
 * the URL hash query, so any experiment can be shared as a link.
 */
import { type Board, type PieceId, PIECES, Tile, cloneBoard, makeBoard, scatter } from '../core/board';

export interface Setup {
  piece: PieceId;
  board: Board;
  start: number;
  goal: number;
  seed: number;
}

const listeners = new Set<() => void>();

export const setup: Setup = {
  piece: 'knight',
  board: makeBoard(8),
  start: 0,
  goal: 63,
  seed: 7,
};

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  for (const fn of listeners) fn();
}

export function resize(size: number) {
  size = Math.max(4, Math.min(16, size));
  setup.board = makeBoard(size);
  setup.start = 0;
  setup.goal = size * size - 1;
  emit();
}

export function setPiece(p: PieceId) {
  setup.piece = p;
  emit();
}

export function randomise(wall = 0.2, mud = 0.1) {
  setup.seed = (Math.random() * 1e6) | 0;
  setup.board = scatter(makeBoard(setup.board.size), setup.seed, wall, mud, [setup.start, setup.goal]);
  emit();
}

export function clearBoard() {
  setup.board = makeBoard(setup.board.size);
  emit();
}

export function paint(cell: number, tile: number) {
  if (cell === setup.start || cell === setup.goal) return false;
  if (setup.board.tiles[cell] === tile) return false;
  setup.board = cloneBoard(setup.board);
  setup.board.tiles[cell] = tile;
  emit();
  return true;
}

export function moveEndpoint(which: 'start' | 'goal', cell: number) {
  if (cell === (which === 'start' ? setup.goal : setup.start)) return;
  setup[which] = cell;
  if (setup.board.tiles[cell] === Tile.Wall) {
    setup.board = cloneBoard(setup.board);
    setup.board.tiles[cell] = Tile.Empty;
  }
  emit();
}

// ---------------------------------------------------------------- URL (de)serialisation

function rle(s: string) {
  return s.replace(/(.)\1{3,}/g, (m, c) => `${c}*${m.length.toString(36)}.`);
}
function unrle(s: string) {
  return s.replace(/(.)\*([0-9a-z]+)\./g, (_, c, n) => c.repeat(parseInt(n, 36)));
}

export function toQuery(): string {
  const { piece, board, start, goal } = setup;
  const q = new URLSearchParams({
    p: piece,
    n: String(board.size),
    s: String(start),
    g: String(goal),
    b: rle(Array.from(board.tiles).join('')),
  });
  return q.toString();
}

export function fromQuery(query: string): boolean {
  const q = new URLSearchParams(query);
  const piece = q.get('p') as PieceId | null;
  const n = Number(q.get('n'));
  const b = q.get('b');
  if (!piece || !(piece in PIECES) || !(n >= 4 && n <= 16) || !b) return false;
  const tiles = unrle(b);
  if (tiles.length !== n * n || /[^012]/.test(tiles)) return false;
  const start = Number(q.get('s'));
  const goal = Number(q.get('g'));
  if (!(start >= 0 && start < n * n) || !(goal >= 0 && goal < n * n) || start === goal) return false;
  setup.piece = piece;
  setup.board = { size: n, tiles: Uint8Array.from(tiles, (c) => Number(c)) };
  setup.start = start;
  setup.goal = goal;
  return true;
}
