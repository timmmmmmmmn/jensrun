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
    b.onLoad({ filter: /public\/game\.js$/ }, (a) => {
      let src = fs.readFileSync(a.path, 'utf8');
      src = vervang(src, BAYER_OUD, BAYER_NIEUW, 'bayer');
      // Geen top-level await: de enige (wachten op iconen en lettertypen) gaat eruit en het iconenplaatje
      // laadt boot.js vooraf. De game zelf draait als gewone functie; in een async functie werd het één
      // generator van 1 MB, en die liet Chakra in EdgeHTML 13 de app laten crashen nog voor het splashscherm.
      src = vervang(src, 'const renderer = new THREE.WebGLRenderer(', "window.__wpStap('webgl');\nconst renderer = new THREE.WebGLRenderer(", 'webgl');
      src = vervang(src, 'const iconSheet = new Image();', "window.__wpStap('game.js loopt');\nconst iconSheet = new Image();", 'stap');
      src = vervang(src, "const iconSheet = new Image();\niconSheet.src = 'img/iconen.png';", 'const iconSheet = window.__wpIconen;', 'iconen');
      src = src.replace(/\nawait Promise\.race\(\[\n[\s\S]*?\n\]\);\n/, (m) => { tla++; return '\n'; });
      if (tla !== 1) throw new Error(`patch 'await': ${tla}× gevonden in plaats van 1×`);
      if (/^await |^for await/m.test(src)) throw new Error('game.js heeft weer een top-level await');
      const regels = src.split('\n');
      let i = 0;
      while (/^(import\s|\s*$|\/\/)/.test(regels[i])) i++;
      src = regels.slice(0, i).join('\n') + '\nwindow.__wpGame = function () {\n' + regels.slice(i).join('\n') + '\n};\n';
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
  jsc: { parser: { syntax: 'ecmascript' }, externalHelpers: false, minify: { compress: { passes: 1 }, mangle: true } },
  minify: true,
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
