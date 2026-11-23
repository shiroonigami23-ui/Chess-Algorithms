# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-11-24

### Changed
- Rebuilt from a single static page into a multi-lab algorithm hub (Vite + TypeScript + Three.js)
- Repository renamed `Chess-Algorithms-` → `Chess-Algorithms`

### Added
- Labs: Pathfinder, Race, Knight's Tour, N-Queens, Reach, Arena, plus an animated hub
- 3D space-time view with bloom, tube paths and piece sprites; 2D canvas renderer with 3 themes
- Frame-accurate replay with scrubbing, speed control and synchronised pseudocode
- Greedy, IDDFS and Bidirectional BFS; mud/wall terrain; admissible per-piece heuristics
- URL-hash routing and shareable boards; responsive mobile layout
- 68 Vitest tests; CI runs typecheck, tests and build; Pages deploys the Vite build

### Fixed
- Pages workflow split into build and deploy jobs (fixes missing `github-pages` artifact)

### Removed
- Legacy `app.js`, `algorithms.js`, `ui.js`, `styles.css` and the "Quantum" mode

## [Unreleased] - 2026-11-13

### Documentation
- Rewrote README with badges, preview, feature & tech-stack tables, architecture diagram and roadmap
- Added `docs/ARCHITECTURE.md` (components, data flow, design decisions)
- Added `docs/ROADMAP.md` (milestones and long-term vision)
- Added real project visuals (demo GIFs / screenshots), SSH / GitHub CLI / ZIP / Codespaces access options and a `.devcontainer`

## [1.0.0] - 2026-03-07

### Added
- Race mode
- Compare mode
- Path mode
- Knight's Tour
- Heatmap
- Playback
- Board editor
- Themes
- Export
