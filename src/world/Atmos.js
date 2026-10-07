/* Atmos.js - weather, sky and the far city.

   - a storm sky dome: layered moving cloud noise lit from below by the city
   - the far skyline: hundreds of towers with lit windows and red aviation
     lights, and on the horizon the Spire, ringed in red - where the
     machines' leader lives (seen long before it is understood)
   - fog that eases between zone presets
   - rain: 9000 streaks in a box that follows the camera; a coarse roof map
     (a data texture over the whole map) hides drops under roofs, so it
     rains outside the window but not in the room
   - splashes, and lightning that lights the whole street for a moment
   - the reflection environment (a PMREM of a small neon-lit scene) */
import * as THREE from '../../lib/three.module.js';

const ROOF_N = 256, ROOF_SIZE = 640; // roof map covers -320..320 in x and z

export class Atmos {
  constructor(game) {
    this.g = game; const scene = game.scene;
    this.fog = new THREE.FogExp2(0x0b1016, 0.025); scene.fog = this.fog;
    scene.background = new THREE.Color(0x05070a);
    this.fogTarget = { color: new THREE.Color(0x0b1016), density: 0.025 };
    this.rainAmt = 1; this.rainTarget = 1; this.lightningT = 12 + Math.random() * 20; this.flash = 0;
    this._sky(scene); this._skyline(scene); this._rain(scene); this._env(game.renderer, scene);
    this.moon = new THREE.DirectionalLight(0x8fa8c8, 0.25); this.moon.position.set(-40, 80, 30); scene.add(this.moon); scene.add(this.moon.target);
    this.hemi = new THREE.HemisphereLight(0x3a4a5c, 0x0d0b0a, 0.25); scene.add(this.hemi);
  }
  /* ---------------- sky ---------------- */
  _sky(scene) {
    this.skyU = { time: { value: 0 }, flash: { value: 0 }, glow: { value: new THREE.Color(0x3a2a40) } };
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform float time; uniform float flash; uniform vec3 glow; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += n(p) * a; p *= 2.03; a *= 0.5; } return s; }
        void main(){ vec3 d = normalize(vP); float up = max(d.y, 0.0);
          vec2 uv = d.xz / (d.y + 0.15) * 1.4 + vec2(time * 0.012, time * 0.004);
          float c = fbm(uv) * 0.7 + fbm(uv * 2.7 - time * 0.01) * 0.3;
          vec3 base = mix(vec3(0.035, 0.04, 0.05), vec3(0.012, 0.014, 0.02), smoothstep(0.0, 0.6, up));
          // city glow from below on the clouds, strongest at the horizon
          vec3 cg = glow * (0.55 * smoothstep(0.5, 0.0, up) + 0.25 * c);
          vec3 col = base + cg * c + vec3(c * 0.03);
          col += vec3(0.55, 0.6, 0.75) * flash * (0.4 + c);
          col = mix(col, vec3(0.06, 0.065, 0.075), smoothstep(0.02, -0.2, d.y));
          gl_FragColor = vec4(col, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), m); this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky);
  }
  /* ---------------- far skyline ---------------- */
  _skyline(scene) {
    const g = new THREE.Group(); g.name = 'skyline'; this.skyline = g;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512; const cx = cv.getContext('2d');
    cx.fillStyle = '#000'; cx.fillRect(0, 0, 128, 512);
    for (let y = 0; y < 512; y += 8) for (let x = 0; x < 128; x += 6) { const r = Math.random(); if (r < 0.12) { cx.fillStyle = r < 0.06 ? '#ffcf8a' : r < 0.1 ? '#8fd0ff' : '#ff9a6a'; cx.globalAlpha = 0.4 + Math.random() * 0.6; cx.fillRect(x + 1, y + 2, 4, 4); } }
    cx.globalAlpha = 1;
    const winTex = new THREE.CanvasTexture(cv); winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.repeat.set(3, 6); winTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.8, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55, fog: true });
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    // per-tower UV scale so window grids keep their size: done by many instances sharing one texture repeat (acceptable at this distance)
    const N = 420, inst = new THREE.InstancedMesh(geo, mat, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const reds = [];
    let k = 0;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 230 + Math.random() * 420;
      const w = 14 + Math.random() * 30, h = 40 + Math.random() ** 1.6 * 260, d = 14 + Math.random() * 30;
      p.set(Math.cos(a) * r, -2, Math.sin(a) * r); s.set(w, h, d); q.setFromEuler(new THREE.Euler(0, Math.random() * 3, 0));
      m4.compose(p, q, s); inst.setMatrixAt(k++, m4);
      if (h > 140 && Math.random() < 0.6) reds.push(new THREE.Vector3(p.x, h - 2, p.z));
    }
    inst.count = k; g.add(inst);
    // aviation lights
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(reds.flatMap(v => [v.x, v.y, v.z]), 3));
    this.redMat = new THREE.PointsMaterial({ color: new THREE.Color(4, 0.3, 0.2), size: 3, sizeAttenuation: true, fog: false, toneMapped: false });
    g.add(new THREE.Points(rg, this.redMat));
    // the Spire: a black needle on the horizon with a red ring and its glyph
    const spire = new THREE.Group(); spire.position.set(-120, 0, -560); this.spire = spire;
    const sm = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.4, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 34, 520, 6, 1), sm); body.position.y = 260; spire.add(body);
    for (let i = 0; i < 3; i++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(6, 300, 60), sm); fin.position.y = 150; fin.rotation.y = i * Math.PI * 2 / 3; fin.position.x = Math.cos(i * 2.094) * 20; fin.position.z = Math.sin(i * 2.094) * 20; spire.add(fin); }
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.25, 0.2), toneMapped: false, fog: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(46, 1.6, 8, 96), this.ringMat); ring.position.y = 380; ring.rotation.x = Math.PI / 2; spire.add(ring); this.ring = ring;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(30, 1, 8, 64), this.ringMat); ring2.position.y = 300; ring2.rotation.x = Math.PI / 2; spire.add(ring2); this.ring2 = ring2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 900, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.08, 0.06), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    beam.position.y = 970; spire.add(beam);
    g.add(spire);
    scene.add(g);
  }
  /* ---------------- rain ---------------- */
  _rain(scene) {
    const N = 7000, pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 44 - 22, y = Math.random() * 24, z = Math.random() * 44 - 22, s = Math.random();
      pos.set([x, y, z, x, y, z], i * 6); seed[i * 2] = s; seed[i * 2 + 1] = s;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const end = new Float32Array(N * 2); for (let i = 0; i < N; i++) end[i * 2 + 1] = 1; geo.setAttribute('tail', new THREE.BufferAttribute(end, 1));
    this.roofData = new Uint8Array(ROOF_N * ROOF_N); this.roofData.fill(0);
    this.roofTex = new THREE.DataTexture(this.roofData, ROOF_N, ROOF_N, THREE.RedFormat, THREE.UnsignedByteType); this.roofTex.needsUpdate = true;
    this.rainU = { time: { value: 0 }, cam: { value: new THREE.Vector3() }, amt: { value: 1 }, roof: { value: this.roofTex }, wind: { value: new THREE.Vector2(1.2, 0.4) }, flash: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.rainU, fog: false,
      vertexShader: `attribute float seed; attribute float tail; uniform float time; uniform vec3 cam; uniform float amt; uniform sampler2D roof; uniform vec2 wind; varying float vA;
        void main(){
          vec3 p = position; float sp = 14.0 + seed * 6.0;
          p.y = mod(p.y - time * sp + seed * 40.0, 24.0) - 8.0;
          vec3 w = vec3(mod(p.x - cam.x + 22.0, 44.0) - 22.0 + cam.x, p.y + cam.y, mod(p.z - cam.z + 22.0, 44.0) - 22.0 + cam.z);
          w.xz += wind * (p.y / 24.0);
          float L = 0.45 + seed * 0.3;
          w += tail * vec3(-wind.x * 0.04, L, -wind.y * 0.04);
          vec2 ruv = (w.xz + ${(ROOF_SIZE / 2).toFixed(1)}) / ${ROOF_SIZE.toFixed(1)};
          float rh = texture2D(roof, ruv).r * 255.0 * 0.25 - 2.0; // roof height in metres (0 = open sky)
          float under = (texture2D(roof, ruv).r > 0.0 && w.y < rh) ? 0.0 : 1.0;
          vA = (seed < amt ? 1.0 : 0.0) * under * (0.55 + tail * 0.45);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: 'varying float vA; uniform float flash; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(vec3(0.42, 0.48, 0.56) * vA * (0.16 + flash * 1.6), 1.0); }',
    });
    this.rain = new THREE.LineSegments(geo, m); this.rain.frustumCulled = false; this.rain.renderOrder = 4; scene.add(this.rain);
    // splashes: little rings flashing on the ground near the camera (outdoor zones)
    const SN = 260, sp = new Float32Array(SN * 3), sl = new Float32Array(SN);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('life', new THREE.BufferAttribute(sl, 1));
    this.splash = { geo: sg, pos: sp, life: sl, n: SN };
    const smat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'attribute float life; varying float vL; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (1.0 - life) * 90.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vL; void main(){ if (vL <= 0.0) discard; vec2 c = gl_PointCoord - 0.5; float r = length(c); float ring = smoothstep(0.5, 0.42, r) * smoothstep(0.25, 0.4, r); gl_FragColor = vec4(vec3(0.5, 0.56, 0.62) * ring * vL * 0.7, 1.0); }' });
    this.splashPts = new THREE.Points(sg, smat); this.splashPts.frustumCulled = false; scene.add(this.splashPts);
  }
  /** mark a rectangle as roofed (no rain under roofY) */
  roof(x0, z0, x1, z1, roofY) {
    const toI = v => Math.floor((v + ROOF_SIZE / 2) / ROOF_SIZE * ROOF_N);
    const v = Math.max(1, Math.min(255, Math.round((roofY + 2) * 4)));
    for (let j = Math.max(0, toI(Math.min(z0, z1))); j <= Math.min(ROOF_N - 1, toI(Math.max(z0, z1))); j++)
      for (let i = Math.max(0, toI(Math.min(x0, x1))); i <= Math.min(ROOF_N - 1, toI(Math.max(x0, x1))); i++) this.roofData[j * ROOF_N + i] = Math.max(this.roofData[j * ROOF_N + i], v);
    this.roofTex.needsUpdate = true;
  }
  roofAt(x, z) { const i = Math.floor((x + ROOF_SIZE / 2) / ROOF_SIZE * ROOF_N), j = Math.floor((z + ROOF_SIZE / 2) / ROOF_SIZE * ROOF_N); if (i < 0 || j < 0 || i >= ROOF_N || j >= ROOF_N) return -99; const v = this.roofData[j * ROOF_N + i]; return v ? v / 4 - 2 : -99; }
  /* ---------------- reflections ---------------- */
  _env(renderer, scene) {
    const es = new THREE.Scene(); es.background = new THREE.Color(0x0a0d12);
    const add = (c, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); es.add(m); };
    add(0x2a3a4c, 0, 30, 0, 80, 1, 80);           // overcast sky
    add(0x6a3040, 0, 4, -30, 60, 6, 1);           // city glow
    add(0x1080a0, -25, 3, 6, 1, 3, 10);           // cyan neon
    add(0xa02050, 25, 4, -4, 1, 2, 8);            // magenta neon
    add(0xc89050, 8, 6, 25, 10, 2, 1);            // warm windows
    add(0x101418, 0, -5, 0, 80, 1, 80);           // ground
    const pm = new THREE.PMREMGenerator(renderer);
    this.envTex = pm.fromScene(es, 0.03).texture; scene.environment = this.envTex;
    pm.dispose();
  }
  setFog(color, density) { this.fogTarget.color.set(color); this.fogTarget.density = density; }
  update(dt, cam, zone) {
    const t = (this.time = (this.time || 0) + dt);
    this.skyU.time.value = t; this.rainU.time.value = t; this.rainU.cam.value.copy(cam.position);
    this.fog.color.lerp(this.fogTarget.color, 1 - Math.exp(-dt * 1.5));
    this.fog.density += (this.fogTarget.density - this.fog.density) * (1 - Math.exp(-dt * 1.5));
    this.g.scene.background.copy(this.fog.color);
    this.rainAmt += (this.rainTarget - this.rainAmt) * (1 - Math.exp(-dt));
    this.rainU.amt.value = this.rainAmt;
    this.skyline.position.set(cam.position.x * 0.9, 0, cam.position.z * 0.9);
    this.sky.position.copy(cam.position);
    // aviation lights blink, the Spire ring breathes
    this.redMat.size = Math.sin(t * 2.4) > 0.2 ? 3 : 1.2;
    const pulse = 0.65 + 0.35 * Math.sin(t * 0.9);
    this.ringMat.color.setRGB(3.5 * pulse, 0.25 * pulse, 0.2 * pulse);
    this.ring.rotation.z = t * 0.05; this.ring2.rotation.z = -t * 0.08;
    // lightning
    const outdoor = zone && zone.outdoor;
    this.lightningT -= dt;
    if (this.lightningT <= 0 && this.rainAmt > 0.3) { this.lightningT = 18 + Math.random() * 35; this.strike(); }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    const fl = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(t * 60)) : 0;
    this.skyU.flash.value = fl; this.rainU.flash.value = fl;
    this.moon.intensity = 0.25 + fl * (outdoor ? 6 : 1.2);
    this.hemi.intensity = (zone?.hemi ?? 0.25) + fl * (outdoor ? 1.2 : 0.2);
    // splashes
    const S = this.splash;
    if (outdoor && this.rainAmt > 0.1) {
      for (let i = 0; i < S.n; i++) {
        S.life[i] -= dt * 4;
        if (S.life[i] <= 0 && Math.random() < this.rainAmt * 0.5) {
          const x = cam.position.x + (Math.random() - 0.5) * 24, z = cam.position.z + (Math.random() - 0.5) * 24;
          if (this.roofAt(x, z) > -90) continue;
          const gy = this.g.phys.ground(x, z, cam.position.y, 0.5);
          if (gy < -50) continue;
          S.pos[i * 3] = x; S.pos[i * 3 + 1] = gy + 0.02; S.pos[i * 3 + 2] = z; S.life[i] = 1;
        }
      }
    } else for (let i = 0; i < S.n; i++) S.life[i] = Math.max(0, S.life[i] - dt * 4);
    S.geo.attributes.position.needsUpdate = true; S.geo.attributes.life.needsUpdate = true;
  }
  strike() {
    this.flash = 1;
    const d = 200 + Math.random() * 600;
    const a = this.g.audio;
    if (a && this.g.zone?.outdoor !== undefined) { if (a.thunder) a.thunder(d); else a.distantBang?.(); }
    if (this.g.director) this.g.director.onLightning?.();
  }
}
