/* Builder.js - the level kit. Level files describe places with it:

     B.box(x0,y0,z0, x1,y1,z1, 'concrete')        a solid block (walls, slabs, steps)
     B.wall(ax,az, bx,bz, y, h, mat, {openings})   a wall along X or Z with door/window holes
     B.room({...})                                 floor + ceiling + four walls
     B.stairs(x,y,z, dir, width, n)                a flight of steps
     B.prop(fn, x,y,z, rot, opts)                  an art-module prop, with its colliders and lights
     B.light(x,y,z, color, intensity, dist)        a light for the light pool
     B.node(x,y,z)                                 a navigation waypoint

   Static boxes are not separate meshes: they are merged per material and
   per 16 m chunk, with world-space UVs so textures run on seamlessly from
   one box to the next. finish() turns the buckets into meshes. */
import * as THREE from '../../lib/three.module.js';
import { Mat, Glow } from '../core/Textures.js';

// metres per texture repeat
const SCALE = { asphalt: 9, concrete: 3.5, concreteDark: 3.5, pavers: 4, plaster: 3, plasterBlue: 3, plasterGreen: 3, panelWhite: 3, panelGrey: 3, panelDark: 2.5, metal: 2.5, metalYellow: 2, metalRed: 2, metalBlue: 2, metalWhite: 2, rust: 2.5, steel: 2, tiles: 2, tilesSmall: 2, tilesSubway: 2.4, tilesGreen: 2.4, wood: 3, carpet: 2, carpetRed: 2, grate: 2, hazard: 1.2, tunnel: 5, rubber: 1, facadeA: 24, facadeB: 24, facadeC: 28, facadeDead: 24 };
const CHUNK = 16;

