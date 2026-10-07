/* Art.js - one door to every art module.

   The models live in GuideArt, PlayerArt, EnemyArt, CityProps and
   InteriorProps. They are loaded once at boot; if one fails to load (or a
   prop name is missing) a plain grey stand-in of about the right size is
   used instead, so a broken model never takes the whole game down. */
import * as THREE from '../../lib/three.module.js';

export const Art = { guide: null, player: null, enemy: null, city: null, interior: null, errors: [] };

export async function loadArt() {
  const load = async (k, path) => { try { Art[k] = await import(path); } catch (e) { Art.errors.push(k + ': ' + e.message); console.warn('art', k, e); window.__log?.('ART ' + k + ' failed: ' + e.message); } };
  await Promise.all([load('guide', './GuideArt.js'), load('player', './PlayerArt.js'), load('enemy', './EnemyArt.js'), load('city', './CityProps.js'), load('interior', './InteriorProps.js')]);
}

const SIZES = {
  car: [4.6, 1.45, 2.0], van: [5.4, 2.4, 2.2], transitPod: [10, 3.2, 2.8], dumpster: [2, 1.4, 1.2], garbagePile: [3, 1.4, 2.6], vendingMachine: [1.1, 2, 0.9],
  bed: [2, 0.6, 1.6], sofa: [2.2, 0.85, 0.95], desk: [1.6, 0.76, 0.8], bookshelf: [1, 2, 0.4], kitchenCounter: [3, 0.95, 0.65], fridge: [0.9, 1.9, 0.75],
  generator: [3, 1.8, 1.6], serverRack: [0.7, 2.1, 1.1], coolingUnit: [2.5, 4, 2.5], subwayCar: [16, 3.4, 3], cryoPod: [1.2, 2.3, 1.2], lockers: [2, 2, 0.5],
};
const greyMat = new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.8 });
function standIn(name, opts = {}) {
  const s = SIZES[name] || [0.8, 0.8, 0.8];
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), greyMat); m.position.y = s[1] / 2; g.add(m);
  g.userData.solid = opts.noSolid ? [] : [{ x: 0, y: s[1] / 2, z: 0, hw: s[0] / 2, hh: s[1] / 2, hd: s[2] / 2 }];
  g.userData.standIn = name;
  return g;
}
/** a prop by name from either prop library */
export function prop(name, opts = {}) {
  const f = Art.city?.PROPS?.[name] || Art.interior?.PROPS?.[name];
  if (f) { try { const o = f(opts); o.userData.solid ||= []; return o; } catch (e) { window.__log?.('ART prop ' + name + ': ' + e.message); } }
  return standIn(name, opts);
}
export const P = (name, opts) => () => prop(name, opts);
/** a pickup model */
export function item(name) {
  const f = Art.interior?.ITEMS?.[name];
  if (f) { try { return f(); } catch (e) { window.__log?.('ART item ' + name + ': ' + e.message); } }
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.4, metalness: 0.6, emissive: 0x204050, emissiveIntensity: 0.6 }));
  m.position.y = 0.05; g.add(m); return g;
}
/** an enemy model (EnemyArt) or a stand-in with the same interface */
export function enemyModel(type) {
  if (Art.enemy?.makeEnemy) { try { return Art.enemy.makeEnemy(type); } catch (e) { window.__log?.('ART enemy ' + type + ': ' + e.message); } }
  const h = { scout: 0.5, crawler: 0.5, dog: 0.9, hunter: 1.9, sentinel: 2.6, stalker: 2.5, medic: 1.8, construction: 3.4, heavy: 3, unknown: 2, foreman: 6 }[type] || 1.8;
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.22, h * 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.6 }));
  m.position.y = h / 2; root.add(m);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(h * 0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.2), toneMapped: false })); eye.position.set(0, h * 0.85, h * 0.2); root.add(eye);
  return { root, height: h, radius: h * 0.25, eyes: [eye], weakPoints: [{ id: 'core', label: 'core', node: m, r: h * 0.2 }], update() {}, setEyes(c, i) { eye.material.color.set(c).multiplyScalar(i || 2); } };
}
export function guideModel(opts) {
  if (Art.guide?.GuideModel) { try { return new Art.guide.GuideModel(opts); } catch (e) { window.__log?.('ART guide: ' + e.message); } }
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 12), new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.4 })); body.position.y = 0.45; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), body.material); head.position.y = 0.88; root.add(head);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2, 2.4), toneMapped: false })); face.position.set(0, 0.88, 0.25); root.add(face);
  return { root, head, handR: body, setDamaged() {}, setFace(e) { face.visible = e !== 'off'; }, update() {}, sparkPoints() { return []; } };
}
export function survivorModel(look) {
  if (Art.player?.SurvivorModel) { try { return new Art.player.SurvivorModel(look); } catch (e) { window.__log?.('ART player: ' + e.message); } }
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 10), new THREE.MeshStandardMaterial({ color: [0x5a6a40, 0x40506a, 0x6a4040, 0x605a50][look % 4], roughness: 0.8 }));
  m.position.y = 0.85; root.add(m);
  const a = new THREE.Object3D(); a.position.set(0.2, 1.4, 0.3); root.add(a);
  return { root, setLook() {}, update() {}, flashlightAnchor: a };
}
