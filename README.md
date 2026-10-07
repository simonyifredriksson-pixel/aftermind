# AFTERMIND

A first-person sci-fi survival horror game for 1–4 players, in the browser. A virus turned a futuristic city's machines against the people who built them. You wake up in your flat in Halden Residences. The only machine you can still trust is GUIDE, your broken home robot, and you have to put him back together.

**Play:** open `index.html` through any static file server (for example `node tools/serve.mjs`, then go to http://127.0.0.1:8746).

## Controls
WASD move · Shift sprint · Space jump · C crouch (quiet) · F flashlight · R swap battery · E interact · 1–5 tools · Q put away · Right mouse: raise the camera / charge the prod · Left mouse: use · Tab objective · I pack · J Field Log · Esc pause · Enter chat (co-op)

## How it plays
- **Photograph machines, then show the photos to GUIDE.** He slowly remembers what they are. Each Field Log entry tells you how that machine behaves and where its weak point is (hits there do triple damage). It also unlocks recipes.
- **Components stay "unknown" until GUIDE recognises the machine they came from.** He builds tools from them: lock bypass, EMP, noise decoy, actuator patch, med foam and upgrades.
- **The flashlight lasts about five minutes per battery,** and it flickers as it dies. Stalkers can't move while your light is on them.
- **The puzzles are things a survivor would actually have to do.** Find a maintenance map. Replace a burnt fuse. Start a generator (one person primes it while another presses start). Reroute power when it can only carry two circuits. Rebuild a door actuator from a hunter's knee piston. When you play alone, GUIDE takes the second role.
- **Chapters:** Halden Residences → Meridian Avenue and Plaza → Meridian Station and Generator B → the maintenance tunnels → Helix shelter B4 → Forge Line 9 (FOREMAN) → the Archive.

## Co-op
HOST CO-OP gives you a five-letter code; friends press JOIN with it. The host runs the world: machines, GUIDE, doors and story. Each player keeps their own pack.

## Development
- Everything (models, textures, sound) is generated in code with three.js r160. There are no asset files.
- Run `node tools/stamp.mjs` after changing any `.js` file (it cache-busts the modules).
- Tests: `node tools/cdpshot.mjs "/?script=all" out.png 600` runs the story walkthrough (`?script=story`) and the gameplay checks (`?script=play`).
- Screenshots: `?shot=at&x=&y=&z=&yaw=&pitch=&skip=<step>&light=1`.
- Level files live in `src/world/levels/`. Each one builds its geometry, places its machines and defines its story steps.
