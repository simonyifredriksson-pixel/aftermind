/* Physics.js - the solid world: boxes, nothing else.

   Walls, floors, steps, furniture, cars and doors are all boxes (axis
   aligned, or turned about Y). Every box top is something you can stand on
   and every side is something that stops you; a box whose top is within a
   step of your feet is climbed instead of pushing you back, so stairs are
   just rows of low boxes. Boxes can be switched off (an open door) and moved
   (an elevator car carries whoever stands on it).

   A spatial hash over X/Z keeps queries local; ray casts walk the hash. */
const CELL = 6;
export const STEP = 0.42;

export class Physics {
  constructor() { this.map = new Map(); this.all = []; this.moving = new Set(); this._q = 0; }
  _key(i, j) { return i * 73856093 ^ j * 19349663; }
  _cells(b, f) {
    const i0 = Math.floor((b.cx - b.br) / CELL), i1 = Math.floor((b.cx + b.br) / CELL), j0 = Math.floor((b.cz - b.br) / CELL), j1 = Math.floor((b.cz + b.br) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) f(this._key(i, j));
  }
  _insert(b) { this._cells(b, k => { let s = this.map.get(k); if (!s) this.map.set(k, (s = [])); s.push(b); }); }
  _remove(b) { this._cells(b, k => { const s = this.map.get(k); if (s) { const i = s.indexOf(b); if (i >= 0) s.splice(i, 1); } }); }

  /** an axis aligned box from min/max corners */
  aabb(x0, y0, z0, x1, y1, z1, tag = null) {
    return this.box((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, Math.min(y0, y1), Math.max(y0, y1), tag);
  }
  /** a box centred at cx,cz with half sizes hw (local x), hd (local z), turned by rot about Y, spanning y0..y1 */
  box(cx, cz, hw, hd, rot, y0, y1, tag = null) {
    const b = { cx, cz, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot), y0, y1, br: Math.hypot(hw, hd), tag, on: true, id: this.all.length };
    this.all.push(b); this._insert(b); return b;
  }
  /** move a box (elevators, doors sliding) */
  move(b, cx, y0, cz) {
    const dy = y0 - b.y0;
    if (cx !== b.cx || cz !== b.cz) { this._remove(b); b.cx = cx; b.cz = cz; this._insert(b); }
    b.y0 += dy; b.y1 += dy;
  }
  setOn(b, on) { if (b) b.on = on; }

  near(x, z, f) { const s = this.map.get(this._key(Math.floor(x / CELL), Math.floor(z / CELL))); if (s) for (const b of s) if (b.on) f(b); }
  _local(b, x, z) { const dx = x - b.cx, dz = z - b.cz; return [dx * b.c - dz * b.s, dx * b.s + dz * b.c]; }
  inside(b, x, z, m = 0) { const [lx, lz] = this._local(b, x, z); return Math.abs(lx) <= b.hw + m && Math.abs(lz) <= b.hd + m; }

