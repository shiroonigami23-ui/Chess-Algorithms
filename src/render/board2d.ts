/**
 * Canvas-2D board renderer. It owns the geometry (cell <-> pixel) and exposes
 * small drawing primitives; labs compose them every animation frame.
 */
import { type Board, Tile, rc, squareName } from '../core/board';
import { asset } from '../ui/dom';
import { type BoardTheme, COLORS, THEMES, rgba } from './palette';

const spriteCache = new Map<string, HTMLImageElement>();

export function sprite(name: string, onLoad?: () => void): HTMLImageElement {
  let img = spriteCache.get(name);
  if (!img) {
    img = new Image();
    img.src = asset(`pieces/maestro/${name}.svg`);
    spriteCache.set(name, img);
  }
  if (onLoad && !img.complete) img.addEventListener('load', onLoad, { once: true });
  return img;
}

export class Board2D {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  size = 8;
  theme: BoardTheme = THEMES[0];
  /** pixels per cell in CSS px */
  cell = 40;
  /** inner padding for coordinate labels */
  pad = 0;
  showLabels = true;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.classList.add('board2d');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  /** Fit a square board into the canvas' CSS box. */
  fit(size: number, labels = true) {
    this.size = size;
    this.showLabels = labels;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(60, Math.floor(rect.width));
    const hh = Math.max(60, Math.floor(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * this.dpr) || this.canvas.height !== Math.round(hh * this.dpr)) {
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(hh * this.dpr);
    }
    this.cssW = w;
    this.cssH = hh;
    this.pad = labels ? Math.min(22, Math.max(12, Math.min(w, hh) * 0.04)) : 0;
    this.cell = Math.floor((Math.min(w, hh) - this.pad * 2) / size);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  get originX() {
    return Math.round((this.cssW - this.cell * this.size) / 2);
  }
  get originY() {
    return Math.round((this.cssH - this.cell * this.size) / 2);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.cssW, this.cssH);
  }

  cellRect(i: number): [number, number, number, number] {
    const [r, c] = rc(this.size, i);
    return [this.originX + c * this.cell, this.originY + r * this.cell, this.cell, this.cell];
  }

  centre(i: number): [number, number] {
    const [x, y, w, h] = this.cellRect(i);
    return [x + w / 2, y + h / 2];
  }

  /** Cell under a pointer event, or -1. */
  hit(e: { clientX: number; clientY: number }): number {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.originX;
    const y = e.clientY - rect.top - this.originY;
    const c = Math.floor(x / this.cell);
    const r = Math.floor(y / this.cell);
    if (r < 0 || c < 0 || r >= this.size || c >= this.size) return -1;
    return r * this.size + c;
  }

