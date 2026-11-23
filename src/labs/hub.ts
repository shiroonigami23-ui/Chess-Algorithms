import * as THREE from 'three';
import { PIECES, makeBoard } from '../core/board';
import { knightsTour } from '../core/puzzles';
import { THEMES } from '../render/palette';
import { Scene3D } from '../render/scene3d';
import { h } from '../ui/dom';
import type { Lab } from './types';

const STATS: [string, string][] = [
  ['7', 'search algorithms'],
  ['6', 'chess pieces'],
  ['16×16', 'largest board'],
  ['4D', 'space + time views'],
];

export function mountHub(root: HTMLElement, labs: Lab[]): () => void {
  root.classList.add('hub');
  const heroCanvas = h('div.hero-3d');
  const cards = labs.map((lab, i) =>
    h(
      'a.card',
      { href: `#/${lab.id}`, style: { '--c': lab.accent, '--i': i } },
      h('div.glow'),
      h('div.ic', { html: lab.icon }),
      h('h3', null, lab.title),
      h('em', null, lab.tagline),
      h('p', null, lab.blurb),
      h('span.go', null, 'Open →'),
    ),
  );
  root.append(
    heroCanvas,
    h('div.hero', null,
      h('span.eyebrow', null, 'ALGORITHM HUB'),
      h('h1', null, 'See algorithms ', h('span.grad', null, 'think'), ' on a chessboard.'),
      h('p.lead', null, 'Pathfinding, tours and backtracking, replayed frame by frame in 2D and as a rising space-time landscape. Draw your own boards, race algorithms, and benchmark them.'),
      h('div.cta', null,
        h('a.btn.primary', { href: '#/pathfinder' }, 'Start with Pathfinder'),
        h('a.btn', { href: '#/race' }, 'Watch a race'),
      ),
      h('div.stats', null, ...STATS.map(([v, l]) => h('div', null, h('b', null, v), h('span', null, l)))),
    ),
    h('div.cards', null, ...cards),
    h('footer.foot', null,
      h('span', null, 'Built with TypeScript, Vite and Three.js · runs entirely in your browser'),
      h('a', { href: 'https://github.com/shiroonigami23-ui/Chess-Algorithms', target: '_blank', rel: 'noopener' }, 'GitHub'),
    ),
  );

  // pointer-follow glow on cards
  const onMove = (e: PointerEvent) => {
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
  };
  root.addEventListener('pointermove', onMove);

  // hero: endless knight's tour on an 8x8 board
  let scene: Scene3D | null = null;
  try {
    scene = new Scene3D(heroCanvas, { autoRotate: true });
    const sc = scene;
    sc.controls.enabled = false;
    sc.controls.autoRotateSpeed = 0.9;
    sc.setBoard(makeBoard(8), THEMES[0]);
    sc.camera.position.set(1, 11.5, 15);
    sc.world.position.x = 3.6;
    const tour = knightsTour(8, 0).order;
    const knight = sc.billboard(PIECES.knight.sprite, 1.3);
    let tube: THREE.Mesh | null = null;
    let lastStep = -1;
    const col = new THREE.Color();
    sc.onFrame = (_dt, time) => {
      const cycle = tour.length + 10;
      const k = (time * 5.5) % cycle;
      const step = Math.min(tour.length, Math.floor(k));
      if (step !== lastStep) {
        lastStep = step;
        for (let i = 0; i < 64; i++) sc.restCell(i);
        for (let j = 0; j < step; j++) {
          col.setHSL((190 + (j / 63) * 150) / 360, 0.85, 0.56);
          const top = j === step - 1;
          sc.setCell(tour[j], 0.12 + (j / 64) * 1.8, [col.r * (top ? 1.9 : 0.85), col.g * (top ? 1.9 : 0.85), col.b * (top ? 1.9 : 0.85)]);
        }
        sc.dispose3(tube);
        tube = null;
        if (step > 1) {
          const pts = tour.slice(0, step).map((c) => sc.cellPos(c, 0.12 + (tour.indexOf(c) / 64) * 1.8 + 0.3));
          tube = sc.tube(pts, '#fbbf24', 0.03);
        }
      }
      const cur = tour[Math.max(0, step - 1)];
      const target = sc.cellPos(cur, 0.12 + (Math.max(0, step - 1) / 64) * 1.8 + 0.12);
      knight.position.lerp(target, 0.2);
    };
  } catch {
    heroCanvas.classList.add('no-webgl');
  }

  return () => {
    root.removeEventListener('pointermove', onMove);
    scene?.dispose();
    root.replaceChildren();
    root.classList.remove('hub');
  };
}
