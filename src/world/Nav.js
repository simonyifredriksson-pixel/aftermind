/* Nav.js - how machines find their way: a waypoint graph.

   Level code drops nodes in rooms, corridors, doorways and along stairs.
   link() joins every pair that can see each other at knee and chest height
   (doors are ignored when linking; a link that passes a door remembers it,
   and a closed door cuts that link at path time). A* over the graph, then
   the walker steers straight at the next node, or straight at the target
   when it has a clear line. */
export class Nav {
  constructor(phys) { this.phys = phys; this.nodes = []; this.grid = new Map(); }
  add(x, y, z, zone = null, opt = {}) {
    const n = { id: this.nodes.length, x, y, z, zone, links: [], dark: !!opt.dark, flying: !!opt.flying, tag: opt.tag || null };
    this.nodes.push(n);
    const k = this._k(x, z); let s = this.grid.get(k); if (!s) this.grid.set(k, (s = [])); s.push(n);
    return n;
  }
  _k(x, z) { return Math.floor(x / 8) * 10007 + Math.floor(z / 8); }
  nearby(x, z, f, rad = 1) { const i0 = Math.floor(x / 8), j0 = Math.floor(z / 8); for (let i = -rad; i <= rad; i++) for (let j = -rad; j <= rad; j++) { const s = this.grid.get((i0 + i) * 10007 + j0 + j); if (s) for (const n of s) f(n); } }
  /** join two nodes by hand (stairs, ladders, elevator shafts) */
  join(a, b, door = null) { if (!a.links.some(l => l.n === b)) a.links.push({ n: b, d: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), door }); if (!b.links.some(l => l.n === a)) b.links.push({ n: a, d: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), door }); }
  /** auto-link everything within maxD that has line of sight */
  link(maxD = 14) {
    const ph = this.phys, notDoor = b => b.tag !== 'door' && b.tag !== 'nolos';
    for (const a of this.nodes) {
      this.nearby(a.x, a.z, b => {
        if (b.id <= a.id) return;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > maxD || Math.abs(a.y - b.y) > 0.6 + d * 0.75) return;
        if (!ph.clear(a.x, a.y + 0.5, a.z, b.x, b.y + 0.5, b.z, notDoor)) return;
        if (!ph.clear(a.x, a.y + 1.3, a.z, b.x, b.y + 1.3, b.z, notDoor)) return;
        // a door in the way?
        let door = null;
        const hit = ph.ray(a.x, a.y + 1, a.z, (b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1), (b.y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1), (b.z - a.z) / (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1), Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), bx => bx.tag === 'door');
        if (hit) door = hit.box;
        this.join(a, b, door);
      }, 2);
    }
  }
  closest(x, y, z, needSight = true) {
    let best = null, bd = 1e9;
    this.nearby(x, z, n => {
      const d = Math.hypot(n.x - x, (n.y - y) * 3, n.z - z);
      if (d < bd && (!needSight || this.phys.clear(x, y + 0.6, z, n.x, n.y + 0.6, n.z, b => b.tag !== 'door' || b.on))) { bd = d; best = n; }
    }, 2);
    if (!best && needSight) return this.closest(x, y, z, false);
    return best;
  }
  /** A*: returns an array of nodes from near start to near goal, or null. canDoor(box) -> may pass a closed door */
  path(sx, sy, sz, gx, gy, gz, canDoor = null) {
    const a = this.closest(sx, sy, sz), b = this.closest(gx, gy, gz);
    if (!a || !b) return null;
    if (a === b) return [b];
    const open = [a], g = new Map([[a, 0]]), f = new Map([[a, 0]]), from = new Map();
    const hd = n => Math.hypot(n.x - b.x, n.y - b.y, n.z - b.z);
    let guard = 0;
    while (open.length && guard++ < 4000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (f.get(open[i]) < f.get(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === b) { const out = [cur]; let c = cur; while (from.has(c)) { c = from.get(c); out.unshift(c); } return out; }
      for (const l of cur.links) {
        if (l.door && l.door.on && !(canDoor && canDoor(l.door))) continue;
        const ng = g.get(cur) + l.d;
        if (ng < (g.get(l.n) ?? 1e9)) { g.set(l.n, ng); f.set(l.n, ng + hd(l.n)); from.set(l.n, cur); if (!open.includes(l.n)) open.push(l.n); }
      }
    }
    return null;
  }
}
