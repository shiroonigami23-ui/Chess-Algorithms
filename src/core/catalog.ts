/**
 * Everything the UI says *about* an algorithm: names, colours, complexity and
 * pseudocode. Pseudocode line numbers (1-based) match the `line` field of the
 * trace events, so the active line lights up while a run plays.
 */
import type { AlgoId } from './pathfinding';

export interface AlgoInfo {
  id: AlgoId;
  name: string;
  short: string;
  color: string;
  family: 'Uninformed' | 'Weighted' | 'Heuristic' | 'Bidirectional';
  optimal: string;
  complete: string;
  time: string;
  space: string;
  weights: boolean;
  blurb: string;
  insight: string;
  code: string[];
}

export const ALGOS: Record<AlgoId, AlgoInfo> = {
  bfs: {
    id: 'bfs', name: 'Breadth-First Search', short: 'BFS', color: '#38bdf8', family: 'Uninformed',
    optimal: 'Fewest moves', complete: 'Yes', time: 'O(V + E)', space: 'O(V)', weights: false,
    blurb: 'Explores the board in rings: every square 1 move away, then 2, then 3.',
    insight: 'Guaranteed fewest moves, but it ignores mud, so the cheapest route can differ from its path.',
    code: [
      'BFS(start, goal):',
      '  queue ← [start]; parent[start] ← none',
      '  while queue is not empty:',
      '    u ← queue.popFront()',
      '    if u = goal: break',
      '    for v in moves(u):',
      '      if v unseen: parent[v] ← u; queue.push(v)',
      '  ',
      '  return path by following parent from goal',
    ],
  },
  dfs: {
    id: 'dfs', name: 'Depth-First Search', short: 'DFS', color: '#f472b6', family: 'Uninformed',
    optimal: 'No', complete: 'Yes (finite board)', time: 'O(V + E)', space: 'O(V)', weights: false,
    blurb: 'Dives down one line of moves as far as it can before backing up.',
    insight: 'Cheap on memory and fast to find *a* route, but the route is often absurdly long.',
    code: [
      'DFS(start, goal):',
      '  stack ← [start]',
      '  while stack is not empty:',
      '    u ← stack.pop(); mark u done',
      '    if u = goal: break',
      '    for v in moves(u):',
      '      if v not done: parent[v] ← u; stack.push(v)',
      '  ',
      '  return path by following parent from goal',
    ],
  },
  iddfs: {
    id: 'iddfs', name: 'Iterative Deepening DFS', short: 'IDDFS', color: '#a78bfa', family: 'Uninformed',
    optimal: 'Fewest moves', complete: 'Yes', time: 'O(b^d)', space: 'O(d)', weights: false,
    blurb: 'Runs depth-limited DFS with limit 0, 1, 2, … until the goal appears.',
    insight: 'BFS-quality answers with DFS-sized memory, paid for by re-exploring shallow squares every round.',
    code: [
      'IDDFS(start, goal):',
      '  for limit ← 0, 1, 2, …:',
      '    if DLS(start, limit) finds goal:',
      '      return the current path',
      'DLS(u, limit):',
      '  visit u; if u = goal: return found',
      '  if limit = 0: return not found',
      '  for v in moves(u): DLS(v, limit − 1)',
    ],
  },
  dijkstra: {
    id: 'dijkstra', name: "Dijkstra's Algorithm", short: 'Dijkstra', color: '#34d399', family: 'Weighted',
    optimal: 'Cheapest cost', complete: 'Yes', time: 'O((V + E) log V)', space: 'O(V)', weights: true,
    blurb: 'Always expands the square with the lowest total cost so far.',
    insight: 'The first algorithm here that respects mud: it will take a longer route to stay on firm ground.',
    code: [
      'Dijkstra(start, goal):',
      '  g[start] ← 0; heap ← {start}',
      '  while heap is not empty:',
      '    u ← heap.popMin(g)',
      '    if u = goal: break',
      '    for v in moves(u):',
      '      if g[u] + cost(v) < g[v]:',
      '        g[v] ← g[u] + cost(v); parent[v] ← u; heap.push(v)',
      '  ',
      '  return path by following parent from goal',
    ],
  },
  astar: {
    id: 'astar', name: 'A* Search', short: 'A*', color: '#fbbf24', family: 'Heuristic',
    optimal: 'Cheapest cost', complete: 'Yes', time: 'O((V + E) log V)', space: 'O(V)', weights: true,
    blurb: 'Dijkstra plus a piece-aware estimate of the remaining moves, f = g + h.',
    insight: 'h is a true lower bound for each piece (knight: max(⌈Δr/2⌉, ⌈Δc/2⌉, ⌈(Δr+Δc)/3⌉)), so A* stays optimal while expanding far fewer squares.',
    code: [
      'AStar(start, goal):',
      '  g[start] ← 0; heap ← {start} by f = g + h',
      '  while heap is not empty:',
      '    u ← heap.popMin(g + h)',
      '    if u = goal: break',
      '    for v in moves(u):',
      '      if g[u] + cost(v) < g[v]:',
      '        g[v] ← g[u] + cost(v); parent[v] ← u; heap.push(v)',
      '  ',
      '  return path by following parent from goal',
    ],
  },
  greedy: {
    id: 'greedy', name: 'Greedy Best-First', short: 'Greedy', color: '#fb923c', family: 'Heuristic',
    optimal: 'No', complete: 'Yes (finite board)', time: 'O((V + E) log V)', space: 'O(V)', weights: false,
    blurb: 'Only looks at the estimate h: always chase whatever looks closest to the goal.',
    insight: 'Often blazing fast on open boards, easily fooled by walls and mud.',
    code: [
      'Greedy(start, goal):',
      '  heap ← {start} by h',
      '  while heap is not empty:',
      '    u ← heap.popMin(h)',
      '    if u = goal: break',
      '    for v in moves(u):',
      '      if v unseen:',
      '        parent[v] ← u; heap.push(v)',
      '  ',
      '  return path by following parent from goal',
    ],
  },
  bibfs: {
    id: 'bibfs', name: 'Bidirectional BFS', short: 'Bi-BFS', color: '#22d3ee', family: 'Bidirectional',
    optimal: 'Fewest moves', complete: 'Yes', time: 'O(b^(d/2))', space: 'O(b^(d/2))', weights: false,
    blurb: 'Two BFS waves, one from each end, growing until they touch.',
    insight: 'Two half-depth searches are far smaller than one full-depth search: b^(d/2) + b^(d/2) ≪ b^d.',
    code: [
      'BiBFS(start, goal):',
      '  F ← {start}; B ← {goal}',
      '  while F and B are not empty:',
      '    pick the smaller frontier S',
      '    for u in S: expand u',
      '      for v in moves(u):',
      '        record parent; add v to next S',
      '        if v was seen by the other side: meet at v',
      '  return start → v → goal',
    ],
  },
};

export const ALGO_ORDER: AlgoId[] = ['bfs', 'dfs', 'iddfs', 'dijkstra', 'astar', 'greedy', 'bibfs'];

export const TOUR_CODE = [
  'Tour(u, step):',
  '  mark u with step',
  '  place knight on u',
  '  if step = n²: return success',
  '  options ← unvisited knight moves from u',
  "  sort options by onward moves (Warnsdorff's rule)",
  '  for v in options: if Tour(v, step + 1): return success',
  '  unmark u   ← backtrack',
  '  return failure',
];

export const QUEENS_CODE = [
  'Solve(row):',
  '  if row = n:',
  '    record the solution',
  '  for col in 0 … n − 1:',
  '    try (row, col)',
  '    if attacked by a queen above: skip',
  '    place queen at (row, col)',
  '    Solve(row + 1)',
  '    remove queen   ← backtrack',
];
