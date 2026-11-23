/**
 * Turns an event trace into scrubbable state. `seek(t)` applies the first `t`
 * events; going backwards restores the nearest snapshot and replays forward,
 * so dragging the timeline is O(snapshot interval), never O(trace).
 */
import type { PathEvent, PathResult } from './pathfinding';

export const Status = { Unseen: 0, Open: 1, Closed: 2, Path: 3 } as const;

interface Snapshot {
  status: Uint8Array;
  side: Uint8Array;
  g: Float32Array;
  parent: Int32Array;
  line: number;
  meet: number;
  depth: number;
}

const INTERVAL = 192;

export class PathReplay {
  readonly n: number;
  readonly result: PathResult;
  readonly length: number;
  status: Uint8Array;
  side: Uint8Array;
  g: Float32Array;
  parent: Int32Array;
  line = 0;
  meet = -1;
  depth = 0;
  /** number of events currently applied */
  t = 0;
  /** highest g seen in the whole run, for normalising heights */
  readonly maxG: number;
  private snaps: Snapshot[] = [];

  constructor(result: PathResult, n: number) {
    this.n = n;
    this.result = result;
    this.length = result.events.length;
    this.status = new Uint8Array(n);
    this.side = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n).fill(-1);
    let maxG = 1;
    for (const e of result.events) if ((e.k === 'open' || e.k === 'close') && e.g > maxG) maxG = e.g;
    this.maxG = maxG;
    this.snaps.push(this.snapshot());
    // build snapshots in one forward pass
    for (let i = 0; i < this.length; i++) {
      this.apply(result.events[i]);
      this.t = i + 1;
      if (this.t % INTERVAL === 0) this.snaps.push(this.snapshot());
    }
    this.reset();
  }

  private snapshot(): Snapshot {
    return {
      status: this.status.slice(),
      side: this.side.slice(),
      g: this.g.slice(),
      parent: this.parent.slice(),
      line: this.line,
      meet: this.meet,
      depth: this.depth,
    };
  }

  private restore(s: Snapshot, t: number) {
    this.status.set(s.status);
    this.side.set(s.side);
    this.g.set(s.g);
    this.parent.set(s.parent);
    this.line = s.line;
    this.meet = s.meet;
    this.depth = s.depth;
    this.t = t;
  }

  private reset() {
    this.restore(this.snaps[0], 0);
  }

  private apply(e: PathEvent) {
    this.line = e.line;
    switch (e.k) {
      case 'open':
        if (this.status[e.cell] === Status.Unseen) this.status[e.cell] = Status.Open;
        this.g[e.cell] = e.g;
        this.side[e.cell] = e.side;
        this.parent[e.cell] = e.from;
        break;
      case 'close':
        this.status[e.cell] = Status.Closed;
        this.g[e.cell] = e.g;
        this.side[e.cell] = e.side;
        break;
      case 'reset':
        this.status.fill(0);
        this.parent.fill(-1);
        this.g.fill(0);
        this.depth = e.depth;
        break;
      case 'meet':
        this.meet = e.cell;
        break;
      case 'path':
        this.status[e.cell] = Status.Path;
        break;
    }
  }

  /** Move to exactly `t` applied events. */
  seek(t: number) {
    t = Math.max(0, Math.min(this.length, Math.round(t)));
    if (t === this.t) return;
    if (t < this.t) {
      const k = Math.min(this.snaps.length - 1, Math.floor(t / INTERVAL));
      this.restore(this.snaps[k], k * INTERVAL);
    }
    while (this.t < t) this.apply(this.result.events[this.t++]);
  }

  /** How many cells have been taken off the frontier so far. */
  expandedSoFar(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.status[i] === Status.Closed || this.status[i] === Status.Path) c++;
    return c;
  }
}
