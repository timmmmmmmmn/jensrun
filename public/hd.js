// Ultra-graphics: alles wat de PS1-stand bewust weglaat. Echte schaduwen van de zon, materialen met
// glans (PBR), ambient occlusion in hoeken en kieren, gloed om lampen en een filmische kleurcurve.
// Alleen actief als Instellingen → Graphics op 'Ultra' staat (wisselen = pagina opnieuw laden,
// want de PS1-shaders worden bij het starten in three.js zelf gezet).
import * as T from './three.module.min.js';
import { EffectComposer } from './hd/postprocessing/EffectComposer.js';
import { RenderPass } from './hd/postprocessing/RenderPass.js';
import { GTAOPass } from './hd/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from './hd/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './hd/postprocessing/OutputPass.js';
import { RoomEnvironment } from './hd/environments/RoomEnvironment.js';

export const HD = (() => {
  try { return JSON.parse(localStorage.getItem('jensrun-v1'))?.set?.quality === 'ultra'; } catch (e) { return false; }
})();

// schaduw automatisch aan voor alles met een 'echt' materiaal; lucht, gloed en doorzichtige dingen niet
const echt = (m) => (Array.isArray(m) ? m.some(echt) : !!m && m.isMeshStandardMaterial && !m.transparent && m.side !== T.BackSide);
function metSchaduw(Base) {
  return class extends Base {
    constructor(...a) { super(...a); this._cs = this._rs = undefined; }
    get castShadow() { return this._cs ?? echt(this.material); }
    set castShadow(v) { this._cs = v; }
    get receiveShadow() { return this._rs ?? (Array.isArray(this.material) ? this.material.some((m) => m?.isMeshStandardMaterial) : !!this.material?.isMeshStandardMaterial); }
    set receiveShadow(v) { this._rs = v; }
  };
}
// Lambert (per hoekpunt) wordt een PBR-materiaal per pixel: mat met een klein beetje glans
class Lambert extends T.MeshStandardMaterial {
  constructor(p = {}) { super({ roughness: 0.78, metalness: 0, envMapIntensity: 0.55, ...p }); }
}
// mist: pas verderop dik (de PS1-mist begint vlak voor je neus om weinig te hoeven tekenen)
if (HD) T.ShaderChunk.fog_fragment = T.ShaderChunk.fog_fragment.replace('float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );', 'float fogFactor = pow( smoothstep( fogNear, fogFar, vFogDepth ), 1.8 );');
export const THREE = HD ? { ...T, MeshLambertMaterial: Lambert, Mesh: metSchaduw(T.Mesh), InstancedMesh: metSchaduw(T.InstancedMesh) } : T;

// textures: groot, scherp en zonder kartels op afstand
let maxAniso = 8;
export function hdTex(t) {
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = maxAniso;
  return t;
}

let composer, renderPass, gtao, bloom, mainScene, sun; const sunPos = new T.Vector3(), sunDoel = new T.Vector3(0, 0, -14);
export function hdSetup(renderer, scene, camera, zon) {
  mainScene = scene; sun = zon;
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  renderer.toneMapping = T.NeutralToneMapping; // houdt de kleuren vol (ACES maakt alles grijzig)
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const mobiel = Math.min(screen.width, screen.height) < 700;
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobiel ? 2048 : 4096, mobiel ? 2048 : 4096);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
  scene.add(sun.target);
  // zachte reflecties van een 'kamer' met lampen: glans op auto's, ramen en de beker
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const size = renderer.getDrawingBufferSize(new T.Vector2());
  const rt = new T.WebGLRenderTarget(size.x, size.y, { type: T.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: mobiel ? 8 : 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: mobiel ? 8 : 16 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
  bloom = new UnrealBloomPass(new T.Vector2(size.x, size.y), 0.32, 0.55, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
export function hdResize(renderer) {
  if (!composer) return;
  const s = renderer.getDrawingBufferSize(new T.Vector2());
  composer.setPixelRatio(1);
  composer.setSize(s.x, s.y);
}
export function hdRender(renderer, scene, camera) {
  // de schaduwcamera hangt boven het stuk straat voor Jens, in de richting die de game de zon geeft
  // (de game zet elk beeld alleen z: -6 als de camera van voren kijkt, anders 5)
  sun.target.position.copy(sunDoel);
  sun.position.copy(sunPos.set(-7, 10, sun.position.z < 0 ? -6 : 5)).normalize().multiplyScalar(60).add(sunDoel);
  renderPass.scene = scene; renderPass.camera = camera;
  // AO kent alleen de hoofdscene (minigames tekenen een eigen scene)
  gtao.enabled = scene === mainScene;
  if (gtao.enabled) gtao.camera = camera;
  composer.render();
}
