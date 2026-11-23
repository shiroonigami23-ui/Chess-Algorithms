/** Binary min-heap of integer items keyed by (priority, tie). Lazy deletion is left to callers. */
export class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  private ties: number[] = [];
  private seq: number[] = [];
  private counter = 0;

  get size() {
    return this.items.length;
  }

  push(item: number, key: number, tie = 0) {
    this.items.push(item);
    this.keys.push(key);
    this.ties.push(tie);
    this.seq.push(this.counter++);
    this.up(this.items.length - 1);
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.length - 1;
    this.swap(0, last);
    this.items.pop();
    this.keys.pop();
    this.ties.pop();
    this.seq.pop();
    if (this.items.length) this.down(0);
    return top;
  }

  private less(a: number, b: number) {
    if (this.keys[a] !== this.keys[b]) return this.keys[a] < this.keys[b];
    if (this.ties[a] !== this.ties[b]) return this.ties[a] < this.ties[b];
    return this.seq[a] < this.seq[b];
  }

  private swap(a: number, b: number) {
    for (const arr of [this.items, this.keys, this.ties, this.seq]) {
      const t = arr[a];
      arr[a] = arr[b];
      arr[b] = t;
    }
  }

  private up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  private down(i: number) {
    const n = this.items.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}