  drawBoard(board: Board) {
    const { ctx, cell, size, theme } = this;
    const ox = this.originX;
    const oy = this.originY;
    // soft drop shadow under the whole board
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = theme.dark;
    ctx.fillRect(ox, oy, cell * size, cell * size);
    ctx.restore();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        const x = ox + c * cell;
        const y = oy + r * cell;
        ctx.fillStyle = (r + c) % 2 === 0 ? theme.light : theme.dark;
        ctx.fillRect(x, y, cell, cell);
        const t = board.tiles[i];
        if (t === Tile.Wall) {
          ctx.fillStyle = theme.wall;
          ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
          ctx.strokeStyle = 'rgba(255,255,255,.2)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 2.5, y + 2.5, cell - 5, cell - 5);
          ctx.strokeStyle = 'rgba(255,255,255,.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = -cell; k < cell; k += Math.max(6, cell / 5)) {
            ctx.moveTo(x + Math.max(0, k), y + Math.max(0, -k));
            ctx.lineTo(x + Math.min(cell, k + cell), y + Math.min(cell, cell - k));
          }
          ctx.stroke();
        } else if (t === Tile.Mud) {
          ctx.fillStyle = rgba(theme.mud, 0.75);
          ctx.fillRect(x, y, cell, cell);
          ctx.fillStyle = 'rgba(0,0,0,.25)';
          for (let k = 0; k < 5; k++) {
            const px = x + ((k * 37 + i * 13) % 100) / 100 * (cell - 6) + 3;
            const py = y + ((k * 61 + i * 29) % 100) / 100 * (cell - 6) + 3;
            ctx.beginPath();
            ctx.arc(px, py, Math.max(1.2, cell * 0.045), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, cell * size - 1, cell * size - 1);
    if (this.showLabels && cell >= 22) {
      ctx.fillStyle = theme.label;
      ctx.font = `600 ${Math.max(9, Math.min(12, cell * 0.28))}px "JetBrains Mono Variable", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let k = 0; k < size; k++) {
        ctx.fillText(String.fromCharCode(97 + k), ox + k * cell + cell / 2, oy + size * cell + this.pad * 0.55);
        ctx.fillText(String(size - k), ox - this.pad * 0.55, oy + k * cell + cell / 2);
      }
    }
  }

  fillCell(i: number, colour: string, inset = 0) {
    const [x, y, w, h] = this.cellRect(i);
    this.ctx.fillStyle = colour;
    this.ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  }

  glowCell(i: number, hex: string, strength = 1) {
    const [cx, cy] = this.centre(i);
    const r = this.cell * (0.7 + 0.25 * strength);
    const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(hex, 0.55 * strength));
    g.addColorStop(1, rgba(hex, 0));
    this.ctx.fillStyle = g;
    this.ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  ring(i: number, hex: string, width = 2, pulse = 0) {
    const [cx, cy] = this.centre(i);
    this.ctx.strokeStyle = hex;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, this.cell * (0.36 + pulse * 0.12), 0, Math.PI * 2);
    this.ctx.stroke();
  }

  text(i: number, s: string, colour = 'rgba(255,255,255,.8)', scale = 0.3) {
    const [cx, cy] = this.centre(i);
    this.ctx.fillStyle = colour;
    this.ctx.font = `600 ${Math.max(8, this.cell * scale)}px "JetBrains Mono Variable", ui-monospace, monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(s, cx, cy);
  }

  piece(i: number, name: string, scale = 0.86, lift = 0, alpha = 1, onLoad?: () => void) {
    const img = sprite(name, onLoad);
    if (!img.complete || !img.naturalWidth) return;
    const [x, y, w, h] = this.cellRect(i);
    const s = w * scale;
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.shadowColor = 'rgba(0,0,0,.55)';
    this.ctx.shadowBlur = this.cell * 0.18;
    this.ctx.shadowOffsetY = this.cell * 0.06;
    this.ctx.drawImage(img, x + (w - s) / 2, y + (h - s) / 2 - lift, s, s);
    this.ctx.restore();
  }

  /** Draw a polyline through cell centres with a glow. `upTo` can be fractional. */
  trail(cells: number[], hex: string, width = 3, upTo = cells.length - 1, glow = true) {
    if (cells.length < 2 || upTo <= 0) return;
    const { ctx } = this;
    const pts = cells.map((c) => this.centre(c));
    const last = Math.min(upTo, pts.length - 1);
    const full = Math.floor(last);
    const frac = last - full;
    const draw = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k <= full; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      if (frac > 0 && full + 1 < pts.length) {
        ctx.lineTo(pts[full][0] + (pts[full + 1][0] - pts[full][0]) * frac, pts[full][1] + (pts[full + 1][1] - pts[full][1]) * frac);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (glow) {
      ctx.strokeStyle = rgba(hex, 0.25);
      ctx.lineWidth = width * 3.2;
      draw();
    }
    ctx.strokeStyle = hex;
    ctx.lineWidth = width;
    draw();
    ctx.restore();
  }

  arrow(from: number, to: number, hex: string, width = 1.5) {
    const [x1, y1] = this.centre(from);
    const [x2, y2] = this.centre(to);
    const { ctx } = this;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(4, this.cell * 0.14);
    const ex = x2 - Math.cos(ang) * this.cell * 0.16;
    const ey = y2 - Math.sin(ang) * this.cell * 0.16;
    ctx.save();
    ctx.strokeStyle = hex;
    ctx.fillStyle = hex;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1 + Math.cos(ang) * this.cell * 0.16, y1 + Math.sin(ang) * this.cell * 0.16);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(ang - 0.5) * head, ey - Math.sin(ang - 0.5) * head);
    ctx.lineTo(ex - Math.cos(ang + 0.5) * head, ey - Math.sin(ang + 0.5) * head);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  squareLabel(i: number) {
    return squareName(this.size, i);
  }
}

export { COLORS };
