import { Board2D } from '../render/board2d';
import { THEMES, type BoardTheme } from '../render/palette';
import { Scene3D } from '../render/scene3d';
import { h } from './dom';
import { seg } from './widgets';

export type ViewMode = '2d' | '3d';

let persistedMode: ViewMode = '2d';
let persistedTheme = 0;

export const currentTheme = (): BoardTheme => THEMES[persistedTheme];

export interface Stage {
  root: HTMLElement;
  board2d: Board2D;
  mode: ViewMode;
  scene: Scene3D | null;
  /** lazily created the first time 3D is shown */
  ensureScene(): Scene3D;
  setMode(m: ViewMode): void;
  onMode(fn: (m: ViewMode) => void): void;
  onTheme(fn: (t: BoardTheme) => void): void;
  /** per-frame callback driven by requestAnimationFrame */
  loop(fn: (dt: number) => void): void;
  overlay: HTMLElement;
  dispose(): void;
  webgl: boolean;
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function createStage(root: HTMLElement, opts: { allow3D?: boolean; label3D?: string } = {}): Stage {
  const allow3D = (opts.allow3D ?? true) && hasWebGL();
  root.classList.add('stage');
  const canvas = h('canvas');
  const layer2d = h('div.layer.l2d', null, canvas);
  const layer3d = h('div.layer.l3d');
  const overlay = h('div.overlay');
  const tools = h('div.stage-tools');
  root.append(layer2d, layer3d, overlay, tools);

  const board2d = new Board2D(canvas);
  board2d.theme = currentTheme();
  const modeListeners: ((m: ViewMode) => void)[] = [];
  const themeListeners: ((t: BoardTheme) => void)[] = [];
  const loops: ((dt: number) => void)[] = [];
  let scene: Scene3D | null = null;
  let raf = 0;
  let last = performance.now();

  const stage: Stage = {
    root,
    board2d,
    mode: allow3D ? persistedMode : '2d',
    get scene() {
      return scene;
    },
    webgl: allow3D,
    overlay,
    ensureScene() {
      if (!scene) {
        scene = new Scene3D(layer3d);
        scene.setBoard({ size: 8, tiles: new Uint8Array(64) }, board2d.theme);
      }
      return scene;
    },
    setMode(m) {
      stage.mode = m;
      persistedMode = m;
      root.dataset.mode = m;
      if (m === '3d') stage.ensureScene().resize();
      modeListeners.forEach((f) => f(m));
    },
    onMode: (fn) => modeListeners.push(fn),
    onTheme: (fn) => themeListeners.push(fn),
    loop: (fn) => loops.push(fn),
    dispose() {
      cancelAnimationFrame(raf);
      scene?.dispose();
      root.replaceChildren();
      root.classList.remove('stage');
    },
  } as Stage;

  const themeSeg = seg(
    THEMES.map((t, i) => ({ value: i, label: t.name })),
    persistedTheme,
    (i) => {
      persistedTheme = i;
      board2d.theme = THEMES[i];
      themeListeners.forEach((f) => f(THEMES[i]));
    },
    'mini',
  );
  tools.append(themeSeg.el);
  if (allow3D) {
    const viewSeg = seg<ViewMode>(
      [
        { value: '2d', label: '2D' },
        { value: '3d', label: opts.label3D ?? '3D · Space-Time' },
      ],
      stage.mode,
      (m) => stage.setMode(m),
      'mini accent',
    );
    tools.prepend(viewSeg.el);
    root.addEventListener('stage:mode', (e) => viewSeg.set((e as CustomEvent<ViewMode>).detail));
  }

  root.dataset.mode = stage.mode;
  if (stage.mode === '3d') stage.ensureScene();

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const fn of loops) fn(dt);
  };
  raf = requestAnimationFrame(frame);
  return stage;
}
