/* PostFX.js - the cinematic layer between the scene and the screen.

   scene -> HDR target -> bright-pass -> 5-level blur pyramid (bloom)
   -> composite: bloom, tone mapping, lens dirt glow, chromatic aberration
   at the edges, vignette, film grain, a damage/static pulse and a
   colour grade (cool shadows, warm highlights).

   The renderer's own tone mapping is off while PostFX is on - it is done
   here in the composite pass so bloom happens in linear HDR. */
import * as THREE from '../../lib/three.module.js';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = `uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold + 0.6, l); gl_FragColor = vec4(c * k, 1.0); }`;

const BLUR = `uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 res; varying vec2 vUv;
void main(){ vec2 o = dir / res; vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
  c += texture2D(tDiffuse, vUv + o * 1.3846).rgb * 0.316216; c += texture2D(tDiffuse, vUv - o * 1.3846).rgb * 0.316216;
  c += texture2D(tDiffuse, vUv + o * 3.2308).rgb * 0.070270; c += texture2D(tDiffuse, vUv - o * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0); }`;

const COMPOSITE = `uniform sampler2D tDiffuse; uniform sampler2D b0; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3; uniform sampler2D b4;
uniform float bloom; uniform float exposure; uniform float time; uniform float grain; uniform float vignette; uniform float aberr;
uniform float hurt; uniform float staticAmt; uniform float sat; uniform vec3 tint; uniform float photo; uniform float blackout;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  // horizontal tearing when the signal is bad (static from the Conductor, EMP)
  if (staticAmt > 0.01) { float line = floor(uv.y * 90.0 + time * 40.0); float t = h(vec2(line, floor(time * 30.0))); if (t > 1.0 - staticAmt * 0.35) uv.x += (h(vec2(line, time)) - 0.5) * 0.06 * staticAmt; }
  vec2 dc = uv - 0.5; float r2 = dot(dc, dc);
  float ab = aberr * (0.4 + r2 * 3.0) + hurt * 0.006;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + dc * ab).r; col.g = texture2D(tDiffuse, uv).g; col.b = texture2D(tDiffuse, uv - dc * ab).b;
  vec3 bl = texture2D(b0, uv).rgb * 0.30 + texture2D(b1, uv).rgb * 0.26 + texture2D(b2, uv).rgb * 0.22 + texture2D(b3, uv).rgb * 0.2 + texture2D(b4, uv).rgb * 0.24;
  col += bl * bloom;
  col *= exposure;
  col = aces(col);
  // grade: cool shadows, warm highlights, controllable saturation
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, sat);
  col = mix(col * vec3(0.92, 1.0, 1.08), col * vec3(1.05, 1.0, 0.94), smoothstep(0.2, 0.8, l));
  col *= tint;
  // vignette + hurt red edges
  float v = smoothstep(0.85, 0.2, r2 * vignette * 2.2);
  col *= mix(1.0, v, 0.85);
  col = mix(col, col * vec3(1.4, 0.35, 0.3), hurt * smoothstep(0.05, 0.4, r2));
  // grain and static snow
  float g = h(uv * vec2(1920.0, 1080.0) + fract(time * 13.7) * 100.0) - 0.5;
  col += g * grain * (1.0 - l * 0.6);
  if (staticAmt > 0.01) col = mix(col, vec3(h(uv * 800.0 + time)), staticAmt * 0.18);
  col = mix(col, vec3(1.0), photo);
  col *= 1.0 - blackout;
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

export class PostFX {
  constructor(renderer) {
    this.r = renderer; this.enabled = true;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    const opt = { type: THREE.HalfFloatType, depthBuffer: true };
    this.main = new THREE.WebGLRenderTarget(4, 4, { ...opt, samples: 4 });
    this.levels = [];
    for (let i = 0; i < 5; i++) this.levels.push({ a: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }), b: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }) });
    this.bright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, uniforms: { tDiffuse: { value: null }, threshold: { value: 0.9 } }, depthTest: false, depthWrite: false });
    this.blur = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR, uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() }, res: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.comp = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, b4: { value: null },
        bloom: { value: 0.9 }, exposure: { value: 1.0 }, time: { value: 0 }, grain: { value: 0.022 }, vignette: { value: 1 }, aberr: { value: 0.0025 },
        hurt: { value: 0 }, staticAmt: { value: 0 }, sat: { value: 0.92 }, tint: { value: new THREE.Vector3(1, 1, 1) }, photo: { value: 0 }, blackout: { value: 0 },
      },
    });
    this.u = this.comp.uniforms;
    this.scale = 1;
    this.setSize(innerWidth, innerHeight);
  }
  setSize(w, h) {
    const pr = this.r.getPixelRatio();
    const W = Math.max(4, Math.floor(w * pr * this.scale)), H = Math.max(4, Math.floor(h * pr * this.scale));
    this.main.setSize(W, H);
    let bw = W >> 1, bh = H >> 1;
    for (const L of this.levels) { L.a.setSize(Math.max(2, bw), Math.max(2, bh)); L.b.setSize(Math.max(2, bw), Math.max(2, bh)); L.w = Math.max(2, bw); L.h = Math.max(2, bh); bw >>= 1; bh >>= 1; }
  }
  _pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }
  /** overlay = { scene, camera } drawn on top with a cleared depth buffer (the first-person hands) */
  render(scene, camera, dt = 0.016, overlay = null) {
    const r = this.r;
    if (!this.enabled) {
      r.toneMapping = THREE.ACESFilmicToneMapping; r.setRenderTarget(null); r.render(scene, camera);
      if (overlay) { r.autoClear = false; r.clearDepth(); r.render(overlay.scene, overlay.camera); r.autoClear = true; }
      return;
    }
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.main); r.render(scene, camera);
    if (overlay) { r.autoClear = false; r.clearDepth(); r.render(overlay.scene, overlay.camera); r.autoClear = true; }
    // bloom pyramid
    let src = this.main.texture;
    for (let i = 0; i < this.levels.length; i++) {
      const L = this.levels[i];
      if (i === 0) { this.bright.uniforms.tDiffuse.value = src; this._pass(this.bright, L.a); }
      else { this.blur.uniforms.tDiffuse.value = src; this.blur.uniforms.res.value.set(L.w, L.h); this.blur.uniforms.dir.value.set(0, 0); this._pass(this.blur, L.a); }
      this.blur.uniforms.res.value.set(L.w, L.h);
      this.blur.uniforms.tDiffuse.value = L.a.texture; this.blur.uniforms.dir.value.set(1, 0); this._pass(this.blur, L.b);
      this.blur.uniforms.tDiffuse.value = L.b.texture; this.blur.uniforms.dir.value.set(0, 1); this._pass(this.blur, L.a);
      src = L.a.texture;
    }
    const u = this.u;
    u.tDiffuse.value = this.main.texture;
    u.b0.value = this.levels[0].a.texture; u.b1.value = this.levels[1].a.texture; u.b2.value = this.levels[2].a.texture; u.b3.value = this.levels[3].a.texture; u.b4.value = this.levels[4].a.texture;
    u.time.value += dt;
    this._pass(this.comp, null);
  }
}