  /** highest box top under (x,z) that is no more than `step` above y (ground for feet at y) */
  ground(x, z, y, step = STEP, r = 0) {
    let best = -1e9, hit = null;
    const q = ++this._q;
    const visit = (b) => {
      if (b._q === q) return; b._q = q;
      if (b.y1 > y + step || b.y1 <= best) return;
      if (this.inside(b, x, z, r * 0.5)) { best = b.y1; hit = b; }
    };
    this.near(x, z, visit);
    if (r) { this.near(x + r, z, visit); this.near(x - r, z, visit); this.near(x, z + r, visit); this.near(x, z - r, visit); }
    this.lastGround = hit;
    return best;
  }
  /** lowest box bottom above head height (ceiling) */
  ceiling(x, z, y, h) {
    let best = 1e9;
    this.near(x, z, b => { if (b.y0 >= y + h - 0.1 && b.y0 < best && this.inside(b, x, z)) best = b.y0; });
    return best;
  }
  /** push a vertical cylinder (feet at pos.y, height h, radius r) out of every box it overlaps. */
  push(pos, r, h, ignoreTag = null) {
    let hit = false;
    const q = ++this._q;
    const c0 = Math.floor((pos.x - r) / CELL), c1 = Math.floor((pos.x + r) / CELL), d0 = Math.floor((pos.z - r) / CELL), d1 = Math.floor((pos.z + r) / CELL);
    for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
      const s = this.map.get(this._key(i, j)); if (!s) continue;
      for (const b of s) {
        if (!b.on || b._q === q) continue; b._q = q;
        if (ignoreTag && b.tag === ignoreTag) continue;
        if (b.y1 <= pos.y + STEP || b.y0 >= pos.y + h) continue;   // below the knees (a step) or above the head
        const [lx, lz] = this._local(b, pos.x, pos.z);
        const cx = Math.max(-b.hw, Math.min(b.hw, lx)), cz = Math.max(-b.hd, Math.min(b.hd, lz));
        let ex = lx - cx, ez = lz - cz; const d = Math.hypot(ex, ez);
        if (d >= r) continue;
        let mx, mz;
        if (d < 1e-6) { // centre inside the box: leave by the nearest side
          const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
          if (px < pz) { mx = (Math.sign(lx) || 1) * (px + r); mz = 0; } else { mx = 0; mz = (Math.sign(lz) || 1) * (pz + r); }
        } else { const k = (r - d) / d; mx = ex * k; mz = ez * k; }
        pos.x += mx * b.c + mz * b.s; pos.z += -mx * b.s + mz * b.c;
        hit = true;
      }
    }
    return hit;
  }
  /** a character step: horizontal move with collision, gravity, step-up, ceilings.
      body = { pos: {x,y,z}, vel: {x,y,z}, r, h, grounded } */
  stepBody(body, dt, gravity = 22) {
    const p = body.pos, v = body.vel;
    // horizontal in sub-steps so fast things do not tunnel through walls
    const dist = Math.hypot(v.x, v.z) * dt, n = Math.max(1, Math.ceil(dist / (body.r * 0.8)));
    for (let k = 0; k < n; k++) { p.x += v.x * dt / n; p.z += v.z * dt / n; this.push(p, body.r, body.h, body.ignore); }
    // vertical
    v.y -= gravity * dt;
    let ny = p.y + v.y * dt;
    const g = this.ground(p.x, p.z, p.y, body.grounded ? STEP : 0.05, body.r * 0.6);
    if (v.y > 0) { const c = this.ceiling(p.x, p.z, p.y, body.h); if (ny + body.h > c) { ny = Math.max(p.y, c - body.h); v.y = 0; } }
    if (ny <= g + 1e-4) {
      body.landV = body.grounded ? 0 : -v.y;
      ny = body.grounded || v.y <= 0 ? g : ny; if (ny <= g) { v.y = 0; body.grounded = true; }
      body.groundBox = this.lastGround;
    } else {
      // walking off a small ledge or down stairs: stick to the ground
      if (body.grounded && v.y <= 0 && p.y - g < STEP + 0.05 && g > -1e8) { ny = g; v.y = 0; body.groundBox = this.lastGround; }
      else { body.grounded = false; body.groundBox = null; }
      body.landV = 0;
    }
    p.y = ny;
    if (p.y < -60) { body.fell = true; }
  }

  /** ray cast against boxes: returns {t, box, nx, ny, nz} or null. dir must be normalised. */
  ray(ox, oy, oz, dx, dy, dz, maxT = 50, filter = null) {
    let best = null, bestT = maxT;
    const q = ++this._q;
    const steps = Math.ceil(maxT / (CELL * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t0 = s * CELL * 0.5; if (t0 > bestT + CELL) break;
      const x = ox + dx * t0, z = oz + dz * t0;
      for (let ii = -1; ii <= 1; ii++) for (let jj = -1; jj <= 1; jj++) {
        const set = this.map.get(this._key(Math.floor(x / CELL) + ii, Math.floor(z / CELL) + jj)); if (!set) continue;
        for (const b of set) {
          if (!b.on || b._q === q) continue; b._q = q;
          if (filter && !filter(b)) continue;
          const r = this._rayBox(b, ox, oy, oz, dx, dy, dz, bestT);
          if (r && r.t < bestT) { bestT = r.t; best = r; r.box = b; }
        }
      }
    }
    return best;
  }
  _rayBox(b, ox, oy, oz, dx, dy, dz, maxT) {
    const rx = ox - b.cx, rz = oz - b.cz;
    const lox = rx * b.c - rz * b.s, loz = rx * b.s + rz * b.c, ldx = dx * b.c - dz * b.s, ldz = dx * b.s + dz * b.c;
    let tmin = 0, tmax = maxT, nAxis = -1, nSign = 0;
    const slab = (o, d, lo, hi, axis) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = axis; nSign = s; }
      if (t2 < tmax) tmax = t2;
      return tmin <= tmax;
    };
    if (!slab(lox, ldx, -b.hw, b.hw, 0) || !slab(oy, dy, b.y0, b.y1, 1) || !slab(loz, ldz, -b.hd, b.hd, 2)) return null;
    if (tmin <= 0) return null; // started inside
    let nx = 0, ny = 0, nz = 0;
    if (nAxis === 1) ny = nSign; else if (nAxis === 0) { nx = nSign * b.c; nz = -nSign * b.s; } else if (nAxis === 2) { nx = nSign * b.s; nz = nSign * b.c; }
    return { t: tmin, nx, ny, nz };
  }
  /** is the straight line between two points clear? */
  clear(ax, ay, az, bx, by, bz, filter = null) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return true;
    return !this.ray(ax, ay, az, dx / L, dy / L, dz / L, L - 0.05, filter);
  }
}
