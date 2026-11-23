/** Playback clock shared by every lab: a position `t` in [0, length] advanced by real time. */
export class Player {
  t = 0;
  length = 0;
  playing = false;
  speed = 1;
  loop = false;
  /** events per second at 1x; labs may override for short or long traces */
  baseRate = 30;
  private listeners = new Set<() => void>();

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  setLength(n: number, keepPosition = false) {
    this.length = n;
    // aim for ~12 s at 1x for long traces, never slower than 30 ev/s
    this.baseRate = Math.max(30, n / 12);
    if (!keepPosition) this.t = 0;
    else this.t = Math.min(this.t, n);
    this.emit();
  }

  get done() {
    return this.t >= this.length;
  }

  play() {
    if (this.length === 0) return;
    if (this.done) this.t = 0;
    this.playing = true;
    this.emit();
  }

  pause() {
    this.playing = false;
    this.emit();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.length, t));
    this.emit();
  }

  step(d: number) {
    this.playing = false;
    this.t = Math.max(0, Math.min(this.length, Math.round(this.t) + d));
    this.emit();
  }

  setSpeed(s: number) {
    this.speed = s;
    this.emit();
  }

  tick(dt: number) {
    if (!this.playing) return;
    this.t += dt * this.baseRate * this.speed;
    if (this.t >= this.length) {
      this.t = this.length;
      if (this.loop) this.t = 0;
      else this.playing = false;
    }
    this.emit();
  }
}
