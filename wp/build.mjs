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

const hier = path.dirname(new URL(import.meta.url).pathname);
const pub = path.join(hier, '../public');
const uit = path.join(pub, 'wp');
fs.mkdirSync(uit, { recursive: true });

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

let tla = 0;
const wp = {
  name: 'wp',
  setup(b) {
    b.onResolve({ filter: /^\.\/three\.module\.min\.js$/ }, () => ({ path: path.join(hier, 'node_modules/three/build/three.module.js') }));
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(hier, 'node_modules/three/build/three.module.js') }));
    b.onResolve({ filter: /^\.\/hd\.js$/ }, () => ({ path: path.join(hier, 'hd-stub.js') }));
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
    b.onLoad({ filter: /public\/game\.js$/ }, (a) => {
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
      src = vervang(src, 'const iconSheet = new Image();', "window.__wpStap('game.js loopt');\nconst iconSheet = new Image();", 'stap');
      src = vervang(src, "const iconSheet = new Image();\niconSheet.src = 'img/iconen.png';", 'const iconSheet = window.__wpIconen;', 'iconen');
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

const r = await esbuild.build({
  entryPoints: [path.join(hier, 'entry.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  supported: { 'dynamic-import': false },
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  outfile: path.join(uit, 'game.js'),
  plugins: [wp],
  logLevel: 'warning',
});
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
let css = fs.readFileSync(path.join(pub, 'style.css'), 'utf8');
css = css.replace(/url\((['"]?)(?!data:|https?:|\/)/g, 'url($1../');
css = (await postcss([customProps({ preserve: true })]).process(css, { from: undefined })).css;
css = lcss({ code: Buffer.from(css), minify: true, targets: { edge: 13 << 16 }, errorRecovery: true }).code.toString();
fs.writeFileSync(path.join(uit, 'style.css'), css);

let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
html = vervang(html, '<script type="module" src="game.js"></script>', '<script src="wp/game.js" defer></script>', 'script');
html = vervang(html, '<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="wp/style.css">', 'css');
html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', '');
html = html.replace('<head>', () => '<head>\n<meta http-equiv="X-UA-Compatible" content="IE=edge">\n<script>window.WP_APP = true;\n' + fs.readFileSync(path.join(hier, 'boot.js'), 'utf8') + '</script>');
fs.writeFileSync(path.join(pub, 'wp.html'), html);
console.log('klaar:', fs.statSync(path.join(uit, 'game.js')).size, 'bytes JS,', css.length, 'bytes CSS');
