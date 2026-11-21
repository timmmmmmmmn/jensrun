// Bouwt de Windows 10 Mobile-versie van Jens Run: public/wp.html + public/wp/ (game.js en style.css).
// EdgeHTML 13–15 kent geen modules, geen WebGL2 en veel moderne JS/CSS niet, dus: three.js r162
// (de laatste met WebGL1), alles in één script omgezet naar ES2015, CSS-variabelen ingevuld.
// Gebruik: cd wp && npm install && node build.mjs
import * as esbuild from 'esbuild';
import swc from '@swc/core';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import customProps from 'postcss-custom-properties';
import { transform as lcss, browserslistToTargets } from 'lightningcss';
import * as acorn from 'acorn';
import { execFileSync } from 'node:child_process';
import edge13, { onopgelost } from './edge13css.mjs';

const hier = path.dirname(new URL(import.meta.url).pathname);
const pub = path.join(hier, '../public');
const uit = path.join(pub, 'wp');
fs.mkdirSync(uit, { recursive: true });

// ---------- afbeeldingen en geluid voor de Lumia (1 GB RAM) ----------
// Gedecodeerde plaatjes staan op ware grootte in het geheugen (splash.jpg van 2400×1600 = 15 MB) en Web Audio bewaart
// geluid als 32-bit stereo op 48 kHz (~68 MB voor alles wat bij de start laadt). Daarom kopieën in public/wp/:
// plaatjes niet groter dan het scherm (480×800) nodig heeft, geluid mono op 22,05 kHz. Alleen opnieuw als de bron nieuwer is.
const nieuwer = (bron, doel) => !fs.existsSync(doel) || fs.statSync(doel).mtimeMs < fs.statSync(bron).mtimeMs;
const allesIn = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allesIn(path.join(d, e.name)) : [path.join(d, e.name)]));
const MAAT = { 'img/splash.jpg': 1000, 'img/menu-bg.jpg': 800, 'img/iconen.png': 768 };
let nPlaatjes = 0, nGeluid = 0;
for (const bron of [...allesIn(path.join(pub, 'img')), ...allesIn(path.join(pub, 'icons'))]) {
  const rel = path.relative(pub, bron), doel = path.join(uit, rel);
  if (!/\.(png|jpe?g|webp)$/i.test(bron) || !nieuwer(bron, doel)) continue;
  fs.mkdirSync(path.dirname(doel), { recursive: true });
  const maat = MAAT[rel] || (rel.startsWith('img/mode/') ? 400 : 256);
  const [w, h] = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', bron]).toString().match(/\d+(?=\s*$)/gm).map(Number);
  if (Math.max(w, h) > maat) execFileSync('sips', ['-Z', String(maat), ...(/\.jpe?g$/i.test(bron) ? ['-s', 'formatOptions', '82'] : []), bron, '--out', doel], { stdio: 'ignore' });
  else fs.copyFileSync(bron, doel);
  nPlaatjes++;
}
for (const bron of allesIn(path.join(pub, 'audio'))) {
  const rel = path.relative(pub, bron), doel = path.join(uit, rel);
  if (!nieuwer(bron, doel)) continue;
  fs.mkdirSync(path.dirname(doel), { recursive: true });
  if (/\.mp3$/i.test(bron)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', bron, '-ac', '1', '-ar', '22050', '-b:a', '48k', doel]);
  else if (/\.json$/i.test(bron)) fs.writeFileSync(doel, fs.readFileSync(bron, 'utf8').replace(/"audio\//g, '"wp/audio/'));
  else continue;
  nGeluid++;
}
if (nPlaatjes || nGeluid) console.log('omgezet:', nPlaatjes, 'plaatjes,', nGeluid, 'geluiden');

// een tekst moet precies één keer voorkomen, anders is game.js veranderd en klopt de patch niet meer
const vervang = (src, oud, nieuw, wat) => {
  const n = src.split(oud).length - 1;
  if (n !== 1) throw new Error(`patch '${wat}': ${n}× gevonden in plaats van 1×`);
  return src.replace(oud, () => nieuw);
};

// WebGL1-shaders (GLSL ES 1.00) kennen geen bitoperaties: dezelfde bayer-dither met floats
const BAYER_OUD = `ivec2 psxP = ivec2(gl_FragCoord.xy) & 3;
    int psxQ = psxP.x ^ psxP.y;
    float psxD = (float((psxQ & 1) * 8 + (psxP.y & 1) * 4 + ((psxQ >> 1) & 1) * 2 + ((psxP.y >> 1) & 1)) + 0.5) / 16.0;`;
const BAYER_NIEUW = `vec2 psxP = mod(floor(gl_FragCoord.xy), 4.0);
    vec2 psxB0 = mod(psxP, 2.0), psxB1 = floor(psxP / 2.0);
    float psxD = (abs(psxB0.x - psxB0.y) * 8.0 + psxB0.y * 4.0 + abs(psxB1.x - psxB1.y) * 2.0 + psxB1.y + 0.5) / 16.0;`;

let tla = 0, kaal = 0;
const wp = {
  name: 'wp',
  setup(b) {
    b.onResolve({ filter: /^\.\/three\.module\.min\.js$/ }, () => ({ path: path.join(hier, 'node_modules/three/build/three.module.js') }));
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(hier, 'node_modules/three/build/three.module.js') }));
    b.onResolve({ filter: /^\.\/hd\.js$/ }, () => ({ path: path.join(hier, 'hd-stub.js') }));
    // alleen de three-onderdelen die de game gebruikt (THREE.X), dan gooit esbuild de rest weg (minder JS = minder RAM)
    b.onLoad({ filter: /wp\/hd-stub\.js$/ }, (a) => {
      const namen = [...new Set([...fs.readFileSync(path.join(pub, 'game.js'), 'utf8').match(/\bTHREE\.[A-Za-z_$][\w$]*/g).map((x) => x.slice(6)), 'Frustum', 'Sphere', 'Matrix4', 'Vector3'])].sort(); // + wat de patches gebruiken
      let src = fs.readFileSync(a.path, 'utf8');
      src = vervang(src, "import * as T from 'three';", `import { ${namen.join(', ')} } from 'three';`, 'three-namen');
      src = vervang(src, 'export const THREE = T;', `export const THREE = { ${namen.join(', ')} };`, 'three-obj');
      return { contents: src, loader: 'js', resolveDir: hier };
    });
    b.onResolve({ filter: /^\.\/eiland\.js$/ }, () => ({ path: path.join(hier, 'eiland-stub.js') }));
    // three.js op WebGL1 zonder EXT_sRGB (de Lumia) zet elke sRGB-textuur bij elke upload op de CPU om (Math.pow per
    // pixel, extra canvas): op de telefoon tientallen seconden vast en een geheugenpiek. Hier decodeert de GPU ze, net als
    // three dat al voor videotexturen doet (map én emissiveMap; alle texturen van de game zijn sRGB).
    b.onLoad({ filter: /three\/build\/three\.module\.js$/ }, (a) => {
      let src = fs.readFileSync(a.path, 'utf8');
      src = vervang(src, `						// slow fallback (CPU decode)

						image = ImageUtils.sRGBToLinear( image );`, `						// Windows 10 Mobile: geen CPU-omzetting, de shader decodeert (DECODE_VIDEO_TEXTURE)`, 'three-srgb');
      src = vervang(src, 'decodeVideoTexture: HAS_MAP && ( material.map.isVideoTexture === true ) && ', 'decodeVideoTexture: HAS_MAP && ', 'three-decode');
      src = vervang(src, 'vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );', 'vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );\\n\\temissiveColor.rgb = mix( pow( emissiveColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), emissiveColor.rgb * 0.0773993808, vec3( lessThanEqual( emissiveColor.rgb, vec3( 0.04045 ) ) ) );', 'three-emissive');
      // De GPU van de Lumia heeft geen ANGLE_instanced_arrays: three tekende InstancedMeshes dan helemaal niet (huizen, bomen,
      // figuranten weg). Nu: gewone attributen koppelen, instanceMatrix niet (die blijft een vaste waarde) en per exemplaar
      // de matrix met vertexAttrib4f zetten en tekenen.
      src = vervang(src, `			if ( extensions.get( 'ANGLE_instanced_arrays' ) === null ) return;

		}

		initAttributes();`, `			if ( extensions.get( 'ANGLE_instanced_arrays' ) === null && object.isInstancedMesh !== true ) return;

		}

		const zonderInstancing = capabilities.isWebGL2 === false && object.isInstancedMesh === true && extensions.get( 'ANGLE_instanced_arrays' ) === null;

		initAttributes();`, 'three-inst1');
      src = vervang(src, `				if ( geometryAttribute !== undefined ) {

					const normalized = geometryAttribute.normalized;`, `				if ( zonderInstancing && ( name === 'instanceMatrix' || name === 'instanceColor' ) ) continue;

				if ( geometryAttribute !== undefined ) {

					const normalized = geometryAttribute.normalized;`, 'three-inst2');
      src = vervang(src, `			} else if ( object.isInstancedMesh ) {

				renderer.renderInstances( drawStart, drawCount, object.count );`, `			} else if ( object.isInstancedMesh && capabilities.isWebGL2 === false && extensions.get( 'ANGLE_instanced_arrays' ) === null ) {

				const im = program.getAttributes().instanceMatrix, ic = program.getAttributes().instanceColor;
				const m = object.instanceMatrix.array, c = object.instanceColor ? object.instanceColor.array : null;

				for ( let i = 0; i < object.count; i ++ ) {

					if ( im ) for ( let k = 0; k < 4; k ++ ) _gl.vertexAttrib4f( im.location + k, m[ i * 16 + k * 4 ], m[ i * 16 + k * 4 + 1 ], m[ i * 16 + k * 4 + 2 ], m[ i * 16 + k * 4 + 3 ] );
					if ( ic && c ) _gl.vertexAttrib3f( ic.location, c[ i * 3 ], c[ i * 3 + 1 ], c[ i * 3 + 2 ] );
					renderer.render( drawStart, drawCount );

				}

			} else if ( object.isInstancedMesh ) {

				renderer.renderInstances( drawStart, drawCount, object.count );`, 'three-inst3');
      // Chakra (Edge 14) gaf na honderden objecten ineens een Mesh zonder .position: een JIT-fout rond Object.defineProperties
      // in de Object3D-constructor. Gewone toewijzingen doen hetzelfde en ontlopen die fout.
      src = vervang(src, `		Object.defineProperties( this, {
			position: {
				configurable: true,
				enumerable: true,
				value: position
			},
			rotation: {
				configurable: true,
				enumerable: true,
				value: rotation
			},
			quaternion: {
				configurable: true,
				enumerable: true,
				value: quaternion
			},
			scale: {
				configurable: true,
				enumerable: true,
				value: scale
			},
			modelViewMatrix: {
				value: new Matrix4()
			},
			normalMatrix: {
				value: new Matrix3()
			}
		} );`, `		this.position = position;
		this.rotation = rotation;
		this.quaternion = quaternion;
		this.scale = scale;
		this.modelViewMatrix = new Matrix4();
		this.normalMatrix = new Matrix3();`, 'three-object3d');
      // extensions.get() waarschuwde bij elke aanroep in de console als een extensie ontbreekt; de instancing-patch vraagt
      // ANGLE_instanced_arrays per tekenopdracht op: duizenden console.warns per seconde (traag in Edge). Eén keer is genoeg.
      src = vervang(src, `			if ( extension === null ) {

				console.warn( 'THREE.WebGLRenderer: ' + name + ' extension not supported.' );

			}`, `			if ( extension === null && ! extensions[ '_gemeld_' + name ] ) {

				extensions[ '_gemeld_' + name ] = true;
				console.warn( 'THREE.WebGLRenderer: ' + name + ' extension not supported.' );

			}`, 'three-warn');
      // Direct3D 9-niveau (en ANGLE): attribuut 0 moet per hoekpunt zijn. Zonder binding kon de linker instanceMatrix op 0
      // zetten, en dan tekende instancing onzin (grote driehoeken, figuranten weg). Dus position altijd op 0.
      src = vervang(src, `	} else if ( parameters.morphTargets === true ) {

		// programs with morphTargets displace position out of attribute 0
		gl.bindAttribLocation( program, 0, 'position' );`, `	} else {

		gl.bindAttribLocation( program, 0, 'position' );`, 'three-attr0');
      // Bug in three r162 zonder OES_vertex_array_object (EdgeHTML): de bindingscache keek alleen naar vorm + programma,
      // dus twee InstancedMeshes met dezelfde vorm en shader tekenden met de instanceMatrix van de eerste (rommeldriehoeken).
      src = vervang(src, `			if ( currentState.geometry !== geometry.id ||
				currentState.program !== program.id ||
				currentState.wireframe !== wireframe ) {

				currentState.geometry = geometry.id;
				currentState.program = program.id;
				currentState.wireframe = wireframe;`, `			const instanties = object.isInstancedMesh === true ? object.instanceMatrix : null;
			const instKleur = object.isInstancedMesh === true ? object.instanceColor : null;

			if ( currentState.geometry !== geometry.id ||
				currentState.program !== program.id ||
				currentState.wireframe !== wireframe ||
				currentState.instanties !== instanties ||
				currentState.instKleur !== instKleur ) {

				currentState.geometry = geometry.id;
				currentState.program = program.id;
				currentState.wireframe = wireframe;
				currentState.instanties = instanties;
				currentState.instKleur = instKleur;`, 'three-binding');
      return { contents: src, loader: 'js' };
    });
    // het iconenvel is voor de Lumia half zo groot (768×528): 48 px per icoon
    b.onLoad({ filter: /public\/iconen\.js$/ }, (a) => ({ contents: vervang(fs.readFileSync(a.path, 'utf8'), 'ICON_CS = 96', 'ICON_CS = 48', 'iconen'), loader: 'js' }));
    b.onLoad({ filter: /public\/game\.js$/ }, (a) => {
      tla = 0; kaal = 0;
      let src = fs.readFileSync(a.path, 'utf8');
      // markeringen door de hele opbouw (vóór een statement op het hoogste niveau, minstens 25 regels uit elkaar):
      // crasht de Lumia hard, dan staat in het log op welke regel van game.js hij was
      {
        const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
        const plekken = [];
        let vorige = 0;
        for (const st of ast.body) {
          if (/^(Import|Export|Function)/.test(st.type) || st.loc.start.line - vorige < 25) continue;
          plekken.push([st.start, st.loc.start.line]);
          vorige = st.loc.start.line;
        }
        for (const [pos, regel] of plekken.reverse()) src = src.slice(0, pos) + `window.__wpStap('r${regel}');\n` + src.slice(pos);
      }
      src = vervang(src, BAYER_OUD, BAYER_NIEUW, 'bayer');
      // Geen top-level await: de enige (wachten op iconen en lettertypen) gaat eruit en het iconenplaatje
      // laadt boot.js vooraf. De game zelf draait als gewone functie; in een async functie werd het één
      // generator van 1 MB, en die liet Chakra in EdgeHTML 13 de app laten crashen nog voor het splashscherm.
      src = vervang(src, 'const renderer = new THREE.WebGLRenderer(', "window.__wpStap('webgl');\nconst renderer = new THREE.WebGLRenderer(", 'webgl');
      // per beeld bijhouden of hij bij bijwerken of tekenen omvalt (eerste 200 beelden, daarna elke 2 s)
      src = vervang(src, "renderer.setAnimationLoop(() => {\n", "let wpN = 0, wpT = 0;\nrenderer.setAnimationLoop(() => {\n", 'loop');
      src = vervang(src, "  autoQuality(t - last);\n", "  const wpLog = wpN < 200 || t - wpT > 2000;\n  if (wpLog) { wpT = t; window.__wpStap('beeld ' + wpN + ' ' + state); }\n  autoQuality(t - last);\n", 'loop2');
      src = vervang(src, "  if (HD) hdRender(renderer, rs, rc); else renderer.render(rs, rc);\n", "  if (wpLog) window.__wpStap('beeld ' + wpN + ' tekenen');\n  if (HD) hdRender(renderer, rs, rc); else renderer.render(rs, rc);\n  if (wpLog) window.__wpStap('beeld ' + wpN + ' getekend');\n  wpN++;\n", 'render');
      // wat de GPU kan (Lumia 435 = Adreno 302, Direct3D 9_3)
      src = vervang(src, "renderer.setPixelRatio(HD ?", "{ const gl = renderer.getContext(); window.__wpStap('webgl ' + gl.getParameter(gl.MAX_TEXTURE_SIZE) + ' tex, ' + gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) + '/' + gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) + ' uniforms, uint-index ' + !!gl.getExtension('OES_element_index_uint') + ', ' + gl.getParameter(gl.RENDERER) + ', varyings ' + gl.getParameter(gl.MAX_VARYING_VECTORS) + ', tex-units ' + gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) + '/' + gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) + ', ext ' + (gl.getSupportedExtensions() || []).join(',')); }\nrenderer.setPixelRatio(HD ?", 'caps');
      // de grote mp3's niet vooraf ophalen: de fetch-polyfill houdt alles in het geheugen
      src = vervang(src, "'icons/icon-512.png', 'audio/menu.mp3', 'audio/intro.mp3', 'audio/game.mp3', 'audio/shop.mp3', 'audio/dbivo.mp3', 'audio/gameover.mp3'];", "'icons/icon-512.png'];", 'splash');
      // Unicode-property-regexen (\p{…} met de u-vlag) liet de app op de Lumia crashen voordat de game begon.
      // Zonder u-vlag: de emoji uit het iconenvel letterlijk, de rest als surrogaatpaar (+ FE0F/ZWJ/huidskleur).
      src = vervang(src, "const EMOJI_RE = /\\p{Regional_Indicator}{2}|\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}\\uFE0F?|\\p{Emoji_Modifier})*/gu;",
        "window.__wpStap('emoji');\nconst EMOJI_RE = new RegExp('(?:' + Object.keys(ICONS).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')).join('|') + ')\\uFE0F?|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF](?:\\uFE0F|\\u200D[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]\\uFE0F?|\\uD83C[\\uDFFB-\\uDFFF])*', 'g');", 'emoji-re');
      src = vervang(src, "const EMOJI_PRES = /\\p{Emoji_Presentation}|\\uFE0F/u;", "const EMOJI_PRES = /[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|\\uFE0F/;", 'emoji-pres');
      src = vervang(src, "\niconize(document.body);\n", "\nwindow.__wpStap('iconen in de pagina');\niconize(document.body);\n", 'iconize');
      // Opwarmen (alle ~90 objecten bouwen, alle shaders compileren, alle texturen uploaden, ~70 figuranten tekenen)
      // is op de Lumia een geheugen- en GPU-piek vlak na het splashscherm: overslaan, shaders komen als iets voor het eerst verschijnt.
      // Alleen de grens voor het opruimen zetten, zoals warmUp dat na afloop doet.
      src = vervang(src, 'setTimeout(warmUp, 400); // tijdens het startscherm', "setTimeout(() => { resBase = { g: new THREE.BufferGeometry().id, t: new THREE.Texture().id }; }, 400);", 'warmup');
      src = vervang(src, 'setTimeout(() => { try { renderer.compile(scene, camera); } catch (e) { /* niet erg */ } }, 500);', '', 'compile');
      src = vervang(src, 'setTimeout(prewarmPeople, 1500);', '', 'prewarm');
      // CSS-variabelen die JS per element zet kent Edge 13 niet: de winkelkleur ook gewoon inline
      src = vervang(src, 'style="--pak:${pakKleur(shopTab, it.id)}"><span class="pak-doos">', 'style="--pak:${pakKleur(shopTab, it.id)}"><span class="pak-doos" style="background-color:${pakKleur(shopTab, it.id)}">', 'pak');
      // plaatjes en geluid uit public/wp/ (verkleind, mono): zie hierboven
      src = src.replace(/(['"`])(img|icons|audio)\//g, '$1wp/$2/');
      // Lumia: altijd de iPod-stand (30 beelden/s, 180p, minder effecten en clips)
      src = vervang(src, 'const isIPod = /iPod/.test(navigator.userAgent);', 'const isIPod = true;', 'ipod');
      if (process.env.WP_DEBUG) src = vervang(src, 'const instPools = new Map();', 'const instPools = new Map(); window.__inst = instPools; window.__scene = () => scene;', 'debug-inst');
      // Lumia: korte kijkafstand (42 m i.p.v. 72 m) met de mist mee naar voren, zodat niets zichtbaar opduikt; huizen, decor en
      // figuranten verder weg worden niet getekend. Scheelt de helft van de tekenopdrachten (zonder instancing telt elk onderdeel).
      src = vervang(src, 'const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 72);', 'const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 42);', 'ver-camera');
      src = vervang(src, 'if (!h.g.visible || !h.g.parent || h.g.position.z < -74) continue;', 'if (!h.g.visible || !h.g.parent || h.g.position.z < -46) continue;', 'ver-huis');
      src = vervang(src, 'if (!proxy.visible || proxy.position.z < -70) continue;', 'if (!proxy.visible || proxy.position.z < -44) continue;', 'ver-decor');
      src = vervang(src, '    if (!_seenTop.has(top)) { _seenTop.add(top); top.updateMatrixWorld(true); }', '    if (top.position.z < -44) continue;\n    if (!_seenTop.has(top)) { _seenTop.add(top); top.updateMatrixWorld(true); }', 'ver-mensen');
      src = vervang(src, "  if (wpLog) window.__wpStap('beeld ' + wpN + ' tekenen');", "  if (rs === scene && scene.fog && camera.far < 50) { if (scene.fog.far > 40) scene.fog.far = 40; if (scene.fog.near > 22) scene.fog.near = 22; }\n  if (wpLog) window.__wpStap('beeld ' + wpN + ' tekenen');", 'ver-mist');
      // alleen tekenen wat in beeld is: instances heeft three niet gecontroleerd (frustumCulled = false), dus ook huizen
      // achter de camera kostten een tekenopdracht per onderdeel
      src = vervang(src, 'function updateBatches() {\n  for (const im of instPools.values()) im.count = 0;', `const _wpFr = new THREE.Frustum(), _wpM = new THREE.Matrix4(), _wpS = new THREE.Sphere(), _wpV = new THREE.Vector3();
const wpZie = (p, r) => _wpFr.intersectsSphere(_wpS.set(_wpV.set(p.x, p.y + r * 0.5, p.z), r));
function updateBatches() {
  camera.updateMatrixWorld();
  _wpFr.setFromProjectionMatrix(_wpM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (const im of instPools.values()) im.count = 0;`, 'zie');
      src = vervang(src, 'if (!h.g.visible || !h.g.parent || h.g.position.z < -46) continue;', 'if (!h.g.visible || !h.g.parent || h.g.position.z < -46 || !wpZie(h.g.position, Math.max(h.width, 11))) continue;', 'zie-huis');
      src = vervang(src, 'if (!proxy.visible || proxy.position.z < -44) continue;', 'if (!proxy.visible || proxy.position.z < -44 || !wpZie(proxy.position, 5)) continue;', 'zie-decor');
      src = vervang(src, '    if (top.position.z < -44) continue;', '    if (top.position.z < -44 || !wpZie(top.position, 3)) continue;', 'zie-mensen');
      // Lumia: cosmetica eruit die veel kost. Lichtbundels/gloed van lantaarns (grote doorzichtige vlakken), regen en sneeuw
      // (elk beeld op de CPU), en losse neus/oren/kapsel alleen nog voor Jens (zijn kapsel wisselt in de winkel).
      src = vervang(src, 'for (const g of lampGlows) g.visible = lamps;', 'for (const g of lampGlows) g.visible = false;', 'kaal-lamp');
      src = vervang(src, 'if (!precipKind || indoor) { rainLines.visible = false; flakes.visible = false; return; }', 'if (true) { rainLines.visible = false; flakes.visible = false; return; }', 'kaal-regen');
      src = src.replace(/const FULL_PEOPLE = new Set\(\[[^\]]*\]\);/, () => { kaal++; return "const FULL_PEOPLE = new Set(['jens']);"; });
      if (kaal !== 1) throw new Error('patch FULL_PEOPLE: ' + kaal + '×');
      // HUD-teksten (score, meters) veranderen steeds: zonder één niet-ASCII-teken kan er geen emoji in zitten
      src = vervang(src, 'function iconizeText(n) {\n  if (!n.parentNode || ICON_SKIP.has(n.parentNode.nodeName)) return;', 'function iconizeText(n) {\n  if (!/[^\\x00-\\x7f]/.test(n.nodeValue)) return;\n  if (!n.parentNode || ICON_SKIP.has(n.parentNode.nodeName)) return;', 'iconize-snel');
      src = vervang(src, 'const iconSheet = new Image();', "window.__wpStap('game.js loopt');\nconst iconSheet = new Image();", 'stap');
      src = vervang(src, "const iconSheet = new Image();\niconSheet.src = 'wp/img/iconen.png';", 'const iconSheet = window.__wpIconen;', 'iconen');
      src = src.replace(/\nawait Promise\.race\(\[\n[\s\S]*?\n\]\);\n/, (m) => { tla++; return '\n'; });
      if (tla !== 1) throw new Error(`patch 'await': ${tla}× gevonden in plaats van 1×`);
      if (/^await |^for await/m.test(src)) throw new Error('game.js heeft weer een top-level await');
      const regels = src.split('\n');
      let i = 0;
      while (/^(import\s|\s*$|\/\/)/.test(regels[i])) i++;
      src = regels.slice(0, i).join('\n') + "\nwindow.__wpGame = function () {\nwindow.__wpStap('game-functie');\n" + regels.slice(i).join('\n') + '\n};\n';
      return { contents: src, loader: 'js' };
    });
  },
};

// core-js: alleen wat de code echt gebruikt. Eerst bundelen zonder core-js, SWC (mode 'usage', doel Edge 13) zegt welke
// polyfills nodig zijn; die komen in plaats van heel core-js/stable (scheelt honderden KB JS om te parsen en te bewaren).
const bundel = (coreJs) => esbuild.build({
  entryPoints: [path.join(hier, 'entry.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  supported: { 'dynamic-import': false },
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  outfile: path.join(uit, 'game.js'),
  plugins: [wp, { name: 'corejs', setup(b) { b.onResolve({ filter: /^core-js\/stable$/ }, () => ({ path: 'corejs-nodig', namespace: 'corejs' })); b.onLoad({ filter: /.*/, namespace: 'corejs' }, () => ({ contents: coreJs, loader: 'js', resolveDir: hier })); } }],
  logLevel: 'warning',
  metafile: true,
});
const zonder = await bundel('');
const gebruik = await swc.transform(zonder.outputFiles[0].text, { env: { targets: { edge: '13' }, mode: 'usage', coreJs: '3.51' }, jsc: { parser: { syntax: 'ecmascript' } }, isModule: false });
// volgorde: zoals SWC ze vindt, maar een aanvulling (web.url-search-params.delete) altijd ná de basis (web.url-search-params):
// die aanvullingen gebruiken de globale constructor meteen bij het laden
const gevonden = [...new Set(gebruik.code.match(/core-js\/modules\/[\w.-]+/g) || [])].map((m) => m.replace(/\.js$/, ''));
const nodig = [];
const voegToe = (m) => {
  if (nodig.includes(m)) return;
  const basis = gevonden.find((b) => b !== m && m.startsWith(b + '.'));
  if (basis) voegToe(basis);
  nodig.push(m);
};
gevonden.forEach(voegToe);
if (!nodig.length) throw new Error('core-js: geen polyfills gevonden, klopt de SWC-analyse nog?');
console.log('core-js:', nodig.length, 'polyfills'); if (process.env.WP_META) console.log(nodig.join(' '));
const r = await bundel(nodig.map((m) => `import '${m}';`).join('\n'));

if (process.env.WP_META) { const per = {}; for (const [f, x] of Object.entries(r.metafile.outputs[Object.keys(r.metafile.outputs)[0]].inputs)) { const k = f.includes('core-js') ? 'core-js' : f.includes('three') ? 'three' : f.replace(/^.*node_modules\//, '').split('/')[0]; per[k] = (per[k] || 0) + x.bytesInOutput; } console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round(v / 1024) + 'K').join(', ')); }
// esbuild kan niet naar ES5; SWC zet de bundel om voor EdgeHTML 13 (let/const, destructuring, async)
const js = await swc.transform(r.outputFiles[0].text, {
  env: { targets: { edge: '13' }, bugfixes: true },
  // WP_DEBUG=1: niet verkleind, voor profileren
  jsc: { parser: { syntax: 'ecmascript' }, externalHelpers: false, minify: process.env.WP_DEBUG ? undefined : { compress: { passes: 1 }, mangle: true } },
  minify: !process.env.WP_DEBUG,
  isModule: false,
});
fs.writeFileSync(path.join(uit, 'game.js'), js.code);

// CSS: variabelen ingevuld (EdgeHTML 13/14 kent ze niet), de rest omgezet waar dat kan
let css = fs.readFileSync(path.join(pub, 'style.css'), 'utf8') + '\n' + fs.readFileSync(path.join(hier, 'edge-fix.css'), 'utf8');
css = css.replace(/url\((['"]?)(?!['"]?(?:data:|https?:|\/|img\/|icons\/))/g, 'url($1../'); // img/ en icons/ staan in wp/ zelf
css = (await postcss([customProps({ preserve: true })]).process(css, { from: undefined })).css;
css = lcss({ code: Buffer.from(css), minify: true, targets: { edge: 13 << 16 }, errorRecovery: true }).code.toString();
// grid → flex, gap → marges, rekenfuncties uitgerekend: wat Edge 13 anders stil negeert (zie edge13css.mjs)
css = (await postcss([edge13()]).process(css, { from: undefined })).css;
css = lcss({ code: Buffer.from(css), minify: true, targets: { edge: 13 << 16 }, errorRecovery: true }).code.toString();
if (onopgelost.length) console.log('niet uit te rekenen, gekozen:\n  ' + onopgelost.join('\n  '));
fs.writeFileSync(path.join(uit, 'style.css'), css);

let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
html = vervang(html, '<script type="module" src="game.js"></script>', '<script src="wp/game.js" defer></script>', 'script');
html = vervang(html, '<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="wp/style.css">', 'css');
html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', '');
html = html.replace('<head>', () => '<head>\n<meta http-equiv="X-UA-Compatible" content="IE=edge">\n<script>window.WP_APP = true;\n' + fs.readFileSync(path.join(hier, 'boot.js'), 'utf8') + '</script>');
html = html.replace(/((?:src|href)=")(img|icons)\//g, '$1wp/$2/');
fs.writeFileSync(path.join(pub, 'wp.html'), html);
console.log('klaar:', fs.statSync(path.join(uit, 'game.js')).size, 'bytes JS,', css.length, 'bytes CSS');