export class Builder {
  constructor(game, zone) {
    this.g = game; this.zone = zone;
    this.group = zone.group;
    this.phys = game.phys; this.nav = game.nav;
    this.buckets = new Map();
    this.updaters = [];
  }
  _bucket(mat, x, z) {
    const m = typeof mat === 'string' ? Mat(mat) : mat;
    const k = (m.name || m.uuid) + '|' + Math.floor(x / CHUNK) + '|' + Math.floor(z / CHUNK);
    let b = this.buckets.get(k);
    if (!b) { b = { m, p: [], n: [], uv: [], idx: [], scale: SCALE[m.name] || 3 }; this.buckets.set(k, b); }
    return b;
  }
  /** add one quad (4 corners in order) to a bucket, uvs from the world positions */
  _quad(b, a, bb, c, d, nx, ny, nz, uvf) {
    const base = b.p.length / 3;
    for (const v of [a, bb, c, d]) { b.p.push(v[0], v[1], v[2]); b.n.push(nx, ny, nz); const uv = uvf(v); b.uv.push(uv[0], uv[1]); }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** a solid axis aligned block. opt: {solid=true, faces:'all'|['px','nx','py','ny','pz','nz'], uv: metres per repeat, tag, noNav} */
  box(x0, y0, z0, x1, y1, z1, mat, opt = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
    const b = this._bucket(mat, (x0 + x1) / 2, (z0 + z1) / 2);
    const s = opt.uv || b.scale, f = opt.faces;
    const has = k => !f || f.includes(k);
    const ox = opt.uvOff || 0;
    // +x / -x faces use (z, y); +y/-y use (x, z); +z/-z use (x, y)
    if (has('px')) this._quad(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, v => [(-v[2] + ox) / s, v[1] / s]);
    if (has('nx')) this._quad(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, v => [(v[2] + ox) / s, v[1] / s]);
    if (has('py')) this._quad(b, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, v => [v[0] / s, -v[2] / s]);
    if (has('ny')) this._quad(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, v => [v[0] / s, v[2] / s]);
    if (has('pz')) this._quad(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, v => [(v[0] + ox) / s, v[1] / s]);
    if (has('nz')) this._quad(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, v => [(-v[0] + ox) / s, v[1] / s]);
    if (opt.solid !== false) { const pb = this.phys.aabb(x0, y0, z0, x1, y1, z1, opt.tag || null); pb.mat = b.m.name; return pb; }
    return null;
  }
  /** a flat one-sided quad (floors of big open areas, decals) facing up */
  floor(x0, z0, x1, z1, y, mat, opt = {}) { return this.box(x0, y - (opt.t || 0.3), z0, x1, y, z1, mat, { ...opt, faces: opt.faces || ['py'] }); }

  /** a wall along X (az === bz) or Z (ax === bx), thickness t centred on the line, bottom y, height h.
      openings: [{ u: distance from a, w, y: sill above floor (0 = door), h }] */
  wall(ax, az, bx, bz, y, h, mat, opt = {}) {
    const t = opt.t ?? 0.2, alongX = Math.abs(az - bz) < 1e-6;
    const L = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    const sx = alongX ? Math.sign(bx - ax) || 1 : 0, sz = alongX ? 0 : Math.sign(bz - az) || 1;
    const ops = (opt.openings || []).slice().sort((p, q) => p.u - q.u);
    const piece = (u0, u1, y0, y1) => {
      if (u1 - u0 < 1e-3 || y1 - y0 < 1e-3) return;
      const px0 = ax + sx * u0, px1 = ax + sx * u1, pz0 = az + sz * u0, pz1 = az + sz * u1;
      if (alongX) this.box(px0, y0, az - t / 2, px1, y1, az + t / 2, mat, opt);
      else this.box(ax - t / 2, y0, pz0, ax + t / 2, y1, pz1, mat, opt);
    };
    let u = 0;
    for (const o of ops) {
      const o0 = o.u - o.w / 2, o1 = o.u + o.w / 2, oy0 = y + (o.y || 0), oy1 = oy0 + o.h;
      piece(u, o0, y, y + h);
      piece(o0, o1, y, oy0);               // sill
      piece(o0, o1, oy1, y + h);           // lintel
      if (opt.frame) this._frame(ax + sx * o.u, az + sz * o.u, oy0, oy1, o.w, alongX, t, opt.frame);
      u = o1;
    }
    piece(u, L, y, y + h);
  }
  _frame(cx, cz, y0, y1, w, alongX, t, mat) {
    const f = 0.06, d = t / 2 + 0.03;
    if (alongX) {
      this.box(cx - w / 2 - f, y0, cz - d, cx - w / 2, y1, cz + d, mat, { solid: false });
      this.box(cx + w / 2, y0, cz - d, cx + w / 2 + f, y1, cz + d, mat, { solid: false });
      this.box(cx - w / 2 - f, y1, cz - d, cx + w / 2 + f, y1 + f, cz + d, mat, { solid: false });
    } else {
      this.box(cx - d, y0, cz - w / 2 - f, cx + d, y1, cz - w / 2, mat, { solid: false });
      this.box(cx - d, y0, cz + w / 2, cx + d, y1, cz + w / 2 + f, mat, { solid: false });
      this.box(cx - d, y1, cz - w / 2 - f, cx + d, y1 + f, cz + w / 2 + f, mat, { solid: false });
    }
  }
  /** a room: interior x0..x1, z0..z1 at floor y with height h. walls centred on the edges.
      o = { floor, wall, ceil, t, skip: ['n','s','e','w'], open: { n: [...openings], ... }, trim } (n = -z side) */
  room(x0, z0, x1, z1, y, h, o = {}) {
    const t = o.t ?? 0.2;
    if (o.floor !== null) this.box(x0 - t / 2, y - 0.25, z0 - t / 2, x1 + t / 2, y, z1 + t / 2, o.floor || 'concrete');
    if (o.ceil !== null) this.box(x0 - t / 2, y + h, z0 - t / 2, x1 + t / 2, y + h + 0.25, z1 + t / 2, o.ceil || 'plaster');
    const skip = o.skip || [], op = o.open || {}, wm = o.wall || 'plaster';
    const wopt = s => ({ t, openings: op[s], frame: o.frame });
    if (!skip.includes('n')) this.wall(x0 - t / 2, z0, x1 + t / 2, z0, y, h, wm, { ...wopt('n'), openings: (op.n || []).map(p => ({ ...p, u: p.u + t / 2 })) });
    if (!skip.includes('s')) this.wall(x0 - t / 2, z1, x1 + t / 2, z1, y, h, wm, { ...wopt('s'), openings: (op.s || []).map(p => ({ ...p, u: p.u + t / 2 })) });
    if (!skip.includes('w')) this.wall(x0, z0 + t / 2, x0, z1 - t / 2, y, h, wm, { ...wopt('w'), openings: (op.w || []).map(p => ({ ...p, u: p.u - t / 2 })) });
    if (!skip.includes('e')) this.wall(x1, z0 + t / 2, x1, z1 - t / 2, y, h, wm, { ...wopt('e'), openings: (op.e || []).map(p => ({ ...p, u: p.u - t / 2 })) });
    if (o.skirting) { // a dark baseboard all round
      const s = 0.1, k = o.skirting;
      this.box(x0 + t / 2, y, z0 + t / 2, x1 - t / 2, y + s, z0 + t / 2 + 0.02, k, { solid: false });
      this.box(x0 + t / 2, y, z1 - t / 2 - 0.02, x1 - t / 2, y + s, z1 - t / 2, k, { solid: false });
      this.box(x0 + t / 2, y, z0 + t / 2, x0 + t / 2 + 0.02, y + s, z1 - t / 2, k, { solid: false });
      this.box(x1 - t / 2 - 0.02, y, z0 + t / 2, x1 - t / 2, y + s, z1 - t / 2, k, { solid: false });
    }
  }
  /** a flight of n steps climbing toward dir ('n' = -z, 's' = +z, 'e' = +x, 'w' = -x) from (x, y, z) = the bottom front centre. Returns the top landing point. */
  stairs(x, y, z, dir, width, n, mat = 'concrete', rise = 0.2, run = 0.3, opt = {}) {
    const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0, dz = dir === 's' ? 1 : dir === 'n' ? -1 : 0;
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const a = i * run, b2 = (i + 1) * run, top = y + rise * (i + 1);
      const bottom = opt.solidUnder ? y - 0.05 : Math.max(y - 0.05, top - 0.45);
      if (dx) { const xa = x + dx * a, xb = x + dx * b2; this.box(Math.min(xa, xb), bottom, z - width / 2, Math.max(xa, xb), top, z + width / 2, mat); }
      else { const za = z + dz * a, zb = z + dz * b2; this.box(x - width / 2, bottom, Math.min(za, zb), x + width / 2, top, Math.max(za, zb), mat); }
      if (opt.underside !== false && !opt.solidUnder && i > 1) { // sloped soffit so the flight is not see-through from below
        const ub = top - 0.45;
        if (dx) { const xa = x + dx * a, xb = x + dx * b2; this.box(Math.min(xa, xb), ub - 0.2, z - width / 2, Math.max(xa, xb), ub, z + width / 2, mat, { solid: false, faces: ['ny', 'px', 'nx', 'pz', 'nz'] }); }
      }
      if (i % 3 === 1) nodes.push([x + dx * (a + run / 2), top, z + dz * (a + run / 2)]);
    }
    const end = [x + dx * n * run, y + rise * n, z + dz * n * run];
    if (!opt.noNav) { let prev = null; const pts = [[x - dx * 0.6, y, z - dz * 0.6], ...nodes, [end[0] + dx * 0.6, end[1], end[2] + dz * 0.6]]; for (const p of pts) { const nd = this.node(p[0], p[1], p[2]); if (prev) this.nav.join(prev, nd); prev = nd; } }
    return end;
  }
  /** place an art-module prop. fn(opts) -> Object3D with userData.solid / lights / update */
  prop(fn, x, y, z, rot = 0, opts = {}) {
    const o = typeof fn === 'function' ? fn(opts) : fn;
    o.position.set(x, y, z); o.rotation.y = rot;
    if (opts.scale) o.scale.setScalar(opts.scale);
    const sc = opts.scale || 1;
    this.group.add(o);
    o.traverse(c => { if (c.isMesh) { c.castShadow = opts.shadow !== false && !c.material.transparent; c.receiveShadow = true; } });
    const ud = o.userData;
    if (opts.solid !== false) for (const s of ud.solid || []) {
      const c = Math.cos(rot), sn = Math.sin(rot);
      const wx = x + (s.x * c + s.z * sn) * sc, wz = z + (-s.x * sn + s.z * c) * sc;
      const bx = this.phys.box(wx, wz, s.hw * sc, s.hd * sc, rot, y + (s.y - s.hh) * sc, y + (s.y + s.hh) * sc, opts.tag || null);
      (o.userData.boxes ||= []).push(bx);
    }
    for (const L of ud.lights || []) {
      const c = Math.cos(rot), sn = Math.sin(rot);
      this.light(x + (L.x * c + L.z * sn) * sc, y + L.y * sc, z + (-L.x * sn + L.z * c) * sc, L.color, L.intensity, L.distance, { ...opts.light, owner: o });
    }
    if (ud.update) this.updaters.push(o);
    return o;
  }
  /** a light for the pool. opt: {flicker 0..1, shadow, owner, dead} */
  light(x, y, z, color, intensity = 1, distance = 8, opt = {}) {
    return this.g.lights.add({ x, y, z, color: new THREE.Color(color), intensity, distance, zone: this.zone, flicker: opt.flicker || 0, owner: opt.owner || null, on: opt.on !== false, power: opt.power || null });
  }
  node(x, y, z, opt = {}) { return this.nav.add(x, y, z, this.zone.id, opt); }
  /** a row of nav nodes along a line every `step` metres */
  nodeLine(ax, y, az, bx, bz, step = 5) { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step)); for (let i = 0; i <= n; i++) this.node(ax + (bx - ax) * i / n, y, az + (bz - az) * i / n); }
  /** a glowing sign or screen: a canvas drawn by draw(ctx, w, h) */
  sign(x, y, z, rot, w, h, draw, opt = {}) {
    const res = opt.res || 256, cw = Math.round(res * Math.max(1, w / h)), ch = Math.round(res * Math.max(1, h / w));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    draw(c.getContext('2d'), cw, ch);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = opt.lit === false ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, transparent: !!opt.transparent }) : new THREE.MeshBasicMaterial({ map: t, transparent: !!opt.transparent, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(opt.glow ?? 1.6), side: opt.double ? THREE.DoubleSide : THREE.FrontSide, depthWrite: !opt.transparent });
    if (opt.additive) { m.blending = THREE.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x, y, z); mesh.rotation.y = rot; this.group.add(mesh);
    mesh.userData.canvas = c; mesh.userData.tex = t;
    return mesh;
  }
  /** a soft volumetric cone of light in the fog (street lamps, emergency lights) */
  cone(x, y, z, rTop, rBot, h, color, alpha = 0.12) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) }, alpha: { value: alpha } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 wp = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-wp.xyz); gl_Position = projectionMatrix * wp; }',
      fragmentShader: 'uniform vec3 color; uniform float alpha; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 1.5); float a = alpha * f * smoothstep(0.0, 0.35, vY) * smoothstep(1.0, 0.85, vY); gl_FragColor = vec4(color * a, 1.0); }',
    });
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 24, 1, true);
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y - h / 2, z); mesh.renderOrder = 5;
    this.group.add(mesh); return mesh;
  }
  add(o) { this.group.add(o); return o; }
  finish() {
    for (const b of this.buckets.values()) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.idx);
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, b.m);
      mesh.castShadow = !b.m.transparent; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.group.add(mesh);
    }
    this.buckets.clear();
    this.zone.updaters.push(...this.updaters);
  }
}
export { Glow };
