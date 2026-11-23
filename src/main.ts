import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/app.css';
import { fieldLab } from './labs/field';
import { mountHub } from './labs/hub';
import { learnLab } from './labs/learn';
import { pathfinderLab } from './labs/pathfinder';
import { queensLab } from './labs/queens';
import { raceLab } from './labs/race';
import { tourLab } from './labs/tour';
import type { Lab } from './labs/types';
import { h } from './ui/dom';
import { fromQuery, subscribe, toQuery } from './ui/store';

const LABS: Lab[] = [pathfinderLab, raceLab, tourLab, queensLab, fieldLab, learnLab];
const SETUP_LABS = new Set(['pathfinder', 'race', 'field']);

const view = h('main', { id: 'view' });
const rail = h(
  'nav.rail',
  { 'aria-label': 'Labs' },
  h('a.brand', { href: '#/', title: 'Chess Algorithms Hub' }, h('span', null, '♞'), h('b', null, 'Chess Algorithms')),
  ...LABS.map((l) =>
    h('a.nav', { href: `#/${l.id}`, 'data-id': l.id, style: { '--c': l.accent }, title: l.tagline }, h('i', { html: l.icon }), h('span', null, l.title)),
  ),
);
document.getElementById('app')!.append(h('div.shell', null, rail, view));

let unmount: (() => void) | null = null;
let current = '';

function parse(): { id: string; query: string } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [id, query = ''] = raw.split('?');
  return { id: id || 'home', query };
}

function route() {
  const { id, query } = parse();
  if (id !== current && SETUP_LABS.has(id) && query) fromQuery(query);
  if (id === current) return;
  current = id;
  unmount?.();
  unmount = null;
  view.className = '';
  view.replaceChildren();
  rail.querySelectorAll('.nav').forEach((a) => a.classList.toggle('active', (a as HTMLElement).dataset.id === id));
  const lab = LABS.find((l) => l.id === id);
  document.title = lab ? `${lab.title} · Chess Algorithms Hub` : 'Chess Algorithms Hub · see algorithms think';
  view.dataset.route = id;
  if (!lab) {
    const root = h('div.page-root');
    view.append(root);
    unmount = mountHub(root, LABS);
    return;
  }
  if (lab.layout === 'page') {
    const root = h('div.page-root');
    view.append(root);
    unmount = lab.mount({ stage: root, side: h('div'), dock: h('div') });
    return;
  }
  const stage = h('div.stage-host');
  const side = h('aside.side');
  const dock = h('footer.dock');
  view.append(h('div.lab', null, stage, side, dock));
  unmount = lab.mount({ stage, side, dock });
}

// keep the URL in sync with the board so any experiment is a shareable link
subscribe(() => {
  const { id } = parse();
  if (SETUP_LABS.has(id)) history.replaceState(null, '', `#/${id}?${toQuery()}`);
});

window.addEventListener('hashchange', route);
route();
