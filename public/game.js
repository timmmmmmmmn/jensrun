import * as THREE from './three.module.min.js';
import { Muxer, ArrayBufferTarget } from './mp4-muxer.mjs';
import { BEKER, BEKER_TEX } from './beker-model.js';
import { ICONS, ICON_CS, ICON_COLS, ICON_ROWS } from './iconen.js';

// =====================================================================
//  geen emoji meer: elke emoji die ergens in beeld komt wordt een plaatje uit het iconenvel.
//  Zo werkt het ook voor oude meldingen uit de database en voor namen en muurteksten van spelers.
//  Gewone tekstsymbolen (✓, →, ★) blijven tekst.
// =====================================================================
const EMOJI_RE = /\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?|\p{Emoji_Modifier})*/gu;
const EMOJI_PRES = /\p{Emoji_Presentation}|\uFE0F/u;
const iconKey = (m) => (ICONS[m] ? m : ICONS[[...m][0]] ? [...m][0] : null);
const ICON_SKIP = new Set(['SCRIPT', 'STYLE', 'OPTION', 'TEXTAREA', 'TITLE', 'INPUT']);
function emojiParts(str) {
  const out = [];
  let last = 0;
  for (const m of str.matchAll(EMOJI_RE)) {
    const k = iconKey(m[0]);
    if (!k && !EMOJI_PRES.test(m[0])) continue; // gewoon tekstsymbool
    if (m.index > last) out.push(str.slice(last, m.index));
    if (k) out.push({ icon: k });
    last = m.index + m[0].length;
  }
  if (!out.length) return null;
  if (last < str.length) out.push(str.slice(last));
  return out;
}
const stripEmoji = (t) => { const p = emojiParts(String(t)); return p ? p.filter((x) => typeof x === 'string').join('').replace(/\s{2,}/g, ' ').trim() : String(t); };
function iconEl(k) {
  const el = document.createElement('j-i'), [cx, cy] = ICONS[k];
  el.className = 'ei';
  el.style.backgroundSize = `${ICON_COLS * 100}% ${ICON_ROWS * 100}%`;
  el.style.backgroundPosition = `${(cx / (ICON_COLS - 1)) * 100}% ${(cy / (ICON_ROWS - 1)) * 100}%`;
  return el;
}
function iconizeText(n) {
  if (!n.parentNode || ICON_SKIP.has(n.parentNode.nodeName)) return;
  const parts = emojiParts(n.nodeValue);
  if (!parts) return;
  const f = document.createDocumentFragment();
  for (const x of parts) f.append(typeof x === 'string' ? document.createTextNode(x) : iconEl(x.icon));
  n.parentNode.replaceChild(f, n);
}
function iconize(n) {
  if (n.nodeType === 3) { iconizeText(n); return; }
  if (n.nodeType !== 1 || ICON_SKIP.has(n.nodeName)) return;
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT), list = [];
  while (w.nextNode()) list.push(w.currentNode);
  list.forEach(iconizeText);
}
new MutationObserver((recs) => {
  for (const r of recs) {
    if (r.type === 'characterData') iconizeText(r.target);
    else r.addedNodes.forEach(iconize);
  }
}).observe(document.body, { childList: true, characterData: true, subtree: true });
iconize(document.body);
// in canvas-tekst (borden, filmpjes, arcade) tekenen we het plaatje midden in de regel
const iconSheet = new Image();
iconSheet.src = 'img/iconen.png';
{
  const P = CanvasRenderingContext2D.prototype, fill = P.fillText, stroke = P.strokeText, measure = P.measureText;
  P.fillText = function (t, x, y, mw) {
    const parts = typeof t === 'string' ? emojiParts(t) : null;
    if (!parts) return mw === undefined ? fill.call(this, t, x, y) : fill.call(this, t, x, y, mw);
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] || 16), iw = size * 1.15;
    const width = parts.reduce((n, q) => n + (typeof q === 'string' ? measure.call(this, q).width : iw), 0);
    const k = mw && width > mw ? mw / width : 1, al = this.textAlign;
    let cx = al === 'center' ? x - (width * k) / 2 : al === 'right' || al === 'end' ? x - width * k : x;
    const top = this.textBaseline === 'middle' ? y - iw / 2 : this.textBaseline === 'top' ? y : y - iw * 0.82;
    this.textAlign = 'left';
    for (const q of parts) {
      if (typeof q === 'string') { const w = measure.call(this, q).width * k; fill.call(this, q, cx, y, w || undefined); cx += w; }
      else {
        const [c, r] = ICONS[q.icon];
        if (iconSheet.complete && iconSheet.naturalWidth) this.drawImage(iconSheet, c * ICON_CS, r * ICON_CS, ICON_CS, ICON_CS, cx, top, iw * k, iw);
        cx += iw * k;
      }
    }
    this.textAlign = al;
  };
  P.strokeText = function (t, x, y, mw) { const c = typeof t === 'string' ? stripEmoji(t) : t; return mw === undefined ? stroke.call(this, c, x, y) : stroke.call(this, c, x, y, mw); };
}
// lettertypen en iconen moeten klaar zijn voordat de borden en texturen getekend worden
await Promise.race([
  Promise.all([iconSheet.decode().catch(() => {}), document.fonts.load('40px Anton').catch(() => {}), document.fonts.load('700 16px "Barlow J"').catch(() => {})]),
  new Promise((r) => setTimeout(r, 2500)),
]);

// =====================================================================
//  helpers
// =====================================================================
// elementen op id onthouden (wordt elk beeld vaak opgevraagd)
const $cache = new Map();
const $ = (s) => {
  const hit = $cache.get(s);
  if (hit && hit.isConnected) return hit;
  const e = document.querySelector(s);
  if (e && s[0] === '#' && s.indexOf(' ') < 0 && s.indexOf('.') < 0 && s.indexOf('[') < 0 && s.indexOf(':') < 0) $cache.set(s, e);
  return e;
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// gedeelde kaart: in een live race gebruikt de wereldbouw voor iedereen dezelfde toevalsgetallen
let mapSeed = 0;
function seeded(key, fn) {
  if (!mapSeed) return fn();
  let a = mapSeed ^ 0x9e3779b9;
  for (const c of String(key)) a = Math.imul(a ^ c.charCodeAt(0), 2654435761);
  const orig = Math.random;
  Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = orig; }
}
let rowN = 0, segN = 0;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const now = () => performance.now() / 1000;
// iPod touch (7e generatie: iOS 15, A10, 2 GB): lichter tekenen en minder geluid tegelijk in het geheugen
const isIPod = /iPod/.test(navigator.userAgent);
if (isIPod) document.documentElement.classList.add('ipod');
// iOS 15 kent roundRect op een canvas nog niet
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, rr) {
    const q = Math.max(0, Math.min(Array.isArray(rr) ? rr[0] || 0 : rr || 0, w / 2, h / 2));
    this.moveTo(x + q, y); this.arcTo(x + w, y, x + w, y + h, q); this.arcTo(x + w, y + h, x, y + h, q); this.arcTo(x, y + h, x, y, q); this.arcTo(x, y, x + w, y, q); this.closePath();
  };
}

const LANES = [-2.2, 0, 2.2];
const ROAD_W = 7.6;
const STREETS = ['Berg en Dalseweg', 'Javastraat', 'Sumatrastraat', 'Ubbergseweg', 'Oranjesingel',
  'Hengstdalseweg', 'Groesbeekseweg', 'Sophiaweg', 'Lombokstraat', 'Bankastraat'];

// Foto's van gezichten: zet een bestand in public/img/ en voeg hier de naam toe,
// bijv. jens: 'img/jens.png'. Leeg = getekend gezicht.
const PHOTO_FACES = { jens: 'img/jens-face.png', shane: 'img/shane-face.png' };

// =====================================================================
//  game data
// =====================================================================
const MODES = {
  fiets: {
    hidden: true, label: 'Fiets', icon: '🚲', chaser: 'de fietser', nearTime: 6,
    desc: 'Er komt iemand op de fiets achter je aan, en die trapt hard.',
    lines: ['JENS, WACHT NOU!', 'Ik heb je zo!', '*tring tring*', 'Rem dan!', 'Je kan niet wegfietsen hè… o wacht'],
    catchLine: 'HEBBES!',
  },
  telefoon: {
    label: 'Rennen', icon: '📱', chaser: 'Shane', nearTime: 5,
    desc: 'Er is telefoonverbod, maar Jens zit gewoon op z\'n telefoon. Shane wil hem afpakken.',
    lines: ['Ja Jens, dit is al de vijfde keer. Dit wordt een gesprek met de directeur.', 'Jens, niet wegrennen! Ik wil je telefoon.', 'Je kent de regels. Hier geven.', 'Ja Jens, geef maar hier.', 'Ja, je telefoon inleveren. Je kan hem om half 4 ophalen.', 'Jens, wat zie ik in je broekzak?'],
    catchLine: 'Ja, je telefoon inleveren. Je kan hem om half 4 ophalen.',
  },
  terror: {
    hidden: true, label: 'Vakkenvullen', icon: '🛒', chaser: 'de leidinggevende', nearTime: 5,
    desc: 'Jens vult vakken bij de Plus Walraven, gooit een product naar z\'n leidinggevende en rent weg.',
    lines: ['SNELLER VULLEN, JENS!', 'Kom terug, je dienst is nog niet klaar!', 'Dit komt in je dossier!', 'De pindakaas staat nog op de pallet!', 'Ik bel je moeder!'],
    catchLine: 'Zo. Terug naar de schappen.',
  },
  school: {
    hidden: true, label: 'School', icon: '🎆', chaser: 'de docent', tag: 'DOCENT', nearTime: 5,
    desc: 'Jens stak een babypijltje af bij het NSG Groenewoud. De docent zit achter hem aan, en een vrouw met een hond probeert hem te vloeren.',
    lines: ['JENS! NAAR DE CONRECTOR!', 'DIT WORDT NABLIJVEN!', 'Ik bel je ouders!', 'Vuurwerk is VERBODEN!', 'Jij bent geschorst!'],
    catchLine: 'Nablijven. Een week lang.',
  },
  // eigen minigames met een eigen wereld (zie MINIGAMES verderop)
  glijden: { mini: true, label: 'Asbest', icon: '⛰️', desc: 'Op een asbestplaat van een gigantische berg af. Je gaat steeds harder, dus stuur op tijd en ontwijk alles.' },
  vuurwerk: { mini: true, label: 'Vuurwerk', icon: '🎆', play: 'AFSTEKEN!', desc: 'Drerries bouwen een brug tussen twee eilandjes. Trek terug, laat los en blaas ze op voordat de brug af is.' },
  osso: { mini: true, label: 'Mijn Osso', icon: '🏠', play: 'VERDEDIGEN!', desc: 'Iedereen die ooit achter Jens aan zat valt tegelijk z\'n osso binnen. Hou ze tegen met een AK-47, romeinse kaarsen en nitraat.' },
};

const SHOP = {
  shout: { label: 'Kreet', items: [
    { id: 'hup', name: 'Hup!', price: 0, text: 'Hup!' },
    { id: 'gonl', name: 'Go Nederland!', price: 300, text: 'GO NEDERLAND!', voice: 'gonl' },
    { id: 'bio', name: 'Nooit meer naar bio 🎵', price: 600, text: '🎵 Nooit meer naar bio 🎵', voice: 'bio' },
    { id: 'dbivo', name: 'DBIVO', price: 900, text: 'DIE BEKER IS VAN ONS!', clip: 'dbivo' },
    { id: 'hohoho', name: 'Ho Ho Ho, Merry Christmas', price: 1200, text: '🎄 HO HO HO, MERRY CHRISTMAS! 🎄', voice: 'hohoho' },
  ] },
  shirt: { label: 'Shirt', items: [
    { id: 'wit', name: 'Wit shirtje', price: 0 },
    { id: 'vierdaagse', name: 'Vierdaagse', price: 450 },
    { id: 'oranje', name: 'Oranje', price: 600 },
    { id: 'uefa', name: 'UEFA shirt', price: 1050 },
    { id: 'rammstein', name: 'Rammstein shirt', price: 1050 },
    { id: 'heineken', name: 'Heineken-setje', price: 1500 },
    { id: 'nec6', name: 'NEC-shirt #6 Nejašmić', price: 1350 },
    { id: 'eurotour', name: 'NEC European Tour-shirt', price: 1200 },
    { id: 'feyenoord', name: 'Feyenoord-shirt', price: 900 },
    { id: 'goud', name: 'Gouden NEC-shirt (plakboek)', price: 99999 },
    { id: 'pas', name: 'Seizoensshirt (seizoenspas)', price: 99999, pass: true },
  ] },
  head: { label: 'Hoofd', items: [
    { id: 'normaal', name: 'Gewoon', price: 0 },
    { id: 'middenscheiding', name: 'Middenscheiding', price: 600 },
    { id: 'pet', name: 'Skere pet', price: 750 },
    { id: 'manen', name: 'Lange blonde manen', price: 1200 },
    { id: 'spike', name: 'Gel-spike', price: 1050 },
    { id: 'bivak', name: 'NEC-bivakmuts', price: 1050 },
    { id: 'kroon', name: 'Kroon (seizoenspas)', price: 99999, pass: true },
    { id: 'kuif', name: 'Platinablonde kuif', price: 1350 },
    { id: 'laser', name: 'Laserogen', price: 2100 },
  ] },
  rug: { label: 'Rug', items: [
    { id: 'geen', name: 'Niks op je rug', price: 0 },
    { id: 'cape', name: 'Spandoek-cape', price: 1500 },
  ] },
  hand: { label: 'Hand', items: [
    { id: 'geen', name: 'Lege hand', price: 0 },
    { id: 'cola', name: 'Blikje cola', price: 240 },
    { id: 'fanta', name: 'Blikje Fanta', price: 240 },
    { id: 'fietsbel', name: 'Fietsbel', price: 300 },
    { id: 'ballon', name: 'Ballon', price: 360 },
    { id: 'toeter', name: 'PVC-toeter', price: 450 },
    { id: 'fakkel', name: 'Rode fakkel', price: 750 },
    { id: 'minibeker', name: 'Mini-beker (seizoenspas)', price: 99999, pass: true },
  ] },
  skill: { label: 'Extra', items: [
    { id: 'geen', name: 'Gewoon springen', price: 0 },
    { id: 'dubbel', name: 'Dubbelspringen', price: 1800 },
  ] },
  maatje: { label: 'Maatje', items: [
    { id: 'geen', name: 'Alleen', price: 0 },
    { id: 'duif', name: 'Duif', price: 750 },
    { id: 'hond', name: 'Saar de hond', price: 1050 },
  ] },
  bril: { label: 'Bril', items: [
    { id: 'geen', name: 'Geen bril', price: 0 },
    { id: 'filter', name: 'Die ene filter zonnebril', price: 900 },
    { id: 'lennon', name: 'John Lennon bril', price: 750 },
    { id: 'snor', name: 'Snor', price: 600 },
  ] },
};

// =====================================================================
//  save
// =====================================================================
const SAVE_KEY = 'jensrun-v1';
const DEFAULT_SAVE = {
  bekers: 0, owned: {}, mode: 'fiets', sound: true,
  eq: { shout: 'hup', shirt: 'wit', head: 'normaal', bril: 'geen', rug: 'geen', hand: 'geen', maatje: 'geen' },
  best: { fiets: 0, telefoon: 0, terror: 0, school: 0 },
};
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) return { ...DEFAULT_SAVE, ...s, eq: { ...DEFAULT_SAVE.eq, ...s.eq }, best: { ...DEFAULT_SAVE.best, ...s.best }, owned: { ...s.owned } };
  } catch (e) { /* geen opslag */ }
  return JSON.parse(JSON.stringify(DEFAULT_SAVE)); // structuredClone kan iOS 15.0 nog niet
}
const save = loadSave();
if (!save.set) save.set = { music: 100, sfx: 100, voice: 100, quality: 'normaal' };
for (const slot of Object.keys(SHOP)) if (!SHOP[slot].items.some((i) => i.id === save.eq[slot])) save.eq[slot] = SHOP[slot].items[0].id;
if (!save.playerId) save.playerId = crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16));
function persist() {
  save.updatedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* geen opslag */ }
  if (typeof scheduleSync === 'function') scheduleSync();
}
const owns = (slot, id) => SHOP[slot].items.find((i) => i.id === id)?.price === 0 || save.owned[slot + ':' + id];

// =====================================================================
//  audio
// =====================================================================
let ac = null, master = null, engine = null, recDest = null, voiceBus = null;
function audioInit() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume();
    musicKick();
    return;
  }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.connect(ac.destination);
    applyVolumes();
    try { recDest = ac.createMediaStreamDestination(); master.connect(recDest); } catch (e) { recDest = null; }
    // alle stemmen via één kanaal: flink harder, de limiter voorkomt dat het kraakt
    voiceBus = ac.createGain(); voiceBus.gain.value = 2.2;
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    voiceBus.connect(lim).connect(ac.destination);
    if (recDest) lim.connect(recDest);
    for (const n of ['nitraat', 'cake', 'groot', 'schot']) queueClip(n, `audio/sfx/${n}.mp3`);
    queueClip('dbivo', 'audio/dbivo.mp3');
    for (let i = 1; i <= 6; i++) queueClip('shane' + i, `audio/shane/${i}.mp3`);
    queueClip('gameover', 'audio/gameover.mp3');
    queueClip('levelgehaald', 'audio/levelgehaald.mp3');
    queueClip('steve', 'audio/steve.mp3');
    loadVoices();
    musicInit();
  } catch (e) { ac = null; }
}
function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
  if (!ac || !save.sound) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.3, delay = 0) {
  if (!ac || !save.sound) return;
  const t = ac.currentTime + delay;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = buf; g.gain.value = vol;
  s.connect(g).connect(master); s.start(t);
}
const sfx = {
  beker() { tone(988, 0.07, 'square', 0.08); tone(1480, 0.12, 'square', 0.08, null, 0.06); },
  jump() { tone(280, 0.16, 'square', 0.07, 620); },
  slide() { noise(0.25, 0.15); },
  stumble() { noise(0.2, 0.4); tone(160, 0.25, 'sawtooth', 0.15, 60); },
  die() {
    // dreun, krak en een pijnkreet; hard, door een compressor zodat het niet kraakt
    if (!ac || !save.sound) return;
    const t = ac.currentTime, out = ac.createGain(), comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.2;
    out.gain.value = 3.2;
    out.connect(comp).connect(master);
    const thump = (at, f0, f1, dur, vol) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g).connect(out); o.start(t + at); o.stop(t + at + dur + 0.05);
    };
    const crunch = (at, dur, vol, freq) => {
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      s.connect(f).connect(g).connect(out); s.start(t + at);
    };
    thump(0, 150, 38, 0.5, 1);        // de klap
    crunch(0, 0.4, 1, 3200);          // krak
    thump(0.22, 110, 45, 0.3, 0.7);   // op de grond
    crunch(0.22, 0.25, 0.6, 1200);
    // 'aaargh': zaagtand door twee klinker-filters, zakt weg
    const o = ac.createOscillator(), g = ac.createGain(), f0 = rand(240, 300);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t + 0.02); o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.75);
    g.gain.setValueAtTime(0.001, t + 0.02); g.gain.exponentialRampToValueAtTime(0.55, t + 0.07); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    for (const [fq, q] of [[750, 6], [1150, 8]]) { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q; o.connect(bp).connect(g); }
    g.connect(out); o.start(t + 0.02); o.stop(t + 0.85);
  },
  power() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'square', 0.08, null, i * 0.07)); },
  smash() { noise(0.15, 0.35); tone(200, 0.12, 'square', 0.1, 90); },
  toet() {
    [0, 0.26].forEach((d) => { tone(370, 0.2, 'square', 0.1, null, d); tone(466, 0.2, 'square', 0.08, null, d); });
  },
  bel() { tone(2300, 0.35, 'sine', 0.12); tone(2300, 0.35, 'sine', 0.12, null, 0.14); },
  grunt() {
    if (!ac || !save.sound) return;
    const t = ac.currentTime, f0 = rand(105, 150);
    const o = ac.createOscillator(), bp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.18);
    bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(rand(650, 850), t);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.18);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(bp).connect(g).connect(master);
    o.start(t); o.stop(t + 0.22);
    noise(0.12, 0.06);
  },
  blaf() {
    [0, 0.22].forEach((d) => { tone(rand(380, 460), 0.09, 'square', 0.12, 180, d); noise(0.08, 0.15, d); });
  },
  sis() { noise(0.5, 0.12); tone(3200, 0.4, 'sawtooth', 0.02, 1800); },
  boem() { fwBang(1.3, 0, true); },
  schoolbel() {
    if (!ac || !save.sound) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'square'; o.frequency.value = 980;
    lfo.frequency.value = 28; lg.gain.value = 0.1;
    g.gain.setValueAtTime(0.1, t); g.gain.setValueAtTime(0.1, t + 2.2); g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(master);
    o.start(t); lfo.start(t); o.stop(t + 2.5); lfo.stop(t + 2.5);
  },
  fluit() { tone(900, 1.0, 'sine', 0.06, 2600); },
  knal() { fwBang(1, 0, false); },
  ring() { [0, 0.12, 0.24, 0.36].forEach((d, i) => tone(i % 2 ? 1568 : 1318, 0.1, 'square', 0.06, null, d)); },
};
// echte vuurwerkknal: scherpe klap + lage dreun + echo tussen de huizen (+ geknetter)
let fwNoise = null;
const FW_VOL = 0.25, FW_CLIPS = new Set(['groot', 'cake', 'nitraat']); // vuurwerk mag de stemmen niet overstemmen
function fwBang(power = 1, delay = 0, crackle = false) {
  if (!ac || !save.sound) return;
  const t = ac.currentTime + delay, sr = ac.sampleRate;
  if (!fwNoise) { fwNoise = ac.createBuffer(1, sr * 2, sr); const d = fwNoise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const out = ac.createGain(), comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.001; comp.release.value = 0.15;
  const fwVol = ac.createGain(); fwVol.gain.value = FW_VOL;
  out.gain.value = 0.85 * power; out.connect(comp).connect(fwVol).connect(master);
  const burstN = (at, dur, vol, type, freq, q = 0.7) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = fwNoise; s.playbackRate.value = rand(0.85, 1.15);
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    s.connect(f).connect(g).connect(out); s.start(at, Math.random()); s.stop(at + dur + 0.05);
  };
  burstN(t, 0.09, 1.6, 'highpass', 900);            // de klap
  burstN(t, 0.7, 1.4, 'lowpass', 520);              // het lichaam van de knal
  const o = ac.createOscillator(), og = ac.createGain();  // de dreun in je buik
  o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
  og.gain.setValueAtTime(1.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  o.connect(og).connect(out); o.start(t); o.stop(t + 0.75);
  burstN(t + 0.16, 0.5, 0.45, 'lowpass', 380);      // echo
  burstN(t + 0.34, 0.6, 0.2, 'lowpass', 300);
  if (crackle) for (let i = 0; i < 18; i++) burstN(t + 0.45 + Math.random() * 1.1, 0.03, rand(0.25, 0.6), 'bandpass', rand(2500, 5000), 2);
}
function engineStart() {
  if (!ac || !save.sound || engine) return;
  const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
  o.type = 'sawtooth'; o.frequency.value = 95;
  lfo.frequency.value = 24; lg.gain.value = 18;
  lfo.connect(lg).connect(o.frequency);
  g.gain.value = 0.05;
  o.connect(g).connect(master);
  o.start(); lfo.start();
  engine = { o, g, lfo };
}
function engineStop() {
  if (!engine) return;
  const e = engine; engine = null;
  e.g.gain.setTargetAtTime(0, ac.currentTime, 0.1);
  e.o.stop(ac.currentTime + 0.5); e.lfo.stop(ac.currentTime + 0.5);
}
const clips = {};
let clipBusyUntil = 0;
async function loadClip(name, url) {
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    clips[name] = await ac.decodeAudioData(buf);
  } catch (e) { /* geen clip */ }
}
// één voor één uitpakken, met een adempauze: 70 tegelijk liet zwakke telefoons bij het starten vastlopen
const clipQueue = [], clipSeen = new Set();
let clipPump = false;
function queueClip(name, url) {
  if (clips[name] || clipSeen.has(name)) return;
  clipSeen.add(name); clipQueue.push([name, url]);
  if (clipPump) return;
  clipPump = true;
  (async () => {
    while (clipQueue.length) { const [n, u] = clipQueue.shift(); await loadClip(n, u); await new Promise((r) => setTimeout(r, 60)); }
    clipPump = false;
  })();
}
function playClip(name, force) {
  if (!ac || !save.sound || !clips[name]) return false;
  const t = ac.currentTime;
  if (!force && t < clipBusyUntil) return true;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = clips[name]; g.gain.value = 0.8 * save.set.voice / 100;
  s.connect(g).connect(voiceBus); s.start();
  clipBusyUntil = t + clips[name].duration;
  voiceDuck = 0.5; voiceUntil = Math.max(voiceUntil, clipBusyUntil);
  return true;
}
let singBusyUntil = 0;
function singBio() {
  if (!save.sound) return;
  const t = now();
  if (t < singBusyUntil) return;
  singBusyUntil = t + 2.2;
  // melodietje eronder
  const notes = [[523, 0.28], [659, 0.28], [784, 0.28], [880, 0.4], [784, 0.6]];
  let d = 0;
  for (const [f, len] of notes) { tone(f, len * 0.95, 'triangle', 0.07, null, d); d += len; }
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const words = [['Nooit', 1.0], ['meer', 1.3], ['naar', 1.6], ['bi', 1.8], ['oooo', 1.5]];
    for (const [w, pitch] of words) {
      const u = new SpeechSynthesisUtterance(w);
      u.lang = 'nl-NL'; u.rate = 0.9; u.pitch = pitch; u.volume = 0.9;
      speechSynthesis.speak(u);
    }
  } catch (e) { /* geen spraak */ }
}
// muziek: één afspeler die van nummer wisselt. Vroeger streamden alle nummers tegelijk op volume 0:
// dat kost veel en browsers leggen zulke streams soms stil, waardoor de muziek ineens wegviel.
const music = { eltune: 'audio/radio/eltune.mp3', chip: 'audio/radio/chiptune.mp3', menu: 'audio/menu.mp3', story: 'audio/story.mp3', verhaalmenu: 'audio/verhaalmenu.mp3', nederland: 'audio/nederland.mp3', game: 'audio/game.mp3' };
const musicEl = new Audio(), musicGain = {}, musicPos = {};
let musicCur = null, musicLoaded = null;
musicEl.loop = true; musicEl.preload = 'auto'; musicEl.crossOrigin = 'anonymous';
musicEl.addEventListener('loadedmetadata', () => { const t = musicPos[musicLoaded] || 0; if (t > 0 && t < musicEl.duration - 1) musicEl.currentTime = t; });
function musicSwitch(k) {
  if (musicCur && musicLoaded === musicCur && musicEl.currentTime > 0) musicPos[musicCur] = musicEl.currentTime;
  musicCur = k;
  if (!k) { musicEl.pause(); return; }
  if (musicLoaded !== k) { musicLoaded = k; musicEl.src = music[k]; }
  musicEl.play().catch(() => {});
}
function musicRestart(k) { musicPos[k] = 0; if (musicLoaded === k) { try { musicEl.currentTime = 0; } catch (e) { /* nog niet geladen */ } } }
// een stream die stukgaat (netwerk, telefoon die iets anders deed): even later op dezelfde plek verder
function musicReload() { if (!musicCur) return; const k = musicCur; musicPos[k] = musicEl.currentTime || musicPos[k] || 0; musicLoaded = null; musicCur = null; musicSwitch(k); }
musicEl.addEventListener('error', () => setTimeout(musicReload, 1500));
// elke aanraking of toets: audio weer aanzetten (browsers staan starten alleen toe na een klik)
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => {
  if (!ac) return;
  if (ac.state !== 'running') ac.resume().catch(() => {});
  musicKick();
}, { capture: true, passive: true });
// muziek gaat mee met je score: bij 2,5 miljoen punten 75% harder en 1,5× zo snel (dat is het maximum)
const musicBoost = () => (state === 'run' || state === 'paused') && !curLevel ? Math.sqrt(clamp(score / 2.5e6, 0, 1)) : 0;
const musicWatch = {};
function musicInit() {
  const g = ac.createGain(); g.gain.value = 0;
  ac.createMediaElementSource(musicEl).connect(g).connect(ac.destination);
  musicGain.main = g;
  if (recDest) g.connect(recDest);
  musicSwitch('menu'); // binnen de eerste klik starten: daarna mag deze afspeler altijd (ook op iPhone)
}
function musicKick() { if (musicCur && musicEl.paused) musicEl.play().catch(() => {}); }
const MUSIC_VOL = 0.45;
let gameoverSrc = null;
function playGameover(name = 'gameover') {
  stopGameover();
  if (!ac || !save.sound || !clips[name]) return;
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = clips[name]; g.gain.value = MUSIC_VOL * save.set.music / 100;
  src.connect(g).connect(ac.destination);
  if (recDest) g.connect(recDest);
  src.start();
  gameoverSrc = src;
  src.onended = () => { if (gameoverSrc === src) gameoverSrc = null; };
}
function stopGameover() {
  if (gameoverSrc) { try { gameoverSrc.stop(); } catch (e) { /* al gestopt */ } gameoverSrc = null; }
}
function updateMusic(dt) {
  if (!ac || !musicGain.main) return;
  if (ac.state !== 'running') {
    // probeer het af en toe zelf weer aan te zetten (zonder klik lukt dat niet altijd)
    if ((musicWatch.resumeT = (musicWatch.resumeT || 0) - dt) <= 0 && !document.hidden) { musicWatch.resumeT = 1; ac.resume().catch(() => {}); }
    return;
  }
  // tijdens game over / level gehaald speelt alleen dat muziekje; in een level eigen muziek
  const storyMenu = curScreen === '#levels' || curScreen === '#lvldone' || (curScreen === '#fame' && curLevel);
  let want = newsPlaying ? null : state === 'cutscene' && !gameoverSrc ? 'verhaalmenu' : state === 'run' || state === 'lkamer' || state === 'aanloop' || (state === 'mini' && !mini.paused && !mini.over) ? (curLevel ? (campaign === 'nederland' ? 'nederland' : 'story') : 'game') : gameoverSrc || state === 'paused' || state === 'dying' || state === 'photo' || state === 'replay' ? null : storyMenu ? 'verhaalmenu' : 'menu';
  if (want === 'menu' && save.radio && save.radio !== 'menu') want = save.radio === 'uit' ? null : save.radio;
  const boost = want === 'game' ? musicBoost() : 0;
  const g = musicGain.main.gain;
  if (want && !save.sound) want = null;
  // wisselen: eerst uitfaden, dan pas het andere nummer
  if (want !== musicCur) {
    g.value = damp(g.value, 0, 10, dt);
    if (g.value < 0.03 || musicEl.paused) { g.value = 0; musicSwitch(want); }
    return;
  }
  if (!want) return;
  const target = MUSIC_VOL * (save.set.music / 100) * (1 + 0.75 * boost) * (ac.currentTime < Math.max(voiceUntil, verslagUntil) ? voiceDuck : 1);
  g.value = damp(g.value, target, target > g.value ? 2.5 : 5, dt);
  const rate = want === 'game' ? (1 + 0.5 * boost) * (slomoT > 0 ? 0.72 : 1) : 1;
  if (Math.abs(musicEl.playbackRate - rate) > 0.01) musicEl.playbackRate = rate;
  if (musicEl.paused) musicEl.play().catch(() => {});
  // waakhond: het nummer moet ook écht doorlopen
  if (!document.hidden) {
    const w = musicWatch;
    if (!musicEl.paused && musicEl.currentTime === w.t) w.stuck = (w.stuck || 0) + dt; else w.stuck = 0;
    w.t = musicEl.currentTime;
    if (w.stuck > 3) { w.stuck = 0; if (musicEl.readyState < 3) musicReload(); else musicEl.play().catch(() => {}); }
  }
}
let lastSpeak = 0;
function speak(text) {
  // geen browserstem meer (klinkt overal anders): alleen vooraf opgenomen zinnen
  const k = SPEAK_MAP[String(text).toLowerCase().replace(/[^a-z ]/g, '').trim()];
  if (k && verslag?.[k]) playUrl(verslag[k][0].f, 0.95 * save.set.voice / 100);
}

// =====================================================================
//  renderer / scene
// =====================================================================
// PS1-look: 240 lijnen, vertices springen naar hele pixels, textures worden affiene (scheef) getekend,
// licht wordt per hoekpunt berekend (Gouraud, zoals de GTE van de PS1), de kleuren gaan terug naar
// 15 bit met een bayer-dither en de mist loopt in banden. Grote vlakken die je scheef ziet (gevels)
// krijgen PSX_PERSP: daar wordt de texture wel recht getekend, anders zwemmen de ramen over de gevel.
{
  const C = THREE.ShaderChunk;
  const affine = `
#ifdef USE_MAP
  vPsxUv = vec3(vMapUv * gl_Position.w, gl_Position.w);
#endif`;
  C.uv_pars_vertex += '\nvarying vec3 vPsxUv;\n';
  C.uv_pars_fragment += '\nvarying vec3 vPsxUv;\n';
  C.project_vertex += affine + `
  {
    float psxA = projectionMatrix[1][1] / projectionMatrix[0][0];
    vec2 psxGrid = psxA >= 1.0 ? vec2(150.0 * psxA, 150.0) : vec2(150.0, 150.0 / psxA);
    vec4 sp = gl_Position;
    if (sp.w > 0.0) { sp.xy = floor(sp.xy / sp.w * psxGrid + 0.5) / psxGrid * sp.w; gl_Position = sp; }
  }`;
  C.map_fragment = C.map_fragment.replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );', `
#ifdef PSX_PERSP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
#else
  // een beetje scheef voor het PS1-gevoel, maar niet zo dat alles zwemt
  vec4 sampledDiffuseColor = texture2D( map, mix( vMapUv, vPsxUv.xy / vPsxUv.z, 0.25 ) );
#endif
  // weinig kleuren per texture, zoals de kleurtabellen van de PS1
  {
    float psxL = max(sampledDiffuseColor.r, max(sampledDiffuseColor.g, sampledDiffuseColor.b)) + 0.001;
    float psxQ2 = floor(sqrt(psxL) * 13.0 + 0.5) / 13.0;
    sampledDiffuseColor.rgb *= psxQ2 * psxQ2 / psxL; // helderheid in stappen, de kleur zelf blijft kloppen
  }`);
  // bayer 4×4 als rekensom: een constante tabel in de fragment shader is op telefoons erg traag
  const bayer = `ivec2 psxP = ivec2(gl_FragCoord.xy) & 3;
    int psxQ = psxP.x ^ psxP.y;
    float psxD = (float((psxQ & 1) * 8 + (psxP.y & 1) * 4 + ((psxQ >> 1) & 1) * 2 + ((psxP.y >> 1) & 1)) + 0.5) / 16.0;`;
  // mist in banden, met dither ertussen
  C.fog_fragment = `
#ifdef USE_FOG
  {
    ${bayer}
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    fogFactor = floor( fogFactor * 14.0 + psxD ) / 14.0;
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  }
#endif`;
  // kleurgrading: voller en harder (diepe schaduwen), dan terug naar 15 bit
  const dither = `
  {
    ${bayer}
    vec3 c = gl_FragColor.rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = clamp(mix(vec3(l), c, 1.22), 0.0, 1.0);
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.55);
    gl_FragColor.rgb = floor(c * 31.0 + psxD) / 31.0;
  }`;
  C.dithering_fragment += dither;
  const sp = THREE.ShaderLib.sprite;
  sp.vertexShader = sp.vertexShader.replace('#include <logdepthbuf_vertex>', affine + '\n#include <logdepthbuf_vertex>');
  sp.fragmentShader = sp.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>' + dither);
  // Gouraud: al het licht in de vertex shader, plus 'gebakken' schaduw onderaan muren en mensen
  const L = THREE.ShaderLib.lambert;
  L.vertexShader = L.vertexShader
    .replace('#include <common>', '#include <common>\n#include <lights_pars_begin>\nvarying vec3 vPsxLight;')
    .replace('#include <fog_vertex>', `#include <fog_vertex>
  {
    vec3 n = normalize(transformedNormal), li = ambientLightColor;
    float up = 0.0;
    #if NUM_HEMI_LIGHTS > 0
      for (int i = 0; i < NUM_HEMI_LIGHTS; i++) { li += getHemisphereLightIrradiance(hemisphereLights[i], n); up = dot(n, hemisphereLights[i].direction); }
    #endif
    #if NUM_DIR_LIGHTS > 0
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
        float d = dot(n, directionalLights[i].direction);
        #ifdef DOUBLE_SIDED
          d = abs(d);
        #endif
        li += saturate(d) * directionalLights[i].color;
      }
    #endif
    #if NUM_POINT_LIGHTS > 0
      for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
        vec3 v = pointLights[i].position - mvPosition.xyz;
        float r = length(v), d = dot(n, v / r);
        #ifdef DOUBLE_SIDED
          d = abs(d);
        #endif
        li += saturate(d * 0.7 + 0.3) * pointLights[i].color * getDistanceAttenuation(r, pointLights[i].distance, pointLights[i].decay);
      }
    #endif
    vec4 wp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
    #endif
    float wy = (modelMatrix * wp).y;
    float ao = wy < -0.5 ? 1.0 : mix(0.58, 1.0, smoothstep(0.0, 1.9, wy));
    vPsxLight = li * RECIPROCAL_PI * mix(ao, 1.0, saturate(up));
  }`);
  const a = '#include <normal_fragment_begin>', b = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;';
  const fs = L.fragmentShader, i0 = fs.indexOf(a), i1 = fs.indexOf(b) + b.length, oud = fs.slice(i0, i1);
  const em = '#include <emissivemap_fragment>';
  L.fragmentShader = (fs.slice(0, i0) + `#ifdef FLAT_SHADED
  ${oud}
#else
  ${em}
  vec3 outgoingLight = diffuseColor.rgb * vPsxLight + totalEmissiveRadiance;
#endif` + fs.slice(i1)).replace('#include <common>', '#include <common>\nvarying vec3 vPsxLight;');
}
const QUALITY = { ps1: 224, normaal: 320, scherp: 480 };
if (!save.set.quality || save.set.quality === 'normaal') save.set.quality = 'auto';
const AUTO_STEPS = [180, 200, 224, 224];
// zwakke apparaten (weinig kernen of geheugen) beginnen lager
const weakDevice = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 8) <= 4;
let autoIdx = weakDevice || isIPod ? 0 : 3;
if (isIPod) AUTO_STEPS[0] = 180;
let PSX_RES = save.set.quality === 'auto' ? AUTO_STEPS[autoIdx] : QUALITY[save.set.quality] || 400;
let lowFx = autoIdx <= 1;
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.debug.checkShaderErrors = /[?&]debug/.test(location.search);
const scene = new THREE.Scene();
const SKY = new THREE.Color('#bfe3ff');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 14, 58);
const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 72); // voorbij de mist hoeft niets getekend te worden
const hemi = new THREE.HemisphereLight('#e6f2ff', '#7a6a58', 2.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
sun.position.set(-7, 10, 5);
scene.add(sun);
// 's avonds hangt er een warme vlek licht om Jens heen: per hoekpunt, dus met de echte PS1-verlopen over de vlakken
const lantern = new THREE.PointLight('#fff4e6', 0, 26, 1.3);
lantern.position.set(0, 2.6, 1.5);
scene.add(lantern);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const k = PSX_RES / Math.min(w, h);
  renderer.setSize(Math.round(w * k), Math.round(h * k), false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 72 : 60;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- samenvoegen: minder losse onderdelen = veel sneller op zwakke laptops ----------
const mInv = new THREE.Matrix4(), mRel = new THREE.Matrix4();
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  mInv.copy(group.matrixWorld).invert();
  const buckets = new Map(), keep = [];
  group.traverse((o) => {
    if (o === group) return;
    if (o.isSprite || o.userData.keep || (o.isMesh && Array.isArray(o.material))) { keep.push(o); return; }
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(mRel.multiplyMatrices(mInv, o.matrixWorld));
    const k = o.material.uuid;
    if (!buckets.has(k)) buckets.set(k, { mat: o.material, geos: [] });
    buckets.get(k).geos.push(g);
  });
  const out = new THREE.Group();
  out.position.copy(group.position); out.quaternion.copy(group.quaternion); out.scale.copy(group.scale);
  for (const { mat, geos } of buckets.values()) {
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      if (!geos.every((g) => g.attributes[name])) continue;
      const size = geos[0].attributes[name].itemSize;
      const arr = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].count * size, 0));
      let off = 0;
      for (const g of geos) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    for (const g of geos) g.dispose();
    out.add(new THREE.Mesh(merged, mat));
  }
  // doorzichtige dingen (schaduw, gloed) blijven los, op dezelfde plek
  for (const o of keep) {
    mRel.multiplyMatrices(mInv, o.matrixWorld);
    o.parent.remove(o);
    mRel.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}

// ---------- instancing: veel gelijke onderdelen in één tekenopdracht ----------
// Huizen, bomen, fietsen, lantaarnpalen en feestversiering worden als 'proxy' (lege groep) in de
// scene gezet: alle bestaande code verplaatst/verbergt die groepen zoals altijd. Hun onderdelen
// (zelfde vorm + materiaal) worden elk beeld verzameld en als InstancedMesh getekend.
const instPools = new Map();
const batchProxies = new Set();
const _bm = new THREE.Matrix4();
function instPush(geo, mat, m, order) {
  const key = geo.id + ':' + mat.id;
  let im = instPools.get(key);
  if (!im || im.count >= im.instanceMatrix.count) {
    const grow = new THREE.InstancedMesh(geo, mat, im ? im.instanceMatrix.count * 2 : 16);
    grow.frustumCulled = false; grow.renderOrder = order || 0; grow.count = 0;
    if (im) { grow.instanceMatrix.array.set(im.instanceMatrix.array.subarray(0, im.count * 16)); grow.count = im.count; scene.remove(im); im.dispose(); }
    scene.add(grow); instPools.set(key, grow); im = grow;
  }
  im.setMatrixAt(im.count++, m);
}
// een groep omzetten: Mesh-onderdelen worden instanced, de rest (sprites e.d.) blijft gewoon hangen
function batchify(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = [], rest = [];
  group.traverse((o) => {
    if (o === group) return;
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && !o.userData.noBatch) parts.push({ src: o, local: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), geo: o.geometry, mat: o.material, order: o.renderOrder });
    else if (!o.isMesh && o.parent === group && !o.isGroup) rest.push(o);
    else if (o.isMesh) rest.push(o);
  });
  const proxy = new THREE.Group();
  proxy.position.copy(group.position); proxy.quaternion.copy(group.quaternion); proxy.scale.copy(group.scale);
  for (const r of rest) { r.parent.remove(r); proxy.add(r); }
  proxy.userData.parts = parts;
  proxy.userData = Object.assign(group.userData, proxy.userData);
  batchProxies.add(proxy);
  return proxy;
}
// figuranten: hun onderdelen staan op laag 1 (de camera's tekenen ze dan niet zelf) en worden
// elk beeld met hun actuele stand als instances getekend
const batchPeople = new Set(), batchSingles = new Set();
function batchPerson(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !Array.isArray(o.material)) { o.layers.set(1); meshes.push(o); } });
  root.userData.batchMeshes = meshes;
  batchPeople.add(root);
}
const _seenTop = new Set();
function chainVisible(o) { for (let n = o; n; n = n.parent) { if (!n.visible) return false; if (n === scene) return true; } return false; }
// huizen: onderdelen veranderen (hoogte, materiaal), dus die worden elk beeld opnieuw gelezen
const batchHouses = [];
function updateBatches() {
  for (const im of instPools.values()) im.count = 0;
  for (const h of batchHouses) {
    if (!h.g.visible || !h.g.parent || h.g.position.z < -74) continue;
    h.g.updateMatrix();
    for (const p of h.parts) {
      if (!p.visible) continue;
      p.updateMatrix();
      instPush(p.geometry, p.material, _bm.multiplyMatrices(h.g.matrix, p.matrix), p.renderOrder);
    }
  }
  for (const proxy of batchProxies) {
    if (!proxy.parent) { batchProxies.delete(proxy); continue; }
    if (!proxy.visible || proxy.position.z < -70) continue; // voorbij het verre vlak tekent three het ook niet
    proxy.updateMatrix();
    for (const p of proxy.userData.parts) {
      if (!p.src.visible) continue;
      instPush(p.geo, p.mat, _bm.multiplyMatrices(proxy.matrix, p.local), p.order);
    }
  }
  _seenTop.clear();
  for (const root of batchPeople) {
    if (!chainVisible(root)) { if (root.userData.inScene && !inScene(root)) batchPeople.delete(root); continue; }
    root.userData.inScene = true;
    let top = root; while (top.parent && top.parent !== scene) top = top.parent;
    if (!_seenTop.has(top)) { _seenTop.add(top); top.updateMatrixWorld(true); }
    for (const m of root.userData.batchMeshes) if (m.visible && chainVisible(m)) instPush(m.geometry, m.material, m.matrixWorld, m.renderOrder);
  }
  for (const m of batchSingles) {
    if (!m.parent || !m.visible) continue;
    if (m.parent === scene) { m.updateMatrix(); instPush(m.geometry, m.material, m.matrix, m.renderOrder); }
    else if (chainVisible(m)) { m.updateWorldMatrix(true, false); instPush(m.geometry, m.material, m.matrixWorld, m.renderOrder); }
  }
  for (const im of instPools.values()) { im.visible = im.count > 0; im.instanceMatrix.needsUpdate = true; }
}
function inScene(o) { for (let n = o; n; n = n.parent) if (n === scene) return true; return false; }

// ---------- low-poly: elke ronde vorm blijft bij een PS1-aantal hoeken ----------
function cylG(rt, rb, h, seg = 6, hs = 1, ...rest) { return new THREE.CylinderGeometry(rt, rb, h, Math.min(seg, 6), Math.min(hs, 1), ...rest); }
function coneG(r, h, seg = 6, ...rest) { return new THREE.ConeGeometry(r, h, Math.min(seg, 6), ...rest); }
// (hoofden en haarkappen mogen iets ronder: die zie je van dichtbij)
function sphG(r, w = 6, h = 4, ...rest) { return new THREE.SphereGeometry(r, w >= 14 ? 9 : Math.min(w, 6), w >= 14 ? Math.min(h, 7) : Math.min(h, 4), ...rest); }
function torG(r, t, rs = 4, ts = 10, ...rest) { return new THREE.TorusGeometry(r, t, Math.min(rs, 4), Math.min(ts, 10), ...rest); }

// ---------- materials / textures ----------
const matCache = new Map();
let tileTex = null;
function matTile() {
  if (tileTex) return tileTex;
  tileTex = canvasTex(16, 16, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 44; i++) { x.fillStyle = `rgba(0,0,0,${rand(0.05, 0.26).toFixed(2)})`; x.fillRect(Math.floor(rand(0, 16)), Math.floor(rand(0, 16)), 1 + Math.floor(rand(0, 2)), 1); }
    x.fillStyle = 'rgba(0,0,0,.26)'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 15, 16, 1); x.fillRect(0, 0, 1, 16); x.fillRect(15, 0, 1, 16);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1, 1); // zonder uv-coördinaten leest de shader deze pixel
  });
  sharedRes.add(tileTex);
  return tileTex;
}
function M(color, extra) {
  const key = color + (extra ? JSON.stringify(extra, (k, v) => (v?.isTexture ? v.uuid : v)) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, map: matTile(), ...extra }));
  return matCache.get(key);
}
function psxTex(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  // geen wazige overgangen, maar op afstand ook geen geflikker
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  return t;
}
// PS1-textures zijn klein: de tekenaar blijft in de oude maat werken, het canvas zelf is kleiner.
// Langwerpige (borden met tekst) mogen iets meer pixels houden.
function canvasTex(w, h, draw, cap = Math.max(w, h) / Math.min(w, h) >= 2.5 ? 192 : 96) {
  const c = document.createElement('canvas');
  const k = Math.min(1, cap / Math.max(w, h));
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const x = c.getContext('2d');
  x.scale(k, k);
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  psxTex(t);
  return t;
}
// opruimen: vormen/textures van verdwenen objecten vrijgeven, behalve wat gedeeld wordt
const sharedRes = new WeakSet();
const markShared = (v) => {
  if (!v || typeof v !== 'object') return v;
  if (v.isBufferGeometry || v.isTexture) sharedRes.add(v);
  else if (v.isMaterial) { sharedRes.add(v); for (const k of ['map', 'emissiveMap']) if (v[k]) sharedRes.add(v[k]); }
  else if (v.isObject3D) v.traverse((o) => { if (o.geometry) sharedRes.add(o.geometry); if (o.material) [].concat(o.material).forEach(markShared); });
  else for (const x of Object.values(v)) if (x && typeof x === 'object' && (x.isMaterial || x.isTexture || x.isBufferGeometry)) markShared(x);
  return v;
};
let resBase = { g: Infinity, t: Infinity }; // alles van vóór het opwarmen blijft altijd
function freeObject(root) {
  root.traverse((o) => {
    const g = o.geometry;
    if (g && !sharedRes.has(g) && g.id > resBase.g) g.dispose();
    if (o.material) for (const m of [].concat(o.material)) for (const k of ['map', 'emissiveMap']) { const t = m[k]; if (t && !sharedRes.has(t) && t.id > resBase.t) t.dispose(); }
  });
}
// dezelfde maten = dezelfde vorm: één keer naar de GPU in plaats van bij elk nieuw object
const boxCache = new Map();
const box = (w, h, d) => {
  const k = w + ',' + h + ',' + d;
  let g = boxCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxCache.set(k, g); sharedRes.add(g); }
  return g;
};
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
function text(x, str, color, size, y, font = 'Anton, Impact, sans-serif', w = 128) {
  x.fillStyle = color;
  x.font = `${size}px ${font}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(str, w / 2, y, w - 10);
}
function star(x, cx, cy, r) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath(); x.fill();
}

// blob shadow
const shadowTex = canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function makeShadow(sx, sz) {
  const s = new THREE.Mesh(shadowGeo, shadowMat);
  s.scale.set(sx, 1, sz);
  s.renderOrder = 1;
  return s;
}

// =====================================================================
//  PS1-mensen: low-poly lijf met ellebogen en knieën en geschilderde textures
// =====================================================================
const SHIRTS = {
  pas: { base: '#141414', paint(x, side) { x.fillStyle = '#ffd23f'; x.fillRect(0, 0, 128, 10); x.fillRect(0, 118, 128, 10); if (side === 'front') text(x, 'SEIZOEN', '#ffd23f', 22, 56); else { text(x, 'JENS', '#ffd23f', 24, 40); text(x, '🎟️', '#fff', 30, 84); } } },
  feyenoord: { base: '#d8101f', paint(x, side) {
    x.fillStyle = '#f4f4f4'; x.fillRect(64, 0, 64, 128); // rood-wit, half om half
    if (side === 'front') { x.fillStyle = '#d8101f'; x.beginPath(); x.arc(92, 34, 9, 0, 7); x.fill(); x.fillStyle = '#f4f4f4'; x.fillRect(89, 28, 6, 12); }
    else { text(x, 'JENS', '#111', 24, 34); text(x, '9', '#111', 54, 84); }
  } },
  wit: { base: '#e9e7e1', paint() {} },
  vierdaagse: { base: '#1f8f4e', paint(x, side) {
    if (side === 'front') { text(x, '4DAAGSE', '#fff', 26, 50); text(x, 'NIJMEGEN', '#bff0cf', 15, 76, 'Anton, sans-serif'); }
    else { text(x, 'JENS', '#fff', 30, 40); text(x, '4', '#fff', 56, 88); }
  } },
  oranje: { base: '#ff7b00', paint(x, side) {
    if (side === 'front') { x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 44, 14, 0, 7); x.fill(); text(x, 'HUP HOLLAND', '#fff', 17, 82); }
    else { text(x, 'JENS', '#fff', 28, 34); text(x, '10', '#fff', 60, 84); }
  } },
  uefa: { base: '#1a1a1a', img: 'img/shirt-uefa.png', paint(x, side) {
    if (side === 'back') {
      x.strokeStyle = '#ff6a00'; x.lineWidth = 3;
      for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(8, 100 + i * 5); x.lineTo(40, 80 + i * 5); x.lineTo(64, 104 + i * 5); x.lineTo(90, 78 + i * 5); x.lineTo(120, 100 + i * 5); x.stroke(); }
      text(x, 'JENS', '#fff', 26, 30); text(x, '7', '#ff8a00', 44, 62);
    }
  } },
  goud: { base: '#d9a51e', paint(x, side) {
    x.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 128; i += 14) x.fillRect(i, 0, 5, 128);
    x.fillStyle = '#c8202b'; x.fillRect(0, 54, 128, 7); x.fillStyle = '#1f7a3a'; x.fillRect(0, 61, 128, 7); x.fillStyle = '#141414'; x.fillRect(0, 68, 128, 7);
    if (side === 'front') text(x, '👑', '#fff', 30, 30); else { text(x, 'JENS', '#141414', 26, 30); text(x, '1', '#141414', 46, 100); }
  } },
  nec6: { base: '#141414', paint(x, side) {
    // rood en groen, gescheiden door zwart
    x.fillStyle = '#c8202b'; x.fillRect(side === 'front' ? 0 : 64, 0, 60, 128);
    x.fillStyle = '#1f7a3a'; x.fillRect(side === 'front' ? 68 : 4, 0, 60, 128);
    if (side === 'front') { x.fillStyle = '#fff'; x.fillRect(80, 22, 22, 26); x.fillStyle = '#c8202b'; x.fillRect(83, 25, 8, 20); x.fillStyle = '#1f7a3a'; x.fillRect(91, 25, 8, 20); text(x, '6', '#ffffff', 26, 90); }
    else { text(x, 'NEJAŠMIĆ', '#ffffff', 19, 26, 'Impact, sans-serif'); text(x, '6', '#ffffff', 70, 80, 'Impact, sans-serif'); }
  } },
  eurotour: { base: '#161616', img: 'img/shirt-eurotour.png', imgBack: 'img/shirt-eurotour-rug.png', paint() {} },
  heineken: { base: '#e8452c', paint(x, side) {
    x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 128; i += 18) x.fillRect(i, 0, 6, 128); // satijnglans
    if (side === 'front') {
      x.fillStyle = '#c23a24'; x.beginPath(); x.moveTo(44, 0); x.lineTo(64, 34); x.lineTo(84, 0); x.fill(); // kraag
      x.fillStyle = '#f4f4f4'; for (let y = 40; y < 128; y += 20) { x.beginPath(); x.arc(64, y, 2.5, 0, 7); x.fill(); }
      x.fillStyle = '#1f7a3a'; x.fillRect(72, 26, 34, 32); // borstzakje
      x.fillStyle = '#e2231a'; star(x, 89, 35, 5);
      x.fillStyle = '#ffffff'; x.font = 'bold 8px Anton, sans-serif'; x.textAlign = 'center'; x.fillText('Heineken', 89, 52);
    }
  } },
  rammstein: { base: '#1a1a1a', img: 'img/shirt-rammstein.png', paint(x, side) {
    if (side === 'back') { text(x, 'RAMM', '#d4141b', 40, 42, 'Impact, sans-serif'); text(x, 'STEIN', '#d4141b', 40, 84, 'Impact, sans-serif'); }
  } },
};
const imgCache = new Map();
function loadImg(url) {
  if (!imgCache.has(url)) imgCache.set(url, new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }));
  return imgCache.get(url);
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => clamp(Math.round(v * f), 0, 255);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, markShared(make()));
  return cache.get(key);
}

// stof zoals een PS1-texture: basiskleur, plooien, schaduw en korrel
function paintFabric(x, w, h, base, o = {}) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  let g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  if (o.sides) {
    // flanken van de romp donkerder (voor = midden, achter = randen)
    g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,.08)'); g.addColorStop(0.25, 'rgba(0,0,0,.32)'); g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(0.75, 'rgba(0,0,0,.32)'); g.addColorStop(1, 'rgba(0,0,0,.08)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  const folds = o.folds ?? 16;
  for (let i = 0; i < folds; i++) {
    const fx = Math.random() * w, fy = Math.random() * h * 0.8, len = rand(h * 0.15, h * 0.5);
    x.strokeStyle = Math.random() < 0.55 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.12)';
    x.lineWidth = rand(1.5, w / 22);
    x.beginPath(); x.moveTo(fx, fy); x.quadraticCurveTo(fx + rand(-w / 12, w / 12), fy + len / 2, fx + rand(-w / 16, w / 16), fy + len); x.stroke();
  }
  grain(x, w, h, o.grain ?? 22);
}
// korrel zonder de texture terug te lezen: dat teruglezen hield het spel vast als er iets nieuws verscheen
let grainCv = null;
function grain(x, w, h, amt) {
  if (!grainCv) {
    grainCv = document.createElement('canvas'); grainCv.width = grainCv.height = 32;
    const g = grainCv.getContext('2d');
    for (let i = 0; i < 32; i++) for (let k = 0; k < 32; k++) { const v = Math.floor(Math.random() * 256); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i, k, 1, 1); }
  }
  x.save();
  x.globalAlpha = Math.min(0.55, amt / 55);
  x.globalCompositeOperation = 'overlay';
  x.fillStyle = x.createPattern(grainCv, 'repeat');
  x.fillRect(0, 0, w, h);
  x.restore();
}
const fabricMat = (base) => cached('fab' + base, () => new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (x, w, h) => paintFabric(x, w, h, base)) }));
const denimMat = (base) => cached('den' + base, () => new THREE.MeshLambertMaterial({ map: canvasTex(64, 128, (x, w, h) => {
  paintFabric(x, w, h, base, { folds: 12, grain: 34 });
  x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(w * 0.38, h * 0.3, w * 0.24, h * 0.25); // sleet bij de knie
  x.strokeStyle = 'rgba(255,214,140,.35)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(w * 0.25, 0); x.lineTo(w * 0.25, h); x.moveTo(w * 0.75, 0); x.lineTo(w * 0.75, h); x.stroke();
}) }));
const skinMat = (base) => cached('skin' + base, () => new THREE.MeshLambertMaterial({ map: canvasTex(32, 64, (x, w, h) => {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(90,40,25,.22)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,40,25,.22)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(90,40,25,.12)'; x.fillRect(rand(0, w), rand(0, h), rand(2, 6), rand(6, 16)); }
  grain(x, w, h, 12);
}) }));
const hairMat = (color) => cached('hair' + color, () => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: canvasTex(64, 64, (x) => {
  x.fillStyle = color; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 260; i++) {
    x.strokeStyle = Math.random() < 0.55 ? shade(color, 0.65) : shade(color, 1.3);
    x.globalAlpha = 0.55; x.lineWidth = 1;
    const sx = Math.random() * 64, sy = Math.random() * 64;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + rand(-2, 2), sy + rand(4, 11)); x.stroke();
  }
  x.globalAlpha = 1;
}) }));

const shirtCache = new Map();
function shirtMats(def) {
  const ck = typeof def === 'string' ? def : def.base + '|' + def.paint.toString();
  if (!shirtCache.has(ck)) shirtCache.set(ck, markShared(shirtMatsNew(def)));
  return shirtCache.get(ck);
}
function shirtMatsNew(def) {
  const s = typeof def === 'string' ? SHIRTS[def] : def;
  // romp-cilinder: voorkant ligt in het midden van de texture, de rug op de randen
  const tex = canvasTex(256, 128, (x) => {
    paintFabric(x, 256, 128, s.base, { sides: true, folds: 24 });
    x.fillStyle = shade(s.base, 0.62); x.beginPath(); x.ellipse(128, 0, 24, 11, 0, 0, Math.PI); x.fill(); // kraag
    x.save(); x.translate(64, 0); s.paint(x, 'front'); x.restore();
    for (const ox of [-64, 192]) { x.save(); x.translate(ox, 0); s.paint(x, 'back'); x.restore(); }
  }, 128);
  if (s.img) loadImg(s.img).then((im) => {
    const x = tex.image.getContext('2d');
    x.drawImage(im, 82, 10, 92, 100);
    grain(x, 256, 128, 14);
    tex.needsUpdate = true;
  });
  if (s.imgBack) loadImg(s.imgBack).then((im) => {
    // de rug ligt over de naad van de texture: helft links, helft rechts
    const x = tex.image.getContext('2d');
    for (const ox of [-28, 228]) x.drawImage(im, ox, 12, 56, 104);
    tex.needsUpdate = true;
  });
  return { torso: new THREE.MeshLambertMaterial({ map: tex }), sleeve: fabricMat(s.base) };
}

// hoofd-texture (equirectangular, gezicht op u = 0.75)
function drawHead(x, o, photo, hair) {
  const W = 512, H = 256, fx = 384;
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  x.fillStyle = o.skin; x.fillRect(0, 0, W, H);
  let g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(70,25,15,.14)'); g.addColorStop(0.25, 'rgba(70,25,15,.32)'); g.addColorStop(0.6, 'rgba(70,25,15,.08)');
  g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(0.9, 'rgba(70,25,15,.08)'); g.addColorStop(1, 'rgba(70,25,15,.14)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(0.9, 'rgba(70,25,15,.35)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const ey = 118;
  if (photo) {
    // ~35% groter dan eerst; het midden van het gezicht blijft op dezelfde plek
    const tmp = document.createElement('canvas'); tmp.width = 216; tmp.height = 216;
    const t = tmp.getContext('2d');
    t.drawImage(photo, 30, 29, 156, 146);
    t.globalCompositeOperation = 'destination-in';
    const rg = t.createRadialGradient(108, 108, 40, 108, 108, 81);
    rg.addColorStop(0, '#000'); rg.addColorStop(0.72, '#000'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    t.setTransform(1, 0, 0, 1.12, 0, -13);
    t.fillStyle = rg; t.fillRect(0, 0, 216, 230);
    x.drawImage(tmp, fx - 108, 70);
  } else {
    x.fillStyle = 'rgba(90,35,20,.16)'; x.fillRect(fx - 44, ey - 13, 88, 24); // oogkassen
    for (const dx of [-23, 23]) {
      x.fillStyle = '#f0e9e0'; x.beginPath(); x.ellipse(fx + dx, ey, 10, 5.5, 0, 0, 7); x.fill();
      x.fillStyle = o.eye || '#4a3a2a'; x.beginPath(); x.arc(fx + dx, ey + 0.5, 4.5, 0, 7); x.fill();
      x.fillStyle = '#111'; x.beginPath(); x.arc(fx + dx, ey + 0.5, 2, 0, 7); x.fill();
      x.strokeStyle = 'rgba(45,20,12,.85)'; x.lineWidth = 2.5;
      x.beginPath(); x.ellipse(fx + dx, ey, 10.5, 6, 0, Math.PI, 2 * Math.PI); x.stroke();
    }
    x.strokeStyle = o.brow || shade(hair || '#3a2614', 0.8); x.lineWidth = 4.5; x.lineCap = 'round';
    x.beginPath();
    if (o.angry) { x.moveTo(fx - 36, ey - 19); x.lineTo(fx - 11, ey - 10); x.moveTo(fx + 36, ey - 19); x.lineTo(fx + 11, ey - 10); }
    else { x.moveTo(fx - 36, ey - 14); x.lineTo(fx - 12, ey - 16); x.moveTo(fx + 12, ey - 16); x.lineTo(fx + 36, ey - 14); }
    x.stroke();
    x.fillStyle = 'rgba(90,40,25,.25)';
    x.beginPath(); x.moveTo(fx - 3, ey + 3); x.lineTo(fx - 9, ey + 29); x.lineTo(fx + 9, ey + 29); x.lineTo(fx + 3, ey + 3); x.fill();
    x.fillStyle = 'rgba(70,25,15,.5)'; x.fillRect(fx - 8, ey + 29, 16, 3);
    const my = ey + 45;
    if (o.angry) {
      x.fillStyle = '#4a1612'; x.beginPath(); x.ellipse(fx, my, 12, 6, 0, 0, 7); x.fill();
      x.fillStyle = '#e8e0d8'; x.fillRect(fx - 9, my - 6, 18, 3);
    } else {
      x.strokeStyle = '#8a3a2e'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(fx - 14, my); x.quadraticCurveTo(fx, my + 5, fx + 14, my); x.stroke();
    }
    x.fillStyle = 'rgba(90,40,25,.2)'; x.fillRect(fx - 10, my + 6, 20, 4);
    if (o.stubble || o.beard) {
      x.fillStyle = o.stubble || o.beard;
      for (let i = 0; i < 1100; i++) {
        const px = fx + rand(-42, 42), py = rand(ey + 26, ey + 78);
        if (Math.abs(px - fx) < 15 && Math.abs(py - my) < 7) continue;
        x.globalAlpha = o.beard ? 0.5 : 0.28; x.fillRect(px, py, 1.6, 1.6);
      }
      x.globalAlpha = 1;
    }
    if (o.dimple) { x.strokeStyle = 'rgba(80,35,25,.55)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(fx, my + 19); x.lineTo(fx, my + 27); x.stroke(); }
    if (o.cheeks) { x.fillStyle = 'rgba(220,90,80,.18)'; x.beginPath(); x.arc(fx - 30, ey + 28, 9, 0, 7); x.arc(fx + 30, ey + 28, 9, 0, 7); x.fill(); }
    if (o.glasses) {
      x.strokeStyle = '#1e1e1e'; x.lineWidth = 3;
      x.strokeRect(fx - 37, ey - 9, 28, 18); x.strokeRect(fx + 9, ey - 9, 28, 18);
      x.beginPath(); x.moveTo(fx - 9, ey - 2); x.lineTo(fx + 9, ey - 2); x.stroke();
    }
  }
  if (hair) {
    // haarlijn: laag in de nek, hoog op het voorhoofd
    const front = photo ? 0.4 : 0.29;
    const line = (u) => {
      const cu = Math.cos(2 * Math.PI * (u - 0.75));
      return H * (cu > 0 ? 0.46 - (0.46 - front) * cu : 0.46 - 0.16 * cu);
    };
    x.globalAlpha = o.shaved ? 0.4 : 1;
    x.fillStyle = hair;
    x.beginPath(); x.moveTo(0, 0);
    for (let i = 0; i <= 64; i++) x.lineTo((i / 64) * W, line(i / 64));
    x.lineTo(W, 0); x.closePath(); x.fill();
    x.globalAlpha = 0.5; x.lineWidth = 1.5;
    for (let i = 0; i < 700; i++) {
      const u = Math.random(), sx = u * W, sy = Math.random() * line(u);
      x.strokeStyle = Math.random() < 0.5 ? shade(hair, 0.65) : shade(hair, 1.3);
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + rand(-2, 2), Math.min(line(u), sy + rand(5, 12))); x.stroke();
    }
    x.globalAlpha = 1;
  }
  grain(x, W, H, 10);
}
const faceCache = new Map();
function faceMat(key, o) {
  // figuranten (drerries, hooligans, feestgangers) delen hun gezicht: tekenen kost veel tijd
  if (!PHOTO_FACES[key] && key !== 'jens') {
    const ck = JSON.stringify(o);
    if (!faceCache.has(ck)) faceCache.set(ck, markShared(faceMatNew(key, o)));
    return faceCache.get(ck);
  }
  return faceMatNew(key, o);
}
function faceMatNew(key, o) {
  const tex = canvasTex(512, 256, (x) => drawHead(x, o, null, o.hair), 192);
  const m = new THREE.MeshLambertMaterial({ map: tex });
  m.userData.hair = o.hair;
  m.userData.setHair = (hair) => {
    m.userData.hair = hair;
    drawHead(tex.image.getContext('2d'), o, m.userData.photo, hair);
    tex.needsUpdate = true;
  };
  if (PHOTO_FACES[key]) loadImg(PHOTO_FACES[key]).then((im) => { m.userData.photo = im; m.userData.setHair(m.userData.hair); }).catch(() => {});
  return m;
}

// ---------- geometrie ----------
// hoofd in 'hoofd-eenheden' (~0.4 breed); de hoofdgroep wordt verkleind
const HEAD_GEO = (() => {
  const g = sphG(1, 14, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) { const k = -y; x *= 1 - 0.24 * k * k; z *= z > 0 ? 1 - 0.3 * k : 1 - 0.06 * k; }
    if (y > 0.5) x *= 0.96;
    p.setXYZ(i, x * 0.2, y * 0.26, z * 0.22);
  }
  g.computeVertexNormals();
  return g;
})();
const NOSE_GEO = coneG(0.04, 0.1, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4);
const EAR_GEO = sphG(0.05, 5, 4).scale(0.45, 1, 0.75);
function limbGeo(r1, r2, len, seg = 5) {
  return cached(`limb${r1},${r2},${len},${seg}`, () => cylG(r1, r2, len, seg, 2).translate(0, -len / 2, 0));
}
const FACE_BITS_GEO = (() => {
  const parts = [NOSE_GEO.clone().translate(0, -0.03, -0.215), EAR_GEO.clone().translate(-0.2, 0, 0), EAR_GEO.clone().translate(0.2, 0, 0)].map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = parts[0].attributes[name].itemSize, arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].count * size, 0));
    let off = 0; for (const g of parts) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
})();
const TORSO_GEO = (() => {
  const g = cylG(0.215, 0.16, 0.5, 8, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0.2) { x *= 0.9; } // schouders aflopend
    if (z < 0 && y > -0.05) z *= 1.12; // borst
    p.setXYZ(i, x, y, z * 0.6);
  }
  g.computeVertexNormals();
  return g;
})();
const PELVIS_GEO = cylG(0.165, 0.15, 0.2, 8).scale(1, 1, 0.66);
const NECK_GEO = cylG(0.05, 0.058, 0.12, 6);
const SHOE_GEO = (() => {
  const g = new THREE.BoxGeometry(0.11, 0.09, 0.27, 1, 1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) < -0.1 && p.getY(i) > 0) p.setY(i, p.getY(i) - 0.035); // neus van de schoen
  g.computeVertexNormals();
  return g;
})();
const capGeo = (len) => cached('cap' + len, () => sphG(1, 14, 6, 0, Math.PI * 2, 0, len).scale(0.215, 0.275, 0.235));

const laserCore = new THREE.MeshBasicMaterial({ color: '#ff3a3a', fog: false });
const laserGlow = new THREE.MeshBasicMaterial({ color: '#ff0000', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
function addLasers(group) {
  // rode stralen uit beide ogen, iets naar beneden de straat op
  const L = 30, parts = [];
  for (const sx of [-0.075, 0.075]) {
    const b = new THREE.Group(); b.position.set(sx, 0.035, -0.22); b.rotation.x = -0.055;
    b.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, L).translate(0, 0, -L / 2), laserCore));
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, L).translate(0, 0, -L / 2), laserGlow);
    b.add(glow);
    b.add(new THREE.Mesh(sphG(0.035, 6, 4), laserGlow));
    group.add(b); parts.push(glow);
  }
  group.userData.laser = parts;
}
function buildHair(group, style, color) {
  while (group.children.length) group.remove(group.children[0]);
  group.userData.laser = null;
  const hm = hairMat(color);
  const cap = (len, tilt, s = 1, sx = 1) => {
    const c = new THREE.Mesh(capGeo(len), hm);
    c.rotation.x = tilt; c.scale.set(s * sx, s, s);
    group.add(c);
    return c;
  };
  switch (style) {
    case 'normaal': case 'laser': {
      cap(Math.PI * 0.42, 0.5, 1.06);
      const f = mesh(box(0.26, 0.05, 0.08), hm, 0, 0.19, -0.2); f.rotation.x = 0.55; group.add(f);
      if (style === 'laser') addLasers(group);
      break;
    }
    case 'kuif': {
      // platinablonde kuif: golf voorop, volume opzij, alles naar achteren geföhnd tot in de nek
      cap(Math.PI * 0.47, 0.45, 1.12);
      const blob = (sx, sy, sz, x, y, z, rx = 0, rz = 0) => { const b = new THREE.Mesh(sphG(1, 10, 7).scale(sx, sy, sz), hm); b.position.set(x, y, z); b.rotation.set(rx, 0, rz); group.add(b); };
      blob(0.215, 0.085, 0.13, 0, 0.165, -0.16, -0.55);          // de golf boven het voorhoofd
      blob(0.2, 0.07, 0.22, 0, 0.215, 0.0, -0.2);             // bovenop, naar achteren
      for (const sx of [-1, 1]) {
        blob(0.055, 0.12, 0.18, sx * 0.19, 0.03, 0.05, 0.3, sx * 0.06); // opzij over de oren
        blob(0.05, 0.05, 0.1, sx * 0.17, -0.12, 0.17, 0.8, sx * 0.4);   // krulletjes in de nek
      }
      blob(0.19, 0.14, 0.1, 0, -0.03, 0.17, 0.2);              // achterkant
      break;
    }
    case 'plat': {
      // plat gekamd: strak over de schedel met een lage pony opzij
      cap(Math.PI * 0.45, 0.38, 1.03).scale.y *= 0.96;
      const f = mesh(box(0.34, 0.035, 0.09), hm, 0.02, 0.17, -0.19); f.rotation.set(0.5, 0, -0.12); group.add(f);
      break;
    }
    case 'kort':
      cap(Math.PI * 0.4, 0.45, 1.04);
      break;
    case 'knot': {
      // opgeschoren zijkanten met mannenknot
      cap(Math.PI * 0.36, 0.3, 1.05, 0.82);
      const bun = mesh(new THREE.IcosahedronGeometry(0.085, 1), hm, 0, 0.25, 0.15);
      bun.scale.set(1, 0.85, 1);
      group.add(bun);
      break;
    }
    case 'lossekrul': {
      // blonde, niet te strakke krullen
      cap(Math.PI * 0.46, 0.45, 1.08);
      const bg = new THREE.IcosahedronGeometry(0.07, 0);
      for (let i = 0; i < 18; i++) {
        const th = rand(0.15, 1.3), ph = rand(0, Math.PI * 2);
        const z = 0.25 * Math.sin(th) * Math.sin(ph);
        if (z < -0.1 && th > 0.75) continue; // niet voor het gezicht
        const b = mesh(bg, hm, 0.23 * Math.sin(th) * Math.cos(ph), 0.29 * Math.cos(th), z);
        b.scale.setScalar(rand(0.8, 1.25));
        b.rotation.set(rand(0, 3), rand(0, 3), 0);
        group.add(b);
      }
      break;
    }
    case 'middenscheiding': {
      cap(Math.PI * 0.44, 0.35, 1.06);
      for (const sx of [-1, 1]) {
        const c = mesh(box(0.12, 0.2, 0.05), hm, sx * 0.1, 0.12, -0.2); c.rotation.set(0.3, 0, sx * 0.45); group.add(c);
        group.add(mesh(box(0.05, 0.24, 0.22), hm, sx * 0.2, 0.02, -0.02));
      }
      break;
    }
    case 'manen': case 'lang': {
      // lang haar tot de ellebogen
      cap(Math.PI * 0.45, 0.25, 1.06);
      const back = new THREE.Mesh(cylG(0.21, 0.29, 1.05, 10, 2, true, -1.4, 2.8), hm);
      back.position.set(0, -0.4, 0.02);
      group.add(back);
      for (const sx of [-1, 1]) {
        const s = mesh(box(0.06, 0.55, 0.1), hm, sx * 0.19, -0.16, -0.09);
        s.rotation.z = sx * -0.08;
        group.add(s);
      }
      break;
    }
    case 'pet': {
      cap(Math.PI * 0.4, 0.5, 1.04);
      const capm = fabricMat('#c8202b'), logo = M('#f2f2f2');
      const dome = new THREE.Mesh(sphG(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.225, 0.2, 0.245), capm);
      dome.position.y = 0.06; dome.rotation.x = 0.12;
      group.add(dome);
      group.add(mesh(box(0.2, 0.1, 0.02), capm, 0, 0.16, -0.22));
      const brim = mesh(box(0.3, 0.02, 0.2), capm, 0, 0.09, -0.3); brim.rotation.x = -0.12; group.add(brim);
      group.add(mesh(box(0.15, 0.015, 0.005), logo, 0, 0.19, -0.233));
      group.add(mesh(box(0.12, 0.015, 0.005), logo, 0, 0.165, -0.236));
      break;
    }
    case 'boapet': case 'guccipet': {
      cap(Math.PI * 0.4, 0.5, 1.03);
      const gucci = style === 'guccipet';
      const capm = gucci ? fabricMat('#cdb58f') : fabricMat('#1c2433');
      const dome = new THREE.Mesh(sphG(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.226, 0.19, 0.245), capm);
      dome.position.y = 0.07; dome.rotation.x = 0.1;
      group.add(dome);
      group.add(mesh(box(0.2, 0.1, 0.02), capm, 0, 0.16, -0.22));
      const brim = mesh(box(0.3, 0.02, 0.2), gucci ? M('#3a2a1e') : capm, 0, 0.09, -0.3); brim.rotation.x = -0.1; group.add(brim);
      if (gucci) {
        [['#1f7a3a', -0.045], ['#c8202b', 0], ['#1f7a3a', 0.045]].forEach(([c, x]) => group.add(mesh(box(0.04, 0.13, 0.01), M(c), x, 0.17, -0.236)));
      } else group.add(mesh(box(0.22, 0.04, 0.01), M('#ffd23f'), 0, 0.14, -0.236));
      break;
    }
    case 'spike': {
      // natte gel-spike recht omhoog
      cap(Math.PI * 0.36, 0.3, 1.04);
      const pieken = [[0, 0.62, -0.02, 0.07], [0.05, 0.5, -0.1, 0.06], [-0.06, 0.5, -0.08, 0.06], [0.08, 0.44, 0.05, 0.06], [-0.08, 0.46, 0.04, 0.06], [0, 0.52, 0.09, 0.06], [0.12, 0.34, -0.04, 0.05], [-0.12, 0.36, -0.02, 0.05], [0.02, 0.4, -0.16, 0.05]];
      for (const [x, h, z, r] of pieken) {
        const c = mesh(coneG(r, h, 5), hm, x, 0.2 + h / 2, z);
        c.rotation.set(z * 0.8, 0, -x * 1.2);
        group.add(c);
      }
      break;
    }
    case 'bivak': {
      // NEC-bivakmuts: rood-groen-zwarte banen, sleuf voor de ogen
      const tex = cached('bivakTex', () => {
        const t = canvasTex(256, 128, (x) => {
          const kl = ['#c8202b', '#1f7a3a', '#141414'];
          for (let i = 0; i < 9; i++) { x.fillStyle = kl[i % 3]; x.fillRect(0, i * (128 / 9), 256, 128 / 9 + 1); }
          grain(x, 256, 128, 18);
          x.clearRect(256 * 0.655, 128 * 0.4, 256 * 0.19, 128 * 0.12);
        });
        return t;
      });
      const m = new THREE.Mesh(HEAD_GEO, cached('bivakMat', () => new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 })));
      m.scale.set(1.07, 1.05, 1.08);
      group.add(m);
      group.add(mesh(sphG(0.06, 6, 4), M('#c8202b'), 0, 0.3, 0)); // bolletje
      break;
    }
    case 'kroon': {
      cap(Math.PI * 0.42, 0.5, 1.06);
      const k = makeKroon(); k.position.y = 0.25; group.add(k);
      break;
    }
    case 'muts': {
      // zwarte beanie met omgeslagen rand
      const knit = fabricMat(color);
      const dome = new THREE.Mesh(sphG(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.235, 0.27, 0.255), knit);
      dome.position.y = 0.05; dome.rotation.x = 0.12; group.add(dome);
      const rand_ = new THREE.Mesh(cylG(0.238, 0.24, 0.09, 14, 1, true), knit);
      rand_.position.y = 0.07; rand_.rotation.x = 0.12; group.add(rand_);
      break;
    }
    case 'kaal': default:
      break;
  }
}
const brilTex = {};
function brilMaterial(url) {
  if (!brilTex[url]) {
    const t = psxTex(new THREE.TextureLoader().load(url));
    brilTex[url] = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
  }
  return brilTex[url];
}
function buildBril(group, style) {
  while (group.children.length) group.remove(group.children[0]);
  if (style === 'lennon') {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.135).rotateY(Math.PI), brilMaterial('img/bril-lennon.png'));
    b.position.set(0, 0.03, -0.235);
    group.add(b);
    const arm = M('#111111');
    group.add(mesh(box(0.01, 0.01, 0.24), arm, -0.18, 0.05, -0.11));
    group.add(mesh(box(0.01, 0.01, 0.24), arm, 0.18, 0.05, -0.11));
  } else if (style === 'snor') {
    const sm = M('#4a3020');
    group.add(mesh(box(0.17, 0.045, 0.04), sm, 0, -0.068, -0.23));
    for (const sx of [-1, 1]) { const e = mesh(box(0.06, 0.035, 0.035), sm, sx * 0.1, -0.085, -0.224); e.rotation.z = sx * 0.6; group.add(e); }
  } else if (style === 'filter') {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.09).rotateY(Math.PI), brilMaterial('img/bril-pixel.png'));
    b.position.set(0, 0.04, -0.24);
    group.add(b);
  }
}

// ---------- persoon ----------
// hoofdrolspelers krijgen alle details; figuranten een lichtere versie
const FULL_PEOPLE = new Set(['jesse', 'tim', 'patrick', 'jens', 'fietser', 'shane', 'toeterhater', 'docent', 'jos', 'boa', 'boa2', 'cameraman', 'ghost']);
function makePerson(o) {
  const root = new THREE.Group();
  root.userData.isPerson = true;
  const body = new THREE.Group();
  root.add(body);
  const skinTex = skinMat(o.skin), skinFlat = M(o.skin);
  const shirt = shirtMats(o.shirt);
  const pants = denimMat(o.pants || '#2f4a78');
  const shoe = fabricMat(o.shoes || '#f4f4f4');
  const torso = mesh(TORSO_GEO, shirt.torso, 0, 1.27, 0);
  body.add(torso);
  body.add(mesh(PELVIS_GEO, pants, 0, 0.97, 0));
  body.add(mesh(NECK_GEO, skinTex, 0, 1.56, 0.01));

  const head = new THREE.Group();
  head.position.y = 1.71;
  head.scale.setScalar(0.5);
  body.add(head);
  const face = faceMat(o.key, { hair: o.hair, ...o.face });
  head.add(new THREE.Mesh(HEAD_GEO, face));
  const lite = !FULL_PEOPLE.has(o.key);
  if (!lite) {
    head.add(mesh(FACE_BITS_GEO, skinFlat)); // neus en oren in één tekenopdracht
  }
  const hair = new THREE.Group(); head.add(hair);
  const bril = new THREE.Group(); head.add(bril);
  buildHair(hair, o.hairStyle, o.hair);
  if (lite) {
    // figuranten: hoofd + haar in één keer tekenen
    const merged = mergeStatic(head);
    while (head.children.length) head.remove(head.children[0]);
    for (const c of [...merged.children]) head.add(c);
    head.add(hair, bril);
    while (hair.children.length) hair.remove(hair.children[0]);
  }

  const arm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.235, 1.47, 0);
    const sleeve = mesh(limbGeo(0.068, 0.06, 0.17), shirt.sleeve); sh.add(sleeve);
    sh.add(mesh(limbGeo(0.052, 0.043, 0.29), skinTex));
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    el.add(mesh(limbGeo(0.044, 0.033, 0.25), skinTex));
    const hand = new THREE.Group(); hand.position.y = -0.25; el.add(hand);
    if (!lite) { const hm = mesh(limbGeo(0.036, 0.03, 0.1, 5), skinTex); hm.scale.set(1.15, 1, 0.6); hand.add(hm); }
    body.add(sh);
    return { sh, el, hand, sleeve };
  };
  const legMeshes = [];
  const leg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.095, 0.93, 0);
    const up = mesh(limbGeo(0.085, 0.063, 0.44), pants); hip.add(up);
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    const low = mesh(limbGeo(0.061, 0.047, 0.42), pants); knee.add(low);
    legMeshes.push([up, low]);
    knee.add(mesh(SHOE_GEO, shoe, 0, -0.45, -0.05));
    body.add(hip);
    return { hip, knee };
  };
  const L = arm(-1), Rr = arm(1), LL = leg(-1), RL = leg(1);
  const shadow = makeShadow(1.0, 0.8);
  root.add(shadow);
  if (o.scale) body.scale.set(...o.scale);
  const p = {
    face, root, body, torso, head, hair, bril, shadow, skin: o.skin, hairColor: o.hair, t: Math.random() * 10,
    armL: L.sh, armR: Rr.sh, elL: L.el, elR: Rr.el, handR: Rr.hand, handL: L.hand, legL: LL.hip, legR: RL.hip, kneeL: LL.knee, kneeR: RL.knee,
  };
  const pelvis = body.children[1];
  p.setPants = (color, shorts) => {
    const pm = shorts ? fabricMat(color) : denimMat(color);
    pelvis.material = pm;
    for (const [up, low] of legMeshes) { up.material = pm; low.material = shorts ? skinTex : pm; }
  };
  p.setShirt = (id) => {
    const s = shirtMats(id);
    torso.material = s.torso;
    L.sleeve.material = s.sleeve; Rr.sleeve.material = s.sleeve;
  };
  if (lite) batchPerson(root);
  return p;
}

// pose: zet doelhoeken (heup, knie, schouder, elleboog) en damp ernaartoe
function pose(p, kind, dt, speedK = 1) {
  p.t += dt * speedK;
  const t = p.t, w = t * 11, s = Math.sin(w), c = Math.cos(w);
  // hardloopbenen: knie buigt vooral als het been terugzwaait
  const runLegs = (amp = 0.9) => {
    lL = s * amp; lR = -s * amp;
    kL = -(0.25 + 1.25 * Math.max(0, -Math.sin(w - 0.9)));
    kR = -(0.25 + 1.25 * Math.max(0, Math.sin(w - 0.9)));
    bY = Math.abs(c) * 0.07;
  };
  let lL = 0, lR = 0, kL = 0, kR = 0, aL = 0, aR = 0, eL = 0.15, eR = 0.15, oL = 0.06, oR = 0.06, bY = 0, bRX = 0, bZ = 0, k = 14;
  switch (kind) {
    case 'run': runLegs(); aL = -s * 0.75; aR = s * 0.75; eL = eR = 1.35; bRX = -0.14; k = 30; break;
    case 'phone': runLegs(); aL = -s * 0.75; eL = 1.35; aR = 0.5 + s * 0.05; eR = 1.55; bRX = -0.1; k = 30; break;
    case 'phoneIdle': aR = 0.35; eR = 1.65; aL = Math.sin(t * 2.5) * 0.04; bY = Math.sin(t * 2.5) * 0.01; break;
    case 'angry': runLegs(); aL = 2.75 + Math.sin(t * 19) * 0.3; aR = 2.75 + Math.cos(t * 19) * 0.3; eL = eR = 0.5; oL = oR = 0.35; k = 30; break;
    case 'jump': lL = 1.05; kL = -1.5; lR = -0.25; kR = -1.1; aL = 2.4; aR = 2.2; eL = eR = 0.5; oL = oR = 0.35; break;
    case 'slide': lL = 1.5; kL = -0.1; lR = 1.2; kR = -0.7; aL = aR = -0.5; eL = eR = 0.3; bRX = 1.25; bY = -0.05; bZ = -0.75; k = 22; break;
    case 'sit': lL = lR = 1.3; kL = kR = -1.35; aL = aR = 1.95; eL = eR = 0.25; oL = oR = 0.32; bY = 0.0 + Math.sin(t * 30) * 0.008; bRX = 0.08; break;
    case 'bikefilm': lL = 1.15 + s * 0.4; lR = 1.15 - s * 0.4; kL = -1.35 - s * 0.35; kR = -1.35 + s * 0.35; aL = 1.0; eL = 0.5; aR = 1.3; eR = 1.6; oR = 0.15; bY = 0.12; bRX = -0.25; k = 30; break;
    case 'bike': lL = 1.15 + s * 0.4; lR = 1.15 - s * 0.4; kL = -1.35 - s * 0.35; kR = -1.35 + s * 0.35; aL = aR = 1.0; eL = eR = 0.5; bY = 0.12; bRX = -0.35; k = 30; break;
    case 'grabbed': aL = aR = 2.9; eL = eR = 0.35; oL = oR = 0.45; break;
    case 'grab': runLegs(); aL = 1.4 + Math.sin(t * 17) * 0.15; aR = 1.4 + Math.cos(t * 17) * 0.15; eL = eR = 0.25; oL = oR = -0.1; bRX = -0.2; k = 30; break;
    case 'point': runLegs(); aL = -s * 0.75; eL = 1.35; aR = 1.6 + Math.sin(t * 9) * 0.1; eR = 0.05; bRX = -0.1; k = 30; break;
    case 'wenk': aR = 2.7 + Math.sin(t * 9) * 0.3; eR = 0.35; oR = 0.3; aL = 0.05; bY = Math.sin(t * 2.5) * 0.01; k = 18; break;
    case 'reach': lL = s * 0.4; lR = -s * 0.4; kL = kR = -0.2; aL = aR = 1.5; eL = eR = 0.2; break;
    case 'camrun': runLegs(); aR = 2.3; eR = 2.0; aL = 0.6; eL = 1.4; k = 30; break;
    case 'cam': aR = 2.3; eR = 2.0; aL = 0.6; eL = 1.4; bY = Math.sin(t * 3) * 0.01; break;
    case 'seat': lL = lR = 1.5; kL = kR = -1.5; aL = 0.55 + Math.sin(t * 1.3) * 0.05; aR = 0.6; eL = eR = 0.95; bY = -0.43; bRX = 0.05; break;
    case 'read': lL = lR = 1.5; kL = kR = -1.5; aL = 0.45; aR = 0.75; eL = 0.75; eR = 1.55; oL = 0.06; oR = 0.12; bY = -0.43; bRX = 0.12; break;
    case 'swim': lL = s * 0.5; lR = -s * 0.5; aL = 1.6 + Math.sin(w * 0.45) * 1.6; aR = 1.6 - Math.sin(w * 0.45) * 1.6; eL = eR = 0.3; bRX = -1.35; bY = 0.3; k = 20; break;
    case 'idle': default:
      bY = Math.sin(t * 2.5) * 0.01; aL = Math.sin(t * 2.5) * 0.04; aR = -aL; kL = kR = -0.04;
  }
  const d = (obj, prop, v, kk = k) => { obj.rotation[prop] = damp(obj.rotation[prop], v, kk, dt); };
  d(p.legL, 'x', lL); d(p.legR, 'x', lR);
  d(p.kneeL, 'x', kL); d(p.kneeR, 'x', kR);
  d(p.armL, 'x', aL); d(p.armR, 'x', aR);
  d(p.elL, 'x', eL); d(p.elR, 'x', eR);
  d(p.armL, 'z', -oL); d(p.armR, 'z', oR);
  p.body.position.y = damp(p.body.position.y, bY, k, dt);
  p.body.position.z = damp(p.body.position.z, bZ, 18, dt);
  p.body.rotation.x = damp(p.body.rotation.x, bRX, 18, dt);
  p.shadow.position.y = 0.03 - p.root.position.y;
}

function makeLabel(str, bg) {
  const tex = canvasTex(512, 128, (x) => {
    x.font = '76px Anton, Impact, sans-serif';
    const w = Math.min(500, x.measureText(str).width + 64);
    x.fillStyle = bg;
    x.beginPath(); x.roundRect(256 - w / 2, 10, w, 108, 54); x.fill();
    x.strokeStyle = '#000'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 8; x.strokeText(str, 256, 68, 480); x.fillText(str, 256, 68, 480);
  });
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false }));
  sp.scale.set(1.5, 0.375, 1);
  sp.renderOrder = 5;
  return sp;
}

// ---------- voertuigen ----------
function wheel(r, w, mat) {
  const g = cylG(r, r, w, 16).rotateZ(Math.PI / 2);
  return new THREE.Mesh(g, mat);
}
function makeMoped() {
  // grijze Puch Maxi met hoog chroom apestuur, lange zwarte buddy en chromen uitlaat
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: '#80878f', emissive: '#151719' });
  const black = M('#1b1b1b'), chrome = new THREE.MeshLambertMaterial({ color: '#e2e6ec', emissive: '#2a2d33' });
  const engine = M('#a3a8ae'), seat = M('#141414'), light = M('#fff6c0', { emissive: '#ffe680' }), tail = M('#d01818', { emissive: '#600000' });
  const mkWheel = (z) => {
    const w = new THREE.Group(); w.position.set(0, 0.3, z);
    w.add(mesh(cylG(0.3, 0.3, 0.08, 14).rotateZ(Math.PI / 2), black));
    w.add(mesh(cylG(0.21, 0.21, 0.09, 10).rotateZ(Math.PI / 2), M('#8d939a')));
    for (let i = 0; i < 5; i++) {
      const sp = mesh(box(0.1, 0.2, 0.035), chrome); sp.position.y = 0;
      const arm = new THREE.Group(); arm.rotation.x = (i / 5) * Math.PI * 2; sp.position.y = 0.1; arm.add(sp); w.add(arm);
    }
    w.add(mesh(cylG(0.05, 0.05, 0.12, 8).rotateZ(Math.PI / 2), chrome));
    g.add(w);
    return w;
  };
  const wf = mkWheel(-0.62), wb = mkWheel(0.58);
  // frame: van balhoofd schuin naar beneden, onder het zadel door en weer omhoog
  const down = mesh(box(0.13, 0.66, 0.15), frame, 0, 0.7, -0.3); down.rotation.x = -0.72; g.add(down);
  g.add(mesh(box(0.15, 0.13, 0.44), frame, 0, 0.47, 0.08));
  const up = mesh(box(0.13, 0.42, 0.13), frame, 0, 0.62, 0.36); up.rotation.x = 0.55; g.add(up);
  g.add(mesh(box(0.11, 0.05, 0.5), frame, 0, 0.72, 0.62));
  // motorblok en uitlaat
  g.add(mesh(box(0.22, 0.22, 0.32), engine, 0, 0.3, 0.02));
  const cyl = mesh(cylG(0.075, 0.075, 0.2, 8), engine, 0, 0.32, -0.2); cyl.rotation.x = 1.3; g.add(cyl);
  for (let i = 0; i < 4; i++) g.add(mesh(box(0.2, 0.012, 0.14), engine, 0, 0.26 + i * 0.035, -0.22));
  const pipe = mesh(cylG(0.035, 0.05, 0.95, 8), chrome, 0.14, 0.24, 0.32); pipe.rotation.x = Math.PI / 2 - 0.08; g.add(pipe);
  const tip = mesh(cylG(0.05, 0.03, 0.12, 8), chrome, 0.14, 0.27, 0.84); tip.rotation.x = Math.PI / 2; g.add(tip);
  // lange buddy
  const s1 = mesh(box(0.25, 0.09, 0.66), seat, 0, 0.85, 0.36); g.add(s1);
  // achterspatbord, schokbrekers en achterlicht
  for (const sx of [-0.1, 0.1]) { const sh = mesh(cylG(0.022, 0.022, 0.42, 6), chrome, sx, 0.52, 0.52); sh.rotation.x = -0.35; g.add(sh); }
  g.add(mesh(box(0.08, 0.06, 0.05), tail, 0, 0.74, 0.88));
  // voorvork, koplamp, kilometerteller
  for (const sx of [-0.07, 0.07]) { const f = mesh(cylG(0.025, 0.025, 0.68, 6), chrome, sx, 0.62, -0.56); f.rotation.x = -0.28; g.add(f); }
  const lamp = mesh(cylG(0.09, 0.09, 0.1, 10).rotateX(Math.PI / 2), black, 0, 0.98, -0.7); g.add(lamp);
  g.add(mesh(new THREE.CircleGeometry(0.075, 10).rotateY(Math.PI), light, 0, 0.98, -0.756));
  g.add(mesh(cylG(0.04, 0.04, 0.05, 8).rotateX(Math.PI / 2 - 0.4), chrome, 0.1, 1.12, -0.62));
  // hoog apestuur
  for (const sx of [-1, 1]) {
    const riser = mesh(cylG(0.018, 0.018, 0.55, 6), chrome, sx * 0.13, 1.23, -0.6); riser.rotation.z = sx * -0.15; riser.rotation.x = 0.2; g.add(riser);
    const top = mesh(cylG(0.018, 0.018, 0.16, 6).rotateZ(Math.PI / 2), chrome, sx * 0.24, 1.49, -0.55); g.add(top);
    g.add(mesh(cylG(0.026, 0.026, 0.12, 6).rotateZ(Math.PI / 2), black, sx * 0.36, 1.49, -0.55));
  }
  g.add(mesh(box(0.26, 0.02, 0.02), chrome, 0, 0.98, -0.62));
  g.userData.wheels = [wf, wb];
  return g;
}
function makeBike(color) {
  const g = new THREE.Group();
  const frame = M(color), black = M('#1b1b1b'), chrome = M('#c9ccd1');
  const tg = torG(0.34, 0.04, 6, 20).rotateY(Math.PI / 2);
  const w1 = new THREE.Mesh(tg, black); w1.position.set(0, 0.36, -0.58);
  const w2 = new THREE.Mesh(tg, black); w2.position.set(0, 0.36, 0.58);
  g.add(w1, w2);
  const bar = (len, x, y, z, rx) => { const m = mesh(box(0.06, len, 0.06), frame, x, y, z); m.rotation.x = rx; g.add(m); };
  bar(0.95, 0, 0.62, 0, Math.PI / 2 - 0.15);
  bar(0.6, 0, 0.55, 0.28, -0.4);
  bar(0.7, 0, 0.62, -0.5, -0.3);
  bar(0.6, 0, 0.6, 0.45, 0.6);
  g.add(mesh(box(0.22, 0.07, 0.3), black, 0, 0.92, 0.22));
  g.add(mesh(box(0.6, 0.05, 0.05), chrome, 0, 1.06, -0.62));
  g.add(mesh(box(0.3, 0.2, 0.25), M('#2a2a2a'), 0, 0.75, 0.7)); // fietstas
  g.userData.wheels = [w1, w2];
  return g;
}
function makeVan() {
  const g = new THREE.Group();
  const logoTex = (back) => canvasTex(256, 128, (x) => {
    x.fillStyle = '#f7f7f7'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#e2001a'; x.fillRect(0, 84, 256, 18);
    x.fillStyle = '#0a4ea2'; x.fillRect(0, 102, 256, 10);
    x.fillStyle = '#e2001a'; x.font = '34px Anton, Impact, sans-serif'; x.textAlign = 'center';
    x.fillText('OMROEP', 128, 38); x.fillStyle = '#0a4ea2'; x.fillText('GELDERLAND', 128, 72);
    if (back) { x.fillStyle = '#333'; x.fillRect(118, 0, 3, 84); }
  });
  const side = new THREE.MeshLambertMaterial({ map: logoTex(false) });
  const back = new THREE.MeshLambertMaterial({ map: logoTex(true) });
  const white = M('#f7f7f7'), glass = M('#26313d'), black = M('#1b1b1b');
  g.add(mesh(box(2.0, 1.9, 3.6), [side, side, white, white, back, white], 0, 1.35, 0.4));
  g.add(mesh(box(2.0, 1.2, 1.2), white, 0, 0.95, -1.95));
  g.add(mesh(box(1.9, 0.5, 0.05), glass, 0, 1.25, -2.56));
  for (const [x, z] of [[-0.9, -1.8], [0.9, -1.8], [-0.9, 1.5], [0.9, 1.5]]) {
    const w = wheel(0.38, 0.28, black); w.position.set(x, 0.38, z); g.add(w);
  }
  const dish = mesh(cylG(0.5, 0.3, 0.12, 16), white, 0, 2.55, 1.2);
  dish.rotation.x = -0.6; g.add(dish);
  g.add(mesh(box(0.08, 0.4, 0.08), M('#999999'), 0, 2.35, 1.2));
  g.add(makeShadow(2.6, 5));
  return g;
}

// =====================================================================
//  characters
// =====================================================================
const jens = makePerson({
  key: 'jens', skin: '#f2cfbf', hair: '#6e5038', hairStyle: 'normaal', shirt: 'wit', pants: '#2f3f5c', shoes: '#f4f4f4',
  face: { skin: '#f2cfbf', eye: '#4a6b8a', cheeks: true },
});
scene.add(jens.root);
const moped = makeMoped();
moped.visible = false;
jens.root.add(moped);
function makePhone() {
  const phone = new THREE.Group();
  phone.add(mesh(box(0.1, 0.18, 0.025), M('#0d0d0d')));
  phone.add(mesh(box(0.085, 0.15, 0.01), M('#7fd3ff', { emissive: '#3aa0e0' }), 0, 0, 0.015));
  phone.position.set(0, -0.1, -0.03);
  phone.rotation.x = 0.3;
  phone.scale.setScalar(0.6);
  return phone;
}
const jensPhone = makePhone();
jens.handR.add(jensPhone);

let wornKey = '';
// spullen in de linkerhand en op de rug
const gearHand = new THREE.Group(); gearHand.position.y = -0.06;
const gearBack = new THREE.Group();
let fakkelOn = false, cape = null, ballonLine = null;
const fakkelSparks = [];
function canMat(bg, label, fg = '#ffffff') {
  return cached('can' + label, () => new THREE.MeshLambertMaterial({ map: canvasTex(64, 32, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, 64, 32);
    x.fillStyle = '#d0d4d8'; x.fillRect(0, 0, 64, 3); x.fillRect(0, 29, 64, 3);
    x.fillStyle = fg; x.font = 'italic bold 13px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 32, 17);
  }) }));
}
function buildGear(rug, hand) {
  for (const g of [gearHand, gearBack]) while (g.children.length) g.remove(g.children[0]);
  if (ballonLine) { jens.root.remove(ballonLine.parent); ballonLine = null; }
  fakkelOn = false; cape = null;
  gearHand.rotation.set(0, 0, 0);
  if (!gearHand.parent) jens.handL.add(gearHand);
  if (!gearBack.parent) jens.body.add(gearBack);
  const g = gearHand;
  switch (hand) {
    case 'cola': case 'fanta': {
      const c = mesh(cylG(0.033, 0.033, 0.12, 10), hand === 'cola' ? canMat('#e41e2b', 'Cola') : canMat('#ff8a00', 'Fanta', '#1f4f9e'), 0, -0.04, -0.02);
      g.add(c); break;
    }
    case 'minibeker': { const c = makeCup(0.22); c.position.set(0, -0.06, -0.03); g.add(c); break; }
    case 'fietsbel': {
      g.add(mesh(sphG(0.04, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#d8dce2'), 0, -0.02, -0.03));
      g.add(mesh(box(0.02, 0.02, 0.05), M('#555'), 0.03, -0.02, -0.03));
      break;
    }
    case 'toeter': {
      const buis = mesh(cylG(0.025, 0.025, 0.5, 8), M('#9aa0a6'), 0, -0.05, -0.22); buis.rotation.x = Math.PI / 2; g.add(buis);
      const kelk = mesh(cylG(0.11, 0.03, 0.18, 10, 1, true), M('#c9ccd1'), 0, -0.05, -0.53); kelk.rotation.x = -Math.PI / 2; kelk.material.side = THREE.DoubleSide; g.add(kelk);
      break;
    }
    case 'fakkel': {
      g.add(mesh(cylG(0.02, 0.02, 0.3, 6), M('#5a1010'), 0, -0.05, 0));
      g.add(mesh(cylG(0.03, 0.025, 0.06, 6), new THREE.MeshBasicMaterial({ color: '#ff3020' }), 0, -0.22, 0));

      g.rotation.x = 0.5; // naar voren gericht, vlam aan de onderkant
      fakkelOn = true; break;
    }
    case 'ballon': {
      const hold = new THREE.Group(); jens.root.add(hold);
      const b = mesh(sphG(0.22, 12, 8), new THREE.MeshLambertMaterial({ color: pick(['#c8202b', '#1f7a3a', '#ff7b00', '#2667c9']), emissive: '#200000' }), -0.55, 2.55, 0.15);
      b.scale.y = 1.2; hold.add(b);
      ballonLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0.9, 0), new THREE.Vector3(-0.55, 2.28, 0.15)]), new THREE.LineBasicMaterial({ color: '#eeeeee' }));
      hold.add(ballonLine);
      ballonLine.userData.ballon = b;
      break;
    }
  }
  if (rug === 'cape') {
    const tex = cached('capeTex', () => psxTex(new THREE.TextureLoader().load('img/spandoek.png')));
    cape = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.7, 1, 3).translate(0, -0.35, 0), cached('capeMat', () => new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })));
    cape.position.set(0, 1.5, 0.14);
    gearBack.add(cape);
  }
}
// per frame: cape wappert, fakkel sputtert, ballon wiebelt
function updateGear(dt) {
  if (cape) cape.rotation.x = damp(cape.rotation.x, state === 'run' ? 0.35 + Math.min(0.6, speed / 40) + Math.sin(now() * 14) * 0.08 : 0.08, 6, dt);
  if (fakkelOn && Math.random() < (state === 'run' ? 0.7 : 0.3)) {
    const p = new THREE.Vector3(); gearHand.children[1].getWorldPosition(p); p.y -= 0.03;
    const sp = poolMesh(sparkGeo, pick(fakkelMats));
    sp.position.copy(p); sp.scale.setScalar(0.3); scene.add(sp);
    fakkelSparks.push({ sp, v: new THREE.Vector3(rand(-0.3, 0.3), rand(0.6, 1.4), rand(-0.3, 0.3) + (state === 'run' ? 2 : 0)), life: rand(0.25, 0.5) });
  }
  // eigen vonkjes bijhouden, ook in menu en winkel
  for (let i = fakkelSparks.length - 1; i >= 0; i--) {
    const f = fakkelSparks[i];
    f.life -= dt;
    f.sp.position.addScaledVector(f.v, dt);
    f.sp.scale.setScalar(Math.max(0.01, f.life * 0.6));
    if (f.life <= 0 || !fakkelOn) { release(f.sp); fakkelSparks.splice(i, 1); }
  }
  if (ballonLine) ballonLine.userData.ballon.position.x = -0.55 + Math.sin(now() * 2) * 0.05;
  const las = jens.hair.userData.laser;
  if (las) { const f = 0.75 + Math.random() * 0.5; for (const g of las) g.scale.set(f, f, 1); laserGlow.opacity = 0.25 + Math.random() * 0.2; }
}
function applyOutfit(eq = save.eq) {
  const key = [eq.shirt, eq.head, eq.bril, eq.rug, eq.hand, eq.maatje].join('|');
  if (key === wornKey) return;
  wornKey = key;
  jens.setShirt(eq.shirt);
  if (eq.shirt === 'heineken') jens.setPants('#1f7a3a', true); else jens.setPants('#2f3f5c', false);
  const hairColor = eq.head === 'manen' ? '#e3c47e' : eq.head === 'spike' ? '#4a3626' : eq.head === 'kuif' ? '#e8e3d4' : '#6e5038';
  buildHair(jens.hair, eq.head, hairColor);
  jens.face.userData.setHair(eq.head === 'kuif' ? '#7a6a58' : hairColor);
  buildBril(jens.bril, eq.bril);
  buildGear(eq.rug, eq.hand);
  setTimeout(() => buildPet(eq.maatje), 0); // maatje-code staat verderop in het bestand
}
applyOutfit();

const chasers = {};
{
  // de fietser
  // bewust algemeen gehouden: alleen de krullen verraden wie het is
  const p = makePerson({ key: 'fietser', skin: '#eccab0', hair: '#1a1410', hairStyle: 'lossekrul', shirt: { base: '#c62f2f', paint() {} }, pants: '#2b3140', shoes: '#d8d8d8',
    face: { skin: '#eccab0', brow: '#141010' }, scale: [0.92, 0.97, 0.92] });
  const bike = makeBike('#2667c9');
  p.root.add(bike);
  p.vehicle = bike;
  p.style = 'bike';
  chasers.fiets = p;
}
{
  // Shane: knot, stoppels, zwarte hoodie met bandprint
  const p = makePerson({ key: 'shane', skin: '#f0cbb2', hair: '#7a4a2c', hairStyle: 'knot', shirt: { base: '#151515', paint(x, side) {
      if (side === 'front') { x.fillStyle = '#c9cfd8'; x.fillRect(58, 0, 2, 50); x.fillRect(68, 0, 2, 50); text(x, 'WINTERSUN', '#7f9fe0', 16, 92); }
      else { x.fillStyle = '#222'; x.fillRect(30, 0, 68, 26); } // capuchon
    } }, pants: '#2a2f3a', shoes: '#1a1a1a',
    face: { skin: '#f0cbb2', brow: '#6a4428', stubble: '#7a4a2c' } });
  longSleeves(p, fabricMat('#151515'));
  p.style = 'grab';
  chasers.telefoon = p;
}
{
  // de leidinggevende van de Plus Walraven
  const p = makeLeidinggevende();
  chasers.terror = p;
}
{
  // docent van het NSG Groenewoud
  // een willekeurige leraar, bewust zonder herkenbare kenmerken
  const p = makePerson({ key: 'docent', skin: '#e6c2a4', hair: '#4a3a2c', hairStyle: 'kort',
    shirt: { base: '#2f3a4e', paint(x, side) {
      if (side !== 'front') return;
      x.fillStyle = '#e4e4e4'; x.fillRect(52, 0, 24, 60); // overhemd onder colbert
    } },
    pants: '#3b3f4a', shoes: '#2a2a2a', face: { skin: '#e6c2a4', angry: true, brow: '#4a3a2c' }, scale: [1.02, 1.02, 1.02] });
  p.style = 'point';
  chasers.school = p;
}
for (const [mode, p] of Object.entries(chasers)) {
  p.label = null;
  if (MODES[mode].tag) {
    p.label = makeLabel(MODES[mode].tag, '#e5383b');
    p.label.position.y = 2.45;
    p.root.add(p.label);
  }
  p.root.visible = false;
  scene.add(p.root);
}
// platform onder Jens in het hoofdmenu: een ring licht, een lichtzuil van onderen
const menuDisc = new THREE.Group();
{
  const ringTex = canvasTex(64, 64, (x) => {
    x.clearRect(0, 0, 64, 64);
    const g = x.createRadialGradient(32, 32, 4, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,190,90,.95)'); g.addColorStop(0.7, 'rgba(255,120,20,.9)'); g.addColorStop(0.86, 'rgba(255,245,200,1)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  });
  const plat = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, fog: false }));
  plat.position.y = 0.04; plat.renderOrder = 2;
  const zuilTex = canvasTex(8, 32, (x) => { const g = x.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, 'rgba(255,170,70,0)'); g.addColorStop(1, 'rgba(255,170,70,.2)'); x.fillStyle = g; x.fillRect(0, 0, 8, 32); });
  const zuil = new THREE.Mesh(cylG(0.22, 0.86, 2.3, 16, 1, true), new THREE.MeshBasicMaterial({ map: zuilTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  zuil.position.y = 1.15; zuil.renderOrder = 2;
  menuDisc.add(plat, zuil);
  menuDisc.visible = false;
  scene.add(menuDisc);
}
// Omroep Gelderland
const van = makeVan();
const cameraman = makePerson({ key: 'cameraman', skin: '#e9bf9a', hair: '#777', hairStyle: 'kort', shirt: { base: '#0a4ea2', paint() {} }, pants: '#333', shoes: '#222',
  face: { skin: '#e9bf9a' } });
{
  const cam = new THREE.Group();
  cam.add(mesh(box(0.22, 0.26, 0.55), M('#1b1b1b')));
  cam.add(mesh(cylG(0.08, 0.08, 0.2, 10).rotateX(Math.PI / 2), M('#333'), 0, 0, -0.35));
  cam.add(mesh(box(0.05, 0.05, 0.05), M('#ff2a2a', { emissive: '#ff0000' }), 0.08, 0.15, -0.2));
  cam.position.set(0.24, 1.6, -0.05);
  cameraman.body.add(cam);
  cameraman.root.position.set(0, 2.3, 0.6);
  cameraman.root.rotation.y = Math.PI; // filmt achteruit, op Jens
  cameraman.shadow.visible = false;
  van.add(cameraman.root);
  const lab = makeLabel('LIVE', '#e2001a');
  lab.position.set(0, 4.9, 0.6);
  lab.scale.set(1.0, 0.25, 1);
  van.add(lab);
}
van.visible = false;
scene.add(van);
// verslaggever met microfoon en een cameraman: rennen naast Jens en willen een reactie
const OG_SHIRT = { base: '#0a4ea2', paint(x) { x.fillStyle = '#e2001a'; x.fillRect(0, 40, 128, 18); x.fillStyle = '#ffffff'; x.fillRect(0, 58, 128, 6); } };
const omReporter = makePerson({ key: 'omreporter', skin: '#e9bf9a', hair: '#3a2a1a', hairStyle: 'kort', shirt: OG_SHIRT, pants: '#222', shoes: '#111', face: { skin: '#e9bf9a', brow: '#3a2a1a' } });
const omCamera = makePerson({ key: 'omcamera', skin: '#f1cdb2', hair: '#777', hairStyle: 'kort', shirt: OG_SHIRT, pants: '#333', shoes: '#222', face: { skin: '#f1cdb2' } });
{
  const mic = new THREE.Group();
  mic.add(mesh(cylG(0.018, 0.022, 0.22, 6), M('#1b1b1b'), 0, -0.08, -0.03));
  mic.add(mesh(box(0.1, 0.1, 0.1), M('#e2001a'), 0, 0.02, -0.03));
  mic.add(mesh(sphG(0.05, 6, 4), M('#222'), 0, 0.09, -0.03));
  mic.position.set(0, -0.08, -0.06);
  omReporter.handR.add(mic);
  const cam = new THREE.Group();
  cam.add(mesh(box(0.22, 0.26, 0.55), M('#1b1b1b')));
  cam.add(mesh(cylG(0.08, 0.08, 0.2, 8).rotateX(Math.PI / 2), M('#333'), 0, 0, -0.35));
  cam.add(mesh(box(0.05, 0.05, 0.05), M('#ff2a2a', { emissive: '#ff0000' }), 0.08, 0.15, -0.2));
  cam.position.set(0.24, 1.6, -0.05);
  omCamera.body.add(cam);
  for (const p of [omReporter, omCamera]) { p.root.visible = false; scene.add(p.root); }
}
const OM_LINES = ['Omroep Gelderland! Een reactie?', 'Jens, één vraagje maar!', 'Jens! Hoe voelt dit?', 'Wij zijn live, Jens!', 'Is de beker echt van ons?', 'Jens, wacht nou even!', 'Kijkers willen het weten!', 'Eén reactie voor de camera!'];
let omroepK = 0, omroepSide = 1, omroepSay = 0;

// =====================================================================
//  world: road, sidewalks, houses, trees
// =====================================================================
const ROAD_TILE = 8, WALK_TILE = 4;
const roadTex = canvasTex(256, 256, (x) => {
  x.fillStyle = '#55585e'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)';
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  x.fillStyle = '#ececec';
  const lx = (m) => ((m + ROAD_W / 2) / ROAD_W) * 256;
  for (const m of [-1.1, 1.1]) x.fillRect(lx(m) - 3, 0, 6, 110);
  x.fillRect(lx(-3.6) - 3, 0, 6, 256);
  x.fillRect(lx(3.6) - 3, 0, 6, 256);
});
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
roadTex.repeat.set(1, 240 / ROAD_TILE);
const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 240, 3, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: roadTex }));
road.material.defines = { PSX_PERSP: '' };
road.position.z = -80;
scene.add(road);

const walkTex = canvasTex(128, 128, (x) => {
  x.fillStyle = '#b9b3a8'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#9d978c'; x.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
});
walkTex.wrapS = walkTex.wrapT = THREE.RepeatWrapping;
walkTex.repeat.set(1, 240 / WALK_TILE);
const walkMat = new THREE.MeshLambertMaterial({ map: walkTex });
walkMat.defines = { PSX_PERSP: '' };
const curbMat = M('#8f8b84');
const grasTex = canvasTex(32, 32, (x) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 150; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.2)'; x.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), 1, 2); }
  for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 32), 1, 1); }
});
grasTex.wrapS = grasTex.wrapT = THREE.RepeatWrapping; grasTex.repeat.set(16, 96);
const grasMat = new THREE.MeshLambertMaterial({ color: '#6f9a52', map: grasTex });
grasMat.defines = { PSX_PERSP: '' };
for (const side of [-1, 1]) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 240, 1, 40).rotateX(-Math.PI / 2), walkMat);
  w.position.set(side * (ROAD_W / 2 + 2), 0.14, -80);
  scene.add(w);
  scene.add(mesh(box(0.25, 0.15, 240), curbMat, side * (ROAD_W / 2 + 0.1), 0.07, -80));
  const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 240, 2, 16).rotateX(-Math.PI / 2), grasMat);
  g.position.set(side * 30, 0.1, -80);
  scene.add(g);
}

// gevels
const BRICKS = ['#8a3b2a', '#9c4a32', '#7a3426', '#a85b3c', '#6e3b2e', '#b59872', '#c7bfae'];
const DOORS = ['#1f4d3a', '#22375e', '#5e1f24', '#2b2b2b', '#e8e2d0'];
const lit = [];
const facades = BRICKS.map((brick, bi) => canvasTex(256, 320, (x) => {
  const glow = document.createElement('canvas'); glow.width = 64; glow.height = 80;
  const gx = glow.getContext('2d'); gx.scale(0.25, 0.25); gx.fillStyle = '#000'; gx.fillRect(0, 0, 256, 320);
  lit.push(glow);
  x.fillStyle = brick; x.fillRect(0, 0, 256, 320);
  x.fillStyle = 'rgba(0,0,0,.13)';
  for (let y = 0; y < 320; y += 8) {
    x.fillRect(0, y, 256, 1.5);
    for (let xx = (y / 8) % 2 ? 0 : 9; xx < 256; xx += 18) x.fillRect(xx, y, 1.5, 8);
  }
  if (bi === 6) { x.fillStyle = '#e8e2d4'; x.fillRect(0, 0, 256, 320); }
  const win = (wx, wy, ww, wh) => {
    x.fillStyle = '#f4f1ea'; x.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
    const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
    g.addColorStop(0, '#5b7590'); g.addColorStop(0.5, '#33465a'); g.addColorStop(1, '#4f6a85');
    x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
    x.fillStyle = '#f4f1ea'; x.fillRect(wx + ww / 2 - 2, wy, 4, wh); x.fillRect(wx, wy + wh * 0.3, ww, 3);
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(wx - 7, wy + wh + 5, ww + 14, 5);
    // 's avonds branden er lampen achter een deel van de ramen
    if (Math.random() < 0.65) {
      const lg = gx.createLinearGradient(wx, wy, wx, wy + wh);
      lg.addColorStop(0, pick(['#ffd27a', '#ffe7b0', '#ffb860', '#c9e2ff'])); lg.addColorStop(1, '#9a6a2a');
      gx.fillStyle = lg; gx.fillRect(wx, wy, ww, wh);
      gx.fillStyle = '#000'; gx.fillRect(wx + ww / 2 - 2, wy, 4, wh); gx.fillRect(wx, wy + wh * 0.3, ww, 3);
    }
  };
  win(26, 30, 80, 70); win(150, 30, 80, 70);
  win(26, 128, 80, 70); win(150, 128, 80, 70);
  win(130, 230, 100, 70);
  x.fillStyle = '#f4f1ea'; x.fillRect(30, 222, 66, 98);
  x.fillStyle = DOORS[bi % DOORS.length]; x.fillRect(36, 228, 54, 92);
  x.fillStyle = '#d9b44a'; x.fillRect(80, 272, 5, 5);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(40, 232, 46, 18);
  // aanslag en roet: hangt onder de ramen en langs de grond
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(20,14,10,${rand(0.05, 0.22).toFixed(2)})`; x.fillRect(rand(0, 256), rand(0, 320), rand(6, 40), rand(8, 60)); }
  x.fillStyle = 'rgba(20,14,10,.3)'; x.fillRect(0, 296, 256, 24);
  grain(x, 256, 320, 26);
}));
let curTheme = null;
const facadeMats = facades.map((t, i) => { const m = new THREE.MeshLambertMaterial({ map: t, emissiveMap: psxTex(new THREE.CanvasTexture(lit[i])), emissive: '#ffffff', emissiveIntensity: 0 }); m.defines = { PSX_PERSP: '' }; return m; });
const allFacadeMats = [...facadeMats];
const roofMats = ['#3d3f45', '#6b3427', '#4a3b33', '#2e3238'].map((c) => M(c));
const wallMat = M('#7d4a3a');

const HOUSE_GEO = (() => {
  const depth = 6, shape = new THREE.Shape([new THREE.Vector2(-depth / 2 - 0.25, 0), new THREE.Vector2(depth / 2 + 0.25, 0), new THREE.Vector2(0, 2.6)]);
  return {
    body: new THREE.BoxGeometry(depth, 1, 1),
    frontL: new THREE.PlaneGeometry(1, 1, 3, 3).rotateY(Math.PI / 2),
    frontR: new THREE.PlaneGeometry(1, 1, 3, 3).rotateY(-Math.PI / 2),
    roof: new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5),
    dormer: new THREE.BoxGeometry(1.4, 1.1, 1.6),
  };
})();
let houseSeq = 0;
function makeHouse(side, width) {
  const g = new THREE.Group();
  const depth = 6;
  // blok met één materiaal + een losse voorgevel richting de weg (2 tekenopdrachten in plaats van 6)
  // vormen zijn gedeeld (breedte zit in de schaal), zodat alle huizen samen getekend kunnen worden
  const body = new THREE.Mesh(HOUSE_GEO.body, wallMat); body.scale.z = width;
  const front = new THREE.Mesh(side < 0 ? HOUSE_GEO.frontL : HOUSE_GEO.frontR, wallMat); front.scale.z = width + 0.08;
  // ruim voor het blok (de hoekpunten springen, dus 1 cm gaf z-fighting) en buren om en om iets verspringend
  houseSeq++;
  front.position.x = (side < 0 ? 1 : -1) * (depth / 2 + 0.14 + (houseSeq % 2) * 0.05);
  const roof = new THREE.Mesh(HOUSE_GEO.roof, roofMats[0]); roof.scale.z = width;
  const dormer = new THREE.Mesh(HOUSE_GEO.dormer, wallMat);
  const h = { g, body, front, roof, dormer, side, width, depth, z: 0, parts: [body, front, roof, dormer] };
  batchHouses.push(h);
  restyleHouse(h);
  g.position.x = side * (ROAD_W / 2 + 4 + depth / 2);
  scene.add(g);
  return h;
}
function restyleHouse(h) {
  const th = curTheme;
  const height = th ? rand(...th.heights) : rand(6.5, 9.5);
  const set = themeMats(th);
  const fi = Math.floor(Math.random() * set.length);
  h.front.material = set[fi];
  h.body.scale.y = height;
  h.body.position.y = height / 2;
  h.front.scale.y = height;
  h.front.position.y = height / 2;
  h.roof.position.y = height;
  h.roof.material = pick(roofMats);
  h.roof.visible = !th || th.roof;
  h.dormer.visible = h.roof.visible && Math.random() < 0.5;
  h.dormer.position.set(-h.side * 0.0 + h.side * -1.8, height + 0.8, rand(-h.width / 4, h.width / 4));
  h.dormer.material = set[fi];
}
const houses = { '-1': [], '1': [] };
for (const side of [-1, 1]) {
  let z = 34;
  for (let i = 0; i < 24; i++) {
    const w = rand(6, 9);
    const h = makeHouse(side, w);
    h.z = z - w / 2;
    z -= w;
    houses[side].push(h);
  }
  houses[side].len = 34 - z;
}

// decor: bomen, lantaarnpalen, fietsen
const decor = [];
const trunkGeo = cylG(0.12, 0.17, 2.4, 4);
// kruin als drie gekruiste plaatjes, zoals bomen op de PS1: 6 driehoeken in plaats van 20 en veel meer sfeer
const crownGeo = (() => {
  const geos = [0, 1, 2].map((i) => new THREE.PlaneGeometry(3.3, 3.5).rotateY((i * Math.PI) / 3).toNonIndexed());
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'uv']) {
    const size = geos[0].attributes[name].itemSize, arr = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].count * size, 0));
    let off = 0; for (const g of geos) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const nrm = new Float32Array(out.attributes.position.count * 3);
  for (let i = 0; i < nrm.length; i += 3) { nrm[i] = 0; nrm[i + 1] = 0.75; nrm[i + 2] = 0.66; }
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
})();
const leafTex = canvasTex(64, 64, (x) => {
  x.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 230; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 29;
    const px = 32 + Math.cos(a) * r, py = 31 + Math.sin(a) * r * 0.96;
    const licht = (64 - py) / 64 - (r / 90);
    x.fillStyle = licht > 0.55 ? '#ffffff' : licht > 0.32 ? '#c4c4c4' : licht > 0.12 ? '#8a8a8a' : '#585858';
    x.fillRect(Math.floor(px) - 1, Math.floor(py) - 1, 3, 3);
  }
}, 64);
const crownMats = ['#5da63e', '#4a9136', '#6fb044', '#7cb84e'].map((c) => new THREE.MeshLambertMaterial({ color: c, map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide }));
function makeTree() {
  const g = new THREE.Group();
  g.add(mesh(trunkGeo, M('#6b4a2e'), 0, 1.2, 0));
  const c = mesh(crownGeo, pick(crownMats), 0, 3.5, 0);
  c.scale.set(1, rand(1.0, 1.2), 1);
  c.rotation.y = rand(0, 1);
  g.add(c);
  g.add(makeShadow(2.4, 2.4));
  return g;
}
const lampHeadMat = new THREE.MeshLambertMaterial({ color: '#fff8d8', emissive: '#ccb877' });
const lampGlowMat = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,214,140,.8)'); g.addColorStop(0.5, 'rgba(255,200,120,.35)'); g.addColorStop(1, 'rgba(255,214,140,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
}), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const lampConeMat = new THREE.MeshBasicMaterial({ map: canvasTex(8, 64, (x) => {
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,220,150,.32)'); g.addColorStop(1, 'rgba(255,220,150,0)');
  x.fillStyle = g; x.fillRect(0, 0, 8, 64);
}), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
const lampConeGeo = cylG(0.15, 2.2, 4.4, 6, 1, true);
const lampGlows = [];
const LAMP_GEO = { paal: cylG(0.06, 0.09, 4.6, 6), arm: new THREE.BoxGeometry(0.9, 0.08, 0.1), kop: new THREE.BoxGeometry(0.35, 0.12, 0.25), spot: new THREE.PlaneGeometry(8.5, 10).rotateX(-Math.PI / 2) };
function makeLamp(side) {
  const g = new THREE.Group();
  const grey = M('#3a3d42');
  g.add(mesh(LAMP_GEO.paal, grey, 0, 2.3, 0));
  g.add(mesh(LAMP_GEO.arm, grey, -side * 0.4, 4.55, 0));
  g.add(mesh(LAMP_GEO.kop, lampHeadMat, -side * 0.8, 4.48, 0));
  // lichtvlek op straat en een gloed om de lamp (alleen 's avonds)
  const spot = new THREE.Mesh(LAMP_GEO.spot, lampGlowMat);
  spot.userData.keep = true; // wordt los aan/uit gezet
  spot.position.set(-side * 1.6, 0.03, 0);
  const cone = new THREE.Mesh(lampConeGeo, lampConeMat);
  cone.userData.keep = true; cone.position.set(-side * 0.8, 2.25, 0);
  g.add(spot, cone);
  lampGlows.push(spot, cone);
  return g;
}
// geparkeerde fietsen: een uitgeknipt plaatje, geen tientallen losse buisjes
const parkFietsMat = (() => {
  const t = canvasTex(64, 40, (x) => {
    x.clearRect(0, 0, 64, 40);
    x.strokeStyle = '#141416'; x.lineWidth = 2;
    for (const cx of [13, 51]) { x.beginPath(); x.arc(cx, 28, 10, 0, 7); x.stroke(); x.fillStyle = '#55585e'; x.fillRect(cx - 1, 27, 2, 2); }
    x.strokeStyle = '#2b3a55'; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(13, 28); x.lineTo(30, 28); x.lineTo(23, 13); x.lineTo(13, 28); x.moveTo(23, 13); x.lineTo(44, 13); x.lineTo(30, 28); x.moveTo(44, 13); x.lineTo(51, 28); x.moveTo(44, 13); x.lineTo(42, 7); x.stroke();
    x.fillStyle = '#141416'; x.fillRect(17, 8, 10, 3); x.fillRect(38, 5, 9, 2.4);
  }, 64);
  return new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
})();
const parkFietsGeo = new THREE.PlaneGeometry(1.75, 1.1);
function makeParkedBikes() {
  const g = new THREE.Group();
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const b = mesh(parkFietsGeo, parkFietsMat, rand(-0.12, 0.12), 0.55, i * 0.7);
    b.rotation.y = rand(-0.28, 0.28);
    g.add(b);
  }
  return g;
}
function addDecor(make, side, x, spacing, count, offset = 0) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const m = batchify(make(side));
    const z = 30 - offset - i * spacing - rand(0, spacing * 0.3);
    m.position.set(side * x, 0.14, z);
    scene.add(m);
    items.push(m);
  }
  decor.push({ items, span: count * spacing, kind: make.name });
}
for (const side of [-1, 1]) {
  addDecor(makeTree, side, ROAD_W / 2 + 1.6, 13, 12, side > 0 ? 6 : 0);
  addDecor(makeLamp, side, ROAD_W / 2 + 0.5, 32, 5, side > 0 ? 16 : 0);
  addDecor(makeParkedBikes, side, ROAD_W / 2 + 3.3, 26, 6, side > 0 ? 9 : 20);
}

// hemelkoepel met kleurverloop: blauw overdag, oranje 's avonds, donkerblauw met sterren 's nachts
const skyGroup = new THREE.Group();
skyGroup.renderOrder = -10;
scene.add(skyGroup);
const SKY_R = 64;
const skyGeo = new THREE.SphereGeometry(SKY_R, 18, 14);
skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const skyDome = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
skyDome.renderOrder = -10;
skyGroup.add(skyDome);
// koepel en sterren reizen mee met de camera die op dat moment tekent (ook snap- en opnamecamera)
scene.onBeforeRender = (r, sc, cam) => { skyGroup.position.copy(cam.position); };
// wolken: een klein, grof plaatje op de koepel, zoals een PS1-skybox
const cloudLayer = (() => {
  const t = canvasTex(128, 64, (x) => {
    x.clearRect(0, 0, 128, 64);
    for (let i = 0; i < 16; i++) {
      const cx = rand(0, 128), cy = rand(6, 46), n = 3 + Math.floor(rand(0, 6));
      for (let k = 0; k < n; k++) for (const ox of [0, -128, 128]) {
        x.fillStyle = k % 2 ? '#ffffff' : '#d9e2ee';
        x.fillRect(Math.floor(cx + ox + rand(-16, 16)), Math.floor(cy + rand(-3, 3)), Math.floor(rand(8, 22)), Math.floor(rand(2, 5)));
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false });
  m.defines = { PSX_PERSP: '' };
  const c = new THREE.Mesh(new THREE.SphereGeometry(SKY_R - 1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.46), m);
  c.renderOrder = -9;
  skyGroup.add(c);
  return c;
})();
const stars = (() => {
  const pos = [];
  for (let i = 0; i < 150; i++) {
    const a = Math.random() * Math.PI * 2, e = rand(0.1, 1.45), r = SKY_R - 3;
    pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, depthWrite: false }));
  pts.renderOrder = -9;
  pts.visible = false;
  skyGroup.add(pts);
  return pts;
})();
const moon = new THREE.Mesh(new THREE.CircleGeometry(2.8, 8), new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false, depthWrite: false }));
moon.position.set(-18, 26, -54); moon.lookAt(0, 0, 0); moon.renderOrder = -9;
moon.visible = false;
skyGroup.add(moon);
let night = false;
const LOOKS = {
  dag: { top: '#2c6fc8', mid: '#7ab4e8', hor: '#cfd9d8', hs: '#cfdcf0', hg: '#5a4a3a', hi: 1.5, sc: '#fff0cc', si: 3.3, fog: [14, 58], win: 0, lan: 0, cl: '#ffffff', cla: 0.95 },
  avond: { top: '#241c5e', mid: '#c8452e', hor: '#ff9a3a', hs: '#d88a78', hg: '#3a2028', hi: 1.15, sc: '#ff7a2c', si: 3.0, fog: [13, 56], win: 0.75, lan: 3, cl: '#ffb48a', cla: 0.85 },
  nacht: { top: '#01020c', mid: '#050a2c', hor: '#101a52', hs: '#4258b8', hg: '#0c0a20', hi: 0.8, sc: '#7f96ff', si: 0.7, fog: [10, 50], win: 1, lan: 8, cl: '#3a4a88', cla: 0.5 },
};
const PHASES = ['dag', 'avond', 'nacht'];
let phaseT = 0, phaseGoal = 0; // 0 = dag, 1 = avond, 2 = nacht (ertussenin = overgang)
const lc1 = new THREE.Color(), lc2 = new THREE.Color(), skyTop = new THREE.Color(), skyMid = new THREE.Color(), skyHor = new THREE.Color();
const mixCol = (out, a, b, k) => out.copy(lc1.set(a)).lerp(lc2.set(b), k);
function applyLook(t) {
  phaseT = t;
  const i = Math.min(1, Math.floor(t)), k = t - i, A = LOOKS[PHASES[i]], B = LOOKS[PHASES[i + 1]];
  const num = (p) => A[p] + (B[p] - A[p]) * k;
  mixCol(skyTop, A.top, B.top, k); mixCol(skyMid, A.mid, B.mid, k); mixCol(skyHor, A.hor, B.hor, k);
  const pos = skyGeo.attributes.position, col = skyGeo.attributes.color;
  for (let v = 0; v < pos.count; v++) {
    const h = pos.getY(v) / SKY_R;
    if (h < 0.02) lc1.copy(skyHor);
    else if (h < 0.3) lc1.copy(skyHor).lerp(skyMid, (h - 0.02) / 0.28);
    else lc1.copy(skyMid).lerp(skyTop, Math.min(1, (h - 0.3) / 0.6));
    col.setXYZ(v, lc1.r, lc1.g, lc1.b);
  }
  col.needsUpdate = true;
  SKY.copy(skyHor); scene.background = SKY; scene.fog.color.copy(skyHor);
  scene.fog.near = A.fog[0] + (B.fog[0] - A.fog[0]) * k; scene.fog.far = A.fog[1] + (B.fog[1] - A.fog[1]) * k;
  mixCol(hemi.color, A.hs, B.hs, k); mixCol(hemi.groundColor, A.hg, B.hg, k); hemi.intensity = num('hi');
  mixCol(sun.color, A.sc, B.sc, k); sun.intensity = num('si');
  for (const m of allFacadeMats) m.emissiveIntensity = num('win');
  lantern.intensity = num('lan');
  mixCol(cloudLayer.material.color, A.cl, B.cl, k); cloudLayer.material.opacity = num('cla');
  const lamps = t > 0.7;
  lampHeadMat.emissive.set(lamps ? '#ffe9a0' : '#ccb877');
  for (const g of lampGlows) g.visible = lamps;
  lampGlowMat.opacity = Math.min(1, Math.max(0, (t - 0.7) / 0.8)) * 0.6 + 0.4;
  stars.visible = moon.visible = t > 1.6;
  skyGroup.visible = true;
  const wasNight = night;
  night = t >= 1.6;
  document.body.style.background = '#' + SKY.getHexString();
  envAfterNight();
  if (wasNight !== night) updateOutlines();
}
// oude aanroepen: aan = nacht, uit = dag
function setNight(on) { applyLook(on ? 2 : 0); }
function pickPhase() {
  const r = Math.random();
  return isEvening() ? (r < 0.55 ? 2 : r < 0.85 ? 1 : 0) : (r < 0.5 ? 0 : r < 0.75 ? 1 : 2);
}

// 's nachts krijgen de dingen op de weg een gele rand, zodat je ze ziet aankomen
const outlineMat = new THREE.MeshBasicMaterial({ color: '#ffd400', side: THREE.BackSide, fog: false });
outlineMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * 0.05;'); };
const holeRimMat = new THREE.MeshBasicMaterial({ color: '#ffd400', fog: false });
const OUTLINE_KINDS = new Set(['kliko', 'fietswrak', 'auto', 'afzetting', 'gat', 'controle', 'vrouw']);
function mergeGeos(geos) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const arr = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].array.length, 0));
    let off = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  for (const g of geos) g.dispose();
  return out;
}
const olInv = new THREE.Matrix4(), olRel = new THREE.Matrix4();
const olCache = new Map();
function makeOutline(o) {
  const root = o.mesh, geos = [], pk = root.userData.pk;
  if (pk && olCache.has(pk)) return new THREE.Mesh(olCache.get(pk), outlineMat);
  if (o.kind === 'gat') {
    const w = o.w - 0.1, d = o.d;
    for (const [bw, bd, x, z] of [[w, 0.1, 0, -d / 2], [w, 0.1, 0, d / 2], [0.1, d, -w / 2, 0], [0.1, d, w / 2, 0]]) geos.push(new THREE.BoxGeometry(bw, 0.04, bd).translate(x, 0.04, z).toNonIndexed());
    const m = new THREE.Mesh(mergeGeos(geos), holeRimMat);
    m.renderOrder = 3;
    return m;
  }
  root.updateMatrixWorld(true);
  olInv.copy(root.matrixWorld).invert();
  const walk = (n) => {
    if (n !== root && (n.userData.isPerson || n.userData.legs)) return; // bewegende figuren niet
    if (n.isMesh && !n.material.transparent && !Array.isArray(n.material) && n.geometry.attributes.normal) {
      const g = n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(olRel.multiplyMatrices(olInv, n.matrixWorld));
      geos.push(g);
    } else if (n.isMesh && Array.isArray(n.material) && n.geometry.attributes.normal) {
      const g = n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(olRel.multiplyMatrices(olInv, n.matrixWorld));
      geos.push(g);
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  if (!geos.length) return null;
  const ol = mergeGeos(geos);
  if (pk) { markShared(ol); olCache.set(pk, ol); }
  return new THREE.Mesh(ol, outlineMat);
}
function outlineObj(o) {
  if (!(OUTLINE_KINDS.has(o.kind) || o.gen) || o.truck) return;
  if (!o.outline && night) { o.outline = makeOutline(o); if (o.outline) o.mesh.add(o.outline); }
  if (o.outline) o.outline.visible = night;
}
function updateOutlines() { if (typeof objs !== 'undefined') for (const o of objs) outlineObj(o); }

// straatnaambord
function makeSign(name) {
  const g = new THREE.Group();
  g.add(mesh(cylG(0.05, 0.05, 2.8, 6), M('#55595f'), 0, 1.4, 0));
  const tex = canvasTex(512, 128, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#1b3f8f'; x.fillRect(8, 8, 496, 112);
    x.fillStyle = '#fff'; x.font = '58px Anton, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, 256, 66, 470);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  plate.position.set(0, 2.6, 0);
  g.add(plate);
  return g;
}

// =====================================================================
//  obstacles / pickups
// =====================================================================
const objs = [];
const holeTex = canvasTex(128, 128, (x) => {
  x.fillStyle = '#6f6253';
  x.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 58 + Math.random() * 6;
    x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  x.fill();
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 54);
  g.addColorStop(0, '#000'); g.addColorStop(0.7, '#0d0b0a'); g.addColorStop(1, '#2b231d');
  x.fillStyle = g;
  x.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 48 + Math.random() * 5;
    x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  x.fill();
});
const holeMat = new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false });
const stripeTex = canvasTex(256, 32, (x) => {
  for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#e2231a'; x.beginPath(); x.moveTo(i * 24 - 12, 32); x.lineTo(i * 24 + 4, 0); x.lineTo(i * 24 + 28, 0); x.lineTo(i * 24 + 12, 32); x.fill(); }
});
stripeTex.wrapS = THREE.RepeatWrapping; stripeTex.repeat.set(2, 1);
const stripeMat = new THREE.MeshLambertMaterial({ map: stripeTex });
const coneMat = M('#ff6a13'), coneWhite = M('#ffffff');
const coneGeo = coneG(0.22, 0.65, 10);

function makeCone() {
  const g = new THREE.Group();
  g.add(mesh(coneGeo, coneMat, 0, 0.33, 0));
  g.add(mesh(cylG(0.13, 0.16, 0.12, 10), coneWhite, 0, 0.36, 0));
  g.add(mesh(box(0.5, 0.04, 0.5), coneMat, 0, 0.02, 0));
  return g;
}
function makeHole(w, d) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), holeMat);
  p.position.y = 0.02;
  p.renderOrder = 2;
  g.add(p);
  return g;
}
const klikoBody = M('#5c6066'), klikoLid = M('#2f8a3e');
function makeKliko() {
  const g = new THREE.Group();
  const b = mesh(box(0.72, 0.95, 0.75), klikoBody, 0, 0.55, 0);
  g.add(b);
  g.add(mesh(box(0.8, 0.08, 0.84), klikoLid, 0, 1.06, 0));
  g.add(mesh(box(0.8, 0.06, 0.06), klikoBody, 0, 1.0, 0.42));
  for (const x of [-0.3, 0.3]) { const w = wheel(0.1, 0.08, M('#1b1b1b')); w.position.set(x, 0.1, 0.32); g.add(w); }
  g.add(makeShadow(1.1, 1.1));
  return g;
}
function makeFietswrak() {
  const g = new THREE.Group();
  const b = makeBike(pick(['#1b1b1b', '#8a1c1c', '#2667c9']));
  b.rotation.z = Math.PI / 2;
  b.rotation.y = Math.PI / 2 + rand(-0.3, 0.3);
  b.position.set(0, 0.06, 0);
  g.add(b);
  return g;
}
const CAR_COLORS = ['#c0392b', '#2c5f9e', '#e8e8e8', '#202020', '#7f8c8d', '#d4a017', '#2e7d4f'];
function makeCar() {
  const g = new THREE.Group();
  const col = M(pick(CAR_COLORS)), glass = M('#26313d'), black = M('#1b1b1b');
  g.add(mesh(box(1.8, 0.7, 3.9), col, 0, 0.6, 0));
  g.add(mesh(box(1.6, 0.55, 2.1), col, 0, 1.2, 0.2));
  g.add(mesh(box(1.62, 0.42, 1.6), glass, 0, 1.22, 0.2));
  g.add(mesh(box(1.5, 0.4, 0.05), glass, 0, 1.2, 1.26));
  g.add(mesh(box(1.5, 0.12, 0.05), M('#d01818', { emissive: '#600000' }), 0, 0.82, 1.96));
  for (const [x, z] of [[-0.85, -1.3], [0.85, -1.3], [-0.85, 1.3], [0.85, 1.3]]) {
    const w = wheel(0.33, 0.24, black); w.position.set(x, 0.33, z); g.add(w);
  }
  g.add(makeShadow(2.4, 4.6));
  return g;
}
function makeAfzetting() {
  const g = new THREE.Group();
  const grey = M('#e6e6e6');
  for (const x of [-ROAD_W / 2 + 0.1, ROAD_W / 2 - 0.1]) {
    g.add(mesh(box(0.14, 1.75, 0.14), grey, x, 0.87, 0));
    g.add(mesh(box(0.6, 0.08, 0.6), M('#333'), x, 0.04, 0));
  }
  g.add(mesh(box(ROAD_W, 0.42, 0.12), stripeMat, 0, 1.28, 0));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(256, 48, (x) => {
    x.fillStyle = '#ffd23f'; x.fillRect(0, 0, 256, 48); x.fillStyle = '#111'; x.font = '30px Anton, Impact, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('WERK IN UITVOERING', 128, 26, 240);
  }) }));
  sign.position.set(0, 1.78, 0.02);
  g.add(sign);
  return g;
}

// beker (het muntje): de echte KNVB-beker, even hoog als de oude bekers (0,62 m, midden op de oorsprong)
const CUP_H = 0.62;
function bekerGeo(lod) {
  const d = BEKER[lod], bin = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0)).buffer;
  const q = new Int16Array(bin(d.p)), pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = (q[i] / 32767) * d.s[i % 3];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin(d.i)), 1));
  g.computeVertexNormals();
  const out = g.toNonIndexed(), p = out.attributes.position, uv = new Float32Array(p.count * 2);
  // reliëf: cilinderprojectie, zonder naad in driehoeken die over de achterkant lopen
  for (let t = 0; t < p.count; t += 3) {
    const us = [0, 1, 2].map((k) => (Math.atan2(p.getZ(t + k), p.getX(t + k)) / (2 * Math.PI) + 0.5) % 1);
    const fix = Math.max(...us) - Math.min(...us) > 0.5;
    us.forEach((u, k) => { uv[(t + k) * 2] = fix && u < 0.5 ? u + 1 : u; uv[(t + k) * 2 + 1] = p.getY(t + k); });
  }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.scale(CUP_H, CUP_H, CUP_H);
  out.translate(0, -0.3, 0);
  g.dispose();
  return markShared(out);
}
const goldMat = new THREE.MeshLambertMaterial({ color: '#ffc928', emissive: '#7a4f00' });
const bekerTex = psxTex(new THREE.TextureLoader().load(BEKER_TEX));
bekerTex.wrapS = THREE.RepeatWrapping;
const bekerMat = new THREE.MeshLambertMaterial({ map: bekerTex, emissive: '#ffffff', emissiveMap: bekerTex, emissiveIntensity: 0.28 });
const cupGeos = {};
function makeCup(scale = 1, mat = bekerMat, lod = 'low') {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cupGeos[lod] ||= bekerGeo(lod), mat));
  g.scale.setScalar(scale);
  return g;
}
// Dum Bum nitraat
const nitraatMat = new THREE.MeshLambertMaterial({ map: canvasTex(64, 32, (x) => {
  x.fillStyle = '#9b6a3a'; x.fillRect(0, 0, 64, 32);
  x.fillStyle = '#c8202b'; x.fillRect(0, 8, 64, 16);
  x.fillStyle = '#ffe14a'; x.font = 'bold 10px Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('DUM BUM', 32, 16);
  grain(x, 64, 32, 20);
}) });
const nitraatGeo = cylG(0.09, 0.09, 0.24, 8);
function makeNitraat() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(nitraatGeo, nitraatMat));
  g.add(mesh(cylG(0.092, 0.092, 0.02, 8), M('#3b2a1a'), 0, 0.12, 0));
  const lont = mesh(box(0.015, 0.12, 0.015), M('#2f7d32'), 0, 0.18, 0); lont.rotation.z = 0.3; g.add(lont);
  return g;
}
const ringGeo = torG(0.7, 0.05, 8, 32);
const POWER_LOOK = {
  sjaal: { ring: '#1f7a3a', label: 'NEC-SJAAL · MAGNEET', bg: '#c8202b', sx: 2.0 },
  fiets: { ring: '#2bb673', label: 'FIETS', bg: '#1f7a3a', sx: 1.1 },
  brommer: { ring: '#ffd23f', label: 'BROMMER', bg: '#1d1a24', sx: 1.3 },
  'beker-van-ons': { ring: '#ff8a00', label: 'DE BEKER IS VAN ONS', bg: '#ff8a00', sx: 2.2 },
  nitraat: { ring: '#e2231a', label: 'DUM BUM NITRAAT', bg: '#c8202b', sx: 2.0 },
  kist: { ring: '#b18cff', label: 'MYSTERY KIST', bg: '#6a2a9a', sx: 1.8 },
};
function makePower(type) {
  const g = new THREE.Group();
  const look = POWER_LOOK[type];
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: look.ring, transparent: true, opacity: 0.85 }));
  g.add(ring);
  if (type === 'brommer') {
    const m = makeMoped(); m.scale.setScalar(0.55); m.position.y = -0.35; m.rotation.y = 0.6; g.add(m);
  } else if (type === 'sjaal') {
    g.add(makeSjaalPower());
  } else if (type === 'fiets') {
    const f = makeBike('#c8202b'); f.scale.setScalar(0.75); f.position.y = -0.4; f.rotation.y = 0.8; g.add(f);
  } else if (type === 'kist') {
    const k = new THREE.Group();
    k.add(mesh(box(0.8, 0.6, 0.6), M('#7a3ab0', { emissive: '#2a0a4a' })));
    k.add(mesh(box(0.84, 0.14, 0.64), M('#ffd23f', { emissive: '#6a5000' }), 0, 0.12, 0));
    k.add(mesh(box(0.14, 0.62, 0.64), M('#ffd23f', { emissive: '#6a5000' })));
    g.add(k);
  } else if (type === 'nitraat') {
    const bundle = new THREE.Group();
    for (const [x, z] of [[-0.1, 0.05], [0.1, 0.05], [0, -0.1]]) { const n = makeNitraat(); n.position.set(x, 0, z); bundle.add(n); }
    bundle.scale.setScalar(1.6);
    g.add(bundle);
  } else {
    g.add(makeCup(1.6, bekerMat, 'high'));
  }
  const lab = makeLabel(look.label, look.bg);
  lab.position.y = 1.05;
  lab.scale.set(look.sx, look.sx / 4, 1);
  g.add(lab);
  g.userData.spin = g.children[1];
  return g;
}

// bekers: één gedeeld onderdeel, en de proxies worden hergebruikt (pas na 10 s, i.v.m. de replay)
let coinParts = null;
const coinPool = [];
function coinProxy() {
  if (!coinParts) { const t = makeCup(1.15), m = t.children[0]; coinParts = [{ src: m, geo: m.geometry, mat: m.material, local: new THREE.Matrix4().makeScale(1.15, 1.15, 1.15), order: 0 }]; }
  if (coinPool.length && performance.now() - coinPool[0].t > 10000) {
    const g = coinPool.shift().g;
    g.visible = true; g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
    for (const c of [...g.children]) g.remove(c);
    batchProxies.add(g);
    return g;
  }
  const g = new THREE.Group();
  g.userData.parts = coinParts; g.userData.coin = true;
  batchProxies.add(g);
  return g;
}
function releaseObj(o) {
  scene.remove(o.mesh);
  if (o.mesh.userData.coin) coinPool.push({ g: o.mesh, t: performance.now() });
  else freeLater.push({ m: o.mesh, t: performance.now() });
}
// pas na 10 s (de replay/nieuws gebruikt de laatste seconden nog), en een paar per beeld
const freeLater = [];
function freeTick() {
  const now_ = performance.now();
  for (let n = 0; n < 4 && freeLater.length && now_ - freeLater[0].t > 10000; n++) { const { m } = freeLater.shift(); if (!m.parent) freeObject(m); }
}
function addObj(kind, meshObj, x, z, w, d, h, extra = {}) {
  meshObj.position.set(x, extra.y ?? 0, z);
  scene.add(meshObj);
  const o = { kind, mesh: meshObj, x, z, w, d, h, y: extra.y ?? 0, ...extra };
  objs.push(o);
  if (night) outlineObj(o);
  return o;
}
function clearObjs() {
  for (const o of objs) releaseObj(o);
  objs.length = 0;
}

// ---------- vrouw met hond ----------
function makeDog() {
  const g = new THREE.Group();
  const fur = M('#8a5a2b'), dark = M('#3b2614');
  g.add(mesh(box(0.34, 0.32, 0.8), fur, 0, 0.5, 0));
  const head = new THREE.Group(); head.position.set(0, 0.72, 0.48); g.add(head);
  head.add(mesh(box(0.3, 0.28, 0.3), fur));
  head.add(mesh(box(0.16, 0.13, 0.18), fur, 0, -0.05, 0.2));
  head.add(mesh(box(0.06, 0.05, 0.04), dark, 0, -0.01, 0.3));
  head.add(mesh(box(0.08, 0.14, 0.05), dark, -0.12, 0.17, -0.05));
  head.add(mesh(box(0.08, 0.14, 0.05), dark, 0.12, 0.17, -0.05));
  head.add(mesh(box(0.05, 0.05, 0.02), M('#111'), -0.08, 0.05, 0.155));
  head.add(mesh(box(0.05, 0.05, 0.02), M('#111'), 0.08, 0.05, 0.155));
  const legs = [];
  for (const [x, z] of [[-0.11, 0.3], [0.11, 0.3], [-0.11, -0.3], [0.11, -0.3]]) {
    const l = new THREE.Group(); l.position.set(x, 0.38, z);
    l.add(mesh(box(0.09, 0.38, 0.09), fur, 0, -0.19, 0));
    g.add(l); legs.push(l);
  }
  const tail = mesh(box(0.06, 0.06, 0.3), fur, 0, 0.66, -0.5); tail.rotation.x = 0.6; g.add(tail);
  g.add(mesh(box(0.36, 0.06, 0.1), M('#c0392b'), 0, 0.62, 0.36)); // halsband
  g.add(makeShadow(0.8, 1.1));
  g.userData = { legs, tail, head };
  return g;
}
function makeVrouw() {
  const g = new THREE.Group();
  const v = makePerson({ key: 'vrouw', skin: '#e9c2a2', hair: '#6a4026', hairStyle: 'lang', shirt: { base: '#7b3f8c', paint() {} }, pants: '#2b2b3a', shoes: '#222',
    face: { skin: '#e9c2a2', angry: true, brow: '#4a2c18' } });
  v.root.rotation.y = Math.PI; // kijkt naar Jens
  g.add(v.root);
  const dog = makeDog();
  dog.position.z = 1.25;
  g.add(dog);
  const leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.38, 0.85, 0.15), new THREE.Vector3(0, 0.62, 1.6)]), new THREE.LineBasicMaterial({ color: '#c0392b' }));
  g.add(leash);
  g.userData = { person: v, dog };
  return g;
}

// ---------- NSG Groenewoud ----------
function makeSchool() {
  const g = new THREE.Group();
  const len = 36, depth = 12, height = 10;
  const facade = canvasTex(512, 256, (x) => {
    x.fillStyle = '#c9b48f'; x.fillRect(0, 0, 512, 256);
    x.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = 0; y < 256; y += 6) x.fillRect(0, y, 512, 1);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 9; i++) {
        const wx = 10 + i * 56, wy = 14 + row * 76;
        x.fillStyle = '#2f3b2f'; x.fillRect(wx - 3, wy - 3, 46, 58);
        const gr = x.createLinearGradient(wx, wy, wx + 40, wy + 52);
        gr.addColorStop(0, '#6f8ea3'); gr.addColorStop(1, '#2c4152');
        x.fillStyle = gr; x.fillRect(wx, wy, 40, 52);
      }
    }
    x.fillStyle = '#1f6b3a'; x.fillRect(220, 170, 72, 86);
    x.fillStyle = '#8fb8c9'; x.fillRect(228, 178, 26, 78); x.fillRect(258, 178, 26, 78);
  });
  const wall = M('#b8a27d');
  const fm = new THREE.MeshLambertMaterial({ map: facade });
  const body = new THREE.Mesh(new THREE.BoxGeometry(depth, height, len, 2, 4, 6), [fm, wall, M('#6d6d6d'), wall, wall, wall]);
  body.position.set(-depth / 2, height / 2, 0);
  g.add(body);
  const signTex = canvasTex(512, 64, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 64);
    x.fillStyle = '#1f7a3a'; x.font = '44px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('NSG GROENEWOUD', 256, 35, 490);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.75, 4, 1).rotateY(Math.PI / 2), new THREE.MeshLambertMaterial({ map: signTex }));
  sign.position.set(0.08, 4.4, 0);
  g.add(sign);
  // schoolhek
  const fence = M('#2f4f2f');
  for (let z = -len / 2; z <= len / 2; z += 2) g.add(mesh(box(0.06, 1.1, 0.06), fence, 0.4, 0.55, z));
  g.add(mesh(box(0.06, 0.06, len), fence, 0.4, 1.06, 0));
  g.position.set(-(ROAD_W / 2 + 4.1), 0.14, 0);
  scene.add(g);
  return { g, len, z: 0 };
}
let school = null;
function placeSchool(on) {
  if (on && !school) school = makeSchool();
  if (!on && school) { scene.remove(school.g); school = null; }
  if (school) { school.z = -2; school.g.position.z = school.z; }
}

// ---------- babypijltje ----------
let rocket = null;
function launchRocket() {
  const g = new THREE.Group();
  g.add(mesh(cylG(0.05, 0.05, 0.3, 6), M('#d4202c'), 0, 0.15, 0));
  g.add(mesh(coneG(0.06, 0.12, 6), M('#ffd23f'), 0, 0.36, 0));
  g.add(mesh(box(0.015, 0.7, 0.015), M('#c8a46a'), 0, -0.3, 0));
  g.position.set(-2.9, 0.4, -3);
  scene.add(g);
  const bottle = mesh(cylG(0.1, 0.12, 0.45, 8), M('#2e7d4f', { transparent: true, opacity: 0.8 }), -2.9, 0.37, -3);
  scene.add(bottle);
  rocket = { g, bottle, t: 0, sparks: [], boom: false };
  sfx.fluit();
}
const sparkGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
const sparkMats = ['#ffd23f', '#ff4d4d', '#5ad1ff', '#7dff6a', '#ff8af0'].map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
function updateRocket(dt, m) {
  if (!rocket) return;
  const r = rocket;
  r.t += dt;
  r.bottle.position.z += m;
  if (!r.boom) {
    r.g.position.z += m;
    r.g.position.y += dt * (5 + r.t * 10);
    if (Math.random() < 0.8) {
      const sp = new THREE.Mesh(sparkGeo, sparkMats[0]);
      sp.position.copy(r.g.position); sp.scale.setScalar(0.5);
      scene.add(sp); r.sparks.push({ sp, v: new THREE.Vector3(rand(-0.5, 0.5), -1, rand(-0.5, 0.5)), life: 0.4 });
    }
    if (r.t > 0.75) {
      r.boom = true;
      if (!miniSnd('groot', 0.55)) sfx.knal();
      for (let i = 0; i < 40; i++) {
        const sp = new THREE.Mesh(sparkGeo, pick(sparkMats));
        sp.position.copy(r.g.position);
        const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(5, 9));
        scene.add(sp); r.sparks.push({ sp, v, life: rand(0.8, 1.4) });
      }
      scene.remove(r.g);
      setTimeout(() => { if (state === 'run' && mode === 'school') bubble(chaser().head, 'WIE WAS DAT?! JENS!!', 'angry', 1.8); }, 300);
    }
  }
  for (let i = r.sparks.length - 1; i >= 0; i--) {
    const k = r.sparks[i];
    k.life -= dt;
    k.v.y -= 6 * dt;
    k.sp.position.addScaledVector(k.v, dt);
    k.sp.position.z += m;
    k.sp.scale.setScalar(Math.max(0.01, k.life));
    if (k.life <= 0) { scene.remove(k.sp); r.sparks.splice(i, 1); }
  }
  if (r.boom && !r.sparks.length && r.bottle.position.z > 20) { scene.remove(r.bottle); rocket = null; }
}
function clearRocket() {
  if (!rocket) return;
  for (const k of rocket.sparks) scene.remove(k.sp);
  scene.remove(rocket.g); scene.remove(rocket.bottle);
  rocket = null;
}

// =====================================================================
//  state
// =====================================================================
let mode = MODES[save.mode] && !MODES[save.mode].hidden ? save.mode : 'telefoon';
let state = 'menu';
let speed = 0, baseSpeed = 0, dist = 0, score = 0, runBekers = 0;
let spawnZ = -40, nextSign = 0, nextPower = 0, streetIdx = 0, nextRegen = 260, firstPower = true;
let nearT = 0, chaseDist = 4.6, brommerT = 0, bekerT = 0, invulnT = 0;
let jacht = null; // Shane jaagt: { rol, bot, t, o: de ander, pw, slowT, trapQ, klaar, win, titel, tekst }
let nitraten = 0;
const shots = [], particles = [];
let runTime = 0, lastRun = null, shoutCool = 0, nextMilestone = 500, nextVrouw = 0, bestPassed = false, streak = 0;
let deathNote = '', telefoon2At = -1;
const sticker = { t: 0, side: 0 };
let chaseX = 0, vanZ = 30, vanSide = 1, deathT = 0, deathReason = '', shakeT = 0, lineT = 4, toetT = 6, introT = 0;
const player = { lane: 1, x: 0, y: 0, vy: 0, grounded: true, slideT: 0, slideQueued: false };
const BROMMER_TIME = 7, BEKER_TIME = 12;

function chaser() { return chasers[mode]; }
// modi vrijspelen met je beste score in één potje
const MODE_UNLOCK = { telefoon: 0, glijden: 0, vuurwerk: 0, osso: 0 };
if (save.bestRun === undefined) save.bestRun = Math.max(0, ...['fiets', 'telefoon', 'terror', 'school'].map((k) => save.best?.[k] || 0));
const modeOpen = (m) => (save.bestRun || 0) >= (MODE_UNLOCK[m] || 0);
const SHANE_VOICE = ["Ja Jens, dit is al de vijfde keer. Dit wordt een gesprek met de directeur.", "Jens, niet wegrennen! Ik wil je telefoon.", "Je kent de regels. Hier geven.", "Ja Jens, geef maar hier.", "Ja, je telefoon inleveren. Je kan hem om half 4 ophalen.", "Jens, wat zie ik in je broekzak?"];
let shaneBag = [];
// lange zinnen in stukjes, zodat het tekstballonnetje te lezen blijft
function subChunks(txt, max = 24) {
  const out = []; let cur = '';
  for (const w of txt.split(' ')) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  return out;
}
function chaserSay(txt, cls = '', dur = 1.6) {
  const c = chaser();
  if (!c) return;
  const vi = mode === 'telefoon' ? SHANE_VOICE.indexOf(txt) : -1;
  if (vi < 0) { bubble(c.head, txt, cls, dur); return; }
  const len = clips['shane' + (vi + 1)]?.duration || 2.5;
  playClip('shane' + (vi + 1), true);
  shaneUntil = performance.now() + len * 1000;
  const parts = subChunks(txt);
  parts.forEach((part, i) => setTimeout(() => { if (state === 'run' || state === 'aanloop' || state === 'dying' || state === 'over' || state === 'menu') bubble(c.head, part, cls, len / parts.length + 0.25); }, (i * len * 1000) / parts.length));
}
let shaneUntil = 0;
const shaneTalking = () => performance.now() < shaneUntil;
function shaneLine() {
  if (!shaneBag.length) shaneBag = SHANE_VOICE.slice().sort(() => Math.random() - 0.5);
  return shaneBag.pop();
}
function setMode(m, force) {
  if (!force && MODE_UNLOCK[m] !== undefined && !modeOpen(m)) m = 'telefoon';
  mode = m;
  save.mode = m; persist();
  for (const [k, p] of Object.entries(chasers)) p.root.visible = k === m;
  jensPhone.visible = m === 'telefoon';
  placeSchool(m === 'school');
  renderModes();
}

function resetRun() {
  newsCancel();
  feverT = 0; slomoT = 0; slomoCD = 3; nearRecord = false; hudK = 0; renHype = false; xpScore = 0; nextMicro = 100; bekerRun = 0; speedTier = 0; gainXp(0);
  if (seg) endSeg(); if (waalOn) setWaal(false); segRollT = 30;
  if (patrickRijder) brommerPatrick(false);
  if (fietsT > 0 || voiceSrc) stopFiets();
  fietsT = 0;
  jensBike.visible = false;
  if (indoor) setIndoor(false);
  schoolPhase = null; schoolBlock = null; nextSchoolDist = 700; schoolCount = 0; jos.root.visible = false;
  if (boss) { scene.remove(boss.mesh); boss = null; }
  clearObjs();
  speed = 0; baseSpeed = curLevel ? curLevel.speed : weekly?.rule.id === 'snel' ? 20 : 14.5;
  bos = null; nextBos = weekly?.rule.id === 'bos' ? 150 : rand(1000, 1500);
  sjaalT = 0; jensSjaal.visible = false; dayMix = 0; sunsetFrom = 0; hill = null; hillTilt = 0; nextHill = rand(800, 1200);
  path = null; nextTruck = rand(300, 550); nextRaam = rand(150, 300); nextReporter = rand(500, 900); nextVrienden = rand(400, 800); nextFork = rand(1100, 1500); nextSchat = rand(500, 900); nextKaart = rand(450, 800);
  if (ebos) { scene.remove(ebos.mesh); ebos = null; } nextEbos = 5000; bazen = 0;
  for (const f of replayBuf) { f.objs.length = 0; replayPool.push(f); }
  replayBuf = []; replayLen = 0; player.usedDouble = false; player.dubbelCD = 0;
  lastSnap = null; dist = 0; score = 0; runBekers = 0; rowN = 0; segN = 0;
  if (curLevel) prepareLevel(levelIdx);
  else if (boss) { scene.remove(boss.mesh); boss = null; }
  applyTheme(curLevel ? THEMES[curLevel.theme] : THEMES.oost);
  spawnZ = -42; nextSign = 380; nextPower = rand(85, 130); nextRegen = 260; firstPower = true; streetIdx = Math.floor(Math.random() * STREETS.length);
  nearT = 0; chaseDist = 3.2; brommerT = 0; bekerT = 0; invulnT = 0; chaseX = 0; vanZ = 34; omroepK = 0; rijTel.clear(); runUp = {}; wkT = 0; thunderT = 3; lkKans = false; plakMaatje.root.visible = false;
  deathT = 0; shakeT = 0; runTime = 0; lineT = mode === 'telefoon' ? rand(30, 45) : rand(6, 9); toetT = rand(4, 7);
  nitraten = 0;
  for (const sh of shots) scene.remove(sh.mesh);
  for (const pa of particles) release(pa.sp);
  shots.length = 0; particles.length = 0;
  shoutCool = 3; nextMilestone = 500; nextVrouw = rand(140, 200); bestPassed = false; streak = 0;
  clearRocket();
  clearFireworks();
  nextShow = rand(10, 18);
  placeSchool(mode === 'school');
  Object.assign(player, { lane: 1, x: 0, y: 0, vy: 0, grounded: true, slideT: 0, slideQueued: false });
  jens.root.position.set(0, 0, 0);
  jens.root.rotation.set(0, 0, 0);
  jens.root.scale.setScalar(1);
  deathFly = null; bikeFly = null; snapDeath = null;
  if (jensBike.parent !== jens.root) { scene.remove(jensBike); jens.root.add(jensBike); }
  jensBike.position.set(0, 0, 0); jensBike.rotation.set(0, 0, 0);
  $('#snap').classList.remove('glitch', 'dead');
  moped.visible = false;
  van.visible = false;
  engineStop();
  clearBubbles();
}

// =====================================================================
//  spawning
// =====================================================================
function gapFor() { return clamp(baseSpeed * rand(1.0, 1.5), 12, 30); }

let rijId = 0;
const rijTel = new Map();
function spawnCoinsLine(lane, z, n = 6) {
  const rij = ++rijId;
  for (let i = 0; i < n; i++) {
    const cz = z + 3.5 - i * 1.6;
    addObj('beker', coinProxy(), LANES[lane], cz, 0, 0, 0, { y: 0.85, rij, rijN: n });
  }
}
function spawnCoinsArc(lane, z) {
  const rij = ++rijId;
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const cz = z + 4 - t * 8;
    addObj('beker', coinProxy(), LANES[lane], cz, 0, 0, 0, { y: 0.85 + Math.sin(t * Math.PI) * 1.3, rij, rijN: 6 });
  }
}
// vaste obstakels: één keer bouwen en samenvoegen, daarna alleen nog klonen (geen nieuwe vormen en minder tekenopdrachten)
const prefabs = new Map();
function prefab(key, make, varianten = 3) {
  let list = prefabs.get(key);
  if (!list) prefabs.set(key, list = []);
  const i = Math.floor(Math.random() * varianten);
  if (!list[i]) { const m = mergeStatic(make()); m.position.set(0, 0, 0); m.userData.pk = key + i; markShared(m); list[i] = m; }
  const c = list[i].clone();
  c.userData.pk = key + i;
  return c;
}
function spawnObstacle(type, lane, z) {
  const x = LANES[lane];
  switch (type) {
    case 'gat': addObj('gat', makeHole(2.1, 2.6), x, z, 2.1, 2.6, 0); break;
    case 'kliko': {
      const n = Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) addObj('kliko', prefab('kliko', makeKliko), x + (n === 2 ? (i ? 0.42 : -0.42) : 0), z, n === 2 ? 0.75 : 0.8, 0.8, 1.12);
      break;
    }
    case 'fietswrak': addObj('fietswrak', prefab('fietswrak', makeFietswrak), x, z, 1.7, 0.9, 0.55); break;
    case 'auto': addObj('auto', prefab('auto', makeCar, 5), x, z - 1.2, 1.85, 3.9, 1.5); break;
    default: spawnSpecial(type, lane, z);
  }
}
function spawnRow(z) {
  if (curLevel) { spawnLevelRow(z); return; }
  if (jacht?.rol === 'shane') { if (Math.random() < 0.6) spawnCoinsLine(Math.floor(Math.random() * 3), z); return; } // Shane: vrije baan, alleen bekers
  if (seg && dist - z >= seg.s0 - 4 && dist - z <= seg.s0 + seg.L + 8) return; // uitstapje: alles staat er al
  if (schoolPhase === 'inside') { spawnIndoorRow(z); return; }
  if (schoolBlock && dist - z > schoolBlock.from && dist - z < schoolBlock.to) return;
  if (bos) { if (bos.spawned < bos.total) spawnHooliganRow(z); return; }
  const early = dist - z < 120;
  const r = Math.random();
  const ahead = dist - z;
  let freeLane = -1;

  if (mode === 'school' && ahead > nextVrouw) {
    nextVrouw = ahead + rand(230, 380);
    const lane = Math.floor(Math.random() * 3);
    addObj('vrouw', makeVrouw(), LANES[lane], z, 0.8, 0.6, 1.8);
    if (Math.random() < 0.6) spawnCoinsLine((lane + 1 + Math.floor(Math.random() * 2)) % 3, z);
  } else if (!early && r < 0.11) {
    // gat over de hele weg
    addObj('gat', makeHole(ROAD_W - 0.4, 2.8), 0, z, ROAD_W, 2.8, 0);
    for (const s of [-1, 1]) { const c = makeCone(); c.position.set(s * (ROAD_W / 2 + 0.4), 0.14, z); addObj('deco', c, s * (ROAD_W / 2 + 0.4), z, 0, 0, 0, { y: 0.14 }); }
    if (Math.random() < 0.7) spawnCoinsArc(Math.floor(Math.random() * 3), z);
  } else if (!early && r < 0.22) {
    addObj('afzetting', makeAfzetting(), 0, z, ROAD_W, 0.3, 1.5);
    if (Math.random() < 0.5) spawnCoinsLine(Math.floor(Math.random() * 3), z - 2, 4);
  } else {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    // BEKERREGEN: alle drie de banen vol
    if (!early && !path && ahead > nextRegen) { nextRegen = ahead + rand(650, 950); for (const l of [0, 1, 2]) spawnCoinsLine(l, z, 9); setTimeout(() => { if (state === 'run') { hype('🏆 BEKERREGEN!'); fxFlash('#ffd23f', 0.2); } }, 600); return; }
    if (!early && !path && ahead > nextFork && !ebos) { nextFork = ahead + 99999; spawnFork(z); spawnCoinsLine(1, z - 6, 4); return; }
    if (!early && ahead > nextSchat) { nextSchat = ahead + rand(700, 1200); spawnSchat(lanes[0], z); spawnCoinsLine(lanes[1], z); return; }
    if (!early && ahead > nextKaart) { nextKaart = ahead + rand(700, 1100); spawnKaart(lanes[0], z); }
    const nBlock = early || path?.kind === 'straat' || Math.random() < (path?.kind === 'park' ? 0.1 : 0.33) ? 1 : 2;
    if (path?.kind === 'park') { spawnCoinsLine(lanes[2], z); spawnCoinsArc(lanes[Math.floor(Math.random() * 2)], z); }
    let cars = 0;
    for (let i = 0; i < nBlock; i++) {
      let type = pick(['kliko', 'kliko', 'fietswrak', 'auto', 'auto', 'gat', 'bank', ...(ahead > 150 ? ['drerrie'] : []), ...(ahead > 450 ? ['tegenligger', 'tegenligger'] : []), ...feestObstacles(), ...(weekly?.rule.id === 'drerries' ? ['drerrie', 'drerrie', 'drerrie', 'drerrie', 'drerrie'] : [])]);
      if (type === 'auto' && ++cars > 1 && nBlock === 2 && Math.random() < 0.5) type = 'kliko';
      spawnObstacle(type, lanes[i], z);
      if (type !== 'auto' && Math.random() < 0.25) spawnCoinsArc(lanes[i], z);
    }
    freeLane = lanes[nBlock];
    if (ahead > nextPower && brommerT <= 0 && bekerT <= 0 && weekly?.rule.id !== 'geenpower') {
      nextPower = ahead + rand(200, 340);
      // de eerste is altijd een mystery kist: meteen iets spannends
      const type = firstPower ? 'kist' : pick(['brommer', 'beker-van-ons', 'nitraat', 'sjaal', 'fiets', 'fiets', 'fiets', 'fiets', 'fiets', 'kist', 'kist', 'kist']);
      firstPower = false;
      addObj('power', makePower(type), LANES[freeLane], z, 0, 0, 0, { y: 1.0, type });
    } else if (Math.random() < (early ? 1 : 0.65)) {
      spawnCoinsLine(freeLane, z);
    }
  }
  if (!early && !path && ahead > nextTruck) { nextTruck = ahead + rand(650, 1100); spawnTruck(z - 3); }
  if (!early && !path && ahead > nextRaam && spawnRaam(z - 6)) nextRaam = ahead + rand(160, 320);
  if (!early && !path && ahead > nextVrienden) { nextVrienden = ahead + rand(900, 1500); spawnVrienden(z - 5); }
  if (!early && !path && ahead > nextReporter) { nextReporter = ahead + rand(900, 1500); spawnReporter(z - 9); }
  if (ahead > nextSign) {
    nextSign = ahead + rand(420, 520);
    streetIdx = (streetIdx + 1) % STREETS.length;
    const s = makeSign(STREETS[streetIdx]);
    addObj('sign', s, ROAD_W / 2 + 0.6, z + 6, 0, 0, 0, { y: 0.14, street: STREETS[streetIdx] });
  }
}

// =====================================================================
//  bubbles / toast / hud
// =====================================================================
const bubbles = [];
const bubblesEl = $('#bubbles');
function bubble(obj, str, cls = '', dur = 1.5, yOff = 0.55) {
  for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].obj === obj) { bubbles[i].el.remove(); bubbles.splice(i, 1); }
  const el = document.createElement('div');
  el.className = 'bubble ' + cls;
  el.textContent = str;
  bubblesEl.appendChild(el);
  bubbles.push({ el, obj, until: now() + dur, yOff });
}
function clearBubbles() { for (const b of bubbles) b.el.remove(); bubbles.length = 0; }
const tmpV = new THREE.Vector3();
function updateBubbles() {
  const t = now(), w = window.innerWidth, h = window.innerHeight;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (t > b.until || !b.obj.parent) { b.el.remove(); bubbles.splice(i, 1); continue; }
    b.obj.getWorldPosition(tmpV);
    tmpV.y += b.yOff;
    tmpV.project(camera);
    if (tmpV.z > 1) { if (!b.hid) { b.hid = true; b.el.style.display = 'none'; } continue; }
    if (b.hid) { b.hid = false; b.el.style.display = ''; }
    const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h - 10;
    const bx = Math.round(clamp(x, 70, w - 70)), by = Math.round(clamp(y, 40, h));
    if (bx === b.lx && by === b.ly) continue;
    b.lx = bx; b.ly = by;
    const tr = `translate(${bx}px, ${by}px) translate(-50%, -100%)`;
    b.el.style.transform = tr;
    b.el.style.setProperty('--t', tr);
  }
}
// klein tekstje linksonder (voor dingen die geen groot scherm-bericht verdienen)
let noteTimer = 0;
function note(text, html) {
  const el = $('#note');
  if (html) el.innerHTML = html; else el.textContent = text;
  el.classList.add('show');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
let toastTimer = 0;
function toast(html, dur = 1.8) {
  const el = $('#toast');
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
}
function flash() { /* bewust uit: schermflitsen bij klappen en power-ups was irritant */ }
let hudBekers = -1;
let hudNitro = -1;
$('#nitroBtn').addEventListener('click', throwNitraat);
$('#nitroBtn').addEventListener('touchstart', (e) => { e.preventDefault(); throwNitraat(); }, { passive: false });
let hudScore = -1, hudPowers = '', hudTick = 1;
function updateHud() {
  updateStoryHud();
  if (hudNitro !== nitraten) {
    hudNitro = nitraten;
    $('#nitroBtn').classList.toggle('hidden', nitraten <= 0);
    $('#nitroBtn span').textContent = '×' + nitraten;
  }
  const sc = Math.floor(score);
  if (sc !== hudScore) {
    hudScore = hudScore >= 0 && sc > hudScore && sc - hudScore < 5000 ? Math.ceil(hudScore + (sc - hudScore) * 0.6) : sc; // optellen in plaats van springen
    $('#score').textContent = hudScore.toLocaleString('nl-NL');
    const k = Math.floor(sc / 1000);
    if (k > hudK) { hudK = k; const e = $('#score'); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
    if (sc < 1000) hudK = 0;
    const best = save.best[mode] || 0;
    if (state === 'run' && !nearRecord && best > 1500 && sc > best * 0.9 && sc < best) { nearRecord = true; note(`😬 Nog ${(best - sc).toLocaleString('nl-NL')} tot je record!`); tone(660, 0.1, 'square', 0.05); tone(880, 0.12, 'square', 0.05, null, 0.12); }
  }
  if (hudBekers === runBekers && bekerRunT <= 0) $('#bugStreak').classList.add('hidden');
  if (hudBekers !== runBekers) {
    hudBekers = runBekers;
    const el = $('#bekerCount');
    el.querySelector('span').textContent = runBekers;
    const st = $('#bugStreak'), reeks = bekerRunT > 0 && bekerRun >= 3;
    st.classList.toggle('hidden', !reeks);
    if (reeks) { st.textContent = `×${bekerRun}`; st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop'); }
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  let html = '';
  if (wkT > 0) html += `<div class="power wk"><span>🏆 De WK beker: 2× bekers</span><div class="bar"><i style="width:${Math.round((wkT / 10) * 100)}%"></i></div></div>`;
  if (sjaalT > 0) html += `<div class="power"><span>🧣 NEC-sjaal – bekermagneet</span><div class="bar"><i style="width:${Math.round((sjaalT / SJAAL_TIME) * 100)}%"></i></div></div>`;
  if (fietsT > 0) html += `<div class="power"><span>🚲 Fiets – 2× snel, halve schade</span><div class="bar"><i style="width:${Math.round((fietsT / fietsMax) * 100)}%"></i></div></div>`;
  if (brommerT > 0) html += `<div class="power"><span>🛵 Brommer – onaantastbaar</span><div class="bar"><i style="width:${Math.round((brommerT / BROMMER_TIME) * 100)}%"></i></div></div>`;
  if (bekerT > 0) html += `<div class="power beker"><span>🏆 De beker is van ons! 2× punten</span><div class="bar"><i style="width:${Math.round((bekerT / BEKER_TIME) * 100)}%"></i></div></div>`;
  if (html !== hudPowers) { hudPowers = html; $('#powers').innerHTML = html; }
}

// =====================================================================
//  input
// =====================================================================
function goodShout(force) {
  if (shoutCool > (force ? 25 : 0)) return;
  shoutCool = rand(40, 60);
  shout(SHOP.shout.items.find((i) => i.id === save.eq.shout) || SHOP.shout.items[0]);
}
function shout(item, force) {
  bubble(jens.head, item.text, 'shout', item.clip || item.voice ? 1.8 : 0.9, 0.5);
  if (item.voice) { if (!(fietsT > 0 && voiceSrc) && !playVoice(item.voice)) speak(item.text); }
  else if (item.clip) { if (!playClip(item.clip, force)) speak(item.text); }
  else if (item.sing) singBio();
  else speak(item.text);
}
// NEC-sticker op een lantaarnpaal plakken: nog een keer naar de stoep swipen
const stickerMat = new THREE.MeshLambertMaterial({ map: psxTex(new THREE.TextureLoader().load('img/nec-sticker.jpg')), side: THREE.DoubleSide });
let stickerCombo = 0;
function trySticker(side) {
  if (indoor || sticker.t > 0 || !player.grounded) return;
  const lamps = decor.find((d) => d.kind === 'makeLamp' && Math.sign(d.items[0].position.x) === side);
  const lamp = lamps && lamps.items.find((it) => it.position.z > -7 && it.position.z < 5);
  if (!lamp) {
    if (brommerT > 0 || fietsT > 0) return;
    sticker.t = 0.25; sticker.side = side;
    deathNote = 'Jens wilde een sticker plakken, maar er stond geen lantaarnpaal. Hij knalde zo tegen een gevel.';
    die('botsing');
    return;
  }
  sticker.t = 0.45; sticker.side = side;
  tone(240, 0.08, 'square', 0.08); noise(0.06, 0.15, 0.05);
  if (!lamp.userData.sticker) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34).rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2), stickerMat);
    pl.position.set(-side * 0.1, 1.45, 0);
    lamp.add(pl);
    lamp.userData.sticker = pl;
    stickerCombo++;
    const pts = (40 + stickerCombo * 10) * (bekerT > 0 ? 2 : 1) * scoreMult();
    missionEvent('sticker');
    score += pts;
    note('', `<img src="img/nec-sticker.jpg" alt="" class="stk"> NEC-sticker geplakt! +${pts}${stickerCombo > 1 ? ` · combo ${stickerCombo}` : ''}`);
  } else note('Hier zit al een sticker');
}
function act(a) {
  if (state !== 'run') return;
  if (seg?.active && seg.type !== 'kermis' && (a === 'jump' || a === 'slide' || seg.type === 'achtbaan')) return;
  if (a === 'left' && player.lane === 0) trySticker(-1);
  else if (a === 'right' && player.lane === 2) trySticker(1);
  else if (a === 'left' && player.lane > 0) player.lane--;
  else if (a === 'right' && player.lane < 2) player.lane++;
  else if (a === 'jump' && !player.grounded && save.eq.skill === 'dubbel' && !player.usedDouble && !(player.dubbelCD > 0) && brommerT <= 0) {
    player.usedDouble = true; player.dubbelCD = 20;
    player.vy = 8.2;
    sfx.jump(); buzz(15);
    burst(new THREE.Vector3(player.x, player.y + 0.1, 0.2), 8, 2, sparkMats[0], 0.4);
  }
  else if (a === 'jump' && player.grounded) {
    player.vy = 9.4;
    player.grounded = false;
    player.slideT = 0;
    sfx.jump();
    missionEvent('jump');
    sfx.grunt();
  } else if (a === 'slide') {
    if (player.grounded) { player.slideT = 0.75; sfx.slide(); missionEvent('slide'); }
    else { player.vy = Math.min(player.vy, -16); player.slideQueued = true; }
  }
}
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input')) return;
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') act('left');
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') act('right');
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') act('jump');
  else if (k === 'ArrowDown' || k === 's' || k === 'S') act('slide');
  else if (k === 'e' || k === 'E') throwNitraat();
  else if (jacht && ['1', '2', '3'].includes(k)) jachtPower(['sprint', 'troeki', 'trap'][k - 1]);
  else if (k === 'Escape' || k === 'p' || k === 'P') { if (state === 'run') pauseGame(); else if (state === 'paused') resumeGame(); }
  else if (k === 'Enter') {
    if (state === 'menu' && started && !$('#menu').classList.contains('hidden') && e.timeStamp - startedAt > 300) startRun();
    else if (state === 'over') startRun();
  }
});
let touch = null;
canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY, done: false }; }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (!touch || touch.done) return;
  const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.hypot(dx, dy) < 28) return;
  touch.done = true;
  if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'left' : 'right');
  else act(dy < 0 ? 'jump' : 'slide');
}, { passive: true });
canvas.addEventListener('touchend', (e) => {
  if (touch && !touch.done) {
    const t = e.changedTouches[0];
    if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) < 12) act('jump');
  }
  touch = null;
}, { passive: true });
// naar de achtergrond (app weggeveegd, tabblad gewisseld): alle geluid stil, en het spel op pauze
function muteBackground() {
  if (state === 'run') pauseGame();
  if (state === 'mini') miniPause(true);
  engineStop();
  stopVoice();
  musicEl.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (ac && ac.state === 'running') ac.suspend();
}
function unmuteForeground() {
  if (ac && ac.state === 'suspended') ac.resume();
  musicKick();
}
window.__jrPause = muteBackground;
window.__jrResume = unmuteForeground;
document.addEventListener('visibilitychange', () => { if (document.hidden) muteBackground(); else unmuteForeground(); });
window.addEventListener('pagehide', muteBackground);

// =====================================================================
//  run flow
// =====================================================================
function startRun() {
  if (MODES[mode]?.mini) { startMini(mode); return; }
  if (jacht?.klaar) jachtStop();
  audioInit();
  missionStartRun();
  missionEvent('games');
  stickerCombo = 0;
  stopGameover();
  musicRestart(curLevel ? (campaign === 'nederland' ? 'nederland' : 'story') : 'game');
  if (!curLevel) { themaIdx = Math.floor(Math.random() * FEEST_ROTATIE.length); feest = FEEST_ROTATIE[themaIdx]; themaT = THEMA_SECS; } else feest = null;
  rollWeather();
  if (weekly?.rule.id === 'regen') { weather = 'regen'; seedPrecip('regen'); }
  if (weekly?.rule.id === 'nacht') { weather = 'mist'; seedPrecip(null); }
  if (curLevel && THEMES[curLevel.theme]?.snow) { weather = 'sneeuw'; seedPrecip('sneeuw'); }
  if (feest && !curLevel) { save.feestPlayed = { ...save.feestPlayed, [feest]: 1 }; recordStat('feesten', 0, Object.keys(save.feestPlayed).length); }
  applyLook(weekly?.rule.id === 'nacht' ? 2 : pickPhase());
  applyFeest();
  comboBreak();
  resetRun();
  state = 'run';
  introT = 0;
  recCaption = pick(['Kijk hem gaan 😂', 'Jens Run 🏃', 'Nijmegen-Oost 💯', 'Wie houdt hem tegen?', `${MODES[mode].icon} ${MODES[mode].label}-modus`, 'Dit gaat mis…']);
  showScreen(null);
  $('#hud').classList.remove('hidden');
  hudBekers = -1; hudScore = -1;
  const aanloop = !curLevel && !live && startAanloop();
  if (!aanloop) toast(`📍 ${STREETS[streetIdx]}<small>${cap(MODES[mode].chaser)} komt eraan… REN!</small>`, 2.4);
  if (mode !== 'telefoon') setTimeout(() => { if (state === 'run') chaserSay(MODES[mode].lines[0], mode === 'terror' ? 'angry' : '', 1.8); }, 600);
  if (mode === 'fiets' && !aanloop) setTimeout(() => sfx.bel(), 700);
  if (mode === 'telefoon') setTimeout(() => { if (state === 'run' && !playVoice(pick(['telefoon', 'telefoon3', 'telefoon4', 'telefoon5']))) sfx.ring(); }, 500);
  telefoon2At = -1;
  if (mode === 'school' && !aanloop) {
    launchRocket();
    toast(`🎆 NSG Groenewoud<small>De docent komt eraan… REN!</small>`, 2.4);
  }
  if (feest && !curLevel) setTimeout(() => { if (state === 'run') note(`${FEESTEN[feest].icon} ${FEESTEN[feest].name}`); }, 1200);
  setTimeout(() => { if (state === 'run') verslaggever(feest === 'wedstrijd' ? 'wedstrijd' : 'start', true); }, 1700);
  if (weekly) setTimeout(() => { if (state === 'run') toast(`🗓️ WEEKUITDAGING<small>${weekly.rule.icon} ${weekly.rule.name}</small>`, 2.2); }, 300);
  if (challenge && challenge.mode === mode && !curLevel) setTimeout(() => { if (state === 'run') note(`👊 Doel: meer dan ${challenge.score.toLocaleString('nl-NL')} punten`); }, 3600);
  if (curLevel) {
    nitraten = curLevel.nitraten || 0;
    hudNitro = -1;
    hudLvlKey = '';
    toast(`LEVEL ${levelIdx + 1} · ${curLevel.wijk}<small>De BOA zit je op de hielen!</small>`, 2.6);
    if (curLevel.id === 'lent') setTimeout(() => { if (state === 'run') playVoice('lent'); }, 400);
  }
}
function pauseGame() {
  state = 'paused';
  engineStop();
  showScreen('#pause');
}
function resumeGame() {
  state = 'run';
  showScreen(null);
  if (brommerT > 0) engineStart();
}
function stumble(o) {
  if (jacht?.rol === 'shane') return; // Shane rent overal dwars doorheen
  if (invulnT > 0 || o.hit) return;
  liveEv('struikel');
  verslaggever('stumble');
  comboBreak();
  buzz(70);
  o.hit = true;
  knock(o);
  sfx.stumble();
  shakeT = 0.3;
  flash(true);
  if (jacht) { jachtVal(1.1); return; }
  if (indoor) { invulnT = 0.5; baseSpeed *= 0.97; return; } // binnen is de achtervolger er niet
  if (fietsT > 0) {
    // op de fiets telt elke klap maar half
    fietsDmg += 0.5;
    if (fietsDmg < 1) { invulnT = 0.7; note('🚲 Klap op de fiets: halve schade'); return; }
    fietsDmg = 0;
  }
  if (seg?.active) { invulnT = 0.6; baseSpeed *= 0.97; return; }
  if (nearT > 0) { die('gepakt'); return; }
  nearT = MODES[mode].nearTime;
  invulnT = 0.4;
  baseSpeed *= 0.94;
  if (mode === 'telefoon') { if (!voiceSrc && !shaneTalking()) { chaserSay(shaneLine(), '', 1.6); lineT = Math.max(lineT, 20); } }
  else bubble(chaser().head, pick(['BIJNA!', 'Ik heb je bijna!', 'HAHA', 'Struikel maar!']), mode === 'terror' ? 'angry' : '', 1.4);
}
function knock(o) {
  o.fly = { vx: rand(-4, 4), vy: rand(5, 8), vz: rand(6, 12), r: rand(-8, 8) };
}
function die(reason) {
  if (state !== 'run') return;
  // Shane jaagt: Jens gaat niet dood, hij ligt even (alleen Shane kan hem pakken)
  if (jacht && reason !== 'gepakt') { if (jacht.rol === 'jens') { flash(true); sfx.stumble(); buzz(120); jachtVal(2.2); } return; }
  // op de fiets is een dodelijke klap 'maar' struikelen (en dat telt weer half)
  if (fietsT > 0 && reason !== 'gepakt') { stumble({}); return; }
  buzz([120, 60, 200]);
  comboBreak();
  state = 'dying';
  liveOnDeath();
  setTimeout(() => verslaggever('dood', true), 700);
  deathReason = reason;
  deathT = 0;
  sfx.die();
  engineStop();
  playGameover();
  shakeT = 0.4;
  flash(true);
  moped.visible = false;
  brommerT = 0;
  // aan het snappen op de fiets? dan vliegt Jens (en de fiets) een paar postcodes verder
  if (snapOn && reason !== 'gat') {
    deathReason = 'vlucht';
    deathFly = { v: new THREE.Vector3(rand(-2.5, 2.5), rand(10, 13), -rand(16, 22)), spin: rand(7, 11), landed: false };
    snapDeath = { t: 0 };
    const wp = new THREE.Vector3(); jensBike.getWorldPosition(wp);
    jens.root.remove(jensBike); scene.add(jensBike); jensBike.position.copy(wp); jensBike.visible = true;
    bikeFly = { v: new THREE.Vector3(rand(-3, 3), rand(3, 5), -rand(8, 12)), spin: rand(5, 9) };
    sfx.smash(); noise(0.6, 0.6); buzz([200, 80, 300]);
    shakeT = 0.8;
  } else if (snapOn) snapDeath = { t: 0 };
  if (fietsT > 0) stopFiets();
  $('#hud').classList.add('hidden');
  setTimeout(() => chaserSay(MODES[mode].catchLine, mode === 'terror' ? 'angry' : '', 2.5), reason === 'gat' ? 900 : 500);
}
function finishRun() {
  state = 'over';
  const s = Math.floor(score);
  const best = save.best[mode] || 0;
  const isBest = !jacht && s > best;
  if (isBest) save.best[mode] = s;
  if (!curLevel && !jacht && s > (save.bestRun || 0)) {
    const before = save.bestRun || 0;
    save.bestRun = s;
    for (const [k, need] of Object.entries(MODE_UNLOCK)) if (need > 1 && before < need && s >= need) setTimeout(() => note(`🔓 ${MODES[k].icon} ${MODES[k].label}-modus vrijgespeeld!`), 1200);
  }
  persist();
  const c = MODES[mode].chaser;
  const street = STREETS[streetIdx];
  const texts = {
    gat: ['In een gat!', `Jens verdween in een gat in de ${street}. ${cap(c)} hoefde alleen nog maar te wachten.`],
    auto: ['Boem!', `Jens knalde vol tegen een foutgeparkeerde auto. ${cap(c)} had hem meteen te pakken.`],
    afzetting: ['Au!', `Jens rende tegen een wegafzetting. Werk in uitvoering, en ${c} ook.`],
    gepakt: ['Gepakt!', `${cap(c)} heeft Jens te pakken op de ${street}.`],
    botsing: [/spandoek/.test(deathNote) ? 'Gesnapt!' : 'Boem!', deathNote],
    vlucht: ['Weggeslingerd!', `Jens zat te snappen en knalde ergens vol op. Hij vertrok in 6522 en landde ergens in ${pick(['6523', '6524', '6525', '6531', '6532', '6533', '6541', '6543', '6544', '6545'])} ${pick(['AB', 'KL', 'GH', 'XZ', 'PT', 'CN'])}. De telefoon filmde alles.`],
    gevloerd: ['Gevloerd!', `Een vrouw met een hond heeft Jens gevloerd op de ${street}. De docent kon hem zo oppakken.`],
  };
  if (mode === 'telefoon') texts.gepakt = ['Ingeleverd!', `Shane heeft Jens z'n telefoon afgepakt op de ${street}. Om half 4 mag hij hem ophalen.`];
  if (mode === 'terror') texts.gepakt = ['Terug aan het werk!', `De leidinggevende heeft Jens te pakken op de ${street}. Zonder polo. Dat wordt een gesprek.`];
  if (mode === 'school') texts.gepakt = ['Nablijven!', `De docent heeft Jens te pakken op de ${street}. Dat babypijltje gaat hem duur komen te staan.`];
  if (curLevel) texts.gepakt = ['Bonnetje!', `De BOA heeft Jens te pakken in ${curLevel.wijk}. Dat wordt een dikke boete.`];
  let [title, txt] = texts[deathReason] || texts.gepakt;
  if (jacht?.titel) [title, txt] = [jacht.titel, jacht.tekst];
  passAddXp(dist);
  if (curLevel) { storyGameOver(title, txt); return; }
  $('#overTitle').textContent = title;
  $('#overText').textContent = txt;
  $('#overScore').textContent = s.toLocaleString('nl-NL');
  $('#overBekers').textContent = '+' + runBekers;
  $('#overBest').textContent = Math.max(s, best).toLocaleString('nl-NL');
  $('#newBest').classList.toggle('hidden', !isBest || s === 0);
  const bijna = !isBest && best > 0 && s >= best * 0.75;
  $('#overBijna').classList.toggle('hidden', !bijna);
  if (bijna) $('#overBijna').textContent = `😩 Zo dichtbij! Nog maar ${(best - s + 1).toLocaleString('nl-NL')} punten tot je record`;
  $('#overRank').classList.add('hidden');
  $('#overName').classList.add('hidden');
  const ch = challengeResult(s);
  $('#overChallenge').innerHTML = ch;
  $('#overChallenge').classList.toggle('hidden', !ch);
  showScreen('#over');
  lastRun = { mult: scoreMult(), mode, score: s, dist: Math.floor(dist), secs: Math.round(runTime * 10) / 10, bekers: runBekers, reason: deathReason, street: STREETS[streetIdx] };
  setTimeout(renderLiveResult, 0);
  startNews(title, txt);
  $('#wallForm').classList.add('hidden');
  if (bazen > 0 && save.name) apiCall('/api/score', { id: save.playerId, mode: 'bazen', score: bazen, dist: Math.floor(dist), secs: Math.round(runTime), bekers: 0, mult: 1 }).catch(() => {});
  $('#overTitle').dataset.weekly = weekly ? '1' : '';
  if (weekly && s > 0) submitWeekly(lastRun);
  if (s > 0 && !jacht) {
    if (save.name) submitScore(lastRun);
    else { $('#overName').classList.remove('hidden'); $('#overName .err').textContent = ''; }
  }
}

// =====================================================================
//  update
// =====================================================================
function houseVisible(h, side) {
  if (indoor || (curTheme && !curTheme.houses)) return false;
  if (side < 0 && school && Math.abs(h.z - school.z) <= h.width / 2 + school.len / 2) return false;
  for (const o of lmList) if ((o.side === side || o.side === 0) && Math.abs(h.z - o.z) < h.width / 2 + o.len / 2) return false;
  return true;
}
const lmList = [];
var worldTravel = 0; // hoever de straat in totaal is opgeschoven (voor het nieuwsfilmpje)
function moveWorld(m, dt) {
  worldTravel += m;
  lmList.length = 0;
  for (const o of objs) if (o.kind === 'landmark') lmList.push(o);
  updateExtras(dt, m);
  scrollIndoor(m);
  roadTex.offset.y += m / ROAD_TILE;
  walkTex.offset.y += m / WALK_TILE;
  for (const side of [-1, 1]) {
    const list = houses[side];
    for (const h of list) {
      h.z += m;
      if (h.z - h.width / 2 > 34) { h.z -= list.len; restyleHouse(h); }
      h.g.position.z = h.z;
      h.g.visible = houseVisible(h, side);
    }
  }
  if (school) {
    school.z += m;
    school.g.position.z = school.z;
    if (school.z - school.len / 2 > 40) placeSchool(false);
  }
  for (const d of decor) {
    for (const it of d.items) {
      it.position.z += m;
      if (it.position.z > 30) { it.position.z -= d.span; if (it.userData.sticker) { it.remove(it.userData.sticker); it.userData.sticker = null; } }
    }
  }
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    const pz = o.z;
    o.z += m;
    if (pz < 0 && o.z >= 0) comboPass(o);
    if (o.fly) {
      o.fly.vy -= 22 * dt;
      o.mesh.position.x += o.fly.vx * dt;
      o.mesh.position.y = Math.max(-3, o.mesh.position.y + o.fly.vy * dt);
      o.z -= o.fly.vz * dt * 0.3;
      o.mesh.rotation.x += o.fly.r * dt;
      o.mesh.rotation.z += o.fly.r * 0.6 * dt;
    }
    o.mesh.position.z = o.z;
    if (o.z < -68) { if (o.mesh.visible) { o.mesh.visible = false; o.culled = true; } }
    else if (o.culled) { o.mesh.visible = true; o.culled = false; }
    if (o.kind === 'beker') o.mesh.rotation.y += dt * 3;
    if (o.kind === 'power') { o.mesh.userData.spin.rotation.y += dt * 2; o.mesh.position.y = o.y + Math.sin(now() * 4) * 0.12; }
    if (o.kind === 'vrouw') updateVrouw(o, dt);
    if (o.upd) o.upd(o, dt);
    if ((o.kind === 'sign' || (o.kind === 'landmark' && o.street)) && !o.toasted && o.z > -6) { o.toasted = true; toast(`📍 ${o.street}`, 1.6); if (!curLevel && STREETS.includes(o.street)) verslaggever('straat', false, STREETS.indexOf(o.street)); }
    if (o.z - (o.len || 0) / 2 > 16 || o.dead) { releaseObj(o); objs.splice(i, 1); }
  }
}

// ---------- nitraat afsteken ----------
const fireMats = ['#fff3a0', '#ffd23f', '#ff8a00', '#ff3b1a', '#5a5a5a', '#8a8a8a'].map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
const SLOOPBAAR = new Set(['kliko', 'fietswrak', 'auto', 'afzetting', 'vrouw', 'deco']);
function throwNitraat() {
  if (state !== 'run' || nitraten <= 0) return;
  nitraten--;
  let target = null;
  for (const o of objs) {
    if (!(SLOOPBAAR.has(o.kind) || o.gen) || o.hit || o.kind === 'deco') continue;
    if (o.z > -1.5 || o.z < -65) continue;
    if (Math.abs(o.x - player.x) > o.w / 2 + 0.6) continue;
    if (!target || o.z > target.z) target = o;
  }
  if (boss && !boss.dead && boss.z > -40 && (!target || target.z < boss.z)) target = boss;
  const eb = ebosTarget(); if (eb && (!target || target.z < eb.z)) target = eb;
  const m = makeNitraat();
  m.position.set(player.x, 1.3, -0.4);
  scene.add(m);
  shots.push({ mesh: m, x: player.x, z: -0.4, t: 0, target, startZ: -0.4 });
  sfx.sis();
  hudNitro = -1;
}
function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const sh = shots[i];
    sh.t += dt;
    sh.z -= 34 * dt;
    const tg = sh.target && !sh.target.hit && !sh.target.dead ? sh.target : null;
    if (tg) sh.x = damp(sh.x, tg.x, tg.isBoss ? 12 : 8, dt);
    const endZ = tg ? tg.z : -45;
    const prog = clamp((sh.startZ - sh.z) / Math.max(1, sh.startZ - endZ), 0, 1);
    sh.mesh.position.set(sh.x, 1.3 + Math.sin(prog * Math.PI) * 2.2 - prog * 0.9, sh.z);
    sh.mesh.rotation.x += dt * 12;
    if (Math.random() < 0.7) burst(sh.mesh.position, 1, 1, sparkMats[0], 0.3);
    if (sh.z <= endZ + 0.2 || sh.t > 2) {
      explode(sh.x, sh.z);
      scene.remove(sh.mesh);
      shots.splice(i, 1);
    }
  }
}
function explode(x, z) {
  buzz(90);
  fxFlash('#ffb050', 0.3);
  if (!miniSnd('nitraat', 1.4)) sfx.boem();
  shakeT = 0.5;
  flash(false);
  burst(new THREE.Vector3(x, 1, z), 60, 9, fireMats, 1.3);
  hitBoss(x, z);
  hitEbos(x, z);
  let n = 0;
  for (const o of objs) {
    if (!(SLOOPBAAR.has(o.kind) || o.gen || o.task) || o.hit || o.dead) continue;
    if (Math.abs(o.x - x) > 2.8 + o.w / 2 || Math.abs(o.z - z) > 4.5 + o.d / 2) continue;
    o.hit = true;
    o.fly = { vx: (o.x - x) * 3 + rand(-3, 3), vy: rand(9, 14), vz: rand(-4, 8), r: rand(-10, 10) };
    onDestroyed(o);
    n++;
  }
  if (n) {
    const pts = n * 100 * (bekerT > 0 ? 2 : 1);
    missionEvent('sloop', n);
    score += pts;
    toast(`💥 ${n}× GESLOOPT<small>+${pts} punten</small>`, 1.4);
    verslaggever('nitraat');
    if (Math.random() < 0.3) goodShout(true);
    else bubble(chaser().head, pick(['WAT DOE JE?!', 'DAT IS ILLEGAAL!', 'NITRAAT?!']), mode === 'terror' ? 'angry' : '', 1.4);
  }
}
const meshPool = new Map();
function poolMesh(geo, mat) {
  const m = meshPool.get(geo)?.pop() || new THREE.Mesh(geo, mat);
  m.material = mat; m.scale.set(1, 1, 1); m.rotation.set(0, 0, 0); m.visible = true;
  m.layers.set(1); batchSingles.add(m); // vonkjes: allemaal samen getekend
  return m;
}
function release(m) {
  scene.remove(m); batchSingles.delete(m);
  if (!meshPool.has(m.geometry)) meshPool.set(m.geometry, []);
  const p = meshPool.get(m.geometry);
  if (p.length < 400) p.push(m);
}
function burst(pos, count, speed, mat, life) {
  if (lowFx) count = Math.ceil(count / 2);
  for (let i = 0; i < count; i++) {
    const sp = poolMesh(sparkGeo, Array.isArray(mat) ? pick(mat) : mat || pick(sparkMats));
    sp.position.copy(pos);
    const v = count === 1 ? new THREE.Vector3(rand(-0.5, 0.5), rand(-1, 0), rand(1, 2)) : new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.5, speed));
    scene.add(sp);
    particles.push({ sp, v, life: life * rand(0.6, 1), max: life });
  }
}
function updateParticles(dt, m) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pa = particles[i];
    pa.life -= dt;
    pa.v.y -= 9 * dt;
    pa.sp.position.addScaledVector(pa.v, dt);
    pa.sp.position.z += m;
    pa.sp.scale.setScalar(Math.max(0.01, (pa.life / pa.max) * 1.4));
    if (pa.life <= 0) { release(pa.sp); particles.splice(i, 1); }
  }
}

// ---------- vuurwerk in de verte ----------
const fwGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
const fwColors = ['#ff3b3b', '#ffd23f', '#4dd2ff', '#7dff6a', '#ff7af0', '#ffffff', '#ff9a1f', '#b18cff'];
const fwMats = fwColors.map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
const fwShells = [], fwSparks = [];
let nextShow = 15;
// cakes klinken als de cake-opname, lawinepijlen en de rest als het grote vuurwerk
const SHOW_SND = { lawine: 'groot', mortier: 'groot', cake: 'cake' };
const SHOWS = {
  lawine: { name: 'Lawinepijl!', shots: 9, gap: 0.22, vy: [14, 18], fuse: [0.85, 1.1], burst: 26, speed: 8 },
  mortier: { name: 'Mortierbom!', shots: 1, gap: 0, vy: [19, 19], fuse: [1.25, 1.25], burst: 90, speed: 13 },
  cake: { name: 'Cakebox!', shots: 14, gap: 0.16, vy: [11, 13], fuse: [0.6, 0.8], burst: 14, speed: 6 },
};
function startShow(type) {
  type ||= pick(Object.keys(SHOWS));
  const sh = SHOWS[type], quiet = miniSnd(SHOW_SND[type], 0.6);
  const side = Math.random() < 0.5 ? -1 : 1;
  const base = new THREE.Vector3(side * rand(1, 7), 2, rand(-85, -60));
  for (let i = 0; i < sh.shots; i++) {
    fwShells.push({ wait: i * sh.gap, pos: base.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5))),
      v: new THREE.Vector3(rand(-2.5, 2.5), rand(...sh.vy), rand(-2, 2)), fuse: rand(...sh.fuse), t: 0, sh, mesh: null, color: pick(fwMats), quiet });
  }
  // Jens roept het bij de eerste knal
  setTimeout(() => {
    if (state !== 'run') return;
    note(`🎆 ${sh.name.replace('!', '')}`);
    if (shoutCool > 12 || Math.random() < 0.5) return;
    shoutCool = Math.max(shoutCool, 12);
    bubble(jens.head, 'GO NEDERLAND!', 'shout', 1.5, 0.5);
    if (!voiceSrc && !playVoice('gonl')) { lastSpeak = 0; speak('Go Nederland!'); }
  }, (sh.fuse[0] + 0.1) * 1000);
}
function updateFireworks(dt, m) {
  if (state === 'run') {
    nextShow -= dt;
    if (nextShow <= 0 && !indoor) { nextShow = curFeest()?.fw ? rand(3, 7) : night ? rand(9, 16) : rand(14, 24); startShow(); }
  }
  for (let i = fwShells.length - 1; i >= 0; i--) {
    const f = fwShells[i];
    f.pos.z += m;
    if (f.wait > 0) { f.wait -= dt; continue; }
    if (!f.mesh) {
      f.mesh = new THREE.Mesh(fwGeo, fwMats[1]); f.mesh.scale.setScalar(0.5); scene.add(f.mesh);
      if (!f.quiet && (f.sh.shots > 1 || Math.random() < 0.5)) tone(rand(1200, 1700), f.fuse, 'sine', 0.012, 3000);
    }
    f.t += dt;
    f.v.y -= 9 * dt;
    f.pos.addScaledVector(f.v, dt);
    f.mesh.position.copy(f.pos);
    if (Math.random() < 0.6) fwSpark(f.pos, new THREE.Vector3(rand(-0.5, 0.5), -1, rand(-0.5, 0.5)), fwMats[1], 0.35, 0.4);
    if (f.t >= f.fuse) {
      scene.remove(f.mesh);
      fwShells.splice(i, 1);
      const n = f.sh.burst, mat = f.color, mat2 = Math.random() < 0.4 ? pick(fwMats) : mat;
      for (let k = 0; k < n; k++) {
        const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(f.sh.speed * rand(0.75, 1));
        fwSpark(f.pos, v, k % 3 ? mat : mat2, rand(1.1, 1.7), 1);
      }
      if (!f.quiet) fwBang(f.sh.burst > 50 ? 1 : 0.6, 0.18 + Math.random() * 0.12, f.sh.burst > 40); // geluid komt iets later aan
    }
  }
  for (let i = fwSparks.length - 1; i >= 0; i--) {
    const k = fwSparks[i];
    k.life -= dt;
    k.v.multiplyScalar(1 - 1.6 * dt);
    k.v.y -= 3 * dt;
    k.sp.position.addScaledVector(k.v, dt);
    k.sp.position.z += m;
    k.sp.scale.setScalar(Math.max(0.01, (k.life / k.max)) * k.size);
    if (k.life <= 0) { release(k.sp); fwSparks.splice(i, 1); }
  }
}
function fwSpark(pos, v, mat, life, size) {
  const sp = poolMesh(fwGeo, mat);
  sp.position.copy(pos);
  scene.add(sp);
  fwSparks.push({ sp, v, life, max: life, size });
}
function clearFireworks() {
  for (const f of fwShells) if (f.mesh) scene.remove(f.mesh);
  for (const k of fwSparks) release(k.sp);
  fwShells.length = 0; fwSparks.length = 0;
}

function updateVrouw(o, dt) {
  const { person, dog } = o.mesh.userData;
  if (!o.hit && state === 'run' && o.z > -30) {
    // komt op Jens af en zwenkt naar zijn baan
    const step = 2.6 * dt;
    o.x += clamp(player.x - o.x, -step, step);
    o.z += dt * 1.5;
    o.mesh.position.x = o.x;
    if (!o.barked && o.z > -20) {
      o.barked = true;
      sfx.blaf();
      bubble(person.head, pick(['HÉ JIJ!', 'PAK HEM, BOEFJE!', 'STAAN BLIJVEN!', 'Ik heb je wel gezien!']), 'angry', 1.6);
    }
  }
  pose(person, o.z > -12 ? 'reach' : 'run', dt, 0.7);
  const t = now() * 14;
  dog.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(t + (i % 2 ? Math.PI : 0) + (i > 1 ? 1 : 0)) * 0.7; });
  dog.userData.tail.rotation.y = Math.sin(t * 1.5) * 0.6;
}
function collide() {
  const px = player.x, py = player.y;
  const sliding = player.slideT > 0;
  const top = py + (sliding ? 0.8 : 1.85);
  const immune = brommerT > 0;
  for (const o of objs) {
    if (o.hit || o.dead) continue;
    const dz = Math.abs(o.z);
    if (o.kind === 'beker') {
      if (Math.abs(px - o.x) < 0.9 && dz < 0.9 && Math.abs(py + 0.9 - o.y) < 1.15) {
        o.dead = true;
        if (jacht?.rol === 'shane') jachtBeker();
        const n = (bekerT > 0 ? 2 : 1) * (wkT > 0 ? 2 : 1);
        runBekers += n;
        save.bekers += n;
        score += 10 * n * scoreMult();
        missionEvent('bekers', n);
        const dn = fxDing();
        coinFly(_pv.set(player.x, player.y + 1.4, -0.3), camera);
        burst(_pv.set(o.x, (o.y || 0.85) + 0.3, o.z), lowFx ? 3 : 6, 3.4, glinsterMats, 0.32);
        if (o.rij) {
          const k = (rijTel.get(o.rij) || 0) + 1;
          if (k >= o.rijN) {
            rijTel.delete(o.rij);
            const pts = 50 * scoreMult() * (bekerT > 0 ? 2 : 1);
            score += pts;
            runPop(`VOLLE RIJ! +${pts}`, 'good rij');
            jingle.kaching(); buzz(18);
          } else rijTel.set(o.rij, k);
          if (rijTel.size > 40) rijTel.delete(rijTel.keys().next().value);
        }
        if (dn >= 8) runPop('+' + 10 * n * scoreMult(), 'good small');
        bekerRun = bekerRunT > 0 ? bekerRun + 1 : 1; bekerRunT = 1.4;
        if (bekerRun === 10 || bekerRun === 25 || bekerRun === 50 || bekerRun === 100) { hype(`🏆 BEKERSTREAK ×${bekerRun}!`, bekerRun >= 50 ? 'mega' : ''); buzz(TRIL.streak); score += bekerRun * 10 * scoreMult(); }
        buzz(8);
        if (++streak % 40 === 0) goodShout();
      }
      continue;
    }
    if (o.kind === 'booster') { if (!o.used && dz < 1 && Math.abs(px - o.x) < 1 && py < 0.5) { o.used = true; player.vy = 21; player.grounded = false; player.slideT = 0; sfx.power(); toast('🚀 BOOSTER!', 0.9); bubble(jens.head, 'WOOOOH!', 'shout', 1, 0.5); } continue; }
    if (o.kind === 'power') {
      if (Math.abs(px - o.x) < 1.1 && dz < 1.1) { o.dead = true; activatePower(o.type); }
      continue;
    }
    if (o.kind === 'schat') { if (Math.abs(px - o.x) < 0.9 && dz < 0.9 && Math.abs(py + 0.9 - o.y) < 1.2) collectSchat(o); continue; }
    if (o.kind === 'kaart') { if (Math.abs(px - o.x) < 1.0 && dz < 1.0) collectKaart(o); continue; }
    if (o.kind === 'fork') continue;
    if (o.kind === 'deco' || o.kind === 'sign' || o.kind === 'landmark') continue;
    // op het moment dat je de deur passeert (niet 'precies raakt': met een trage frame sprong je er soms overheen)
    if (o.kind === 'lkdeur') { if (!o.used && o.z > -0.8) { o.used = true; if (px > LANES[1] + 0.9) { enterLk(); return; } } continue; }
    if (o.kind === 'ingang') { if (!o.used && o.z > -0.8) { o.used = true; if (o.forced || px > LANES[1] + 0.9) { enterSchool(); return; } } continue; }
    if (o.kind === 'checkpoint' || o.kind === 'finish') { storyCollide(o, px, py); if (state !== 'run') return; continue; }
    if (o.kind === 'vrouw') {
      if (Math.abs(px - o.x) > 0.62) continue;
      if (immune) { o.hit = true; knock(o); score += 25; sfx.smash(); continue; }
      if (invulnT > 0) continue;
      const dogZ = o.z + 1.25;
      if (!o.dogHit && Math.abs(dogZ) < 0.6 && py < 0.6) { o.dogHit = true; sfx.blaf(); stumble({ hit: false }); if (state !== 'run') return; }
      if (Math.abs(o.z) < 0.45 && py < 1.5) { o.hit = true; die('gevloerd'); return; }
      if (py > 0.6 && Math.abs(dogZ) < 0.3 && !o.cleared) { o.cleared = true; if (Math.random() < 0.5) goodShout(); }
      continue;
    }
    const ox = Math.abs(px - o.x) < o.w / 2 + 0.22;
    const oz = dz < o.d / 2 + 0.3;
    if (!ox || !oz) continue;
    if (o.kind === 'gat') {
      if (!immune && invulnT <= 0 && py <= 0.02 && dz < o.d / 2 - 0.25 && Math.abs(px - o.x) < o.w / 2 - 0.1) { die('gat'); return; }
      if (!o.cleared && dz < 0.2 && py > 0.02) { o.cleared = true; if (Math.random() < (o.w > 3 ? 0.5 : 0.25)) goodShout(); }
      continue;
    }
    if (immune) {
      if (o.kind === 'afzetting') { o.hit = true; o.fly = { vx: 0, vy: 4, vz: 14, r: 3 }; }
      else { o.hit = true; knock(o); }
      score += 25;
      sfx.smash();
      shakeT = 0.15;
      continue;
    }
    if (invulnT > 0) continue;
    if (o.kind === 'controle') {
      if (!o.hit && top > 1.06 && py < 1.48) { o.hit = true; deathNote = 'Bij de controle vonden ze het spandoek. Jens werd de ArenA uit gezet.'; die('botsing'); return; }
      continue;
    }
    if (o.kickable) { o.hit = true; knock(o); sfx.smash(); onDestroyed(o); continue; }
    if (o.gen) {
      if (!o.cleared && Math.abs(o.z) < 0.2 && py >= o.h - 0.08) { o.cleared = true; if (Math.random() < 0.3) goodShout(); }
      if (py < o.h - 0.08) {
        if (o.gen === 'die') { o.hit = true; deathNote = o.deathText; die('botsing'); return; }
        stumble(o);
        if (state !== 'run') return;
      }
      continue;
    }
    if ((o.kind === 'kliko' || o.kind === 'fietswrak' || o.kind === 'afzetting') && !o.cleared && Math.abs(o.z) < 0.2 && (py >= o.h - 0.08 || (o.kind === 'afzetting' && top <= 1.06))) {
      o.cleared = true;
      if (Math.random() < 0.3) goodShout();
    }
    if (o.kind === 'kliko' || o.kind === 'fietswrak') { if (py < o.h - 0.08) stumble(o); }
    else if (o.kind === 'auto') { if (py < o.h - 0.1) { o.hit = true; die('auto'); return; } }
    else if (o.kind === 'afzetting') { if (top > 1.06 && py < 1.48) { o.hit = true; die('afzetting'); return; } }
  }
}

// MYSTERY KIST: je weet nooit wat erin zit (en dat is precies het leuke)
function mysteryKist() {
  hype('📦 MYSTERY KIST…'); buzz(TRIL.kist);
  for (let i = 0; i < 9; i++) tone(500 + i * 90, 0.05, 'square', 0.05, null, i * 0.09);
  setTimeout(() => {
    if (state !== 'run') return;
    const r = Math.random();
    if (r < 0.04) {
      save.bekers += 500; runBekers += 500; persist();
      hype('💰 JACKPOT!<small>+500 BEKERS</small>', 'mega'); fxFlash('#ffd23f', 0.5); buzz(TRIL.jackpot);
      burst(new THREE.Vector3(player.x, 2, 0), 70, 9, [goldMat, ...sparkMats], 1.4);
      for (let i = 0; i < 12; i++) setTimeout(() => fxDing(), i * 70);
    } else if (r < 0.44) {
      const n = pick([25, 40, 60, 100]);
      save.bekers += n; runBekers += n; persist();
      hype(`🏆 +${n} BEKERS!`, '', 'kaching'); for (let i = 0; i < 5; i++) setTimeout(() => fxDing(), i * 80);
    } else if (r < 0.64) {
      const pts = 1000 * scoreMult(); score += pts;
      hype(`⭐ +${pts.toLocaleString('nl-NL')} PUNTEN!`);
    } else if (r < 0.8) {
      feverT = 8; hype('🔥 KOORTS!<small>8 seconden dubbele punten</small>', 'mega'); fxFlash('#ff8a00', 0.3);
    } else {
      const t = pick(['brommer', 'beker-van-ons', 'sjaal', 'nitraat']);
      activatePower(t);
    }
  }, 950);
}
function activatePower(type) {
  liveEv('power', type);
  if (type === 'kist') { buzz([30, 40, 30]); missionEvent('power'); fxFlash('#b18cff', 0.3); mysteryKist(); return; }
  buzz([30, 40, 30]);
  fxFlash({ brommer: '#5ad1ff', 'beker-van-ons': '#ffd23f', sjaal: '#7dff6a', fiets: '#ff5a3a' }[type] || '#ffffff', 0.28);
  missionEvent('power');
  sfx.power();
  flash(false);
  if (type === 'nitraat2') {
    nitraten += 2;
    hudNitro = -1;
    toast('🧨 +2 NITRATEN', 1);
    return;
  }
  if (type === 'nitraat') {
    nitraten = Math.max(nitraten, 3);
    toast(`🧨 DUM BUM NITRAAT!<small>${matchMedia('(pointer: coarse)').matches ? 'Tik op 🧨' : 'Druk op E'} om er een af te steken</small>`, 2.2);
    goodShout(true);
    return;
  }
  if (type === 'fiets') { startFiets(); goodShout(true); verslaggever('fiets', true); return; }
  if (type === 'sjaal') { sjaalT = SJAAL_TIME; jensSjaal.visible = true; toast('🧣 NEC-SJAAL!<small>Alle bekers komen naar je toe</small>', 1.8); return; }
  if (type === 'brommer') {
    if (fietsT > 0) stopFiets();
    brommerT = BROMMER_TIME;
    moped.visible = true;
    brommerPatrick(true);
    nearT = 0;
    engineStart();
    playVoice('brommer');
    verslaggever('brommer');
    toast('🛵 PATRICK NEEMT JE ACHTEROP!<small>Sneller dan ' + MODES[mode].chaser + ' en onaantastbaar</small>', 1.8);
    goodShout(true);
  } else {
    bekerT = BEKER_TIME;
    vanZ = Math.max(vanZ, 22);
    van.visible = true;
    toast('🏆 DE BEKER IS VAN ONS!<small>Omroep Gelderland komt erbij · 2× punten</small>', 2.2);
    bubble(jens.head, 'DE BEKER IS VAN ONS!', 'shout', 1.6, 0.5);
    if (!playClip('dbivo', true)) speak('Die beker is van ons!');
  }
}

let camShakeV = new THREE.Vector3();
const camPos = new THREE.Vector3(3, 2.2, -5), camLook = new THREE.Vector3(0, 1.1, 1.5);
const camTargetPos = new THREE.Vector3(), camTargetLook = new THREE.Vector3();

function updateCamera(dt) {
  const vanVoren = camera.position.z < -0.5;
  sun.position.z = vanVoren ? -6 : 5;
  lantern.position.set(player.x, 2.6, vanVoren ? -2.6 : 1.2);
  if (state === 'photo') { photoCamera(); return; }
  if (state === 'kamer') { kamerCamera(); return; }
  if (state === 'lkamer') { lkCamera(); return; }
  if (state === 'cutscene' || state === 'aanloop') return;
  if (state === 'replay') return;
  const portrait = camera.aspect < 0.8;
  if (state === 'run' || state === 'paused') {
    const b = brommerT > 0 ? 1 : 0;
    const ride = seg?.active && SEG_DEFS[seg.type].ride, lift = player.y > 3 ? (player.y - 3) * 0.8 : 0;
    if (ride) { camTargetPos.set(player.x * 0.6, player.y + (portrait ? 3.2 : 2.7), portrait ? 5.6 : 4.8); camTargetLook.set(player.x * 0.6, player.y + 0.4, -10); }
    else {
      camTargetPos.set(player.x * 0.5, (portrait ? 5.4 : 4.6) + b * 0.5 + lift, (portrait ? 7.4 : 6.3) + b * 1.2);
      camTargetLook.set(player.x * 0.6, 0.6 + lift, -9);
    }
  } else {
    // vooraanzicht: Jens en de achtervolger
    const wide = camera.aspect > 1.1;
    const px = player.x;
    if (state === 'shop' && shopTab === 'rug') {
      camTargetPos.set(wide ? -0.4 : 0, 1.45, 2.2);
      camTargetLook.set(wide ? -0.4 : 0, portrait ? 0.7 : 1.15, 0);
    } else if (state === 'shop' && shopTab === 'maatje') {
      camTargetPos.set(wide ? 2.4 : 1.6, 1.2, -2.6);
      camTargetLook.set(wide ? 0.5 : 0.9, portrait ? 0.1 : 0.6, -0.6);
    } else if (state === 'shop' && shopTab === 'hand') {
      camTargetPos.set(wide ? 0.05 : -0.3, 1.15, -0.95);
      camTargetLook.set(wide ? 0.15 : -0.3, portrait ? 0.55 : 0.95, 0);
    } else if (state === 'shop') {
      // closeup van het artikel: shirt op borsthoogte, de rest op het hoofd
      const shirt = shopTab === 'shirt';
      const off = wide ? (shirt ? 0.42 : 0.2) : 0;
      const y = shirt ? 1.25 : 1.72;
      camTargetPos.set(off, y + (portrait ? 0.15 : 0.05), shirt ? -1.75 : -0.95);
      camTargetLook.set(off, y - (portrait ? (shirt ? 0.55 : 0.32) : 0), 0);
    } else if (state === 'menu') {
      if (portrait) { camTargetPos.set(px + 0.7, 1.75, -4.7); camTargetLook.set(px + 0.05, 0.62, 1.6); } // mobiel menu: Jens in het midden
      else {
        camTargetPos.set(px + (wide ? 0.5 : 0.8), portrait ? 2.3 : 1.45, portrait ? -4.6 : -3.9);
        camTargetLook.set(px, portrait ? -2.4 : 1.02, 1.6);
      }
    } else if (deathFly) {
      const jp = jens.root.position;
      camTargetPos.set(jp.x + 2.4, jp.y + 1.6, jp.z + 4.6);
      camTargetLook.set(jp.x, jp.y + 0.6, jp.z);
    } else {
      camTargetPos.set(clamp(px + (px > 0.5 ? -2.4 : 2.4), -3, 3), deathReason === 'gat' ? 3.2 : 2.3, -4.8);
      camTargetLook.set(px, deathReason === 'gat' ? 0.0 : 0.9, 1.4);
    }
  }
  const k = state === 'run' ? (introT < 1.2 ? 2.8 : 8) : 2.4;
  camPos.x = damp(camPos.x, camTargetPos.x, k, dt);
  camPos.y = damp(camPos.y, camTargetPos.y, k, dt);
  camPos.z = damp(camPos.z, camTargetPos.z, k, dt);
  camLook.x = damp(camLook.x, camTargetLook.x, k, dt);
  camLook.y = damp(camLook.y, camTargetLook.y, k, dt);
  camLook.z = damp(camLook.z, camTargetLook.z, k, dt);
  camera.position.copy(camPos);
  menuDisc.visible = state === 'menu';
  if (menuDisc.visible) menuDisc.rotation.y += dt * 0.5;
  if (shakeT > 0) {
    shakeT -= dt;
    camShakeV.set(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(shakeT * 0.6);
    camera.position.add(camShakeV);
  }
  camera.lookAt(camLook);
  // heuvel: horizon schuift mee (bergop zie je meer weg, bergaf meer lucht)
  hillTilt = damp(hillTilt, state === 'run' && hill ? hill.dir * 0.09 : 0, 2, dt);
  if (hillTilt) camera.rotateX(-hillTilt);
}

function updateChaser(dt, moving) {
  if (state === 'aanloop') return;
  const c = chaser();
  if (!c) return;
  if (jacht) jachtChaser(c, dt, moving);
  else {
  const target = state === 'dying' ? 0.9 : brommerT > 0 || indoor ? 16 : nearT > 0 ? 1.9 : fietsT > 0 ? 9 : (state === 'run' ? (camera.aspect < 0.8 ? 3.4 : 2.9) : 3.2);
  const k = brommerT > 0 ? 0.8 : state === 'dying' ? 2.2 : 1.6;
  chaseDist = damp(chaseDist, target, k, dt);
  chaseX = damp(chaseX, player.x, state === 'run' ? 3 : 4, dt);
  c.root.position.set(chaseX, 0, chaseDist);
  c.root.visible = !indoor && !seg?.active;
  if (c.label) c.label.visible = state !== 'run' && state !== 'paused' ? state !== 'dying' : introT < 3;
  let kind = 'idle';
  if (c.style === 'bike') kind = moving ? 'bike' : 'bike';
  else if (moving) kind = c.style;
  else if (state === 'dying' || state === 'over') kind = c.style === 'angry' ? 'angry' : 'reach';
  pose(c, kind, dt, moving ? clamp(speed / 12, 0.8, 1.6) : (c.style === 'bike' ? 0.1 : 1));
  if (c.vehicle) for (const w of c.vehicle.userData.wheels) w.rotation.x -= (moving ? speed : 0) * dt / 0.34;
  }

  // Omroep Gelderland: alleen tijdens 'de beker is van ons'. De bus rijdt vóór Jens zodat je
  // hem ook op een smal scherm ziet, de verslaggever en de cameraman rennen vlak naast hem.
  const run = state === 'run' || state === 'paused';
  const omOn = run && !indoor && !seg?.active && bekerT > 0; // alleen bij de power-up 'de beker is van ons'
  const wasOff = omroepK < 0.02;
  omroepK = damp(omroepK, omOn ? 1 : 0, omOn ? 1.8 : 2.6, dt);
  const vanTarget = omOn ? (camera.aspect < 0.8 ? -10 : -7) : 34;
  vanZ = damp(vanZ, vanTarget, 1.1, dt);
  van.visible = vanZ < 30 && run;
  if (player.lane === 2) vanSide = -1;
  else if (player.lane === 0) vanSide = 1;
  van.position.set(damp(van.position.x, vanSide * 3.5, 2, dt), 0, vanZ);
  const omZie = omroepK > 0.03 && run;
  omReporter.root.visible = omCamera.root.visible = omZie;
  if (omZie) {
    if (player.lane === 2) omroepSide = -1; else if (player.lane === 0) omroepSide = 1;
    const narrow = camera.aspect < 0.8, inv = 1 - omroepK;
    const rx = player.x + omroepSide * (narrow ? 0.95 : 1.15), cx = player.x + omroepSide * (narrow ? 1.75 : 2.3);
    omReporter.root.position.set(wasOff ? rx : damp(omReporter.root.position.x, rx, 4, dt), 0, 0.75 + inv * 8);
    omCamera.root.position.set(wasOff ? cx : damp(omCamera.root.position.x, cx, 3.2, dt), 0, 1.5 + inv * 9);
    omReporter.root.rotation.y = -omroepSide * 0.5; // draait naar Jens toe, microfoon vooruit
    pose(omReporter, 'point', dt, clamp(speed / 12, 0.8, 1.6));
    pose(omCamera, 'camrun', dt, clamp(speed / 12, 0.8, 1.6));
    if (omOn && state === 'run' && (omroepSay -= dt) <= 0) { omroepSay = 2.6; bubble(omReporter.head, pick(OM_LINES), 'shout', 2.1, 0.5); }
  }
  for (const o of van.children) if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.position.y < 0.5) o.rotation.x -= (state === 'run' ? speed : 0) * dt / 0.38;
  pose(cameraman, 'cam', dt);
}

// ---------- XP-balk: de eerste levels gaan razendsnel, daarna steeds langer ----------
const xpNeed = (l) => Math.round(150 * Math.pow(l, 1.6));
let xpScore = 0, nextMicro = 100, bekerRun = 0, bekerRunT = 0, speedTier = 0;
const SPEED_TIERS = [17, 20, 23, 26, 29];
function gainXp(n) {
  save.lvl ||= 1; save.xp = (save.xp || 0) + n;
  let up = false;
  while (save.xp >= xpNeed(save.lvl)) { save.xp -= xpNeed(save.lvl); save.lvl++; up = true; }
  if (up) {
    const bonus = 20 + save.lvl * 10;
    save.bekers += bonus; runBekers += bonus;
    hype(`⭐ LEVEL ${save.lvl}!<small>+${bonus} bekers</small>`, 'mega', 'level'); buzz(TRIL.level);
    fxFlash('#7dff6a', 0.3);
    persist();
  }
  $('#xpLv').textContent = 'LV ' + save.lvl;
  const pct = Math.min(100, (save.xp / xpNeed(save.lvl)) * 100);
  $('#xpFill').style.width = pct + '%';
  $('#xpFill').parentElement.classList.toggle('bijna', pct > 85);
}
function earlyHooks(dt) {
  if (curLevel) return;
  // XP komt uit je punten
  if (score > xpScore) { gainXp(Math.floor(score - xpScore)); xpScore = Math.floor(score); }
  // elke 100 meter een klein beloninkje, na 1000 m elke 500 meter
  if (dist > nextMicro) {
    const mr = $('#score').getBoundingClientRect();
    popAt(`${nextMicro} M ✓`, mr.left + 60, mr.top + mr.height / 2, 'good small'); jingle.drum(); fxDing();
    score += 25 * scoreMult(); nextMicro += nextMicro < 1000 ? 100 : 500;
  }
  // sneller: per snelheidstrap een melding
  if (speedTier < SPEED_TIERS.length && baseSpeed > SPEED_TIERS[speedTier]) { speedTier++; hype('⚡ SNELLER!', '', 'riser'); fxFlash('#5ad1ff', 0.15); buzz(TRIL.sneller); }
  bekerRunT -= dt;
}
function updateRun(dt) {
  earlyHooks(dt);
  if (!renHype) { renHype = true; if (!curLevel) { hype('REN, JENS!'); fxFlash('#ffffff', 0.25); } }
  introT += dt;
  runTime += dt;
  if (shoutCool > 0) shoutCool -= dt;
  if (dist > nextMilestone) {
    if (nextMilestone % 1000 === 0) hype(`${nextMilestone.toLocaleString('nl-NL')} METER!`, nextMilestone % 5000 === 0 ? 'mega' : ''); else toast(`${nextMilestone} m!`, 1.2);
    if (nextMilestone % 1000 === 0) { verslaggever('meter'); liveEv('meter', nextMilestone); }
    nextMilestone += 500;
    goodShout(true);
  }
  if (!bestPassed && save.best[mode] > 200 && score > save.best[mode]) {
    bestPassed = true;
    hype('🏅 NIEUW RECORD!', 'mega'); fxFlash('#ffd23f', 0.3); buzz(TRIL.record);
    liveEv('record');
    verslaggever('record', true);
    goodShout(true);
  }
  // endless: de eerste 30 seconden hard optrekken (zo zit je er meteen in), daarna rustig verder
  if (baseSpeed < (curLevel ? curLevel.maxSpeed : 30)) baseSpeed += dt * (!curLevel && runTime < 30 ? 0.33 : baseSpeed < 17 ? 0.3 : 0.12);
  // fiets: 2x zo snel aan het begin, maar later nooit meer dan ~30 (of 15% boven lopen)
  const fietsMul = jacht ? baseSpeed * 1.3 : Math.max(baseSpeed * 1.15, Math.min(baseSpeed * 2, 30)); // in de jacht is de fiets geen ontsnapping
  const target = (brommerT > 0 ? baseSpeed * 1.55 : fietsT > 0 ? fietsMul : baseSpeed) * hillSpeed() * (seg?.active ? SEG_DEFS[seg.type].mul : 1) * jachtMul();
  speed = damp(speed, target, introT < 1 ? 2.5 : 4, dt);
  const m = speed * dt;
  dist += m;
  score += m * (bekerT > 0 ? 2 : 1) * scoreMult() * comboMult();
  missionEvent('score', 0, score); missionEvent('dist', 0, dist);

  // speler
  if (sticker.t > 0) sticker.t -= dt;
  if (player.dubbelCD > 0) player.dubbelCD -= dt;
  const cdEl = $('#dubbelCD'), cdTxt = save.eq.skill === 'dubbel' && player.dubbelCD > 0 ? `🦘 ${Math.ceil(player.dubbelCD)}s` : '';
  if (cdEl.textContent !== cdTxt) { cdEl.textContent = cdTxt; cdEl.classList.toggle('hidden', !cdTxt); }
  player.x = damp(player.x, sticker.t > 0 ? sticker.side * 3.45 : LANES[player.lane], laneGrip(), dt);
  if (!player.grounded) {
    player.vy -= 26 * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) {
      player.y = 0; player.vy = 0; player.grounded = true; player.usedDouble = false;
      if (player.slideQueued) { player.slideT = 0.75; player.slideQueued = false; sfx.slide(); }
    }
  }
  segPlayer();
  if (player.slideT > 0) player.slideT -= dt;
  jens.root.position.set(player.x, player.y, 0);
  jens.root.rotation.z = damp(jens.root.rotation.z, (LANES[player.lane] - player.x) * -0.12, 10, dt);

  if (jacht?.rol === 'shane') {
    // Jens wordt in updateJacht neergezet, op de plek van de echte Jens
  } else if (seg?.active && seg.type !== 'kermis') {
    pose(jens, seg.type === 'waal' ? 'swim' : seg.type === 'achtbaan' ? 'sit' : 'slide', dt);
  } else if (brommerT > 0) {
    brommerT -= dt / (runUp.brommer ? 1.7 : 1);
    pose(jens, 'sit', dt);
    updatePatrickRijder(dt);
    for (const w of moped.userData.wheels) w.rotation.x -= m / 0.3;
    if (brommerT <= 0) {
      moped.visible = false;
      invulnT = 1.2;
      engineStop();
      bubble(jens.head, 'Hè, op!', 'shout', 1, 0.5);
    }
  } else if (fietsT > 0 || indoor) {
    pose(jens, fietsT > 0 ? 'bikefilm' : 'bike', dt, clamp(speed / 12, 0.9, 1.7));
    for (const w of jensBike.userData.wheels) w.rotation.x -= m / 0.34;
    if (fietsT > 0) {
      fietsT -= dt;
      if (fietsT <= 0) { stopFiets(); invulnT = Math.max(invulnT, 1.2); bubble(jens.head, 'Klaar met fietsen!', 'shout', 1, 0.5); }
    }
  } else {
    pose(jens, player.slideT > 0 ? 'slide' : !player.grounded ? 'jump' : sticker.t > 0 ? 'reach' : mode === 'telefoon' ? 'phone' : 'run', dt, clamp(speed / 12, 0.9, 1.7));
  }
  if (bekerT > 0) bekerT -= dt;
  if (invulnT > 0) invulnT -= dt / (runUp.brommer ? 2.5 : 1);
  updateUpgrades(dt);
  if (nearT > 0) nearT -= dt;
  jens.root.visible = invulnT > 0 && brommerT <= 0 && fietsT <= 0 ? Math.floor(now() * 14) % 2 === 0 : true;

  // achtervolger roept dingen
  lineT -= dt;
  if (lineT <= 0 && brommerT <= 0 && !indoor) {
    lineT = mode === 'telefoon' ? rand(40, 60) : rand(9, 15); // Shane zegt alleen af en toe iets als er niks gebeurt
    chaserSay(mode === 'telefoon' ? shaneLine() : pick(MODES[mode].lines), mode === 'terror' ? 'angry' : '', 1.6);
    if (mode === 'fiets' && Math.random() < 0.6) sfx.bel();
    if (mode === 'telefoon' && Math.random() < 0.5 && !voiceSrc) sfx.ring();
    if (mode === 'school' && Math.random() < 0.3) bubble(jens.head, pick(['Ik was het niet!', 'Het was een ongelukje!']), '', 1.4, 0.5);
  }
  if (bekerT > 0 && Math.random() < dt * 0.15) bubble(cameraman.head, pick(['Live vanaf Nijmegen-Oost!', 'Jens, een reactie?', 'Daar gaat hij!']), '', 1.6);

  if (curLevel) storyUpdate(dt);
  updateSchool(dt, m);
  updateBos();
  if (telefoon2At > 0 && runTime > telefoon2At && !voiceSrc) { telefoon2At = -1; playVoice('telefoon2'); }
  // wereld
  moveWorld(m, dt);
  updateExtras3(dt, m);
  updateRocket(dt, m);
  updateShots(dt);
  updateParticles(dt, m);
  updateFireworks(dt, m);
  spawnZ += m;
  while (spawnZ > -100) seeded('r' + ++rowN, () => { spawnRow(spawnZ); spawnZ -= gapFor(); });
  collide();
}

var deathFly = null, bikeFly = null, snapDeath = null; // var: resetRun kan dit al eerder gebruiken
function updateDying(dt) {
  deathT += dt;
  recordReplay(dt);
  speed = damp(speed, 0, 5, dt);
  moveWorld(speed * dt, dt);
  if (snapDeath) snapDeath.t += dt;
  if (deathReason === 'jacht') {
    if (jacht?.rol !== 'shane') pose(jens, 'idle', dt);
    if (deathT > 1.8) finishRun();
    return;
  }
  if (deathFly) {
    const f = deathFly, r = jens.root;
    f.v.y -= 22 * dt;
    r.position.addScaledVector(f.v, dt);
    r.rotation.x += f.spin * dt; r.rotation.z += f.spin * 0.35 * dt;
    if (r.position.y < 0) {
      r.position.y = 0; f.v.y *= -0.3; f.v.x *= 0.5; f.v.z *= 0.45; f.spin *= 0.4;
      if (!f.landed) { f.landed = true; shakeT = 0.4; sfx.stumble(); buzz(80); burst(r.position.clone().setY(0.2), 20, 4, fireMats.slice(4), 0.8); }
    }
    pose(jens, 'grabbed', dt);
    if (bikeFly) {
      const b = bikeFly;
      b.v.y -= 22 * dt; jensBike.position.addScaledVector(b.v, dt);
      jensBike.rotation.z += b.spin * dt; jensBike.rotation.y += b.spin * 0.5 * dt;
      if (jensBike.position.y < 0) { jensBike.position.y = 0; b.v.multiplyScalar(0.4); b.v.y = Math.abs(b.v.y); b.spin *= 0.5; }
    }
    jens.root.visible = true;
    if (deathT > 3) finishRun();
    return;
  }
  if (deathReason === 'gat') {
    player.y = damp(player.y, -2.2, 3, dt);
    jens.root.position.y = player.y;
    jens.root.rotation.z += dt * 2;
    pose(jens, 'grabbed', dt);
  } else if (deathReason === 'gepakt') {
    jens.root.position.y = 0;
    pose(jens, 'grabbed', dt);
  } else if (deathReason === 'gevloerd') {
    jens.root.position.y = Math.max(0, jens.root.position.y - dt * 4);
    jens.root.rotation.x = damp(jens.root.rotation.x, -1.45, 6, dt);
    pose(jens, 'idle', dt);
  } else {
    jens.root.position.y = Math.max(0, jens.root.position.y - dt * 4);
    jens.root.rotation.x = damp(jens.root.rotation.x, 1.45, 6, dt);
    pose(jens, 'idle', dt);
  }
  jens.root.visible = true;
  if (deathT > 2.2) finishRun();
}

let fps30 = isIPod; // iPod: 30 beelden per seconde, dan blijft hij koel en soepel
let last = performance.now(), slowT = 0, fastT = 0, frameAvg = 16.7;
// automatisch zwaarder of lichter tekenen op basis van hoe soepel het loopt
// te traag? Is de processor de rem, dan helpt alleen minder beelden (30 per seconde, net als op de PS1);
// anders eerst de resolutie omlaag.
let workAvg = 0;
function autoQuality(ms) {
  if (save.set.quality !== 'auto' || state !== 'run') return;
  frameAvg = frameAvg * 0.95 + ms * 0.05;
  const traag = fps30 ? 42 : 22;
  if (frameAvg > traag) { slowT += ms; fastT = 0; } else if (frameAvg < 15) { fastT += ms; slowT = 0; } else { slowT = 0; fastT = 0; }
  if (slowT > 1500) {
    slowT = 0; frameAvg = fps30 ? 33 : 16.7;
    if (!fps30 && (workAvg > 9 || autoIdx === 0)) fps30 = true;
    else if (autoIdx > 0) { autoIdx--; applyRes(); }
  }
  if (fastT > 8000 && autoIdx < AUTO_STEPS.length - 1) { autoIdx++; fastT = 0; applyRes(); }
}
function applyRes() { PSX_RES = AUTO_STEPS[autoIdx]; lowFx = autoIdx <= 1; resize(); }
// meten (alleen aan via window.__perf.on, voor de benchmark)
const PERF = window.__perf = { on: false, upd: 0, rend: 0, post: 0, n: 0, long: 0, calls: 0, tris: 0 };
renderer.setAnimationLoop(() => {
  if (newsJob) { newsStep(); return; } // NijmegenActueel-filmpje wordt gemaakt
  const t = performance.now();
  // stroom sparen: hooguit 60 beelden per seconde tijdens het rennen, 30 in menu's
  const cap = (state === 'run' || state === 'mini' || state === 'aanloop' || state === 'dying' || state === 'replay' || state === 'photo' || state === 'cutscene') && !fps30 ? 1000 / 60 : 1000 / 30;
  if (t - last < cap - 2) return;
  autoQuality(t - last);
  let dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  if (slomoCD > 0) slomoCD -= dt;
  if (slomoT > 0) { slomoT -= dt; if (state === 'run') dt *= 0.28; }
  document.body.classList.toggle('slomo', slomoT > 0 && state === 'run');
  const p0 = PERF.on ? performance.now() : 0;
  if (state === 'run') updateRun(dt);
  else if (state === 'aanloop') updateAanloop(dt);
  else if (state === 'dying') updateDying(dt);
  else if (state === 'replay') updateReplay(dt);
  else if (state === 'kamer') updateOsso(dt);
  else if (state === 'mini') updateMini(dt);
  else if (state === 'cutscene') updateCut(dt);
  else if (state === 'menu' || state === 'shop' || state === 'over') {
    if (state !== 'over') {
      pose(jens, mode === 'telefoon' ? 'phoneIdle' : 'idle', dt);
      jens.root.position.set(0, 0, 0);
      jens.root.rotation.set(0, 0, 0);
      kamer.visible = false;
    } else pose(jens, deathReason === 'gat' || deathReason === 'gepakt' ? 'grabbed' : 'idle', dt);
    moveWorld(0, dt);
  }
  if (state !== 'paused') {
    updateChaser(dt, state === 'run');
  }
  updateLiveLoop(dt);
  updateCamera(dt);
  if ((hudTick += dt) >= 0.1) { hudTick = 0; updateHud(); }
  updateMusic(dt);
  pollPad();
  checkAch();
  updateBatches();
  freeTick();
  const p1 = PERF.on ? performance.now() : 0;
  if (state === 'mini' && mini.scene) renderer.render(mini.scene, mini.cam); else renderer.render(scene, camera);
  workAvg = workAvg * 0.95 + (performance.now() - t) * 0.05;
  const p2 = PERF.on ? performance.now() : 0;
  if (photo.take) { photo.take = false; takePhotoNow(); }
  renderSnap();
  updateBubbles();
  if (PERF.on) { const p3 = performance.now(); PERF.upd += p1 - p0; PERF.rend += p2 - p1; PERF.post += p3 - p2; PERF.n++; if (p3 - p0 > 16) PERF.long++; const mt = renderer.info.memory.textures, mg = renderer.info.memory.geometries; if (p3 - p0 > 40) (PERF.slow ||= []).push([Math.round(p1 - p0), Math.round(p2 - p1), Math.round(p3 - p2), renderer.info.programs.length, mt - (PERF.mt || mt), mg - (PERF.mg || mg)]); PERF.mt = mt; PERF.mg = mg; PERF.calls += renderer.info.render.calls; PERF.tris += renderer.info.render.triangles; }
});

// =====================================================================
//  UI
// =====================================================================
let curScreen = null;
function showScreen(sel) {
  if (newsJob && sel !== '#over') newsCancel();
  curScreen = sel;
  for (const s of ['#start', '#menu', '#shop', '#over', '#pause', '#board', '#levels', '#lvldone', '#fame', '#install', '#profile', '#settings', '#awards', '#weekly', '#plakboek', '#kamer', '#social', '#account', '#pass', '#krant', '#mini', '#miniOver', '#arcade', '#lkamer']) $(s).classList.toggle('hidden', s !== sel);
  for (const f of ['#fmModes', '#fmArt', '#fmLive']) $(f).classList.add('hidden');
  if (sel === '#menu') { renderWall(); renderFm(); }
  glasSluit(true);
  if (sel === '#menu') { $('#mMore').classList.add('hidden'); $('#xPop').classList.add('hidden'); $('#menuBekers').textContent = $('#mBekers').textContent = save.bekers.toLocaleString('nl-NL'); $('#mMult').textContent = `×${save.mult}`; $('#fmBell').dataset.n = $('#mBell').dataset.n = $('#socialBtn').dataset.n || ''; renderModes(); renderMissions(); renderFeesten(); renderChallenge(); }
  if (sel === '#over') renderMissions('#overMissions');
}
const MODE_IMG = (k) => `img/mode/${k}.jpg`;
function renderModes() {
  const el = $('#modes');
  el.innerHTML = Object.entries(MODES).filter(([, m]) => !m.hidden).map(([k, m]) => modeOpen(k)
    ? `<button class="mode ${k === mode ? 'sel' : ''}" data-mode="${k}"><span class="ic" style="background-image:url(${MODE_IMG(k)})"></span><span class="mode-t"><b>${m.label}</b><small class="desc">${m.desc || ''}</small><small class="best">🏅 Record ${(save.best[k] || 0).toLocaleString('nl-NL')}</small></span></button>`
    : `<button class="mode locked" data-mode="${k}"><span class="ic">🔒</span><span class="mode-t"><b>${m.label}</b><small>${(MODE_UNLOCK[k] / 1000).toLocaleString('nl-NL')}k in 1 run</small></span></button>`).join('');
  const m = MODES[mode];
  if (!m) return;
  $('#fmModeName').textContent = m.label;
  $('#fmModeImg').style.backgroundImage = `url(${MODE_IMG(mode)})`;
}
// ---------- hoofdmenu: seizoen linksboven, nieuws rechts, zwevende vensters ----------
const FM_NEWS_BASIS = [{ id: 'v2', title: 'Jens Run 2.0 is er!', body: 'Echte PS1-graphics, de KNVB-beker om te verzamelen, Asbest-modus, de lerarenkamer, nieuwe spullen voor De Hub en Omroep Gelderland die je overal achterna rent.\n\nVeel plezier en laat je niet pakken.', img: 'icons/icon-512.png' }];
let fmNews = FM_NEWS_BASIS, fmNewsI = 0, fmNewsT = null;
function renderFm() {
  const p = passState(), lvl = Math.min(PASS_TIERS, Math.floor(p.xp / PASS_XP));
  const open = Array.from({ length: lvl }, (_, i) => i).filter((i) => !p.claimed[i]).length;
  $('#fmSeasonH').textContent = `Seizoen ${new Date().toLocaleString('nl-NL', { month: 'long' })}`;
  $('#fmSeasonLv').textContent = `TREDE ${lvl}`;
  $('#fmSeasonBar').style.width = `${lvl >= PASS_TIERS ? 100 : ((p.xp % PASS_XP) / PASS_XP) * 100}%`;
  const cta = $('#fmSeasonCta');
  cta.textContent = open ? `${open} BELONING${open > 1 ? 'EN' : ''} KLAAR` : lvl >= PASS_TIERS ? 'Hele pas gehaald' : `Nog ${PASS_XP - (p.xp % PASS_XP)} XP tot trede ${lvl + 1}`;
  cta.classList.toggle('claim', !!open);
  renderFmNews();
  loadNews();
}
function renderFmNews() {
  const el = $('#fmNews'), n = fmNews[fmNewsI % fmNews.length];
  el.innerHTML = '';
  const card = document.createElement('button');
  card.className = 'fm-ncard';
  card.style.backgroundImage = n.img ? `url("${n.img}")` : '';
  card.style.setProperty('--nimg', n.img ? `url("${n.img}")` : 'none');
  const t = document.createElement('span'); t.textContent = n.title; card.append(t);
  card.addEventListener('click', () => openArticle(n));
  el.append(card);
  if (fmNews.length > 1) {
    const dots = document.createElement('div'); dots.className = 'fm-ndots';
    fmNews.forEach((_, i) => { const d = document.createElement('i'); if (i === fmNewsI % fmNews.length) d.className = 'on'; d.addEventListener('click', () => { fmNewsI = i; renderFmNews(); }); dots.append(d); });
    el.append(dots);
  }
  clearTimeout(fmNewsT);
  if (fmNews.length > 1) fmNewsT = setTimeout(() => { if (curScreen === '#menu') { fmNewsI++; renderFmNews(); } }, 7000);
}
function openArticle(n) {
  audioInit();
  $('#fmArtH').textContent = n.title;
  const im = $('#fmArtImg');
  if (n.img) im.src = n.img; else im.removeAttribute('src');
  $('#fmArtBody').textContent = n.body || '';
  $('#fmArtFoot').textContent = n.until ? `Staat hier nog tot ${new Date(n.until).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : '';
  $('#fmArt').classList.remove('hidden');
}
let newsLoaded = 0;
async function loadNews() {
  if (Date.now() - newsLoaded < 120000) return;
  newsLoaded = Date.now();
  try {
    const r = await fetch('/api/news').then((x) => x.json());
    const items = (r.items || []).filter((n) => n && n.title);
    fmNews = items.length ? items : FM_NEWS_BASIS;
    fmNewsI = 0;
    if (curScreen === '#menu') renderFmNews();
  } catch (e) { /* offline: de ingebouwde blijft staan */ }
}
// Spel kiezen in het glazen menu; de oude knoppen doen het echte werk.
setTimeout(() => Object.keys(MODES).forEach((k) => { if (!MODES[k].hidden) glasVoorlaad(MODE_IMG(k)); }), 2500);
function modeRows() {
  renderModes();
  const rows = Object.entries(MODES).filter(([, m]) => !m.hidden).map(([k, m]) => (modeOpen(k)
    ? { title: m.label, img: MODE_IMG(k), checked: k === mode, run: () => $(`#modes [data-mode="${k}"]`).click() }
    : { title: m.label, icon: '🔒', subtitle: `${(MODE_UNLOCK[k] / 1000).toLocaleString('nl-NL')}k in 1 run`, checked: false, disabled: true }));
  return [...rows, { separator: true },
    { title: 'Verhaal', icon: '📖', run: () => $('#storyBtn').click() },
    { title: 'Samen spelen', icon: '👥', run: () => $('#samenBtn').click() },
    { title: 'Shane jaagt', icon: '📱', subtitle: '1 tegen 1 online', run: () => quickPlay(null, true) },
    { title: 'Weekuitdaging', icon: '🗓️', run: () => $('#wkBtn').click() }];
}
$('#fmMode').addEventListener('click', (e) => {
  audioInit();
  if (glasMenu(e.currentTarget, modeRows())) return;
  renderModes();
  $('#fmModes').classList.remove('hidden');
});
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden'));
for (const f of ['#fmModes', '#fmArt']) $(f).addEventListener('click', (e) => { if (e.target.id === f.slice(1)) e.currentTarget.classList.add('hidden'); });
$('#modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  audioInit();
  if (!modeOpen(b.dataset.mode)) { note(`🔒 Haal ${MODE_UNLOCK[b.dataset.mode].toLocaleString('nl-NL')} punten in één run om ${MODES[b.dataset.mode].label} vrij te spelen`); tone(180, 0.15, 'square', 0.06); return; }
  setMode(b.dataset.mode);
  $('#fmModes').classList.add('hidden');
  if (MODES[mode].mini) { sfx.power(); return; }
  chaserSay(mode === 'telefoon' ? shaneLine() : MODES[mode].lines[0], mode === 'terror' ? 'angry' : '', 1.6);
  if (mode === 'fiets') sfx.bel(); else if (mode === 'telefoon') sfx.ring(); else sfx.toet();
});
$('#playBtn').addEventListener('click', () => { weekly = null; startRun(); });
$('#againBtn').addEventListener('click', startRun);
$('#overMenu').addEventListener('click', toMenu);
$('#quitBtn').addEventListener('click', () => { if (curLevel) { openLevels(); return; } resetRun(); toMenu(); });
$('#resumeBtn').addEventListener('click', resumeGame);
const vibeLabel = () => { $('#vibeBtn').textContent = save.vibe ? '📳 Trillen: aan' : '📴 Trillen: uit'; };
$('#vibeBtn').addEventListener('click', () => { save.vibe = !save.vibe; persist(); vibeLabel(); buzz(40); });
vibeLabel();
if (!navigator.vibrate) $('#vibeBtn').classList.add('hidden');
$('#pauseBtn').addEventListener('click', () => { if (state === 'run') pauseGame(); });
function toMenu() {
  stopGameover();
  jachtStop();
  mapSeed = 0;
  if (live?.quick) liveClose();
  else if (live && !live.started) { /* in de lobby blijven mag */ } else if (live) live.started = false;
  weekly = null;
  if (curLevel) leaveStory();
  resetRun();
  state = 'menu';
  $('#hud').classList.add('hidden');
  showScreen('#menu');
}

// ---------- winkel ----------
let shopTab = 'shout';
const shopSel = {};
function openShop() {
  audioInit();
  stopGameover();
  const wasOver = state === 'over';
  resetRun();
  state = 'shop';
  $('#hud').classList.add('hidden');
  if (wasOver) jens.root.rotation.set(0, 0, 0);
  for (const k of Object.keys(SHOP)) shopSel[k] = save.eq[k];
  showScreen('#shop');
  renderShop();
}
$('#shopBtn').addEventListener('click', openShop);
$('#overShop').addEventListener('click', openShop);
$('#shopBack').addEventListener('click', () => { applyOutfit(); toMenu(); });
function previewOutfit() {
  applyOutfit({ ...save.eq, [shopTab]: shopSel[shopTab] });
}
function renderShop() {
  $('#shopBekers').textContent = save.bekers.toLocaleString('nl-NL');
  $('#tabs').innerHTML = Object.entries(SHOP).map(([k, s]) => `<button class="tab ${k === shopTab ? 'sel' : ''}" data-tab="${k}">${s.label}</button>`).join('');
  $('#items').innerHTML = SHOP[shopTab].items.map((it) => {
    const own = owns(shopTab, it.id), eq = save.eq[shopTab] === it.id, sel = shopSel[shopTab] === it.id;
    const status = eq ? '✓ Aan' : own ? 'Gekocht' : `🏆 ${it.price.toLocaleString('nl-NL')}`;
    return `<button class="item ${own ? 'owned' : ''} ${eq ? 'eq' : ''} ${sel ? 'sel' : ''} ${!own && save.bekers < it.price ? 'cant' : ''}" data-id="${it.id}"><b>${it.name}</b><small>${status}</small></button>`;
  }).join('');
  const it = SHOP[shopTab].items.find((i) => i.id === shopSel[shopTab]);
  const own = owns(shopTab, it.id), eq = save.eq[shopTab] === it.id;
  $('#siName').textContent = it.name;
  const btn = $('#siBtn');
  btn.disabled = false;
  btn.classList.remove('buy');
  if (eq) { btn.textContent = '✓ In gebruik'; btn.disabled = true; $('#siStatus').textContent = 'Dit heb je aan.'; }
  else if (own) { btn.textContent = 'Aantrekken'; $('#siStatus').textContent = 'Al gekocht.'; }
  else if (it.price >= 99999) { btn.textContent = it.pass ? '🔒 Seizoenspas' : '🔒 Plakboek'; btn.disabled = true; $('#siStatus').textContent = it.pass ? 'Te verdienen met de seizoenspas (🎟️ in het menu).' : 'Alleen te verdienen door het plakboek vol te maken.'; }
  else if (save.bekers >= it.price) { btn.textContent = `Kopen · 🏆 ${it.price.toLocaleString('nl-NL')}`; btn.classList.add('buy'); $('#siStatus').textContent = 'Je hebt genoeg bekers.'; }
  else { btn.textContent = `🏆 ${it.price.toLocaleString('nl-NL')}`; btn.disabled = true; $('#siStatus').textContent = `Je mist nog ${(it.price - save.bekers).toLocaleString('nl-NL')} bekers.`; }
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  shopTab = b.dataset.tab;
  applyOutfit();
  previewOutfit();
  renderShop();
});
$('#items').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  const it = SHOP[shopTab].items.find((i) => i.id === b.dataset.id);
  shopSel[shopTab] = it.id;
  previewOutfit();
  if (shopTab === 'shout') { lastSpeak = 0; singBusyUntil = 0; shout(it, true); }
  else { jens.root.position.y = 0; tone(660, 0.06, 'square', 0.05); }
  renderShop();
});
$('#siBtn').addEventListener('click', () => {
  const it = SHOP[shopTab].items.find((i) => i.id === shopSel[shopTab]);
  if (!owns(shopTab, it.id)) {
    if (save.bekers < it.price) return;
    save.bekers -= it.price;
    save.owned[shopTab + ':' + it.id] = true;
    sfx.power();
    bubble(jens.head, pick(['Strak!', 'Lekker man', 'Dit is hem', 'Zo ga ik de stad in']), '', 1.2, 0.5);
  } else sfx.beker();
  save.eq[shopTab] = it.id;
  persist();
  applyOutfit();
  renderShop();
});

// ---------- ranglijst ----------
async function apiCall(path, data) {
  const r = await fetch(path, data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {});
  let j = {};
  try { j = await r.json(); } catch (e) { /* leeg */ }
  return { status: r.status, ok: r.ok, ...j };
}
function forgetName() { save.name = null; persist(); }
async function register(name) {
  const r = await apiCall('/api/register', { id: save.playerId, name });
  if (!r.ok) throw new Error(r.error || 'Er ging iets mis, probeer opnieuw.');
  save.name = r.name;
  persist();
}
async function submitScore(run) {
  const el = $('#overRank');
  try {
    const r = await apiCall('/api/score', { id: save.playerId, ...run });
    if (r.status === 404) {
      // naam is door de beheerder verwijderd
      forgetName();
      if (state === 'over') { $('#overName').classList.remove('hidden'); $('#overName .err').textContent = ''; }
      return;
    }
    if (r.ok && state === 'over' && lastRun === run) {
      el.textContent = r.rank ? `#${r.rank} op de ranglijst als ${save.name}` : `Opgeslagen als ${save.name}`;
      if (r.rank === 1) { $('#wallForm').classList.remove('hidden'); $('#wallForm .err').textContent = ''; }
      el.classList.remove('hidden');
      syncProfile();
    }
  } catch (e) { /* offline */ }
}
function bindNameForm(sel, after) {
  $(sel).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $(sel + ' input'), err = $(sel + ' .err'), btn = $(sel + ' button');
    err.textContent = '';
    btn.disabled = true;
    try {
      await register(input.value);
      $(sel).classList.add('hidden');
      after();
    } catch (ex) { err.textContent = ex.message; }
    btn.disabled = false;
  });
}
bindNameForm('#overName', () => { if (lastRun) submitScore(lastRun); });
bindNameForm('#boardName', () => renderBoard());

let boardMode = mode;
async function renderBoard() {
  $('#boardTabs').innerHTML = Object.entries(MODES).filter(([k, m]) => !m.hidden || k === 'bazen').map(([k, m]) => `<button class="tab ${k === boardMode ? 'sel' : ''}" data-bmode="${k}">${m.icon} ${m.label}</button>`).join('');
  $('#boardPick').innerHTML = `<span>${MODES[boardMode]?.icon || ''} ${MODES[boardMode]?.label || ''}</span>`;
  $('#boardMe').textContent = save.name ? '👤 ' + save.name : '';
  $('#boardName').classList.toggle('hidden', !!save.name);
  const list = $('#boardList');
  list.innerHTML = '<li class="empty">Laden…</li>';
  const want = boardMode;
  try {
    const r = await apiCall('/api/leaderboard?mode=' + want);
    if (want !== boardMode) return;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    list.innerHTML = r.rows?.length
      ? r.rows.map((row, i) => `<li data-name="${esc(row.name)}" class="click ${row.name === save.name ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="nm">${esc(row.name)}</span><span class="sc">${row.score.toLocaleString('nl-NL')}</span></li>`).join('')
      : '<li class="empty">Nog niemand. Wordt de eerste!</li>';
  } catch (e) { list.innerHTML = '<li class="empty">Kan de ranglijst niet laden.</li>'; }
}
$('#boardPick').addEventListener('click', (e) => {
  glasMenu(e.currentTarget, Object.entries(MODES).filter(([k, m]) => !m.hidden || k === 'bazen').map(([k, m]) => ({
    title: m.label, icon: m.icon, checked: k === boardMode, run: () => { boardMode = k; renderBoard(); },
  })));
});
$('#boardTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bmode]');
  if (b) { boardMode = b.dataset.bmode; renderBoard(); }
});
$('#boardBtn').addEventListener('click', () => { boardMode = mode; showScreen('#board'); renderBoard(); });
$('#boardBack').addEventListener('click', () => showScreen('#menu'));
// controleer of onze naam nog bestaat
// naam ophalen: de beheerder kan een naam hebben aangepast
if (save.name) apiCall('/api/me?id=' + save.playerId).then((r) => { if (r.status === 404) forgetName(); else if (r.ok && r.name && r.name !== save.name) { save.name = r.name; persist(); } }).catch(() => {});
persist();

// =====================================================================
//  VERHAALMODUS: Nijmegen terroriseren, wijk voor wijk
// =====================================================================

// ---------- gevels per wijktype ----------
const facadeSets = {};
function makeFacadeMat(draw) {
  const glow = document.createElement('canvas'); glow.width = 64; glow.height = 80;
  const gx = glow.getContext('2d'); gx.scale(0.25, 0.25); gx.fillStyle = '#000'; gx.fillRect(0, 0, 256, 320);
  const lightWin = (wx, wy, ww, wh, p = 0.6) => {
    if (Math.random() > p) return;
    const lg = gx.createLinearGradient(wx, wy, wx, wy + wh);
    lg.addColorStop(0, pick(['#ffd27a', '#ffe7b0', '#ffb860', '#c9e2ff'])); lg.addColorStop(1, '#9a6a2a');
    gx.fillStyle = lg; gx.fillRect(wx, wy, ww, wh);
  };
  const map = canvasTex(256, 320, (x) => { draw(x, lightWin); grain(x, 256, 320, 12); });
  const m = new THREE.MeshLambertMaterial({ map, emissiveMap: psxTex(new THREE.CanvasTexture(glow)), emissive: '#ffffff', emissiveIntensity: night ? 0.9 : 0 });
  m.defines = { PSX_PERSP: '' };
  allFacadeMats.push(m);
  return m;
}
function glassWin(x, wx, wy, ww, wh, frame = '#f4f1ea') {
  x.fillStyle = frame; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
  const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
  g.addColorStop(0, '#5b7590'); g.addColorStop(0.5, '#33465a'); g.addColorStop(1, '#4f6a85');
  x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
}
const FACADE_STYLES = {
  // statige centrumpanden met hoge ramen en een winkelpui
  centrum: (x, L) => {
    const base = pick(['#e8e0cf', '#7a3b2b', '#d9cdb4', '#5e4a3a', '#efe9dc', '#8c5a3c']);
    x.fillStyle = base; x.fillRect(0, 0, 256, 320);
    x.fillStyle = 'rgba(0,0,0,.15)'; x.fillRect(0, 0, 256, 10); x.fillRect(0, 214, 256, 8);
    for (let r = 0; r < 3; r++) for (const wx of [24, 104, 184]) {
      glassWin(x, wx, 22 + r * 64, 46, 50);
      x.fillStyle = '#f4f1ea'; x.fillRect(wx + 21, 22 + r * 64, 4, 50);
      L(wx, 22 + r * 64, 46, 50, 0.55);
    }
    const aw = pick(['#c8202b', '#1f6b3a', '#22375e', '#d4a017']);
    for (let i = 0; i < 256; i += 32) { x.fillStyle = i % 64 ? '#f4f1ea' : aw; x.fillRect(i, 226, 32, 18); }
    glassWin(x, 16, 250, 160, 66, '#2b2b2b'); L(16, 250, 160, 66, 0.8);
    x.fillStyle = '#3a2a1e'; x.fillRect(196, 250, 44, 70);
  },
  // arbeiderswoningen: laag, donkere baksteen, deur-raam-deur-raam
  arbeider: (x, L) => {
    x.fillStyle = pick(['#6e2e22', '#7a3426', '#5e2a20', '#8a4030']); x.fillRect(0, 0, 256, 320);
    x.fillStyle = 'rgba(0,0,0,.15)';
    for (let y = 0; y < 320; y += 8) { x.fillRect(0, y, 256, 1.5); for (let xx = (y / 8) % 2 ? 0 : 9; xx < 256; xx += 18) x.fillRect(xx, y, 1.5, 8); }
    for (const ox of [0, 128]) {
      glassWin(x, ox + 20, 60, 86, 70); L(ox + 20, 60, 86, 70);
      glassWin(x, ox + 60, 190, 52, 70); L(ox + 60, 190, 52, 70);
      x.fillStyle = pick(['#1f4d3a', '#22375e', '#5e1f24', '#e8e2d0']); x.fillRect(ox + 14, 196, 36, 124);
      x.fillStyle = '#e8e2d0'; x.fillRect(ox, 160, 128, 8);
    }
  },
  // campus: beton met lintramen
  campus: (x, L) => {
    x.fillStyle = pick(['#a9adb1', '#b8b3a6', '#8f969c']); x.fillRect(0, 0, 256, 320);
    for (let y = 16; y < 320; y += 52) {
      x.fillStyle = '#26323d'; x.fillRect(0, y, 256, 30);
      for (let i = 0; i < 256; i += 32) { x.fillStyle = '#6f7b85'; x.fillRect(i, y, 3, 30); L(i + 3, y, 29, 30, 0.45); }
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, y, 256, 6);
    }
  },
  // galerijflat: zes verdiepingen met galerijen en gekleurde panelen
  flat: (x, L) => {
    x.fillStyle = pick(['#c9c2b4', '#b8b0a0', '#a7a9a0', '#cfc6b0']); x.fillRect(0, 0, 256, 320);
    const accent = pick(['#d9772b', '#3f7d5a', '#c94a3a', '#4a6aa8', '#d4b33a']);
    for (let f = 0; f < 6; f++) {
      const y = f * 53;
      for (let i = 0; i < 256; i += 64) {
        x.fillStyle = '#3a2f28'; x.fillRect(i + 8, y + 10, 16, 30); // voordeur
        glassWin(x, i + 30, y + 12, 28, 20, '#e8e4da'); L(i + 30, y + 12, 28, 20, 0.5);
        x.fillStyle = accent; x.fillRect(i + 30, y + 34, 28, 6);
      }
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, y + 40, 256, 4);
      x.fillStyle = '#d8d2c4'; x.fillRect(0, y + 44, 256, 9); // galerij-borstwering
      x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 256; i += 8) x.fillRect(i, y + 44, 2, 9);
    }
  },
};
function themeMats(th) {
  if (!th || !th.houses || th.houses === 'rij') return facadeMats;
  if (!facadeSets[th.houses]) facadeSets[th.houses] = Array.from({ length: 5 }, () => makeFacadeMat(FACADE_STYLES[th.houses]));
  return facadeSets[th.houses];
}

// ---------- thema's ----------
const THEMES = {
  oost: { houses: 'rij', heights: [6.5, 9.5], roof: true, grass: '#6f9a52', streets: STREETS, obstacles: ['kliko', 'kliko', 'fietswrak', 'auto', 'auto', 'gat', 'bank'] },
  centrum: { houses: 'centrum', heights: [9, 13], roof: true, grass: '#8d8a80', streets: ['Grote Markt', 'Burchtstraat', 'Lange Hezelstraat', 'Molenstraat', 'Stikke Hezelstraat', 'Ganzenheuvel'], obstacles: ['marktkraam', 'terras', 'terras', 'auto', 'gat', 'kliko'] },
  water: { houses: 'arbeider', heights: [5.5, 7.5], roof: true, grass: '#6a8a4a', streets: ['Waterstraat', 'Tweede Oude Heselaan', 'Wolfskuilseweg', 'Daalseweg', 'Hezelpoort'], obstacles: ['winkelwagen', 'winkelwagen', 'kliko', 'auto', 'gat', 'fietswrak'] },
  goffert: { houses: 'rij', heights: [6, 9], roof: true, grass: '#4f8f3a', streets: ['Goffertweg', 'Slotemaker de Bruïneweg', 'Sint Annastraat', 'Goffertpark'], obstacles: ['dranghek', 'dranghek', 'kliko', 'auto', 'gat', 'fietswrak'] },
  campus: { houses: 'campus', heights: [10, 18], roof: false, grass: '#5f8f48', streets: ['Heyendaalseweg', 'Erasmuslaan', 'Thomas van Aquinostraat', 'Houtlaan'], obstacles: ['deelscooter', 'deelscooter', 'fietswrak', 'fietswrak', 'afzetting-row', 'gat'] },
  dukenburg: { houses: 'flat', heights: [14, 24], roof: false, grass: '#6a8a4a', streets: ['Meijhorst', 'Tolhuis', 'Zwanenveld', 'Lindenholt', 'Weezenhof'], obstacles: ['scootmobiel', 'winkelwagen', 'winkelwagen', 'kliko', 'auto', 'gat'] },
  lent: { houses: null, water: true, heights: [6, 8], roof: true, grass: '#7aa84f', streets: ['Lentse Dijk', 'De Oversteek', 'Spiegelwaal', 'Griftdijk'], obstacles: ['schaap', 'schaap', 'schaap', 'fietswrak', 'gat', 'auto'] },
  hatert: { houses: 'flat', heights: [12, 22], roof: false, grass: '#5f7a48', streets: ['Hatertseweg', 'Hatertse Hei', 'Boekweitstraat', 'Gerststraat'], obstacles: ['drerrie', 'drerrie', 'fatbike', 'kliko', 'auto', 'gat'] },
};
const groundMat = (() => { let m = null; scene.traverse((o) => { if (!m && o.isMesh && o.position.y === 0.1 && o.geometry.parameters?.width === 40) m = o.material; }); return m; })();
const waterPlanes = [-1, 1].map((side) => {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(60, 240, 4, 30).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#3d6f8f', emissive: '#0d2230' }));
  w.position.set(side * 42, 0.12, -80);
  w.visible = false;
  scene.add(w);
  return w;
});
function applyTheme(th) {
  curTheme = th;
  for (const side of [-1, 1]) for (const h of houses[side]) restyleHouse(h);
  for (const d of decor) for (const it of d.items) it.visible = d.kind !== 'makeParkedBikes' || !!th.houses;
  if (groundMat) groundMat.color.set(th.grass);
  for (const w of waterPlanes) w.visible = !!th.water;
}

// ---------- unieke obstakels ----------
function makeBank() {
  const g = new THREE.Group();
  const stof = fabricMat(pick(['#b5652e', '#5a6e3a', '#7a2e3a', '#6b5a8a']));
  g.add(mesh(box(1.8, 0.42, 0.85), stof, 0, 0.35, 0));
  g.add(mesh(box(1.8, 0.55, 0.22), stof, 0, 0.75, 0.33));
  g.add(mesh(box(0.22, 0.6, 0.85), stof, -0.85, 0.5, 0));
  g.add(mesh(box(0.22, 0.6, 0.85), stof, 0.85, 0.5, 0));
  g.add(makeShadow(2.2, 1.2));
  return g;
}
function makeMarktkraam() {
  const g = new THREE.Group();
  const hout = M('#8a6a44'), kleur = pick(['#c8202b', '#1f6b3a', '#22375e']);
  const doek = new THREE.MeshLambertMaterial({ map: canvasTex(64, 16, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f4f1ea' : kleur; x.fillRect(i * 8, 0, 8, 16); } }) });
  g.add(mesh(box(2.0, 0.08, 1.2), hout, 0, 0.9, 0));
  g.add(mesh(box(1.9, 0.8, 1.1), M('#6b4a2e'), 0, 0.45, 0));
  for (const [x, z] of [[-0.95, -0.55], [0.95, -0.55], [-0.95, 0.55], [0.95, 0.55]]) g.add(mesh(box(0.06, 2.3, 0.06), hout, x, 1.15, z));
  const dak = mesh(box(2.3, 0.08, 1.5), doek, 0, 2.3, 0); dak.rotation.x = -0.12; g.add(dak);
  for (let i = 0; i < 6; i++) g.add(mesh(box(0.22, 0.22, 0.22), M(pick(['#e23a2a', '#f2a01a', '#7dbb3a', '#f2d23a'])), -0.7 + i * 0.28, 1.05, rand(-0.3, 0.3)));
  g.add(makeShadow(2.4, 1.6));
  return g;
}
function makeTerras() {
  const g = new THREE.Group();
  const metaal = M('#3a3d42');
  for (const ox of [-0.5, 0.5]) {
    g.add(mesh(cylG(0.35, 0.35, 0.04, 10), M('#e8e4da'), ox, 0.75, 0));
    g.add(mesh(cylG(0.03, 0.03, 0.73, 6), metaal, ox, 0.37, 0));
    g.add(mesh(box(0.3, 0.05, 0.3), M('#2f6b3a'), ox, 0.45, 0.45));
    g.add(mesh(box(0.3, 0.4, 0.04), M('#2f6b3a'), ox, 0.68, 0.6));
  }
  g.add(mesh(cylG(0.03, 0.03, 0.4, 6), metaal, -0.5, 0.95, 0));
  g.add(mesh(coneG(0.2, 0.12, 6), M('#fff'), -0.5, 1.2, 0)); // bierglas-ish
  g.add(makeShadow(1.8, 1.2));
  return g;
}
function makeWinkelwagen() {
  const g = new THREE.Group();
  const draad = new THREE.MeshLambertMaterial({ color: '#b8bcc2', transparent: true, opacity: 0.75 });
  g.add(mesh(box(0.6, 0.45, 0.9), draad, 0, 0.75, 0));
  g.add(mesh(box(0.62, 0.04, 0.04), M('#c8202b'), 0, 1.0, 0.5));
  for (const [x, z] of [[-0.25, -0.38], [0.25, -0.38], [-0.25, 0.38], [0.25, 0.38]]) { const w = wheel(0.06, 0.04, M('#1b1b1b')); w.position.set(x, 0.06, z); g.add(w); }
  g.add(mesh(box(0.04, 0.5, 0.04), M('#8a8f96'), -0.28, 0.3, -0.38));
  g.add(mesh(box(0.04, 0.5, 0.04), M('#8a8f96'), 0.28, 0.3, -0.38));
  g.rotation.y = rand(-0.5, 0.5);
  g.add(makeShadow(0.9, 1.2));
  return g;
}
function makeDranghek() {
  const g = new THREE.Group();
  const kleur = [M('#c8202b'), M('#1f7a3a'), M('#141414')];
  for (let i = 0; i < 3; i++) g.add(mesh(box(0.7, 1.0, 0.05), kleur[i], -0.7 + i * 0.7, 0.55, 0));
  for (let i = 0; i < 4; i++) g.add(mesh(box(0.05, 1.1, 0.05), M('#9aa0a6'), -1.05 + i * 0.7, 0.55, 0));
  g.add(mesh(box(2.2, 0.05, 0.4), M('#5a5f66'), 0, 0.02, 0));
  return g;
}
function makeDeelscooter() {
  const g = new THREE.Group();
  const groen = M('#2bd16a'), zwart = M('#1b1b1b');
  g.add(mesh(box(0.16, 0.06, 0.75), groen, 0, 0.12, 0));
  const stang = mesh(box(0.05, 1.0, 0.05), groen, 0, 0.6, -0.33); stang.rotation.x = 0.15; g.add(stang);
  g.add(mesh(box(0.45, 0.04, 0.04), zwart, 0, 1.08, -0.4));
  for (const z of [-0.35, 0.35]) { const w = wheel(0.1, 0.05, zwart); w.position.set(0, 0.1, z); g.add(w); }
  g.rotation.z = Math.random() < 0.5 ? 1.35 : 0; // vaak omgevallen
  if (g.rotation.z) g.position.y = 0.1;
  g.rotation.y = rand(-0.6, 0.6);
  return g;
}
function makeScootmobiel() {
  const g = new THREE.Group();
  const rood = M('#c8202b'), zwart = M('#1b1b1b');
  g.add(mesh(box(0.7, 0.3, 1.3), rood, 0, 0.35, 0));
  g.add(mesh(box(0.55, 0.12, 0.5), zwart, 0, 0.62, 0.2));
  g.add(mesh(box(0.55, 0.45, 0.1), zwart, 0, 0.85, 0.45));
  const stuur = mesh(box(0.06, 0.6, 0.06), M('#8a8f96'), 0, 0.75, -0.45); stuur.rotation.x = -0.4; g.add(stuur);
  g.add(mesh(box(0.4, 0.05, 0.05), M('#8a8f96'), 0, 1.02, -0.56));
  g.add(mesh(box(0.1, 0.6, 0.05), M('#ff8a00'), 0.25, 1.2, 0.5)); // vlaggetje
  for (const [x, z] of [[-0.32, -0.45], [0.32, -0.45], [-0.32, 0.45], [0.32, 0.45]]) { const w = wheel(0.13, 0.08, zwart); w.position.set(x, 0.13, z); g.add(w); }
  const oma = makePerson({ key: 'oma', skin: '#efcfb8', hair: '#d8d8d8', hairStyle: 'kort', shirt: { base: '#7a5aa8', paint() {} }, pants: '#4a4a5a', shoes: '#333', face: { skin: '#efcfb8' }, scale: [0.95, 0.9, 0.95] });
  oma.root.position.set(0, -0.25, 0.15);
  oma.shadow.visible = false;
  g.add(oma.root);
  g.userData.person = oma;
  g.add(makeShadow(1.1, 1.6));
  return g;
}
function makeSchaap() {
  const g = new THREE.Group();
  const wol = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshLambertMaterial({ color: '#efeae0', flatShading: true }));
  wol.scale.set(0.9, 0.75, 1.25); wol.position.y = 0.6; g.add(wol);
  const zwart = M('#1e1e1e');
  g.add(mesh(box(0.22, 0.26, 0.3), zwart, 0, 0.75, -0.6));
  const legs = [];
  for (const [x, z] of [[-0.18, -0.3], [0.18, -0.3], [-0.18, 0.3], [0.18, 0.3]]) { const l = new THREE.Group(); l.position.set(x, 0.38, z); l.add(mesh(box(0.08, 0.38, 0.08), zwart, 0, -0.19, 0)); g.add(l); legs.push(l); }
  g.add(makeShadow(1, 1.3));
  g.userData.legs = legs;
  return g;
}
function makeFatbike(gold) {
  const g = new THREE.Group();
  const frame = gold ? new THREE.MeshLambertMaterial({ color: '#e8b923', emissive: '#4a3500' }) : M(pick(['#141414', '#2a2a2a', '#3a3f4a'])), band = M('#111');
  const tg = torG(0.3, 0.1, 6, 16).rotateY(Math.PI / 2);
  for (const z of [-0.6, 0.6]) { const w = new THREE.Mesh(tg, band); w.position.set(0, 0.4, z); g.add(w); }
  const b1 = mesh(box(0.1, 0.1, 1.0), frame, 0, 0.72, 0); b1.rotation.x = 0.15; g.add(b1);
  const b2 = mesh(box(0.1, 0.55, 0.1), frame, 0, 0.62, 0.2); b2.rotation.x = -0.3; g.add(b2);
  g.add(mesh(box(0.1, 0.6, 0.1), frame, 0, 0.75, -0.55));
  g.add(mesh(box(0.7, 0.05, 0.05), M('#222'), 0, 1.08, -0.55));
  g.add(mesh(box(0.3, 0.1, 0.3), M('#222'), 0, 0.92, 0.25));
  g.add(mesh(box(0.22, 0.28, 0.2), M('#222'), 0, 0.6, -0.05)); // accu
  return g;
}
// drerrie met gucci-petje op een fatbike (kijkt naar Jens)
function makeDrerrie(boss) {
  const g = new THREE.Group();
  const bike = makeFatbike(boss);
  g.add(bike);
  const p = makePerson({ key: 'drerrie', skin: pick(['#e8c0a0', '#c99468', '#a8714a', '#f0cbb0']), hair: '#1a1410', hairStyle: 'guccipet',
    shirt: { base: boss ? '#e0e0e0' : '#151515', paint(x) { x.fillStyle = boss ? '#c8a020' : '#f4f4f4'; x.fillRect(4, 0, 6, 128); x.fillRect(118, 0, 6, 128); } },
    pants: '#151515', shoes: '#f4f4f4', face: { skin: '#e8c0a0', angry: true, brow: '#1a1410' } });
  p.root.position.y = 0.12;
  p.shadow.visible = false;
  if (boss) {
    const ketting = mesh(torG(0.12, 0.025, 6, 14), new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#6b4a00' }), 0, 1.5, -0.08);
    ketting.rotation.x = 1.2;
    p.body.add(ketting);
  }
  g.add(p.root);
  g.rotation.y = Math.PI;
  g.add(makeShadow(1.0, 1.8));
  g.userData.person = p;
  if (boss) g.scale.setScalar(1.6);
  return g;
}

// ---------- bezienswaardigheden ----------
// gebouwd met de voorgevel op x = 0, het gebouw ligt richting +x (rechterkant van de weg)
function textPlane(str, w, h, color, bg, font = 'Anton, Impact, sans-serif') {
  const t = canvasTex(512, Math.round(512 * h / w), (x, W, H) => {
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); }
    x.fillStyle = color; x.font = `${Math.round(H * 0.72)}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(str, W / 2, H * 0.55, W - 16);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: t, transparent: !bg }));
  return p;
}
function prismRoof(depth, len, height, mat) {
  const shape = new THREE.Shape([new THREE.Vector2(-depth / 2, 0), new THREE.Vector2(depth / 2, 0), new THREE.Vector2(0, height)]);
  return new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2), mat);
}
const LANDMARKS = {
  stevenskerk() {
    const g = new THREE.Group(), steen = M('#9a7a5a'), licht = M('#b59a76'), dak = M('#3d4a52');
    g.add(mesh(new THREE.BoxGeometry(14, 16, 34, 2, 3, 6), steen, 9, 8, 0));
    const r = prismRoof(14.5, 34, 9, dak); r.position.set(9, 16, 0); g.add(r);
    g.add(mesh(new THREE.BoxGeometry(10, 44, 10, 2, 6, 2), licht, 9, 22, -18));
    g.add(mesh(cylG(3.6, 4.2, 9, 8), licht, 9, 48.5, -18));
    g.add(mesh(cylG(2.4, 3.2, 5, 8), dak, 9, 55.5, -18));
    g.add(mesh(coneG(1.6, 6, 8), dak, 9, 61, -18));
    const klok = mesh(new THREE.CircleGeometry(1.8, 12).rotateY(-Math.PI / 2), M('#f4f1ea'), 3.95, 36, -18); g.add(klok);
    for (let i = 0; i < 4; i++) { const ra = mesh(box(0.2, 7, 2.2), M('#3a4652'), 3.95, 7, -10 + i * 7); g.add(ra); }
    return { g, len: 46, name: 'Stevenskerk' };
  },
  waag() {
    const g = new THREE.Group();
    const tex = canvasTex(256, 256, (x) => {
      x.fillStyle = '#8a3a2a'; x.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
        const wx = 18 + i * 60, wy = 40 + r * 100;
        glassWin(x, wx + 8, wy, 26, 56);
        for (const sx of [wx - 4, wx + 36]) { for (let k = 0; k < 6; k++) { x.fillStyle = k % 2 ? '#c8202b' : '#f4f1ea'; x.beginPath(); x.moveTo(sx, wy + k * 10); x.lineTo(sx + 12, wy + k * 10 - 8); x.lineTo(sx + 12, wy + k * 10 + 2); x.lineTo(sx, wy + k * 10 + 10); x.fill(); } }
      }
      x.fillStyle = '#f4f1ea'; x.fillRect(0, 22, 256, 6);
    });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(10, 12, 16, 2, 2, 3), [M('#8a3a2a'), new THREE.MeshLambertMaterial({ map: tex }), M('#8a3a2a'), M('#8a3a2a'), M('#8a3a2a'), M('#8a3a2a')]));
    g.children[0].position.set(5, 6, 0);
    const r = prismRoof(10.4, 16, 6, M('#3a3f45')); r.position.set(5, 12, 0); g.add(r);
    const plaat = textPlane('DE WAAG', 5, 0.9, '#f4f1ea', '#2b2b2b'); plaat.position.set(-0.06, 9.5, 0); g.add(plaat);
    return { g, len: 18, name: 'De Waag' };
  },
  honig() {
    const g = new THREE.Group();
    const tex = canvasTex(256, 256, (x) => {
      x.fillStyle = '#7a3a2a'; x.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
        const wx = 10 + i * 42, wy = 20 + r * 76;
        x.fillStyle = '#d9cfbf'; x.beginPath(); x.arc(wx + 14, wy + 12, 16, Math.PI, 0); x.fill(); x.fillRect(wx - 2, wy + 12, 32, 44);
        glassWin(x, wx + 1, wy + 2, 26, 50, '#d9cfbf');
      }
    });
    const steen = M('#7a3a2a');
    g.add(new THREE.Mesh(new THREE.BoxGeometry(16, 14, 44, 2, 2, 6), [steen, new THREE.MeshLambertMaterial({ map: tex }), M('#4a4a50'), steen, steen, steen]));
    g.children[0].position.set(8, 7, 0);
    g.add(mesh(cylG(1.3, 1.9, 42, 10), M('#6e3022'), 12, 21, 14));
    g.add(mesh(cylG(1.4, 1.4, 1, 10), M('#3a3a3a'), 12, 42, 14));
    const letters = textPlane('HONIG', 22, 5.5, '#f2e6b8', null); letters.position.set(2, 17.2, 0); g.add(letters);
    return { g, len: 48, name: 'Honigcomplex' };
  },
  goffert() {
    const g = new THREE.Group();
    const tex = canvasTex(256, 128, (x) => {
      const kl = ['#c8202b', '#1f7a3a', '#141414'];
      for (let i = 0; i < 8; i++) { x.fillStyle = kl[i % 3]; x.fillRect(0, i * 16, 256, 16); }
      x.fillStyle = '#f4f1ea'; x.font = '44px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.fillText('GOFFERT', 128, 82);
    });
    const beton = M('#a8a49c');
    g.add(new THREE.Mesh(new THREE.BoxGeometry(26, 15, 56, 2, 2, 6), [beton, new THREE.MeshLambertMaterial({ map: tex }), M('#5a5f66'), beton, beton, beton]));
    g.children[0].position.set(13, 7.5, 0);
    for (const z of [-26, 26]) {
      g.add(mesh(box(0.6, 34, 0.6), M('#8a8f96'), 2, 17, z));
      const lamp = mesh(box(1.2, 3, 4), lampHeadMat, 2, 34, z); g.add(lamp);
    }
    return { g, len: 60, name: 'Goffertstadion' };
  },
  erasmus() {
    const g = new THREE.Group();
    const tex = canvasTex(128, 512, (x) => {
      x.fillStyle = '#8f969c'; x.fillRect(0, 0, 128, 512);
      for (let y = 6; y < 512; y += 22) for (let i = 4; i < 128; i += 20) { x.fillStyle = '#26323d'; x.fillRect(i, y, 14, 14); }
    });
    const tm = new THREE.MeshLambertMaterial({ map: tex });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(14, 64, 16, 2, 8, 2), [tm, tm, M('#5a5f66'), tm, tm, tm]));
    g.children[0].position.set(10, 32, 0);
    const bord = textPlane('RADBOUD UNIVERSITEIT', 12, 1.2, '#ffffff', '#c8202b'); bord.position.set(2.9, 5, 0); g.add(bord);
    g.add(mesh(box(6, 6, 30), M('#a9adb1'), 6, 3, 0));
    return { g, len: 32, name: 'Erasmusgebouw' };
  },
  galerijflat() {
    const g = new THREE.Group();
    const fm = themeMats({ houses: 'flat' })[0], beton = M('#b8b0a0');
    g.add(new THREE.Mesh(new THREE.BoxGeometry(12, 30, 70, 2, 6, 8), [beton, fm, M('#6d6d6d'), beton, beton, beton]));
    g.children[0].position.set(6, 15, 0);
    return { g, len: 72, name: 'Galerijflat' };
  },
  winkelcentrum(naam) {
    const g = new THREE.Group();
    const steen = M('#c9b48f');
    g.add(mesh(new THREE.BoxGeometry(20, 7, 40, 2, 2, 5), steen, 10, 3.5, 0));
    g.add(mesh(box(0.2, 3, 36), new THREE.MeshLambertMaterial({ color: '#4f6a85', emissive: '#1a2a3a' }), -0.1, 1.8, 0));
    g.add(mesh(box(3, 0.4, 40), M('#3a3d42'), -1.2, 3.6, 0));
    const bord = textPlane(naam, 22, 2, '#ffffff', '#1f4f8f'); bord.position.set(-0.12, 5.6, 0); g.add(bord);
    return { g, len: 42, name: naam };
  },
  school() {
    const s = makeSchool();
    scene.remove(s.g);
    s.g.position.set(0, 0, 0);
    s.g.rotation.y = Math.PI; // makeSchool is voor de linkerkant gebouwd
    return { g: s.g, len: s.len, name: 'NSG Groenewoud' };
  },
};
// boogbrug over de weg (Waalbrug groen, De Oversteek wit)
function makeArch(color, len = 70, height = 24) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, emissive: color === '#f4f4f4' ? '#333' : '#0c1a10' });
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3(sx * (ROAD_W / 2 + 0.8), Math.sin(t * Math.PI) * height, -len / 2 + t * len)); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.7, 6), mat);
    g.add(tube);
    for (let i = 2; i < 15; i += 2) { const t = i / 16, hy = Math.sin(t * Math.PI) * height; g.add(mesh(box(0.08, hy, 0.08), mat, sx * (ROAD_W / 2 + 0.8), hy / 2, -len / 2 + t * len)); }
  }
  for (let i = 4; i <= 12; i += 2) { const t = i / 16; g.add(mesh(box(ROAD_W + 1.6, 0.4, 0.4), mat, 0, Math.sin(t * Math.PI) * height, -len / 2 + t * len)); }
  for (const sx of [-1, 1]) g.add(mesh(box(0.15, 1.1, len), mat, sx * (ROAD_W / 2 + 0.5), 0.6, 0));
  return { g, len, name: color === '#f4f4f4' ? 'De Oversteek' : 'Waalbrug' };
}

// ---------- de BOA (achtervolger in de verhaalmodus) ----------
MODES.bazen = { hidden: true, label: 'Bazen', icon: '👹', chaser: '', desc: '', lines: [''], catchLine: '' };
MODES.verhaal = {
  hidden: true, label: 'Verhaal', icon: '📖', chaser: 'de BOA', nearTime: 5,
  desc: '', lines: ['STAAN BLIJVEN!', 'HANDHAVING!', 'Dat wordt een boete!', 'Ik schrijf je op!', 'Jij weer?!'], catchLine: 'Zo. Bonnetje.',
};
{
  const p = makePerson({ key: 'boa', skin: '#e8c3a6', hair: '#3a2a1e', hairStyle: 'boapet',
    shirt: { base: '#1c2433', paint(x, side) {
      if (side === 'back') text(x, 'HANDHAVING', '#ffd23f', 18, 40);
      else { x.fillStyle = '#ffd23f'; x.fillRect(80, 30, 18, 12); x.fillStyle = '#c9cde6'; x.fillRect(30, 30, 20, 4); }
    } },
    pants: '#141a26', shoes: '#111', face: { skin: '#e8c3a6', angry: true, brow: '#3a2a1e', stubble: '#3a2a1e' }, scale: [1.08, 1.05, 1.08] });
  p.style = 'point';
  p.label = null;
  p.root.visible = false;
  scene.add(p.root);
  chasers.verhaal = p;
}

// ---------- levels ----------
// opdrachten: vuurwerk/bel/toeter/fakkel = door de ring rennen, kliko = omtrappen, nitraat = opblazen
const LEVELS = [
  { id: 'oost', wijk: 'Nijmegen-Oost', theme: 'oost', length: 1100, speed: 11, maxSpeed: 19, need: 2, star3: 2500,
    intro: 'Het begint bij het NSG Groenewoud. Studenten slapen nog, tijd om de buurt wakker te maken.',
    uniek: 'Studentenbanken op de stoep',
    landmarks: [{ at: 60, b: 'school', side: -1 }],
    tasks: [
      { at: 150, type: 'vuurwerk', text: 'Vuurwerk bij het NSG' },
      { at: 520, type: 'bel', text: 'Belletje trekken bij een studentenhuis' },
      { at: 880, type: 'toeter', text: 'Toeter de Berg en Dalseweg wakker' },
    ] },
  { id: 'centrum', wijk: 'Centrum', theme: 'centrum', length: 1300, speed: 12, maxSpeed: 20, need: 3, star3: 3200, nitraten: 2,
    intro: 'Zaterdag op de Grote Markt. Marktkramen, terrasjes, en de Stevenskerk kijkt toe.',
    uniek: 'Marktkramen en terrassen',
    landmarks: [{ at: 260, b: 'stevenskerk', side: 1 }, { at: 600, b: 'waag', side: -1 }, { at: 1180, arch: '#3f6b4a', side: 0 }],
    tasks: [
      { at: 300, type: 'vuurwerk', text: 'Vuurwerk bij de Stevenskerk' },
      { at: 640, type: 'nitraat', obj: 'marktkraam', text: 'Blaas een marktkraam op' },
      { at: 820, type: 'bel', text: 'Belletje trekken op de Grote Markt' },
      { at: 1200, type: 'vuurwerk', show: 'lawine', text: 'Lawinepijl op de Waalbrug' },
    ] },
  { id: 'water', wijk: 'Waterkwartier', theme: 'water', length: 1300, speed: 12.5, maxSpeed: 21, need: 2, star3: 3300, nitraten: 1,
    intro: 'Langs het oude Honigcomplex. Overal verdwaalde winkelwagens.',
    uniek: 'Winkelwagens',
    landmarks: [{ at: 380, b: 'honig', side: 1 }],
    tasks: [
      { at: 420, type: 'vuurwerk', text: 'Vuurwerk bij het Honigcomplex' },
      { at: 760, type: 'kliko', text: 'Trap een kliko om' },
      { at: 1050, type: 'nitraat', obj: 'winkelwagen', text: 'Blaas een winkelwagen op' },
    ] },
  { id: 'goffert', wijk: 'Goffert', theme: 'goffert', length: 1400, speed: 13, maxSpeed: 22, need: 2, star3: 3800,
    intro: 'Wedstrijddag bij NEC. Dranghekken, supporters en een park vol bomen.',
    uniek: 'NEC-dranghekken',
    landmarks: [{ at: 450, b: 'goffert', side: -1 }],
    tasks: [
      { at: 480, type: 'fakkel', text: 'Fakkel afsteken bij het Goffertstadion' },
      { at: 820, type: 'toeter', text: 'Toeter voor NEC' },
      { at: 1150, type: 'vuurwerk', show: 'mortier', text: 'Mortier boven het Goffertpark' },
    ] },
  { id: 'heyendaal', wijk: 'Heyendaal', theme: 'campus', length: 1500, speed: 13.5, maxSpeed: 23, need: 2, star3: 4300, nitraten: 1,
    intro: 'De campus. Tentamenweek, iedereen gestrest, overal deelscooters.',
    uniek: 'Deelscooters',
    landmarks: [{ at: 380, b: 'erasmus', side: 1 }],
    tasks: [
      { at: 420, type: 'vuurwerk', text: 'Vuurwerk bij het Erasmusgebouw' },
      { at: 800, type: 'bel', text: 'Belletje trekken bij de studentenflat' },
      { at: 1200, type: 'nitraat', obj: 'deelscooter', text: 'Blaas een deelscooter op' },
    ] },
  { id: 'dukenburg', wijk: 'Dukenburg', theme: 'dukenburg', length: 1600, speed: 14, maxSpeed: 24, need: 2, star3: 4800, nitraten: 1,
    intro: 'Galerijflats tot aan de horizon. Kijk uit voor de scootmobielen.',
    uniek: 'Scootmobielen die oversteken',
    landmarks: [{ at: 300, b: 'galerijflat', side: -1 }, { at: 700, b: 'winkelcentrum', arg: 'WINKELCENTRUM DUKENBURG', side: 1 }, { at: 1150, b: 'galerijflat', side: 1 }],
    tasks: [
      { at: 340, type: 'vuurwerk', show: 'cake', text: 'Cakebox bij de flats' },
      { at: 740, type: 'toeter', text: 'Toeter bij het winkelcentrum' },
      { at: 1250, type: 'nitraat', obj: 'winkelwagen', text: 'Blaas een winkelwagen op' },
    ] },
  { id: 'lent', wijk: 'Lent', theme: 'lent', length: 1700, speed: 14.5, maxSpeed: 25, need: 2, star3: 5300,
    intro: 'Over de dijk en De Oversteek. Schapen, wind en de Spiegelwaal.',
    uniek: 'Schapen op de dijk',
    landmarks: [{ at: 700, arch: '#f4f4f4', side: 0 }, { at: 780, arch: '#f4f4f4', side: 0 }, { at: 860, arch: '#f4f4f4', side: 0 }],
    tasks: [
      { at: 350, type: 'toeter', text: 'Laat de schapen schrikken' },
      { at: 790, type: 'vuurwerk', show: 'lawine', text: 'Lawinepijl op De Oversteek' },
      { at: 1400, type: 'vuurwerk', show: 'mortier', text: 'Mortier boven de Spiegelwaal' },
    ] },
  { id: 'hatert', wijk: 'Hatert', theme: 'hatert', length: Infinity, speed: 13.5, maxSpeed: 20, need: 1, star3: 7000, nitraten: 8, boss: true,
    intro: 'De eindbaas. Drerries op fatbikes met gucci-petjes, en de Koning van Hatert zelf. Gooi alles wat je hebt.',
    uniek: 'Drerries op fatbikes',
    landmarks: [{ at: 200, b: 'winkelcentrum', arg: 'WINKELCENTRUM HATERT', side: -1 }],
    tasks: [
      { type: 'drerries', count: 8, text: 'Bonus: haal 8 drerries neer' },
      { type: 'koning', must: true, text: 'Versla de Koning van Hatert' },
    ] },
];
const TASK_ICON = { vuurwerk: '🎆', bel: '🔔', toeter: '📯', fakkel: '🔥', kliko: '🗑️', nitraat: '💥', drerries: '🧢', koning: '👑' };
const TASK_COLOR = { vuurwerk: '#ff4dd8', bel: '#4dd2ff', toeter: '#ffd23f', fakkel: '#ff4a1a', kliko: '#5dff8a', nitraat: '#ff3b1a' };

let curLevel = null, levelIdx = 0, tasks = [], lvlEvents = [], finishSpawned = false, takedowns = 0;
let boss = null, bossPhase = false;
if (!save.story) save.story = {};

const campOpen = (c) => c === 'nijmegen' || c === 'vierdaagse' || (c === 'nederland' ? !!save.story.hatert?.cleared : !!save.story.arena?.cleared);
function levelUnlocked(i) { return i === 0 ? campOpen(campaign) : !!save.story[LV()[i - 1].id]?.cleared; }

function prepareLevel(i) {
  levelIdx = i;
  curLevel = LV()[i];
  tasks = curLevel.tasks.map((t) => ({ ...t, done: false, missed: false }));
  lvlEvents = [
    ...(curLevel.landmarks || []).map((l) => ({ ...l, kind: 'landmark' })),
    ...tasks.filter((t) => t.at != null).map((t) => ({ at: t.at, kind: 'task', task: t })),
    ...(curLevel.lore || []).map((l) => ({ ...l, kind: 'lore' })),
  ].sort((a, b) => a.at - b.at);
  if (boss) scene.remove(boss.mesh);
  finishSpawned = false; takedowns = 0; boss = null; bossPhase = false; goff = null;
}
function leaveStory() {
  curLevel = null;
  spandoekRol.visible = false;
  if (boss) { scene.remove(boss.mesh); boss = null; }
  setMode(save.mode && MODES[save.mode] && !MODES[save.mode].hidden ? save.mode : 'telefoon');
}

// spawnen in een level
function spawnLevelRow(z) {
  const ahead = dist - z;
  const th = THEMES[curLevel.theme];
  let busy = false;
  while (lvlEvents.length && lvlEvents[0].at <= ahead) {
    const ev = lvlEvents.shift();
    if (ev.kind === 'landmark') spawnLandmark(ev, z);
    else if (ev.kind === 'lore') toast(ev.text, 3.2);
    else { spawnTask(ev.task, z); busy = true; }
  }
  if (curLevel.boss) { bossRow(z, ahead); return; }
  if (curLevel.goffert) { goffertRow(z, ahead); return; }
  if (ahead > curLevel.length) {
    if (!finishSpawned) { finishSpawned = true; spawnFinish(z); }
    return;
  }
  // Vierdaagse: ook op de stoep lopen wandelaars mee
  if (curLevel.theme.startsWith('vd_') && Math.random() < (lowFx ? 0.15 : 0.28)) {
    const side = Math.random() < 0.5 ? -1 : 1, g = makeWandelaars(2);
    g.rotation.y = 0;
    addObj('deco', g, side * (ROAD_W / 2 + 1.3), z - rand(0, 6), 0, 0, 0, { y: 0.14, upd(o, dt) { if (state === 'run') o.z -= 1.4 * dt; for (const p of o.mesh.userData.ps) pose(p, 'run', dt, 0.35); } });
  }
  if (busy) { if (Math.random() < 0.5) spawnCoinsLine(Math.floor(Math.random() * 3), z - 6); return; }
  if (ahead > nextSign) {
    nextSign = ahead + rand(380, 480);
    streetIdx = (streetIdx + 1) % th.streets.length;
    addObj('sign', makeSign(th.streets[streetIdx]), ROAD_W / 2 + 0.6, z + 6, 0, 0, 0, { y: 0.14, street: th.streets[streetIdx] });
  }
  const early = ahead < 100;
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const nBlock = early || Math.random() < 0.4 ? 1 : 2;
  for (let i = 0; i < nBlock; i++) {
    const type = pick(th.obstacles);
    if (type === 'afzetting-row') { addObj('afzetting', makeAfzetting(), 0, z, ROAD_W, 0.3, 1.5); break; }
    spawnObstacle(type, lanes[i], z);
  }
  const free = lanes[nBlock];
  if (ahead > nextPower) {
    nextPower = ahead + rand(260, 420);
    const type = pick(['brommer', 'beker-van-ons', 'nitraat', 'sjaal', 'fiets', 'fiets', 'fiets', 'fiets', 'fiets', 'fiets']);
    addObj('power', makePower(type), LANES[free], z, 0, 0, 0, { y: 1.0, type });
  } else if (Math.random() < 0.6) spawnCoinsLine(free, z);
}
// unieke/nieuwe obstakels. gen: 'stumble' (struikelen) of 'die'
function spawnSpecial(type, lane, z) {
  const x = LANES[lane];
  switch (type) {
    case 'bank': return addObj('bank', prefab('bank', makeBank), x, z, 1.8, 0.9, 0.95, { gen: 'stumble' });
    case 'wandelaars': {
      const n = Math.random() < 0.5 ? 2 : 3, g = makeWandelaars(n);
      return addObj('wandelaars', g, x, z, Math.min(1.9, n * 0.62), 0.8, 1.8, { gen: 'stumble', upd(o, dt) { if (o.hit) return; if (state === 'run') o.z -= 1.4 * dt; for (const p of o.mesh.userData.ps) pose(p, 'run', dt, 0.35); } });
    }
    case 'marktkraam': return addObj('marktkraam', prefab('marktkraam', makeMarktkraam), x, z, 2.0, 1.4, 2.4, { gen: 'die', deathText: 'Jens rende dwars door een marktkraam. Overal fruit, en de BOA erachteraan.' });
    case 'terras': return addObj('terras', prefab('terras', makeTerras), x, z, 1.7, 1.0, 0.85, { gen: 'stumble' });
    case 'winkelwagen': return addObj('winkelwagen', prefab('winkelwagen', makeWinkelwagen), x, z, 0.8, 1.0, 1.05, { gen: 'stumble' });
    case 'dranghek': return addObj('dranghek', prefab('dranghek', makeDranghek), x, z, 2.1, 0.4, 1.1, { gen: 'stumble' });
    case 'deelscooter': return addObj('deelscooter', prefab('deelscooter', makeDeelscooter), x, z, 0.8, 0.9, 0.9, { gen: 'stumble' });
    case 'fatbike': { const m = makeFatbike(false); m.rotation.z = 1.4; m.position.y = 0.3; const g = new THREE.Group(); g.add(m); return addObj('fatbike', g, x, z, 1.6, 1.2, 0.7, { gen: 'stumble' }); }
    case 'scootmobiel': {
      // steekt langzaam over
      const dir = lane === 0 ? 1 : lane === 2 ? -1 : pick([-1, 1]);
      return addObj('scootmobiel', makeScootmobiel(), x, z, 0.9, 1.4, 1.3, { gen: 'die', deathText: 'Jens knalde op een overstekende scootmobiel. De BOA schreef meteen een bon uit.',
        upd(o, dt) { if (o.z > -45 && !o.hit) { o.x += dir * 1.6 * dt; o.mesh.position.x = o.x; o.mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2; } } });
    }
    case 'schaap': {
      const dir = pick([-1, 1]);
      return addObj('schaap', makeSchaap(), x, z, 1.0, 1.3, 0.95, { gen: 'stumble',
        upd(o, dt) {
          const t = now() * 10;
          o.mesh.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(t + i * 1.6) * 0.5; });
          if (o.z > -35 && !o.hit) { o.x += dir * 1.1 * dt; if (Math.abs(o.x) > 3.4) o.x = -o.x; o.mesh.position.x = o.x; o.mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
        } });
    }
    case 'drerrie': return spawnDrerrie(lane, z);
  }
  if (SPECIAL_EXTRA[type]) return SPECIAL_EXTRA[type](lane, z);
  return null;
}
// ---------- mensen die uit het raam hangen en naar Jens schreeuwen ----------
var nextRaam = 250, nextReporter = 700;
const RAAM_BUREN = ['JENS! Doe normaal!', 'Ik bel de politie!', 'Rustig aan jongen!', 'Hé! Mijn kliko!', 'Ga naar huis!', 'Wat doe jij nou weer?', 'JENS! Je moeder belde!', 'Het is hier geen racebaan!', 'Ik ken je vader!', 'Kan het wat zachter?!'];
const RAAM_HOOLS = ['NEC! NEC! NEC!', 'DIE BEKER IS VAN ONS!', 'Nijmegen is rood-groen!', 'JENS! Kom naar de Goffert!', 'Vitesse is niks!', 'Jens voor de selectie!', 'WIJ ZIJN NEC!', 'Ren Jens, REN!'];
const raamGat = new THREE.MeshBasicMaterial({ color: '#141414' });
function houseAt(side, z) { return houses[side].find((h) => h.g.visible && Math.abs(h.g.position.z - z) < h.width / 2 - 0.8); }
function spawnRaam(z) {
  const side = Math.random() < 0.5 ? -1 : 1;
  if (!houseAt(side, z)) return false;
  const hool = Math.random() < 0.45;
  const fx = side * (ROAD_W / 2 + 4); // de gevel
  const g = new THREE.Group();
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.5), raamGat);
  win.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; win.position.set(-side * 0.03, 3.65, 0); g.add(win);
  g.add(mesh(box(0.35, 0.08, 1.5), M('#e8e2d2'), -side * 0.1, 2.92, 0)); // vensterbank
  const skin = hool ? pick(['#f0cbb0', '#e2b896', '#c98f6a']) : pick(['#f0cfb6', '#e6c2a4', '#b97a55']);
  const p = makePerson(hool
    ? { key: 'hool' + skin, skin, hair: '#2a2018', hairStyle: Math.random() < 0.35 ? 'bivak' : pick(['kort', 'pet']), shirt: { base: '#c8202b', paint(x, side) { x.fillStyle = '#1f7a3a'; x.fillRect(0, 44, 128, 18); x.fillStyle = '#141414'; x.fillRect(0, 62, 128, 18); if (side === 'front') text(x, 'NEC', '#fff', 26, 34); } }, pants: '#222', shoes: '#222', face: { skin, angry: true, brow: '#2a2018' } }
    : { key: 'buur' + skin, skin, hair: pick(['#9a9a9a', '#3a2a1a', '#c9a866']), hairStyle: pick(['kort', 'lang', 'kaal']), shirt: { base: pick(['#7a8a9a', '#a35a5a', '#e0d8c8']), paint() {} }, pants: '#333', shoes: '#333', face: { skin, angry: Math.random() < 0.6, brow: '#3a2a1a' } });
  p.root.position.set(side * 0.4, 2.05, 0);
  p.root.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
  p.shadow.visible = false;
  if (hool) { const sjaal = mesh(box(0.08, 0.5, 0.04), M('#1f7a3a'), 0, 0.15, 0); p.handR.add(sjaal); }
  g.add(p.root);
  g.userData.person = p;
  addObj('deco', g, fx, z, 0, 0, 0, { y: 0, raam: true, upd(o, dt) {
    pose(p, hool ? 'angry' : 'grab', dt, 0.6);
    p.body.rotation.x = -0.5; // hangt voorover naar buiten
    if (!o.yelled && o.z > -24) { o.yelled = true; bubble(p.head, pick(hool ? RAAM_HOOLS : RAAM_BUREN), hool ? 'angry' : '', 2); }
  } });
  return true;
}
// de reporter van NijmegenActueel staat langs de weg te filmen
let naLogoTex = null;
function makeReporter() {
  const g = new THREE.Group();
  const p = makePerson({ key: 'reporter', skin: '#f1cdb2', hair: '#8a5a32', hairStyle: 'lossekrul',
    shirt: { base: '#2f3833', paint(x) { x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; for (let y = 12; y < 128; y += 16) { x.beginPath(); x.moveTo(0, y); x.lineTo(128, y); x.stroke(); } } },
    pants: '#2a2f3a', shoes: '#1a1a1a', face: { skin: '#f1cdb2', brow: '#6a4428' } });
  longSleeves(p, fabricMat('#2f3833'));
  const camBody = mesh(box(0.14, 0.1, 0.09), M('#1a1a1a'), 0, -0.06, -0.06); p.handR.add(camBody);
  camBody.add(mesh(cylG(0.04, 0.045, 0.08, 10).rotateX(Math.PI / 2), M('#222'), 0, 0, -0.08));
  naLogoTex ||= psxTex(new THREE.TextureLoader().load('img/na-logo.png'));
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: naLogoTex, transparent: true, alphaTest: 0.3 }));
  const paal = new THREE.Group(); paal.position.set(0.6, 0, 0.2);
  paal.add(mesh(cylG(0.03, 0.03, 1.6, 6), M('#777'), 0, 0.8, 0));
  bord.position.set(0, 1.85, 0); bord.rotation.y = Math.PI; paal.add(bord);
  g.add(p.root, paal);
  const flash = new THREE.Mesh(sphG(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }));
  flash.visible = false; camBody.add(flash); flash.position.z = -0.14;
  g.userData = { person: p, flash };
  return g;
}
function spawnReporter(z) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const m = makeReporter();
  m.rotation.y = Math.PI + side * 0.5; // kijkt Jens tegemoet, iets naar de weg
  addObj('deco', m, side * (ROAD_W / 2 + 1.4), z, 0, 0, 0, { y: 0.14, upd(o, dt) {
    const { person, flash } = o.mesh.userData;
    pose(person, 'cam', dt);
    flash.visible = o.z > -30 && o.z < 4 && Math.random() < 0.06;
    if (!o.yelled && o.z > -22) { o.yelled = true; bubble(person.head, pick(['NijmegenActueel hier!', 'Mag ik een reactie, Jens?', 'Dit gaat online!', 'Breaking news!', 'Jens! Even lachen!']), '', 2); }
  } });
}
// ---------- foodtruck Quality Truk'i Pan: gooit Curaçaose specialiteiten naar Jens ----------
var nextTruck = 400;
let truckSideTex = null, truckSignTex = null;
function makeTruck() {
  const g = new THREE.Group();
  truckSideTex ||= canvasTex(256, 128, (x) => {
    x.fillStyle = '#121212'; x.fillRect(0, 0, 256, 128);
    // verlicht luik met keuken erachter
    const gr = x.createLinearGradient(0, 18, 0, 70); gr.addColorStop(0, '#ffcf7a'); gr.addColorStop(1, '#8a5a24');
    x.fillStyle = gr; x.fillRect(22, 18, 196, 52);
    x.fillStyle = '#b9b4a8'; x.fillRect(30, 40, 50, 30); x.fillRect(150, 34, 34, 36);
    x.fillStyle = '#c9ccd1'; x.fillRect(20, 70, 202, 3);
    for (const [bx, c] of [[30, '#c8202b'], [36, '#ff8a00'], [42, '#f4f4f4'], [48, '#ffd23f']]) { x.fillStyle = c; x.fillRect(bx, 61, 5, 9); }
    // vlammen onderaan
    for (let i = 0; i < 64; i++) {
      const fx = i * 4, h = 14 + Math.sin(i * 1.7) * 6 + Math.random() * 8;
      x.fillStyle = '#ff5a14'; x.fillRect(fx, 128 - h, 4, h);
      x.fillStyle = '#ffd23f'; x.fillRect(fx + 1, 128 - h * 0.55, 2, h * 0.55);
    }
    // logo
    x.fillStyle = '#1f3a7a'; x.beginPath(); x.ellipse(52, 92, 22, 14, 0, 0, 7); x.fill();
    x.fillStyle = '#ff8a00'; for (let i = 0; i < 5; i++) x.fillRect(38 + i * 6, 80 - (i % 2) * 4, 4, 8 + (i % 2) * 4);
    x.fillStyle = '#fff'; x.font = 'bold 8px Arial'; x.textAlign = 'center';
    x.fillText('KWALITY', 52, 95); x.fillText("TROEK'I", 52, 103);
    grain(x, 256, 128, 8);
  });
  const zwart = M('#141414'), alu = M('#c9ccd1');
  const side = new THREE.MeshLambertMaterial({ map: truckSideTex, emissiveMap: truckSideTex, emissive: '#ffffff', emissiveIntensity: 0.45 });
  // kast: de luikkant (-x) kijkt naar de weg
  g.add(new THREE.Mesh(box(2, 2.3, 4.6), [zwart, side, M('#2a2a2a'), zwart, zwart, zwart]).translateY(1.75));
  g.add(mesh(box(2.1, 0.12, 4.7), alu, 0, 2.95, 0));
  g.add(mesh(box(2.04, 0.3, 4.64), alu, 0, 0.72, 0));
  // luifel schuin naar buiten met lampjes
  const luifel = mesh(box(1.1, 0.06, 4.0), alu, -1.45, 2.65, 0); luifel.rotation.z = 0.35; g.add(luifel);
  const lampje = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
  for (let i = 0; i < 7; i++) g.add(mesh(box(0.08, 0.08, 0.08), lampje, -1.15, 2.42 - (i % 2) * 0.05, -1.6 + i * 0.53));
  // toonbank
  g.add(mesh(box(0.4, 0.06, 4.0), alu, -1.2, 1.55, 0));
  // wielen en dissel
  for (const z of [-0.5, 0.5]) for (const sx of [-1.02, 1.02]) g.add(mesh(cylG(0.36, 0.36, 0.18, 10).rotateZ(Math.PI / 2), M('#1a1a1a'), sx, 0.36, z));
  g.add(mesh(box(0.12, 0.12, 1.2), alu, 0, 0.5, 2.9));
  // bord op het dak, naar Jens toe: ook op een smal scherm goed te zien
  truckSignTex ||= canvasTex(256, 64, (x) => {
    x.fillStyle = '#121212'; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#ff5a14'; for (let i = 0; i < 32; i++) x.fillRect(i * 8, 52 - (i % 3) * 3, 6, 12 + (i % 3) * 3);
    x.fillStyle = '#ffd23f'; x.font = '30px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText("KWALITY TROEK'I", 128, 26, 240);
  });
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: truckSignTex }));
  bord.position.set(-1.0, 3.6, 1.2); g.add(bord);
  g.add(mesh(box(0.06, 0.8, 0.06), alu, -1.0, 3.1, 1.2));
  // de kok in het luik
  const kok = makePerson({ key: 'kok', skin: '#7a4a2c', hair: '#1a1410', hairStyle: 'kort', shirt: { base: '#f4f4f4', paint() {} }, pants: '#222', shoes: '#222', face: { skin: '#7a4a2c', brow: '#1a1410' } });
  kok.root.position.set(-0.45, 0.6, 0.3); kok.root.rotation.y = -Math.PI / 2;
  g.add(kok.root);
  g.add(makeShadow(2.6, 5.2));
  g.userData = { kok, bord };
  return g;
}
const SNACKS = ['Keshi yena!', 'Stoba!', 'Kabritu stoba!', 'Pastechi!', 'Funchi!', 'Sopi di mondongo!', 'Bon apetit!'];
const snackMats = ['#5a3412', '#6b3e17', '#4a2a0e'].map((c) => M(c));
function spawnTruck(z) {
  const side = Math.random() < 0.5 ? -1 : 1, x = side * (ROAD_W / 2 + 1.35);
  const m = makeTruck();
  m.scale.setScalar(1.2);
  if (side < 0) { m.rotation.y = Math.PI; m.userData.bord.rotation.y = Math.PI; }
  m.position.y = 0.14;
  addObj('deco', m, x, z, 0, 0, 0, { y: 0.14, truck: true, len: 6, thrown: 0, nextThrow: 0,
    upd(o, dt) {
      const kok = o.mesh.userData.kok;
      pose(kok, 'idle', dt);
      if (state !== 'run' || o.z < -34 || o.z > -7 || o.thrown >= 3) return;
      o.nextThrow -= dt;
      if (o.nextThrow > 0) return;
      o.nextThrow = rand(0.55, 0.9);
      o.thrown++;
      if (o.thrown === 1 || Math.random() < 0.5) bubble(kok.head, pick(SNACKS), 'angry', 1.2);
      throwSnack(o.x - side * 1.3, o.z);
    } });
}
function throwSnack(sx, sz) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.13 + Math.random() * 0.07, 0), pick(snackMats), rand(-0.1, 0.1), rand(-0.06, 0.06), rand(-0.1, 0.1)));
  const tx = player.x, T = 0.85;
  addObj('deco', g, sx, sz, 0, 0, 0, { y: 1.9, t: 0,
    upd(o, dt) {
      o.t += dt;
      const k = Math.min(1, o.t / T);
      o.x = sx + (tx - sx) * k; o.z = sz * (1 - k);
      o.mesh.position.set(o.x, 1.9 + (1.15 - 1.9) * k + 3 * k * (1 - k), o.z);
      o.mesh.rotation.x += dt * 9; o.mesh.rotation.y += dt * 6;
      if (k < 1) return;
      o.dead = true;
      if (state === 'run' && Math.abs(player.x - tx) < 0.9 && player.slideT <= 0 && player.y < 0.9) splatScreen();
    } });
}
// het scherm zit 3 seconden onder, op een willekeurige plek
function splatScreen() {
  noise(0.18, 0.35); tone(110, 0.25, 'sine', 0.2, 50);
  buzz(40);
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'), blob = (cx, cy, r, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
  for (let i = 0; i < 14; i++) { const a = Math.random() * 7, d = rand(10, 50); blob(80 + Math.cos(a) * d, 80 + Math.sin(a) * d, rand(10, 26), i % 3 ? '#4f2d10' : '#61391a'); }
  blob(80, 80, 40, '#56320f');
  for (let i = 0; i < 6; i++) { x.fillStyle = '#4f2d10'; const dx = rand(45, 115); x.fillRect(dx, 80, rand(4, 8), rand(40, 78)); blob(dx + 3, 80 + rand(40, 78), 5, '#4f2d10'); }
  for (let i = 0; i < 10; i++) blob(rand(45, 115), rand(45, 115), rand(1.5, 3.5), pick(['#e8c25a', '#c9a227', '#7a4a1e']));
  blob(64, 62, 7, 'rgba(255,255,255,.35)'); blob(70, 58, 3, 'rgba(255,255,255,.55)');
  const el = document.createElement('div'); el.className = 'splat';
  const s = Math.min(innerWidth, innerHeight) * rand(0.45, 0.7);
  el.style.cssText = `width:${s}px;height:${s}px;left:${rand(0, innerWidth - s * 0.7)}px;top:${rand(0, innerHeight - s * 0.7)}px;transform:rotate(${rand(0, 360)}deg)`;
  el.style.backgroundImage = `url(${c.toDataURL()})`;
  $('#splats').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function spawnDrerrie(lane, z) {
  const m = makeDrerrie(false);
  const speed = rand(3, 6);
  return addObj('drerrie', m, LANES[lane], z, 0.9, 1.7, 1.7, { gen: 'stumble', drerrie: true,
    upd(o, dt) {
      if (o.hit) return;
      if (state === 'run') { o.z += speed * dt; o.x += Math.sin(now() * 2 + o.z) * dt * 0.6; o.mesh.position.x = o.x; }
      pose(o.mesh.userData.person, 'bike', dt, 1.2);
      if (!o.yelled && o.z > -25) { o.yelled = true; if (Math.random() < 0.4) bubble(o.mesh.userData.person.head, pick(['Wollah!', 'Wat kijk je nou?', 'Rustig man!', 'Ey ey ey!', 'Boef!']), '', 1.3); }
    } });
}
function spawnLandmark(ev, z) {
  const lm = ev.arch ? makeArch(ev.arch) : LANDMARKS[ev.b](ev.arg);
  const side = ev.side;
  if (side) {
    lm.g.position.set(side * (ROAD_W / 2 + 4.1), 0.14, 0);
    if (side < 0) lm.g.rotation.y += Math.PI;
  }
  const o = addObj('landmark', lm.g, side ? side * (ROAD_W / 2 + 4.1) : 0, z - lm.len / 2, 0, 0, 0, { y: side ? 0.14 : 0, side, len: lm.len + (side ? 36 : 4) });
  if (lm.name && !ev.arch) o.street = lm.name;
  if (lm.upd) o.upd = lm.upd;
  if (lm.roof) o.roof = lm.roof;
  return o;
}
function checkpointMesh(task) {
  const g = new THREE.Group();
  const col = TASK_COLOR[task.type] || '#ffd23f';
  const ring = new THREE.Mesh(torG(0.95, 0.09, 6, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: col }));
  ring.position.y = 0.08; g.add(ring);
  const beam = new THREE.Mesh(cylG(0.9, 0.9, 5, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 2.5; g.add(beam);
  const lab = makeLabel(`${TASK_ICON[task.type]} ${task.text}`, '#1d1a24');
  lab.position.y = 3.2; lab.scale.set(3.4, 0.85, 1); g.add(lab);
  g.userData.ring = ring;
  return g;
}
function spawnTask(task, z) {
  if (task.type === 'controle') { spawnControle(task, z); return; }
  const lane = task.type === 'bel' ? pick([0, 2]) : Math.floor(Math.random() * 3);
  if (task.type === 'nitraat') {
    const o = spawnSpecial(task.obj, lane, z);
    o.task = task;
    const lab = makeLabel(`🎯 ${task.text}`, '#c8202b');
    lab.position.y = 3; lab.scale.set(3.2, 0.8, 1); o.mesh.add(lab);
    return;
  }
  if (task.type === 'kliko') {
    const o = addObj('kliko', makeKliko(), LANES[lane], z, 0.8, 0.8, 1.12, { task, kickable: true });
    const lab = makeLabel(`🗑️ ${task.text}`, '#1f7a3a');
    lab.position.y = 2.2; lab.scale.set(2.6, 0.65, 1); o.mesh.add(lab);
    return;
  }
  addObj('checkpoint', checkpointMesh(task), LANES[lane], z, 1.8, 1.6, 0, { task });
}
function spawnFinish(z) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(mesh(box(0.25, 5, 0.25), M('#f4f4f4'), sx * (ROAD_W / 2 + 0.2), 2.5, 0));
  const vlag = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 0.6, 1.4), new THREE.MeshBasicMaterial({ map: canvasTex(256, 48, (x) => {
    for (let i = 0; i < 32; i++) for (let j = 0; j < 6; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; x.fillRect(i * 8, j * 8, 8, 8); }
    x.fillStyle = '#ffd23f'; x.font = '30px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeStyle = '#000'; x.lineWidth = 5; x.strokeText('WIJK GETERRORISEERD', 128, 25); x.fillText('WIJK GETERRORISEERD', 128, 25);
  }), side: THREE.DoubleSide }));
  vlag.position.y = 4.4; g.add(vlag);
  addObj('finish', g, 0, z, ROAD_W, 1, 0);
}
function completeTask(task, where) {
  if (task.done) return;
  task.done = true;
  score += 500;
  toast(`${TASK_ICON[task.type]} ${task.text}!<small>+500 chaos</small>`, 1.6);
  sfx.power();
  if (where && task.type === 'boem') bigBoom(where);
  if (where) {
    if (task.type === 'vuurwerk') startShowAt(task.show || pick(['lawine', 'mortier', 'cake']), where);
    if (task.type === 'fakkel') burst(new THREE.Vector3(where.x, 1.2, where.z), 70, 4, fakkelMats, 2.2);
  }
  if (task.type === 'bel') { tone(880, 0.35, 'sine', 0.15); tone(698, 0.5, 'sine', 0.15, null, 0.35); setTimeout(() => toast('🏠 "WIE BELT ER NOU OM DEZE TIJD?!"', 1.4), 900); }
  if (task.type === 'toeter') sfx.toet();
  goodShout(true);
}
const fakkelMats = ['#ff2a1a', '#ff6a2a', '#ff3b3b', '#ffd23f', '#a01010'].map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
function startShowAt(type, where) {
  const sh = SHOWS[type], quiet = miniSnd(SHOW_SND[type], 0.9);
  for (let i = 0; i < sh.shots; i++) {
    fwShells.push({ wait: i * sh.gap, pos: new THREE.Vector3(where.x + rand(-1, 1), 0.5, where.z - 8 + rand(-1, 1)),
      v: new THREE.Vector3(rand(-2, 2), rand(...sh.vy) * 0.8, rand(-2, 0)), fuse: rand(...sh.fuse), t: 0, sh, mesh: null, color: pick(fwMats), quiet });
  }
}

// botsingen met verhaal-objecten
function storyCollide(o, px, py) {
  const dz = Math.abs(o.z);
  if (o.kind === 'checkpoint') {
    o.mesh.userData.ring.rotation.z += 0.05;
    if (!o.task.done && dz < 0.9 && Math.abs(px - o.x) < 1.0) { completeTask(o.task, { x: o.x, z: o.z }); o.mesh.visible = false; }
    if (!o.task.done && !o.task.missed && o.z > 2) { o.task.missed = true; toast(`❌ Gemist: ${o.task.text}`, 1.4); }
    return;
  }
  if (o.kind === 'finish' && dz < 0.6) winLevel();
}
function onDestroyed(o) {
  if (o.club != null && goff && o.club === goff.wave) goff.kills++;
  if (o.hooligan && bos) bos.kills++;
  if (o.task && !o.task.done) completeTask(o.task, null);
  if (o.drerrie) {
    takedowns++;
    const t = tasks.find((k) => k.type === 'drerries');
    if (t && !t.done && takedowns >= t.count) completeTask(t, null);
  }
}

// ---------- eindbaas: de Koning van Hatert ----------
const BOSS_START = 350, BOSS_HP = 5;
function bossRow(z, ahead) {
  if (!bossPhase && ahead > BOSS_START) startBoss();
  const n = bossPhase && Math.random() < 0.2 ? 2 : 1;
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.7) spawnDrerrie(lanes[i], z);
    else spawnObstacle(pick(['fatbike', 'kliko', 'auto', 'gat']), lanes[i], z);
  }
  const free = lanes[n];
  if (Math.random() < (bossPhase ? 0.6 : 0.25)) addObj('power', makeSmallNitraat(), LANES[free], z, 0, 0, 0, { y: 1.0, type: 'nitraat2' });
  else if (Math.random() < 0.5) spawnCoinsLine(free, z, 4);
}
function makeSmallNitraat() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#e2231a', transparent: true, opacity: 0.85 })));
  const n = makeNitraat(); n.scale.setScalar(2); g.add(n);
  g.userData.spin = n;
  return g;
}
function startBoss() {
  bossPhase = true;
  const m = makeDrerrie(true);
  m.userData.isKing = true;
  const lab = makeLabel('👑 DE KONING VAN HATERT', '#c8a020');
  lab.position.y = 2.9; lab.scale.set(2.8, 0.7, 1); m.add(lab);
  scene.add(m);
  boss = { mesh: m, x: 0, z: -60, hp: BOSS_HP, targetLane: 1, laneT: 2, throwT: 3, isBoss: true, w: 1.2, d: 2 };
  nitraten = Math.max(nitraten, 8);
  hudNitro = -1;
  toast('👑 DE KONING VAN HATERT<small>Gooi nitraten (E / 🧨), ze zoeken hem vanzelf op!</small>', 2.6);
  sfx.toet();
}
function updateBoss(dt) {
  if (!boss) return;
  const b = boss;
  if (b.dead) {
    b.vy -= 20 * dt; b.mesh.position.y += b.vy * dt; b.mesh.rotation.x += dt * 5; b.mesh.rotation.z += dt * 3;
    b.mesh.position.z += dt * 6;
    return;
  }
  b.z = damp(b.z, -19, 1.2, dt);
  b.laneT -= dt;
  if (b.laneT <= 0) { b.laneT = rand(1.8, 3.2); b.targetLane = Math.floor(Math.random() * 3); }
  b.x += clamp(LANES[b.targetLane] - b.x, -3.5 * dt, 3.5 * dt);
  b.mesh.position.set(b.x, 0, b.z);
  pose(b.mesh.userData.person, 'bike', dt, 1.4);
  b.throwT -= dt;
  if (b.throwT <= 0 && b.z > -30) {
    b.throwT = rand(3.2, 5);
    const lane = b.targetLane;
    if (Math.random() < 0.5) spawnObstacle(pick(['fatbike', 'kliko']), lane, b.z + 2);
    else spawnDrerrie(lane, b.z + 2);
    bubble(b.mesh.userData.person.head, pick(['DIT IS MIJN WIJK!', 'KOM DAN!', 'HATERT BOVEN ALLES!', 'Jij gaat nergens heen!']), 'angry', 1.4);
  }
}
function hitBoss(x, z) {
  const b = boss;
  if (!b || b.dead || Math.abs(b.x - x) > 2.4 || Math.abs(b.z - z) > 4.5) return false;
  b.hp--;
  shakeT = 0.6;
  score += 400;
  bubble(b.mesh.userData.person.head, pick(['AU!', 'MIJN PETJE!', 'DAT GA JE BEZUREN!', 'WOLLAH NEE!']), 'angry', 1.2);
  if (b.hp <= 0) {
    b.dead = true; b.vy = 14;
    completeTask(tasks.find((k) => k.type === 'koning'), null);
    toast('👑 DE KONING VAN HATERT IS VERSLAGEN!', 3);
    burst(new THREE.Vector3(b.x, 2, b.z), 120, 12, fireMats, 2);
    for (const t of ['lawine', 'mortier', 'cake']) startShowAt(t, { x: rand(-3, 3), z: -40 });
    setTimeout(() => { if (state === 'run') winLevel(); }, 3200);
  } else toast(`👑 RAAK! Nog ${b.hp}`, 1);
  return true;
}

// ---------- level-verloop ----------
function storyUpdate(dt) {
  updateBoss(dt);
  for (const o of objs) if (o.kind === 'checkpoint' && o.mesh.userData.ring) o.mesh.userData.ring.rotation.z += dt * 2;
}
function startLevel(i) {
  weekly = null;
  if (!levelUnlocked(i)) return;
  const cid = cutForLevel(i);
  if (cid && !save.cuts[cid]) { playCut(cid, () => startLevel(i)); return; } // eerst het filmpje
  prepareLevel(i);
  mode = 'verhaal';
  spandoekRol.visible = !!curLevel.finale;
  for (const [k, p] of Object.entries(chasers)) p.root.visible = k === 'verhaal';
  jensPhone.visible = false;
  startRun();
}
function winLevel() {
  if (state !== 'run') return;
  const done = tasks.filter((t) => t.done).length;
  const needed = curLevel.need;
  const mustFail = tasks.some((t) => t.must && !t.done);
  state = 'over';
  engineStop();
  $('#hud').classList.add('hidden');
  const s = Math.floor(score);
  if (done < needed || mustFail) {
    playGameover();
    showLevelResult(false, done, needed, s, 0);
    return;
  }
  const stars = 1 + (done === tasks.length ? 1 : 0) + (done === tasks.length && s >= curLevel.star3 ? 1 : 0);
  const rec = save.story[curLevel.id] || {};
  const firstKing = curLevel.boss && !rec.cleared, firstCup = curLevel.goffert && !rec.cleared;
  save.story[curLevel.id] = { cleared: true, stars: Math.max(rec.stars || 0, stars), best: Math.max(rec.best || 0, s) };
  persist();
  playGameover('levelgehaald');
  missionEvent('level');
  passAddXp(dist);
  syncProfile();
  if (firstKing) { playCut('koning', () => showLevelResult(true, done, needed, s, stars)); return; }
  if (firstCup) { playCut('eubeker', () => showLevelResult(true, done, needed, s, stars)); return; }
  if (curLevel.goffert) loudClip('dbivo', 2.6);
  showLevelResult(true, done, needed, s, stars);
}
function hideLabels() { for (const o of objs) o.mesh.traverse((c) => { if (c.isSprite) c.visible = false; }); }
function showLevelResult(ok, done, needed, s, stars) {
  hideLabels();
  $('#ldTitle').textContent = ok ? (curLevel.winTitle || (curLevel.boss ? 'HATERT IS VAN JOU!' : `${curLevel.wijk} geterroriseerd!`)) : curLevel.finale ? 'Gesnapt bij de controle!' : 'Niet genoeg chaos!';
  $('#ldText').textContent = ok
    ? (curLevel.winText || (curLevel.boss ? 'De Koning van Hatert ligt in de sloot en heel Nijmegen weet wie Jens is.' : `${done} van de ${tasks.length} opdrachten gedaan.`))
    : curLevel.finale ? 'Je moet langs alle drie de controles komen zonder dat ze het spandoek vinden. Glij eronder door!' : `Je deed ${done} van de ${tasks.length} opdrachten, maar je hebt er minstens ${needed} nodig.`;
  if (ok && curLevel.finale) $('#ldText').insertAdjacentHTML('beforeend', '<img src="img/spandoek.png" alt="Spandoek: Die beker is van ons" class="spandoek">');
  $('#ldStars').innerHTML = [1, 2, 3].map((n) => `<span class="${n <= stars ? 'on' : ''}">★</span>`).join('');
  $('#ldTasks').innerHTML = tasks.map((t) => `<li class="${t.done ? 'ok' : ''}">${t.done ? '✓' : '✗'} ${TASK_ICON[t.type]} ${t.text}</li>`).join('');
  $('#ldScore').textContent = s.toLocaleString('nl-NL');
  const last = levelIdx >= LV().length - 1;
  $('#ldNext').classList.toggle('hidden', !ok || last);
  $('#ldFame').classList.toggle('hidden', !(ok && (curLevel.boss || curLevel.finale)));
  $('#ldRetry').textContent = ok ? 'Opnieuw' : 'NOG EEN KEER';
  $('#ldRetry').classList.toggle('big', !ok);
  showScreen('#lvldone');
  if (ok && (curLevel.boss || curLevel.finale)) setTimeout(() => openFame(true), 2600);
}
function storyGameOver(title, txt) {
  hideLabels();
  $('#ldTitle').textContent = title;
  $('#ldText').textContent = txt;
  $('#ldStars').innerHTML = '';
  $('#ldTasks').innerHTML = tasks.map((t) => `<li class="${t.done ? 'ok' : ''}">${t.done ? '✓' : '✗'} ${TASK_ICON[t.type]} ${t.text}</li>`).join('');
  $('#ldScore').textContent = Math.floor(score).toLocaleString('nl-NL');
  $('#ldNext').classList.add('hidden');
  $('#ldFame').classList.add('hidden');
  $('#ldRetry').textContent = 'NOG EEN KEER';
  $('#ldRetry').classList.add('big');
  showScreen('#lvldone');
}

// ---------- HUD ----------
let hudLvlKey = '';
function updateStoryHud() {
  const el = $('#lvlhud');
  if (!curLevel || state !== 'run') { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const prog = curLevel.boss ? (boss ? 1 - boss.hp / BOSS_HP : clamp(dist / BOSS_START, 0, 1)) : curLevel.goffert ? (goff ? goff.wave / CLUBS.length : 0) : clamp(dist / curLevel.length, 0, 1);
  const key = tasks.map((t) => (t.done ? 1 : t.missed ? 2 : 0)).join('') + takedowns + (boss ? boss.hp : '-');
  if (key !== hudLvlKey) {
    hudLvlKey = key;
    $('#lvlTasks').innerHTML = tasks.map((t) => {
      const extra = t.type === 'drerries' ? ` ${Math.min(takedowns, t.count)}/${t.count}` : '';
      return `<span class="${t.done ? 'ok' : t.missed ? 'miss' : ''}" title="${t.text}">${TASK_ICON[t.type]}${extra}</span>`;
    }).join('');
  }
  $('#lvlName').textContent = curLevel.boss && boss ? `👑 Koning van Hatert · ${boss.hp}/${BOSS_HP}` : curLevel.goffert && goff && goff.wave < CLUBS.length ? `${CLUBS[goff.wave].flag} ${CLUBS[goff.wave].name} · ${Math.min(goff.kills, WAVE_NEED)}/${WAVE_NEED}` : curLevel.wijk;
  $('#lvlBar').style.width = (prog * 100).toFixed(1) + '%';
  $('#lvlBar').classList.toggle('boss', !!(curLevel.boss && boss));
}

// ---------- level-kaart ----------
let selLevel = 0;
function openLevels() {
  audioInit();
  stopGameover();
  if (curLevel) leaveStory();
  resetRun();
  state = 'menu';
  $('#hud').classList.add('hidden');
  selLevel = Math.min(LV().findIndex((l, i) => !save.story[l.id]?.cleared && levelUnlocked(i)) >>> 0, LV().length - 1);
  if (selLevel < 0 || selLevel >= LV().length) selLevel = 0;
  showScreen('#levels');
  renderLevels();
}
function renderLevels() {
  const total = LV().reduce((n, l) => n + (save.story[l.id]?.stars || 0), 0);
  $('#lvStars').textContent = `★ ${total}/${LV().length * 3}`;
  $('#lvHead').textContent = CAMPAIGNS[campaign].name;
  const cat = CAMPAIGNS[campaign].cat || 'terror';
  $('#campCats').innerHTML = [['terror', '⚔️ Terroriseer'], ['event', '🎉 Evenementen']].map(([k, t]) => `<button class="tab cat ${k === cat ? 'sel' : ''}" data-cat="${k}">${t}</button>`).join('');
  $('#campTabs').innerHTML = Object.entries(CAMPAIGNS).filter(([, c]) => (c.cat || 'terror') === cat).map(([k, c]) => `<button class="tab ${k === campaign ? 'sel' : ''}" data-camp="${k}">${!campOpen(k) ? '🔒 ' : ''}${c.name.replace('Terroriseer ', '')}</button>`).join('');
  $('#lvGrid').innerHTML = LV().map((l, i) => {
    const open = levelUnlocked(i), rec = save.story[l.id];
    const st = [1, 2, 3].map((n) => `<i class="${rec && n <= rec.stars ? 'on' : ''}">★</i>`).join('');
    return `<button class="lv ${open ? '' : 'locked'} ${i === selLevel ? 'sel' : ''} ${l.boss ? 'boss' : ''}" data-lv="${i}">
      <small>${l.boss ? '👑 EINDBAAS' : l.goffert ? '🏆 FINALE' : l.finale ? '🏟️ FINALE' : 'LEVEL ' + (i + 1)}</small><b>${open ? l.wijk : '🔒'}</b><span class="st">${open ? st : ''}</span></button>`;
  }).join('');
  const l = LV()[selLevel], open = levelUnlocked(selLevel);
  $('#lvTitle').textContent = `${selLevel + 1}. ${l.wijk}`;
  $('#lvIntro').textContent = open ? l.intro : selLevel === 0 ? (campaign === 'europa' ? 'Smokkel eerst het spandoek de ArenA in om Europa vrij te spelen.' : 'Versla eerst de Koning van Hatert om heel Nederland vrij te spelen.') : `Haal eerst ${LV()[selLevel - 1].wijk} om dit level vrij te spelen.`;
  $('#lvTasks').innerHTML = open ? [`<li>⭐ Uniek: ${l.uniek}</li>`, ...l.tasks.map((t) => `<li>${TASK_ICON[t.type]} ${t.text}</li>`)].join('') + `<li class="need">${l.goffert ? `Houd elke club tegen: ${WAVE_NEED} van de ${WAVE_N} per golf` : l.finale ? 'Alle controles moeten lukken' : l.boss ? 'Versla de Koning; de drerries zijn een bonus-ster' : `Minstens ${l.need} opdrachten nodig`}</li>` : '';
  const seen = [cutForLevel(selLevel), l.id === 'hatert' ? 'koning' : l.id === 'efinale' ? 'eubeker' : null].filter((c) => c && save.cuts[c]);
  $('#lvCuts').innerHTML = seen.map((c) => `<button class="tab" data-cut="${c}">🎬 ${c === 'koning' ? 'Na de Koning' : c === 'eubeker' ? 'De beker' : 'Filmpje'}</button>`).join('');
  $('#lvPlay').disabled = !open;
  $('#lvPlay').textContent = open ? 'SPELEN' : 'OP SLOT';
}
$('#campCats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const first = Object.entries(CAMPAIGNS).find(([, c]) => (c.cat || 'terror') === b.dataset.cat)[0];
  if ((CAMPAIGNS[campaign].cat || 'terror') === b.dataset.cat) return;
  campaign = first; save.campaign = campaign; persist();
  selLevel = Math.max(0, LV().findIndex((l, i) => !save.story[l.id]?.cleared && levelUnlocked(i)));
  tone(520, 0.06, 'square', 0.05);
  renderLevels();
});
$('#campTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-camp]');
  if (!b) return;
  campaign = b.dataset.camp;
  save.campaign = campaign; persist();
  selLevel = Math.max(0, LV().findIndex((l, i) => !save.story[l.id]?.cleared && levelUnlocked(i)));
  tone(660, 0.06, 'square', 0.05);
  renderLevels();
});
$('#lvGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lv]');
  if (!b) return;
  selLevel = +b.dataset.lv;
  tone(660, 0.06, 'square', 0.05);
  renderLevels();
});
$('#lvPlay').addEventListener('click', () => startLevel(selLevel));
$('#lvCuts').addEventListener('click', (e) => { const b = e.target.closest('[data-cut]'); if (b) playCut(b.dataset.cut, openLevels); });
$('#lvBack').addEventListener('click', () => { leaveStory(); toMenu(); });
$('#storyBtn').addEventListener('click', openLevels);
$('#samenBtn').addEventListener('click', () => { audioInit(); openSocial('live'); });
// mobiel menu: proxy-knoppen, 'Meer'-blad en opklapbare opdrachten
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { $('#mMore').classList.add('hidden'); $(b.dataset.go)?.click(); }));
// ---------- "Meer" op de telefoon: een menu van glas ----------
// In de Android-app (13+) tekent de app het echte glas; elders dezelfde beweging met CSS.
// De regels komen uit het gewone paneel en klikken daar ook op de echte knoppen; dat paneel
// blijft de terugval voor browsers zonder backdrop-filter.
const glasRows = () => [...document.querySelectorAll('#mMore .m-grid > [data-i]')].map((el) => {
  const n = el.dataset.n;
  return { icon: el.dataset.i, title: el.lastChild.textContent.trim() + (n ? ` (${n})` : ''), run: () => el.click() };
});
const isMobiel = () => matchMedia('(max-width: 700px)').matches;
// Regel van een icoon uit het iconenvel, of een klein plaatje (r.img), als PNG voor het native menu.
const glasImgs = {};
function glasVoorlaad(url) {
  if (glasImgs[url]) return glasImgs[url];
  const i = new Image();
  i.src = url;
  return (glasImgs[url] = i);
}
function glasIcoon(row) {
  const pic = row.img && glasImgs[row.img];
  const klaar = pic?.complete && pic.naturalWidth;
  const cell = ICONS[(row.icon || '').replace(/\uFE0F/g, '')];
  if (!klaar && (!cell || !iconSheet.complete)) return '';
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d');
    if (klaar) {
      const s = Math.min(pic.naturalWidth, pic.naturalHeight);
      g.beginPath();
      g.roundRect(0, 0, 48, 48, 10);
      g.clip();
      g.drawImage(pic, (pic.naturalWidth - s) / 2, (pic.naturalHeight - s) / 2, s, s, 0, 0, 48, 48);
    } else {
      g.imageSmoothingEnabled = false;
      g.drawImage(iconSheet, cell[0] * ICON_CS, cell[1] * ICON_CS, ICON_CS, ICON_CS, 0, 0, 48, 48);
    }
    return c.toDataURL('image/png').split(',')[1];
  } catch (e) { return ''; }
}
// Veerbeweging als CSS-easing (zelfde gevoel als het glazen menu in de app).
const glasVeer = (() => {
  const punten = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40 * 0.62;
    punten.push((1 - Math.exp(-11 * t) * Math.cos(15 * t)).toFixed(3));
  }
  const s = `linear(${punten.join(',')})`;
  return window.CSS?.supports?.('animation-timing-function', s) ? s : 'cubic-bezier(.2,1.25,.35,1)';
})();
let glasOpen = null;
function glasSluit(meteen) {
  if (!glasOpen) return false;
  const g = glasOpen;
  glasOpen = null;
  if (meteen) { g.root.remove(); return true; }
  g.root.style.pointerEvents = 'none';
  g.panel.animate({ transform: g.van, opacity: 0 }, { duration: 170, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' }).finished
    .catch(() => {}).finally(() => g.root.remove());
  return true;
}
const glasKan = window.JensRunNative?.glassMenu || CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
if (glasKan) document.documentElement.classList.add('glas-ok');
// rows: { title, icon, img, subtitle, checked, disabled, heading, separator, run }
function glasMenu(from, rows) {
  const r = from.getBoundingClientRect();
  try {
    if (window.JensRunNative?.glassMenu?.(JSON.stringify({
      x: r.left, y: r.top, w: r.width, h: r.height,
      items: rows.map((row, i) => ({ ...row, run: undefined, img: undefined, icon: undefined, id: String(i), png: glasIcoon(row) })),
    }))) {
      window.__jrGlassPick = (id) => rows[+id]?.run?.();
      return true;
    }
  } catch (e) { /* dan de versie hieronder */ }
  if (!glasKan) return false;
  glasSluit(true);
  const metVink = rows.some((row) => row.checked !== undefined);
  const root = document.createElement('div');
  root.className = 'glas';
  root.innerHTML = `<div class="glas-p" role="menu"><span class="glas-plate"></span>${rows.map((row, i) => {
    if (row.separator) return '<hr>';
    if (row.heading) return `<b class="glas-h">${escHtml(row.title)}</b>`;
    const ico = row.img ? `<i class="glas-img" style="background-image:url(${row.img})"></i>` : row.icon ? `<i>${row.icon}</i>` : '';
    return `<button role="menuitem" data-i="${i}"${row.disabled ? ' disabled' : ''}>${metVink ? `<em>${row.checked ? '✓' : ''}</em>` : ''}${ico}<span>${escHtml(row.title)}${row.subtitle ? `<small>${escHtml(row.subtitle)}</small>` : ''}</span></button>`;
  }).join('')}</div>`;
  $('#app').appendChild(root);
  const panel = root.firstChild, plate = panel.firstChild;
  const knoppen = [...panel.querySelectorAll('button')];
  // plaats: boven of onder de knop, aan de kant waar de knop staat, altijd binnen het scherm
  const vak = root.getBoundingClientRect();
  const p0 = panel.getBoundingClientRect();
  const marge = 10, boven = r.top - vak.top, onder = vak.bottom - r.bottom;
  const naarBoven = boven >= p0.height + marge || boven > onder;
  const hoogte = Math.min(p0.height, (naarBoven ? boven : onder) - marge - 8);
  panel.style.maxHeight = `${hoogte}px`;
  const links = Math.max(marge, Math.min(vak.width - p0.width - marge, r.left + r.width / 2 > vak.width / 2 ? r.right - p0.width : r.left));
  panel.style.left = `${links}px`;
  panel.style.top = `${naarBoven ? r.top - vak.top - hoogte - 8 : r.bottom - vak.top + 8}px`;
  const p = panel.getBoundingClientRect();
  const scrolt = panel.scrollHeight > panel.clientHeight + 1;
  if (scrolt) root.style.touchAction = 'pan-y';
  const van = `translate(${r.left + r.width / 2 - (p.left + p.width / 2)}px, ${r.top + r.height / 2 - (p.top + p.height / 2)}px) scale(${Math.max(.08, Math.min(1, r.width / p.width) * .7)}, ${Math.max(.05, r.height / p.height * .7)})`;
  glasOpen = { root, panel, van, toets: (e) => {
    const open = knoppen.map((b, i) => (b.disabled ? -1 : i)).filter((i) => i >= 0);
    if (e.key === 'Escape') glasSluit();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
      const stap = e.key === 'ArrowUp' || e.shiftKey ? -1 : 1;
      const nu = open.indexOf(actief);
      const i = open[(nu < 0 ? (stap > 0 ? 0 : open.length - 1) : (nu + stap + open.length) % open.length)];
      licht(i);
      knoppen[i].scrollIntoView({ block: 'nearest' });
    } else if ((e.key === 'Enter' || e.key === ' ') && actief >= 0) kies(knoppen[actief]);
  } };
  const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.animate({ transform: [van, 'none'], opacity: [0, 1, 1] }, { duration: rustig ? 1 : 420, easing: glasVeer });
  if (!rustig) panel.querySelectorAll('button > *, .glas-h').forEach((el) => el.animate({ opacity: [0, 1], filter: ['blur(5px)', 'blur(0)'] }, { duration: 240, delay: 70, easing: 'ease-out', fill: 'backwards' }));
  let actief = -1, ingedrukt = false, klaar = false;
  const rijOp = (y) => knoppen.findIndex((b) => { const q = b.getBoundingClientRect(); return !b.disabled && y >= q.top && y < q.bottom; });
  const licht = (i) => {
    if (i === actief) return;
    if (i >= 0 && actief >= 0) buzz(6);
    const eerste = actief < 0;
    actief = i;
    plate.classList.toggle('aan', i >= 0);
    if (i < 0) return;
    if (eerste) plate.style.transition = 'opacity .12s';
    plate.style.transform = `translateY(${knoppen[i].offsetTop}px)`;
    plate.style.height = `${knoppen[i].offsetHeight}px`;
    if (eerste) requestAnimationFrame(() => { plate.style.transition = ''; });
  };
  const kies = (b) => {
    if (klaar || !b || b.disabled) return;
    klaar = true;
    buzz(10);
    glasSluit();
    rows[+b.dataset.i]?.run?.();
  };
  const volg = (e) => {
    const q = panel.getBoundingClientRect();
    panel.style.setProperty('--x', `${e.clientX - q.left}px`);
    panel.style.setProperty('--y', `${e.clientY - q.top + panel.scrollTop}px`);
    // het glas trekt een klein beetje naar je vinger toe
    const dx = e.clientX - (q.left + q.width / 2), dy = e.clientY - (q.top + q.height / 2);
    panel.style.translate = `${Math.max(-6, Math.min(6, dx * .025))}px ${Math.max(-6, Math.min(6, dy * .018))}px`;
    licht(e.clientX >= q.left - 24 && e.clientX <= q.right + 24 ? rijOp(e.clientY) : -1);
  };
  root.addEventListener('pointerdown', (e) => {
    // een lijst die zelf scrolt: alleen tikken, slepen is dan scrollen
    ingedrukt = !scrolt && panel.contains(e.target);
    if (!ingedrukt) return;
    if (e.pointerType === 'mouse') { panel.classList.add('zweef'); return; }
    panel.classList.add('druk');
    panel.setPointerCapture?.(e.pointerId);
    volg(e);
  });
  panel.addEventListener('pointermove', (e) => {
    if (ingedrukt) return volg(e);
    if (e.pointerType !== 'mouse') return;
    // muis: de regel en het licht volgen zonder dat je hoeft te drukken
    const q = panel.getBoundingClientRect();
    panel.classList.add('zweef');
    panel.style.setProperty('--x', `${e.clientX - q.left}px`);
    panel.style.setProperty('--y', `${e.clientY - q.top + panel.scrollTop}px`);
    licht(rijOp(e.clientY));
  });
  panel.addEventListener('pointerleave', (e) => {
    if (ingedrukt || e.pointerType !== 'mouse') return;
    panel.classList.remove('zweef');
    licht(-1);
  });
  const los = (e, kiezen) => {
    if (!ingedrukt) return;
    ingedrukt = false;
    panel.classList.remove('druk');
    panel.style.translate = '';
    const i = actief;
    if (e.pointerType !== 'mouse') licht(-1);
    if (kiezen && i >= 0) kies(knoppen[i]);
  };
  panel.addEventListener('pointerup', (e) => los(e, true));
  panel.addEventListener('pointercancel', (e) => los(e, false));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) kies(b);
    else if (e.target === root) { buzz(6); glasSluit(); }
  });
  return true;
}
// Zolang het menu open is, zijn de toetsen van het menu en bewegen ze Jens niet.
window.addEventListener('keydown', (e) => {
  if (!glasOpen || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (!e.repeat || e.key.startsWith('Arrow')) glasOpen.toets?.(e);
}, true);
// Desktop: glazen navigatie met een lichtje dat met de muis meeglijdt.
{
  const nav = document.querySelector('.fm-tabs'), plek = nav.querySelector('.fm-plate');
  nav.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button');
    if (e.pointerType !== 'mouse' || !b) return;
    if (b.classList.contains('on')) { plek.classList.remove('aan'); return; }
    if (!plek.classList.contains('aan')) plek.style.transition = 'opacity .14s';
    plek.style.transform = `translateX(${b.offsetLeft}px)`;
    plek.style.width = `${b.offsetWidth}px`;
    plek.offsetWidth;
    plek.style.transition = '';
    plek.classList.add('aan');
  });
  nav.addEventListener('pointerleave', () => plek.classList.remove('aan'));
}
// Smal venster: wat niet meer in de balk past, staat achter "Meer".
$('#fmTabMeer').addEventListener('click', (e) => {
  glasMenu(e.currentTarget, [
    { el: $('#fmBell'), icon: '🔔' },
    { el: document.querySelector('.fm-tabs [data-go="#fameBtn"]'), icon: '👑' },
  ].map(({ el, icon }) => ({ icon, title: el.textContent.trim() + (el.dataset.n ? ` (${el.dataset.n})` : ''), run: () => el.click() })));
});
$('#mMoreBtn').addEventListener('click', (e) => {
  if (!glasOpen && !glasMenu(e.currentTarget, glasRows())) $('#mMore').classList.toggle('hidden');
});
$('#xBtn').addEventListener('click', () => $('#xPop').classList.remove('hidden'));
$('#xPop').addEventListener('click', (e) => { if (e.target.id === 'xPop' || e.target.id === 'xClose' || e.target.closest('.x-grid button')) $('#xPop').classList.add('hidden'); });
$('#mMore').addEventListener('click', (e) => { if (e.target.id === 'mMore') $('#mMore').classList.add('hidden'); });
$('#missionBox').addEventListener('click', () => $('#missionBox').classList.toggle('open'));
$('#ldRetry').addEventListener('click', () => startLevel(levelIdx));
$('#ldNext').addEventListener('click', () => startLevel(levelIdx + 1));
$('#ldMap').addEventListener('click', openLevels);
$('#ldFame').addEventListener('click', () => openFame(true));

// ---------- Wall of Fame ----------
let fameCamp = 'nijmegen';
$('#fameTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-fc]'); if (b) { fameCamp = b.dataset.fc; openFame(false); } });
async function openFame(canSign) {
  showScreen('#fame');
  if (canSign) fameCamp = curLevel?.finale ? 'nl' : 'nijmegen';
  $('#fameTabs').innerHTML = [['nijmegen', 'Nijmegen · Hatert'], ['nl', 'Nederland · ArenA']].map(([k, t]) => `<button class="tab ${k === fameCamp ? 'sel' : ''}" data-fc="${k}">${t}</button>`).join('');
  $('#fameSub').textContent = fameCamp === 'nl' ? 'Iedereen die het spandoek de ArenA in smokkelde.' : 'Iedereen die de Koning van Hatert heeft verslagen.';
  const signable = canSign && ((fameCamp === 'nijmegen' && curLevel?.boss && save.story.hatert?.cleared) || (fameCamp === 'nl' && curLevel?.finale && save.story.arena?.cleared));
  $('#fameForm').classList.toggle('hidden', !signable);
  if (signable) { $('#fameInput').value = save.fameName || save.name || ''; $('#fameForm .err').textContent = ''; }
  const list = $('#fameList');
  list.innerHTML = '<li class="empty">Laden…</li>';
  try {
    const r = await apiCall('/api/fame' + (fameCamp === 'nl' ? '?c=nl' : ''));
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    list.innerHTML = r.rows?.length
      ? r.rows.map((row, i) => `<li data-name="${esc(row.name)}" class="click"><span class="pos">${i + 1}</span><span class="nm">${esc(row.name)}</span><span class="sc">${new Date(row.created).toLocaleDateString('nl-NL')}</span></li>`).join('')
      : `<li class="empty">${fameCamp === 'nl' ? 'Nog niemand heeft het spandoek binnengekregen.' : 'Nog niemand heeft Hatert verslagen.'}</li>`;
  } catch (e) { list.innerHTML = '<li class="empty">Kan de Wall of Fame niet laden.</li>'; }
}
$('#fameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#fameForm button'), err = $('#fameForm .err');
  btn.disabled = true; err.textContent = '';
  try {
    const r = await apiCall('/api/fame' + (fameCamp === 'nl' ? '?c=nl' : ''), { id: save.playerId, name: $('#fameInput').value, score: Math.floor(score), secs: Math.round(runTime), mult: save.mult });
    if (!r.ok) throw new Error(r.error || 'Er ging iets mis.');
    save.fameName = r.name; persist();
    $('#fameForm').classList.add('hidden');
    openFame(false);
  } catch (ex) { err.textContent = ex.message; }
  btn.disabled = false;
});
$('#fameBtn').addEventListener('click', () => openFame(false));
$('#fameBack').addEventListener('click', () => { if (curLevel) openLevels(); else showScreen('#menu'); });

// =====================================================================
//  FIETS (power-up): Jens fietst zo lang als het filmpje duurt
// =====================================================================
const FIETS_CLIPS = 47;
let fietsDmg = 0;
let fietsT = 0, fietsMax = 1, fietsBag = [], voiceSrc = null, voiceUntil = 0, voiceDuck = 0.5;
const jensBike = makeBike('#c8202b');
jensBike.visible = false;
jens.root.add(jensBike);
function loadVoices() {
  queueClip('telefoon', 'audio/telefoon.mp3');
  queueClip('bio', 'audio/bio.mp3');
  for (const n of ['gonl', 'hohoho', 'telefoon2', 'lent', 'telefoon3', 'telefoon4', 'telefoon5', 'brommer']) queueClip(n, `audio/${n}.mp3`);
  JOS_VOICE.forEach((_, i) => queueClip('jos' + (i + 1), `audio/jos/${i + 1}.mp3`));
  fietsVooruit();
}
// spraakfragment uit een filmpje; de muziek gaat zolang zachter
const VOICE_GAIN = { telefoon2: 0.63, telefoon: 1.2 };
function playVoice(name) {
  stopVoice();
  if (!ac || !save.sound || !clips[name]) return 0;
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = clips[name]; g.gain.value = (VOICE_GAIN[name] || 1) * save.set.voice / 100;
  src.connect(g).connect(voiceBus);
  src.start();
  voiceSrc = src;
  voiceDuck = name.startsWith('jos') ? 0.35 : 0.5; // Jos moet er bovenuit komen
  voiceUntil = ac.currentTime + clips[name].duration;
  src.onended = () => { if (voiceSrc === src) { voiceSrc = null; voiceUntil = 0; } };
  return clips[name].duration;
}
function stopVoice() {
  if (voiceSrc) { try { voiceSrc.stop(); } catch (e) { /* al gestopt */ } voiceSrc = null; }
  voiceUntil = 0;
}
// husselen: alle filmpjes één keer in willekeurige volgorde, daarna opnieuw
// op de iPod passen niet alle filmpjes tegelijk in het geheugen: een vaste greep van 8 per keer
const FIETS_SET = Array.from({ length: FIETS_CLIPS }, (_, i) => i + 1).sort(() => Math.random() - 0.5).slice(0, isIPod ? 8 : FIETS_CLIPS);
// fietsfilmpjes zijn groot: alleen de eerstvolgende staan klaar, een afgespeeld filmpje gaat weer uit het geheugen
let fietsVorige = null;
function fietsVooruit() {
  if (fietsBag.length < 2) fietsBag = FIETS_SET.filter((n) => !fietsBag.includes(n)).sort(() => Math.random() - 0.5).concat(fietsBag);
  for (const n of fietsBag.slice(-2)) { clipSeen.delete('fiets' + n); queueClip('fiets' + n, `audio/fiets/${n}.mp3?v=2`); }
}
function nextFietsClip() {
  if (!fietsBag.length) fietsVooruit();
  // liefst een filmpje dat al uitgepakt is
  let i = fietsBag.length - 1;
  while (i > 0 && !clips['fiets' + fietsBag[i]]) i--;
  const n = clips['fiets' + fietsBag[i]] ? fietsBag.splice(i, 1)[0] : fietsBag.pop();
  if (fietsVorige !== null && fietsVorige !== n) delete clips['fiets' + fietsVorige];
  fietsVorige = n;
  fietsVooruit();
  return n;
}
function startFiets() {
  missionEvent('fiets');
  if (brommerT > 0) { brommerT = 0; moped.visible = false; engineStop(); }
  const n = nextFietsClip();
  snapClip = 'fiets' + n;
  const dur = playVoice('fiets' + n) || clips['fiets' + n]?.duration || 10;
  fietsT = fietsMax = dur;
  fietsDmg = 0;
  nearT = 0;
  jensBike.visible = true;
  toast('🚲 FIETS!<small>2× zo snel en halve schade zolang het filmpje duurt</small>', 1.8);
}
function stopFiets() {
  fietsT = 0;
  jensBike.visible = schoolPhase === 'inside';
  stopVoice();
}

// =====================================================================
//  MONTESSORI COLLEGE: afslag (of verplicht) door de school heen fietsen
// =====================================================================
let schoolPhase = null, indoorT = 0, nextSchoolDist = 700, schoolCount = 0, schoolBlock = null, indoorStep = 0;
const streetBits = [];
scene.traverse((o) => { if (o.isMesh && (o.material === walkMat || o.material === curbMat || (o.geometry.parameters?.width === 40 && o.position.y === 0.1))) streetBits.push(o); });

// houten planken: vloer, wanden en plafond
function planks(x, w, h, n, tones, vertical) {
  const pw = (vertical ? w : h) / n;
  for (let i = 0; i < n; i++) {
    x.fillStyle = tones[i % tones.length];
    if (vertical) x.fillRect(i * pw, 0, pw, h); else x.fillRect(0, i * pw, w, pw);
    x.fillStyle = 'rgba(40,20,5,.18)'; // nerf
    for (let k = 0; k < 3; k++) { const o = i * pw + rand(2, pw - 2); if (vertical) x.fillRect(o, 0, 1, h); else x.fillRect(0, o, w, 1); }
    x.fillStyle = 'rgba(30,15,5,.55)'; // naad
    if (vertical) x.fillRect(i * pw, 0, 1, h); else x.fillRect(0, i * pw, w, 1);
    const cut = rand(0.15, 0.85) * (vertical ? h : w);
    if (vertical) x.fillRect(i * pw, cut, pw, 1); else x.fillRect(cut, i * pw, 1, pw);
  }
}
const floorTex = canvasTex(128, 128, (x) => { planks(x, 128, 128, 8, ['#9a6a3e', '#8a5c34', '#a8764a', '#7e5530'], true); grain(x, 128, 128, 12); });
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(2, 240 / 4);
const wallTexL = canvasTex(256, 128, (x) => {
  planks(x, 256, 128, 16, ['#b07a46', '#a06c3c', '#bb8650', '#98653a'], true);
  // oranje kluisjes
  for (let i = 0; i < 6; i++) {
    const kx = 4 + i * 22;
    x.fillStyle = '#e8762b'; x.fillRect(kx, 30, 20, 98);
    x.fillStyle = '#b8561a'; x.fillRect(kx, 30, 20, 2); x.fillRect(kx + 19, 30, 1, 98); x.fillRect(kx, 78, 20, 2);
    x.fillStyle = 'rgba(0,0,0,.35)'; for (let v = 0; v < 3; v++) { x.fillRect(kx + 4, 36 + v * 4, 12, 1); x.fillRect(kx + 4, 84 + v * 4, 12, 1); }
    x.fillStyle = '#d8d8d8'; x.fillRect(kx + 15, 60, 2, 7); x.fillRect(kx + 15, 106, 2, 7);
  }
  x.fillStyle = '#4a2e16'; x.fillRect(150, 30, 46, 98); // klaslokaaldeur
  x.fillStyle = '#9fc4dc'; x.fillRect(160, 42, 26, 30);
  x.fillStyle = '#ffffff'; x.fillRect(206, 30, 40, 26); x.fillStyle = '#e8762b'; x.font = '12px Anton, sans-serif'; x.fillText('LOKAAL', 208, 47);
  x.fillStyle = '#5a3a1e'; x.fillRect(0, 18, 256, 4); // lijst
  x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(0, 124, 256, 4);
  grain(x, 256, 128, 10);
});
wallTexL.wrapS = THREE.RepeatWrapping;
wallTexL.repeat.set(240 / 8, 1);
const wallTexR = wallTexL.clone(); wallTexR.needsUpdate = true;
// bovenwand: alleen planken, de camera hangt hoger dan de kluisjes
const wallTexUL = canvasTex(128, 64, (x) => { planks(x, 128, 64, 8, ['#a87444', '#9a683a', '#b37e4c'], true); x.fillStyle = '#5a3a1e'; x.fillRect(0, 60, 128, 4); grain(x, 128, 64, 10); });
wallTexUL.wrapS = THREE.RepeatWrapping; wallTexUL.repeat.set(240 / 4, 1);
const wallTexUR = wallTexUL.clone(); wallTexUR.needsUpdate = true;
const ceilTex = canvasTex(64, 64, (x) => { planks(x, 64, 64, 4, ['#c9a274', '#bd9668'], false); x.fillStyle = '#fff8e0'; x.fillRect(20, 12, 24, 40); });
ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
ceilTex.repeat.set(2, 240 / 6);
const corridor = new THREE.Group();
{
  const h = 4.2;
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(240, h, 30, 2).rotateY(Math.PI / 2), new THREE.MeshLambertMaterial({ map: wallTexL }));
  wl.position.set(-ROAD_W / 2, h / 2, -80);
  const wr = new THREE.Mesh(new THREE.PlaneGeometry(240, h, 30, 2).rotateY(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: wallTexR }));
  wr.position.set(ROAD_W / 2, h / 2, -80);
  const H2 = 7.2; // tot het plafond
  const ul = new THREE.Mesh(new THREE.PlaneGeometry(240, H2 - h, 30, 1).rotateY(Math.PI / 2), new THREE.MeshLambertMaterial({ map: wallTexUL }));
  ul.position.set(-ROAD_W / 2, (h + H2) / 2, -80);
  const ur = new THREE.Mesh(new THREE.PlaneGeometry(240, H2 - h, 30, 1).rotateY(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: wallTexUR }));
  ur.position.set(ROAD_W / 2, (h + H2) / 2, -80);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 240, 2, 30).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ map: ceilTex }));
  ceil.position.set(0, H2, -80);
  corridor.add(ul, ur);
  const zwart = new THREE.MeshBasicMaterial({ color: '#000000', fog: false });
  const ver = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 2, H2 + 2), zwart); ver.position.set(0, H2 / 2, -199);
  const dicht = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 2, H2 + 2).rotateY(Math.PI), zwart); dicht.position.set(0, H2 / 2, 39);
  for (const v of [wl, wr, ul, ur, ceil]) v.material.defines = { PSX_PERSP: '' };
  corridor.add(wl, wr, ceil, ver, dicht);
  corridor.visible = false;
  scene.add(corridor);
}
let indoor = false;
function setIndoor(on) {
  indoor = on;
  corridor.visible = on;
  road.material.map = on ? floorTex : roadTex;
  road.material.needsUpdate = true;
  for (const b of streetBits) b.visible = !on;
  for (const d of decor) for (const it of d.items) it.visible = !on && (d.kind !== 'makeParkedBikes' || !!curTheme?.houses);
  for (const w of waterPlanes) w.visible = !on && !!curTheme?.water;
  if (on) {
    // buiten de gang is alles zwart: geen doorkijkje naar de lege wereld
    SKY.set('#000000'); scene.background = SKY; scene.fog.color.set('#000000'); scene.fog.near = 12; scene.fog.far = 56;
    document.body.style.background = '#000';
    hemi.color.set('#ffffff'); hemi.groundColor.set('#9a9080'); hemi.intensity = 2.0; sun.intensity = 0.8; lantern.intensity = 0;
    for (const g of lampGlows) g.visible = false;
    stars.visible = false; moon.visible = false; skyGroup.visible = false;
  } else applyLook(phaseT);
  for (const side of [-1, 1]) for (const h of houses[side]) h.g.visible = !on && houseVisible(h, side);
}
function scrollIndoor(m) {
  if (!indoor) return;
  floorTex.offset.y += m / 4;
  wallTexL.offset.x += m / 8;
  wallTexR.offset.x -= m / 8;
  wallTexUL.offset.x += m / 4;
  wallTexUR.offset.x -= m / 4;
  ceilTex.offset.y -= m / 6;
}

// het echte logo op een witte plaat
const LOGO_URL = 'img/montessori-logo.png', LOGO_RATIO = 512 / 396;
function logoBord(h, rotY = 0) {
  const mat = cached('montessoriLogoMat', () => new THREE.MeshBasicMaterial({ map: psxTex(new THREE.TextureLoader().load(LOGO_URL)) }));
  return new THREE.Mesh(new THREE.PlaneGeometry(h * LOGO_RATIO, h).rotateY(rotY), mat);
}
// gebouw langs de weg
LANDMARKS.montessori = () => {
  const g = new THREE.Group();
  const tex = canvasTex(512, 256, (x) => {
    x.fillStyle = '#e8e6e0'; x.fillRect(0, 0, 512, 256);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) {
      x.fillStyle = '#2b3946'; x.fillRect(12 + i * 62, 18 + r * 70, 50, 48);
      x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(12 + i * 62, 18 + r * 70, 50, 10);
    }
    x.fillStyle = '#f7941d'; for (let r = 0; r < 3; r++) x.fillRect(0, 68 + r * 70, 512, 6);
    x.fillStyle = '#2b3946'; x.fillRect(220, 200, 72, 56);
  });
  const wit = M('#e8e6e0');
  g.add(new THREE.Mesh(new THREE.BoxGeometry(14, 12, 50, 2, 3, 6), [wit, new THREE.MeshLambertMaterial({ map: tex }), M('#6d6d6d'), wit, wit, wit]));
  g.children[0].position.set(7, 6, 0);
  const gevel = logoBord(7.6, -Math.PI / 2); gevel.position.set(-0.12, 7.4, 0); g.add(gevel);
  const kopse = logoBord(8); kopse.position.set(7, 7, 25.06); g.add(kopse);
  return { g, len: 54, name: 'Montessori College' };
};
function makeIngang(forced) {
  const g = new THREE.Group();
  const oranje = M('#f7941d'), wit = M('#f4f4f4');
  if (forced) {
    // de hele weg loopt de school in
    const muur = new THREE.MeshLambertMaterial({ map: canvasTex(512, 128, (x) => {
      x.fillStyle = '#e8e6e0'; x.fillRect(0, 0, 512, 128);
      x.fillStyle = '#1b1b1b'; x.fillRect(96, 28, 320, 100);
      x.fillStyle = '#f7941d'; x.fillRect(0, 0, 512, 24);
      x.fillStyle = '#fff'; x.font = '20px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.fillText('MONTESSORI COLLEGE · IEDEREEN NAAR BINNEN', 256, 18);
    }) });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 4, 6), muur); w.position.y = 3; g.add(w);
    for (const sx of [-1, 1]) g.add(mesh(box(2, 6, 1), M('#e8e6e0'), sx * (ROAD_W / 2 + 1), 3, 0.5));
    const logo = logoBord(2.6); logo.position.set(0, 7.3, 0); g.add(logo);
  } else {
    // afslag in de rechterbaan
    for (const sx of [1.15, 3.25]) g.add(mesh(box(0.2, 3.2, 0.2), oranje, sx, 1.6, 0));
    g.add(mesh(box(2.4, 0.2, 0.2), oranje, 2.2, 3.2, 0));
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (x) => {
      x.fillStyle = '#f7941d'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#fff'; x.font = '30px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('➜ SCHOOL IN', 128, 34);
    }), side: THREE.DoubleSide }));
    bord.position.set(2.2, 3.7, 0); g.add(bord);
    const logo = logoBord(1.3); logo.position.set(2.2, 4.68, 0); g.add(logo);
    for (let i = 1; i <= 4; i++) { const pijl = mesh(box(0.5, 0.02, 1.4), wit, 2.2, 0.03, i * 5); g.add(pijl); }
  }
  return g;
}
function spawnMontessori(forced) {
  schoolCount++;
  const z = -100;
  // ruim de weg rond de ingang leeg
  for (const o of objs) if (o.z < z + 30 && o.z > z - 12 && o.kind !== 'landmark') o.dead = true;
  schoolBlock = { from: dist - z - 30, to: dist - z + 12 };
  spawnLandmark({ b: 'montessori', side: 1 }, z + 30);
  addObj('ingang', makeIngang(forced), 0, z, ROAD_W, 1, 0, { forced });
  schoolPhase = 'approach';
  if (forced) toast('🏫 MONTESSORI COLLEGE<small>Je MOET naar binnen!</small>', 2.4);
  else toast('🏫 Afslag Montessori College<small>Rechts aanhouden om erdoorheen te fietsen</small>', 2.4);
}
function fade() {
  const f = $('#flash');
  f.classList.remove('on', 'red', 'black');
  void f.offsetWidth;
  f.classList.add('on', 'black');
  setTimeout(() => f.classList.remove('on', 'black'), 700);
}
function enterSchool() {
  liveEv('school');
  verslaggever('school', true);
  missionEvent('school');
  fade();
  schoolPhase = 'inside';
  indoorT = 0; indoorStep = 0;
  clearObjs();
  spawnZ = -30;
  setIndoor(true);
  jensBike.visible = true;
  nearT = 0;
  sfx.schoolbel();
  toast('🏫 Montessori College', 1.6);
  lkKans = !curLevel && mode === 'telefoon' && Math.random() < 0.25;
}
function exitSchool() {
  nextSchoolDist = Math.max(nextSchoolDist, dist + 800);
  fade();
  schoolPhase = null;
  clearObjs();
  jos.root.visible = false; // Jos blijft binnen
  spawnZ = -40;
  setIndoor(false);
  jensBike.visible = fietsT > 0;
  toast('🚪 Achteruitgang!<small>Weer buiten</small>', 1.4);
}
// Jos: dunne docent met blond plat haar, geen baard of snor
function makeJos() {
  const skin = '#f0cdb4';
  const p = makePerson({ key: 'jos', skin, hair: '#e2c675', hairStyle: 'plat', shirt: { base: '#8fa9c4', paint() {} }, pants: '#3b3f4a', shoes: '#3a2a1e',
    face: { skin, brow: '#c4a55c' }, scale: [0.8, 1.04, 0.8] });
  p.head.scale.set(0.56, 0.5, 0.56); // de romp is smal, het hoofd niet
  return p;
}
const jos = makeJos();
jos.root.visible = false;
scene.add(jos.root);
// volgorde = audio/jos/1.mp3 t/m 5.mp3
const JOS_VOICE = ['Jens ga je een briefje halen!', 'Jens je bent te laat, briefje!', 'Kom op Jens, effe briefje halen, anders sta je op afwezig', 'Hé Jens! Haal je even een briefje.', 'Jens, dit is al de derde keer deze week, ga je even een briefje halen?'];
let josBag = [];
function josPraat() {
  if (!josBag.length) josBag = JOS_VOICE.map((_, i) => i).sort(() => Math.random() - 0.5);
  const i = josBag.pop();
  const len = playVoice('jos' + (i + 1)) || 2.5;
  const parts = subChunks('Jos: ' + JOS_VOICE[i]);
  parts.forEach((part, k) => setTimeout(() => { if (schoolPhase === 'inside') bubble(jos.head, part, '', len / parts.length + 0.25); }, (k * len * 1000) / parts.length));
}
function spawnIndoorRow(z) {
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const type = pick(['rugzak', 'rugzak', 'stoel', 'stoel', 'kar']);
  const x = LANES[lanes[0]];
  if (type === 'rugzak') addObj('rugzak', makeRugzak(), x, z, 0.8, 0.6, 0.55, { gen: 'stumble' });
  else if (type === 'stoel') addObj('stoel', makeStoel(), x, z, 0.8, 0.7, 0.95, { gen: 'stumble' });
  else addObj('kar', makeKar(), x, z, 1.0, 1.2, 1.2, { gen: 'stumble' });
  if (Math.random() < 0.6) spawnCoinsLine(lanes[1], z);
}
function makeRugzak() {
  const g = new THREE.Group();
  const kleur = fabricMat(pick(['#c8202b', '#2667c9', '#1f1f1f', '#3c6e47', '#e8b923']));
  g.add(mesh(box(0.45, 0.5, 0.3), kleur, 0, 0.25, 0));
  g.add(mesh(box(0.4, 0.2, 0.12), kleur, 0, 0.18, -0.2));
  g.rotation.set(-1.2, rand(-1, 1), 0); g.position.y = 0.1;
  return g;
}
function makeStoel() {
  const g = new THREE.Group();
  const zitting = M(pick(['#2f6b3a', '#c8202b', '#2667c9'])), poot = M('#8a8f96');
  g.add(mesh(box(0.45, 0.05, 0.45), zitting, 0, 0.46, 0));
  g.add(mesh(box(0.45, 0.4, 0.05), zitting, 0, 0.7, 0.2));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(mesh(box(0.04, 0.46, 0.04), poot, x, 0.23, z));
  g.rotation.y = rand(-0.8, 0.8);
  return g;
}
function makeKar() {
  const g = new THREE.Group();
  g.add(mesh(box(0.7, 0.8, 1.0), M('#e8b923'), 0, 0.55, 0));
  g.add(mesh(cylG(0.22, 0.2, 0.4, 8), M('#2667c9'), 0, 1.1, 0.2));
  g.add(mesh(box(0.04, 1.2, 0.04), M('#8a6a44'), 0.25, 1.2, -0.3));
  for (const [x, z] of [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.4], [0.3, 0.4]]) { const w = wheel(0.08, 0.05, M('#1b1b1b')); w.position.set(x, 0.08, z); g.add(w); }
  return g;
}
function makeUitgang() {
  const g = new THREE.Group();
  g.add(mesh(box(ROAD_W, 4.2, 0.2), M('#e8e2d2'), 0, 2.1, -0.2));
  g.add(mesh(box(3.4, 3.2, 0.1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0, 1.6, -0.05));
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(256, 80, (x) => {
    x.fillStyle = '#1f9a4a'; x.fillRect(0, 0, 256, 80); x.fillStyle = '#fff'; x.font = '36px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🏃 UITGANG', 128, 42);
  }) }));
  bord.position.set(0, 3.6, 0.1); g.add(bord);
  return g;
}
// verloop binnen: bel, Jos wenkt en roept als je eraan komt, rent je na het passeren achterna tot de achteruitgang
const SCHOOL_TIME = 15;
function updateSchool(dt, m) {
  if (curLevel || jacht?.rol === 'shane') return;
  // kans op de school na een stuk afstand; hoe vaker hij al kwam, hoe langer de pauze
  if (!schoolPhase && dist >= nextSchoolDist) {
    const k = 'sc' + Math.round(nextSchoolDist);
    nextSchoolDist = dist + 700 + schoolCount * 500;
    seeded(k, () => { if (Math.random() < 1 / 3) spawnMontessori(Math.random() < 1 / 5); });
  }
  if (schoolPhase === 'approach' && !objs.some((o) => o.kind === 'ingang')) { schoolPhase = null; schoolBlock = null; }
  if (schoolPhase !== 'inside') return;
  indoorT += dt;
  const jr = jos.root;
  if (indoorStep === 0) {
    indoorStep = 1;
    const z = -Math.max(10, speed * 1.2); // Jos staat al bij de deur te wachten
    jr.position.set(-ROAD_W / 2 + 0.7, 0, z);
    jr.rotation.y = Math.PI;
    jr.visible = true;
    addObj('deco', logoBord(1.5, Math.PI / 2), -ROAD_W / 2 + 0.03, z, 0, 0, 0, { y: 2.9 });
  }
  if (indoorStep === 1 || indoorStep === 2) {
    jr.position.z += m;
    pose(jos, 'wenk', dt);
    if (indoorStep === 1 && jr.position.z > -speed) { indoorStep = 2; josPraat(); }
    if (jr.position.z > 0) indoorStep = 3;
  } else if (indoorStep >= 3) {
    jr.rotation.y = damp(jr.rotation.y, 0, 8, dt);
    jr.position.x = damp(jr.position.x, player.x, 3, dt);
    jr.position.z = damp(jr.position.z, camera.aspect < 0.8 ? 3.4 : 2.9, 1.2, dt);
    pose(jos, 'point', dt, clamp(speed / 12, 0.8, 1.6));
  }
  if (indoorStep === 3 && indoorT > SCHOOL_TIME - 1.6) { indoorStep = 4; addObj('deco', makeUitgang(), 0, -Math.max(12, speed * 1.5), 0, 0, 0); }
  // soms staat de deur van de lerarenkamer open
  if (lkKans && indoorT > 3.5) {
    lkKans = false;
    const z = -Math.max(34, speed * 3.2);
    for (const o of objs) if (o.z > z - 10 && o.z < z + 10 && Math.abs(o.x - LANES[2]) < 1) o.dead = true;
    addObj('lkdeur', makeLkDeur(), 0, z, 0, 0, 0);
    toast('🚪 De lerarenkamer staat open!<small>Hou rechts aan om naar binnen te rennen</small>', 2.6);
    bubble(jens.head, 'Hé, die deur is open!', 'shout', 1.6, 0.5);
  }
  if (indoorT > SCHOOL_TIME) exitSchool();
}
// ---------- de lerarenkamer: exclusieve upgrades voor de rest van de run ----------
const LK_ITEMS = [
  { id: 'brommer', icon: '🛵', name: "Lev's schakelbrommer", price: 300, text: 'Langer onaantastbaar: de brommer duurt 1,7× zo lang en na een klap ben je 2,5× zo lang veilig.' },
  { id: 'thunder', icon: '🎆', name: 'De Thunderking', price: 450, text: 'Schiet om de 7 seconden vuurwerk op alle drie de banen.' },
  { id: 'plakker', icon: '🧑', name: 'Plakmaatje', price: 350, text: 'Een blonde vriend rent met je mee en plakt op elke paal een sticker. Meer punten.' },
  { id: 'wk', icon: '🏆', name: 'De WK beker', price: 200, text: '2× bekers voor 10 seconden, zodra je de gang weer in rent.' },
];
let runUp = {}, wkT = 0, thunderT = 3, lkKans = false, lkRoom = null, lkPrev = 0;
const LK_X = 700;
// blond, strak achterovergekamd haar, geen naam
const plakMaatje = makePerson({ key: 'plakmaatje', skin: '#f2d3bb', hair: '#e8cf7a', hairStyle: 'plat', shirt: { base: '#20242c', paint() {} }, pants: '#3a3f4a', shoes: '#eeeeee', face: { skin: '#f2d3bb', brow: '#c4a55c' }, scale: [0.92, 1, 0.92] });
{
  // het haar glad naar achteren: een lage kap die in de nek doorloopt
  const kam = M('#e8cf7a');
  plakMaatje.head.add(mesh(box(0.72, 0.16, 0.86), kam, 0, 0.3, 0.05));
  plakMaatje.head.add(mesh(box(0.66, 0.24, 0.2), kam, 0, 0.14, 0.42));
  plakMaatje.root.visible = false;
  scene.add(plakMaatje.root);
}
function makeLkDeur() {
  const g = new THREE.Group(), x = ROAD_W / 2 - 0.06;
  const paneel = mesh(box(0.12, 3.1, 2.6), M('#5a3a1e'), x, 1.55, 0);
  g.add(paneel);
  g.add(mesh(box(0.08, 2.9, 2.2), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), x - 0.05, 1.45, 0)); // licht uit de open deur
  // poort over de rechterbaan: het bord staat recht naar je toe, de deur in de muur zie je pas laat
  for (const px of [LANES[2] - 1.1, LANES[2] + 1.1]) g.add(mesh(box(0.2, 3.1, 0.2), M('#c8202b'), px, 1.55, 0));
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: canvasTex(256, 52, (c) => {
    c.fillStyle = '#c8202b'; c.fillRect(0, 0, 256, 52); c.fillStyle = '#fff'; c.font = '34px Anton, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LERARENKAMER', 128, 28);
  }) }));
  bord.position.set(LANES[2], 3.4, 0); g.add(bord);
  for (let i = 1; i <= 4; i++) g.add(mesh(box(0.7, 0.02, 1.4), M('#fff3c4', { emissive: '#c9a640' }), LANES[2], 0.03, i * 5));
  return g;
}
function buildLkRoom() {
  const g = new THREE.Group(), muur = M('#d6d0bf'), vloer = M('#7a5a3a');
  g.position.x = LK_X;
  g.add(mesh(box(9, 0.1, 8), vloer, 0, -0.05, 0));
  g.add(mesh(box(9, 3.2, 0.2), muur, 0, 1.6, 3.2));
  g.add(mesh(box(0.2, 3.2, 8), muur, -4.2, 1.6, 0));
  g.add(mesh(box(0.2, 3.2, 8), muur, 4.2, 1.6, 0));
  g.add(mesh(box(9, 0.1, 8), M('#efeadd'), 0, 3.2, 0));
  g.add(mesh(box(1.6, 0.05, 0.9), new THREE.MeshBasicMaterial({ color: '#fff6d8' }), 0, 3.14, 0));
  // whiteboard
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.3).rotateY(Math.PI), new THREE.MeshBasicMaterial({ map: canvasTex(192, 84, (c) => {
    c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, 192, 84); c.fillStyle = '#c8202b'; c.font = '20px Anton, Impact, sans-serif'; c.textAlign = 'center'; c.fillText('NIET VOOR LEERLINGEN', 96, 28);
    c.fillStyle = '#1f4fa8'; c.font = '13px Anton, Impact, sans-serif'; c.fillText('JENS: 14× TE LAAT', 96, 52); c.fillText('KOFFIE IS OP', 96, 70);
  }) }));
  wb.position.set(-0.9, 1.9, 3.08); g.add(wb);
  // tafel, koffie, kluisjes
  g.add(mesh(box(2.4, 0.08, 1.1), M('#8a6a44'), 1.5, 0.78, 1.2));
  for (const [x, z] of [[0.45, 0.75], [2.55, 0.75], [0.45, 1.65], [2.55, 1.65]]) g.add(mesh(box(0.08, 0.78, 0.08), M('#5a4630'), x, 0.39, z));
  g.add(mesh(cylG(0.05, 0.04, 0.1, 6), M('#ffffff'), 1.1, 0.87, 1.0));
  g.add(mesh(cylG(0.05, 0.04, 0.1, 6), M('#c8202b'), 1.9, 0.87, 1.4));
  g.add(mesh(box(0.7, 1.6, 0.6), M('#2a2a2e'), -3.5, 0.8, 2.6));
  g.add(mesh(box(0.5, 0.4, 0.05), new THREE.MeshBasicMaterial({ color: '#ffb340' }), -3.5, 1.2, 2.28));
  for (let i = 0; i < 4; i++) g.add(mesh(box(0.55, 2, 0.5), M(i % 2 ? '#e8762b' : '#d4661f'), 3.8, 1, 2.8 - i * 0.6));
  // de spullen liggen op de tafel
  const c = makeCup(0.5, bekerMat, 'high'); c.position.set(1.5, 0.98, 1.0); g.add(c);
  // twee docenten aan de koffie
  for (const [x, z, key] of [[0.2, 1.2, 'lkdocent1'], [2.9, 1.2, 'lkdocent2']]) {
    const p = makePerson({ key, skin: '#e9bf9a', hair: x < 1 ? '#555' : '#8a5a32', hairStyle: 'kort', shirt: { base: x < 1 ? '#8fa9c4' : '#a0653a', paint() {} }, pants: '#333', shoes: '#222', face: { skin: '#e9bf9a' } });
    p.root.position.set(x, 0, z); p.root.rotation.y = x < 1 ? -Math.PI / 2 : Math.PI / 2;
    pose(p, 'seat', 1);
    g.add(p.root);
  }
  scene.add(g);
  return g;
}
function renderLk() {
  $('#lkBekers').textContent = save.bekers.toLocaleString('nl-NL');
  $('#lkList').innerHTML = LK_ITEMS.map((it) => `<button class="lk-item ${runUp[it.id] ? 'got' : save.bekers < it.price ? 'cant' : ''}" data-lk="${it.id}"><i>${it.icon}</i><b>${it.name}</b><em>${runUp[it.id] ? '✓ Gekocht' : `🏆 ${it.price}`}</em><small>${it.text}</small></button>`).join('');
}
function enterLk() {
  fade();
  lkRoom ||= buildLkRoom();
  lkRoom.visible = true;
  lkPrev = state;
  state = 'lkamer';
  $('#hud').classList.add('hidden');
  hemi.color.set('#fff1d8'); hemi.intensity = 2.4; sun.intensity = 1.4;
  jens.root.position.set(LK_X - 1.3, 0, 0);
  jens.root.rotation.set(0, 0, 0);
  jensBike.visible = false;
  showScreen('#lkamer');
  renderLk();
  sfx.schoolbel();
}
function lkCamera() {
  camera.position.set(LK_X - 0.2, 1.55, -3.9);
  camera.lookAt(camera.aspect < 0.8 ? LK_X - 1.3 : LK_X - 0.1, camera.aspect < 0.8 ? 0.2 : 1.15, 2);
  pose(jens, 'idle', 0.03);
}
$('#lkList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lk]');
  if (!b) return;
  const it = LK_ITEMS.find((x) => x.id === b.dataset.lk);
  if (runUp[it.id]) return;
  if (save.bekers < it.price) { note(`Je mist nog ${it.price - save.bekers} bekers`); tone(180, 0.15, 'square', 0.06); return; }
  save.bekers -= it.price; persist();
  runUp[it.id] = true;
  sfx.power();
  renderLk();
});
$('#lkBack').addEventListener('click', () => {
  fade();
  lkRoom.visible = false;
  showScreen(null);
  $('#hud').classList.remove('hidden');
  jensBike.visible = true;
  jens.root.position.set(player.x, player.y, 0);
  hemi.color.set('#ffffff'); hemi.groundColor.set('#9a9080'); hemi.intensity = 2.0; sun.intensity = 0.8;
  state = 'run';
  invulnT = Math.max(invulnT, 1);
  if (runUp.wk && !runUp.wkUsed) { runUp.wkUsed = true; wkT = 10; }
  if (runUp.plakker) { plakMaatje.root.visible = true; plakMaatje.root.position.set(player.x + 1, 0, 4); }
  if (runUp.thunder) thunderT = 2;
});
// volley op alle drie de banen
function thunderVolley() {
  LANES.forEach((lx, i) => setTimeout(() => {
    if (state !== 'run') return;
    let target = null;
    for (const o of objs) {
      if (!(SLOOPBAAR.has(o.kind) || o.gen) || o.hit || o.kind === 'deco') continue;
      if (o.z > -1.5 || o.z < -55 || Math.abs(o.x - lx) > o.w / 2 + 0.7) continue;
      if (!target || o.z > target.z) target = o;
    }
    const m = makeNitraat();
    m.position.set(lx, 1.3, -0.4);
    scene.add(m);
    shots.push({ mesh: m, x: lx, z: -0.4, t: 0, target, startZ: -0.4 });
    sfx.sis();
  }, i * 110));
}
// het plakmaatje rent naar de eerstvolgende paal en plakt er een sticker op
function updateUpgrades(dt) {
  if (wkT > 0) wkT -= dt;
  if (runUp.thunder && !indoor && (thunderT -= dt) <= 0) { thunderT = 7; thunderVolley(); }
  if (!runUp.plakker) return;
  const pm = plakMaatje.root;
  pm.visible = !indoor && !seg?.active;
  if (!pm.visible) return;
  let next = null;
  for (const d of decor) if (d.kind === 'makeLamp') for (const it of d.items) {
    if (it.userData.sticker || it.position.z > 1.2 || it.position.z < -40) continue;
    if (!next || it.position.z > next.position.z) next = it;
  }
  const tx = next ? Math.sign(next.position.x) * (ROAD_W / 2 + 0.05) : player.x + 1.4;
  pm.position.x = damp(pm.position.x, tx, next && next.position.z > -14 ? 2.6 : 1.1, dt);
  pm.position.z = damp(pm.position.z, 0.3, 2, dt);
  pose(plakMaatje, 'run', dt, clamp(speed / 12, 0.8, 1.6));
  if (next && next.position.z > -1.1) {
    const side = Math.sign(next.position.x);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34).rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2), stickerMat);
    pl.position.set(-side * 0.1, 1.45, 0);
    next.add(pl);
    next.userData.sticker = pl;
    const pts = 60 * (bekerT > 0 ? 2 : 1) * scoreMult();
    score += pts;
    missionEvent('sticker');
    tone(240, 0.08, 'square', 0.05);
    runPop('+' + pts, 'good small');
  }
}

// =====================================================================
//  VERHAAL 2: TERRORISEER NEDERLAND
// =====================================================================
Object.assign(THEMES, {
  arnhem: { houses: 'flat', heights: [10, 18], roof: false, grass: '#5f8f48', streets: ['Batavierenweg', 'Nijmeegseweg', 'Gelredomeplein', 'Rijnbaan'], obstacles: ['trolleybus', 'kliko', 'auto', 'auto', 'gat', 'fietswrak'] },
  kermis: { houses: 'rij', heights: [6, 8.5], roof: true, grass: '#6f9a52', streets: ['Markt Wijchen', 'Kasteellaan', 'Touwslagersbaan', 'Homberg'], obstacles: ['botsauto', 'botsauto', 'suikerspin', 'kliko', 'gat', 'dranghek'] },
  malden: { houses: 'rij', heights: [5, 7], roof: true, grass: '#7aa84f', streets: ['Rijksweg', 'Hoogstraat', 'Kerkplein', 'Heikantstraat'], obstacles: ['bakfiets', 'bakfiets', 'kliko', 'auto', 'gat', 'fietswrak'] },
  bos: { houses: null, heights: [6, 8], roof: true, grass: '#3f6b2e', streets: ['Zevenheuvelenweg', 'Oude Kleefsebaan', 'Postweg', 'Duivelsberg'], obstacles: ['boomstam', 'boomstam', 'fietswrak', 'auto', 'gat'] },
  terapel: { houses: 'rij', heights: [5, 6.5], roof: true, grass: '#7fa04a', water: true, streets: ['Hoofdstraat', 'Boslaan', 'Kloosterlaan', 'Ter Apelkanaal'], obstacles: ['hooibaal', 'hooibaal', 'trekker', 'kliko', 'auto', 'gat'] },
  polder: { houses: null, heights: [6, 8], roof: true, grass: '#8ab65a', streets: ['Hoogstraat', 'Schoonenburgseweg', 'Kerkstraat', 'Maasdijk'], obstacles: ['koe', 'koe', 'koe', 'hooibaal', 'trekker', 'gat'] },
  denhaag: { houses: 'centrum', heights: [10, 16], roof: true, grass: '#6f9a52', streets: ['Malieveld', 'Koekamplaan', 'Zuid-Hollandlaan', 'Lange Voorhout'], obstacles: ['trekker', 'trekker', 'hooibaal', 'dranghek', 'afzetting-row', 'gat'] },
  rotterdam: { houses: 'flat', heights: [16, 30], roof: false, grass: '#5f7a48', water: true, streets: ['Maashaven', 'Afrikaanderplein', 'Strevelsweg', 'Kop van Zuid'], obstacles: ['container', 'container', 'auto', 'kliko', 'gat', 'drerrie'] },
  urk: { houses: 'arbeider', heights: [5, 7], roof: true, grass: '#7aa84f', water: true, streets: ['Wijk 1', 'Westhavenkade', 'Bootstraat', 'Vuurtorenpad'], obstacles: ['viskrat', 'viskrat', 'fietswrak', 'kliko', 'gat', 'auto'] },
  amsterdam: { houses: 'campus', heights: [14, 26], roof: false, grass: '#5f7a48', streets: ['Arena Boulevard', 'Johan Cruijff Boulevard', 'Bijlmerdreef', 'Hoogoorddreef'], obstacles: ['steward', 'steward', 'dranghek', 'fietswrak', 'auto', 'gat'] },
});

// ---------- nieuwe obstakels ----------
function makeTrolleybus() {
  const g = new THREE.Group();
  const geel = M('#e8b923'), glas = M('#26313d');
  g.add(mesh(box(2.3, 2.6, 8), geel, 0, 1.6, 0));
  g.add(mesh(box(2.32, 1.0, 7.2), glas, 0, 2.0, 0.2));
  g.add(mesh(box(2.0, 1.0, 0.05), glas, 0, 2.1, -4.02));
  g.add(mesh(box(1.6, 0.3, 0.06), new THREE.MeshBasicMaterial({ color: '#ff9a1f' }), 0, 2.85, -4.03));
  for (const sx of [-0.4, 0.4]) { const s = mesh(box(0.05, 0.05, 4), M('#222'), sx, 3.6, 1.2); s.rotation.x = 0.35; g.add(s); }
  for (const [x, z] of [[-1, -2.8], [1, -2.8], [-1, 2.8], [1, 2.8]]) { const w = wheel(0.5, 0.3, M('#1b1b1b')); w.position.set(x, 0.5, z); g.add(w); }
  g.add(makeShadow(2.8, 8.6));
  return g;
}
function makeBotsauto() {
  const g = new THREE.Group();
  const kleur = M(pick(['#c8202b', '#2667c9', '#e8b923', '#2bb673', '#ff7ae0']));
  g.add(mesh(box(1.2, 0.45, 1.6), kleur, 0, 0.35, 0));
  g.add(mesh(box(1.35, 0.2, 1.75), M('#1b1b1b'), 0, 0.15, 0));
  g.add(mesh(box(0.06, 2.2, 0.06), M('#c9ccd1'), 0, 1.5, 0.6));
  g.add(mesh(box(0.5, 0.35, 0.5), M('#1b1b1b'), 0, 0.75, 0.25));
  g.add(makeShadow(1.6, 2));
  return g;
}
function makeKraam(kleur, tekst) {
  const g = new THREE.Group();
  g.add(mesh(box(2.0, 1.1, 1.3), M(kleur), 0, 0.55, 0));
  const dak = mesh(box(2.3, 0.1, 1.7), M('#f4f1ea'), 0, 2.3, 0); dak.rotation.x = -0.12; g.add(dak);
  for (const x of [-0.95, 0.95]) g.add(mesh(box(0.06, 2.3, 0.06), M('#8a6a44'), x, 1.15, -0.6));
  const bord = textPlane(tekst, 2, 0.4, '#ffffff', kleur); bord.rotation.y = Math.PI; bord.position.set(0, 1.75, -0.66); g.add(bord);
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.17, 0), M('#ffb3e6'), -0.6 + i * 0.4, 1.3, 0));
  g.add(makeShadow(2.4, 1.6));
  return g;
}
function makeBakfiets() {
  const g = new THREE.Group();
  g.add(mesh(box(0.8, 0.5, 0.9), M('#6b4a2e'), 0, 0.55, -0.55));
  const b = makeBike(pick(['#1b1b1b', '#2f6b3a'])); b.position.z = 0.4; g.add(b);
  g.add(makeShadow(1.2, 2.2));
  return g;
}
function makeBoomstam() {
  const g = new THREE.Group();
  const stam = mesh(cylG(0.28, 0.32, 2.1, 8).rotateZ(Math.PI / 2), M('#6b4a2e'), 0, 0.3, 0);
  g.add(stam);
  g.add(mesh(new THREE.CircleGeometry(0.28, 8).rotateY(Math.PI / 2), M('#c9a36b'), 1.06, 0.3, 0));
  g.add(makeShadow(2.4, 0.9));
  return g;
}
function makeHooibaal() {
  const g = new THREE.Group();
  g.add(mesh(cylG(0.6, 0.6, 1.2, 10).rotateZ(Math.PI / 2), M(Math.random() < 0.5 ? '#d9b45a' : '#f4f4f4'), 0, 0.6, 0));
  g.add(makeShadow(1.6, 1.4));
  return g;
}
function makeTrekker() {
  const g = new THREE.Group();
  const groen = M(pick(['#2f7d32', '#c8202b', '#2667c9'])), zwart = M('#1b1b1b');
  g.add(mesh(box(1.2, 0.9, 2.2), groen, 0, 1.1, -0.5));
  g.add(mesh(box(1.3, 1.3, 1.2), groen, 0, 1.95, 0.6));
  g.add(mesh(box(1.25, 0.9, 1.1), M('#26313d'), 0, 2.1, 0.6));
  for (const sx of [-1, 1]) { const w = wheel(0.8, 0.5, zwart); w.position.set(sx * 0.85, 0.8, 0.6); g.add(w); const v = wheel(0.45, 0.35, zwart); v.position.set(sx * 0.75, 0.45, -1.3); g.add(v); }
  g.add(mesh(box(0.12, 0.8, 0.12), M('#555'), 0.4, 2.0, -1.0));
  const vlag = textPlane('🇳🇱', 0.6, 0.4, '#ffffff', '#c8202b'); vlag.position.set(-0.5, 3.0, 0.6); g.add(vlag);
  g.add(makeShadow(2.2, 3.4));
  return g;
}
function makeKoe() {
  const g = new THREE.Group();
  const huid = new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (x) => {
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#1b1b1b'; for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(rand(0, 64), rand(0, 64), rand(6, 14), rand(5, 10), rand(0, 3), 0, 7); x.fill(); }
  }) });
  g.add(mesh(box(0.7, 0.7, 1.5), huid, 0, 0.95, 0));
  g.add(mesh(box(0.42, 0.42, 0.5), huid, 0, 1.2, -0.9));
  g.add(mesh(box(0.3, 0.18, 0.12), M('#e8a0a0'), 0, 1.05, -1.18));
  const legs = [];
  for (const [x, z] of [[-0.25, -0.55], [0.25, -0.55], [-0.25, 0.55], [0.25, 0.55]]) { const l = new THREE.Group(); l.position.set(x, 0.6, z); l.add(mesh(box(0.14, 0.6, 0.14), huid, 0, -0.3, 0)); g.add(l); legs.push(l); }
  g.add(makeShadow(1.2, 1.9));
  g.userData.legs = legs;
  return g;
}
function makeContainer() {
  const g = new THREE.Group();
  const kleur = pick(['#c8202b', '#2667c9', '#e8762b', '#2f7d32', '#8a8f96']);
  const tex = canvasTex(128, 64, (x) => { x.fillStyle = kleur; x.fillRect(0, 0, 128, 64); x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 128; i += 6) x.fillRect(i, 0, 2, 64); x.fillStyle = '#fff'; x.font = '14px Impact, sans-serif'; x.fillText(pick(['MAERSK', 'COSCO', 'MSC', 'HAPAG']), 8, 20); });
  g.add(mesh(box(2.2, 2.4, 5.6), new THREE.MeshLambertMaterial({ map: tex }), 0, 1.2, 0));
  g.add(makeShadow(2.6, 6));
  return g;
}
function makeViskrat() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    g.add(mesh(box(0.9, 0.32, 0.6), M(pick(['#2667c9', '#e8762b', '#2f7d32'])), rand(-0.05, 0.05), 0.16 + i * 0.33, rand(-0.05, 0.05)));
  }
  for (let i = 0; i < 4; i++) { const v = mesh(box(0.35, 0.08, 0.12), M('#b8c4cc'), rand(-0.3, 0.3), 1.04, rand(-0.2, 0.2)); v.rotation.y = rand(0, 3); g.add(v); }
  g.add(makeShadow(1.2, 0.9));
  return g;
}
function makeSteward() {
  const p = makePerson({ key: 'steward', skin: pick(['#f2d0b8', '#c99468', '#e8c3a6']), hair: '#2a1d14', hairStyle: pick(['kort', 'kaal']),
    shirt: { base: '#e8f02a', paint(x, side) { x.fillStyle = '#d0d4d8'; x.fillRect(0, 70, 128, 10); x.fillRect(0, 96, 128, 10); if (side === 'back') text(x, 'STEWARD', '#1b1b1b', 20, 40); } },
    pants: '#1b1b2a', shoes: '#111', face: { skin: '#e8c3a6', angry: true }, scale: [1.12, 1.05, 1.1] });
  p.root.rotation.y = Math.PI;
  return p;
}
function makeTegenligger() {
  const g = makeCar();
  g.rotation.y = Math.PI;
  const licht = new THREE.MeshBasicMaterial({ color: '#fff6c0' });
  for (const sx of [-0.6, 0.6]) g.add(mesh(box(0.35, 0.18, 0.05), licht, sx, 0.75, 1.97));
  return g;
}
const SPECIAL_EXTRA = {
  trolleybus: (lane, z) => addObj('trolleybus', makeTrolleybus(), LANES[lane], z - 3, 2.3, 8, 3, { gen: 'die', deathText: 'Jens knalde op een Arnhemse trolleybus. Die stoppen niet voor niemand.' }),
  botsauto: (lane, z) => {
    let dir = pick([-1, 1]);
    return addObj('botsauto', makeBotsauto(), LANES[lane], z, 1.3, 1.8, 0.8, { gen: 'stumble',
      upd(o, dt) { if (o.hit || o.z < -40) return; o.x += dir * 2.4 * dt; if (Math.abs(o.x) > 2.4) { dir = -dir; o.x = clamp(o.x, -2.4, 2.4); } o.mesh.position.x = o.x; } });
  },
  suikerspin: (lane, z) => addObj('suikerspin', makeKraam('#ff5fb8', 'SUIKERSPIN'), LANES[lane], z, 2.0, 1.4, 2.3, { gen: 'die', deathText: 'Jens dook kop-voor in een suikerspinkraam. Overal roze plakzooi.' }),
  bakfiets: (lane, z) => addObj('bakfiets', makeBakfiets(), LANES[lane], z, 1.0, 2.2, 1.0, { gen: 'stumble' }),
  boomstam: (lane, z) => addObj('boomstam', makeBoomstam(), LANES[lane], z, 2.1, 0.7, 0.62, { gen: 'stumble' }),
  hooibaal: (lane, z) => addObj('hooibaal', makeHooibaal(), LANES[lane], z, 1.3, 1.2, 1.15, { gen: 'stumble' }),
  trekker: (lane, z) => addObj('trekker', makeTrekker(), LANES[lane], z - 1, 1.8, 3.4, 2.6, { gen: 'die', deathText: 'Jens rende tegen een trekker aan. De boer was er niet blij mee.' }),
  koe: (lane, z) => {
    const dir = pick([-1, 1]);
    return addObj('koe', makeKoe(), LANES[lane], z, 1.0, 1.7, 1.3, { gen: 'die', deathText: 'Jens botste op een koe. Een koe wint altijd.',
      upd(o, dt) {
        const t = now() * 6; o.mesh.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(t + i * 1.6) * 0.35; });
        if (o.z > -35 && !o.hit) { o.x += dir * 0.9 * dt; if (Math.abs(o.x) > 3.3) o.x = -o.x; o.mesh.position.x = o.x; o.mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
      } });
  },
  container: (lane, z) => addObj('container', makeContainer(), LANES[lane], z - 2, 2.2, 5.6, 2.4, { gen: 'die', deathText: 'Jens liep tegen een zeecontainer op Zuid. Rotterdam is hard.' }),
  viskrat: (lane, z) => addObj('viskrat', makeViskrat(), LANES[lane], z, 1.0, 0.7, 1.05, { gen: 'stumble' }),
  steward: (lane, z) => {
    const p = makeSteward();
    return addObj('steward', p.root, LANES[lane], z, 0.8, 0.6, 1.8, { gen: 'die', deathText: 'Een steward hield Jens tegen en vond het spandoek. Einde smokkelpoging.',
      upd(o, dt) {
        if (!o.hit && state === 'run' && o.z > -28) { const step = 1.8 * dt; o.x += clamp(player.x - o.x, -step, step); o.mesh.position.x = o.x; }
        pose(p, o.z > -10 ? 'reach' : 'idle', dt);
        if (!o.yelled && o.z > -18) { o.yelled = true; bubble(p.head, pick(['Ho, even je tas open!', 'Wat zit daarin?', 'Stop! Controle!']), 'angry', 1.4); }
      } });
  },
  tegenligger: (lane, z) => addObj('tegenligger', makeTegenligger(), LANES[lane], z, 1.85, 3.9, 1.5, { gen: 'die', deathText: 'Jens liep frontaal op een tegenligger in. Die toeterde nog wel.',
    upd(o, dt) { if (state === 'run' && !o.hit) o.z += 9 * dt; } }),
};

// controlepoort (finale): alleen glijdend kom je er met het spandoek door
function makePoort() {
  const g = new THREE.Group();
  const grijs = M('#8a8f96');
  for (const x of [-ROAD_W / 2 + 0.2, ROAD_W / 2 - 0.2]) g.add(mesh(box(0.3, 2.4, 0.5), grijs, x, 1.2, 0));
  g.add(mesh(box(ROAD_W, 0.5, 0.4), grijs, 0, 1.3, 0));
  g.add(mesh(box(ROAD_W - 0.4, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), 0, 1.0, -0.2));
  const bord = textPlane('CONTROLE · GEEN SPANDOEKEN', 5, 0.5, '#ffffff', '#c8202b'); bord.rotation.y = Math.PI / 2; bord.position.set(0, 1.85, 0.21); g.add(bord);
  return g;
}

// ---------- nieuwe bezienswaardigheden ----------
Object.assign(LANDMARKS, {
  gelredome() {
    const g = new THREE.Group();
    const wand = new THREE.MeshLambertMaterial({ map: canvasTex(256, 64, (x) => { x.fillStyle = '#c9cdd2'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#8a9096'; for (let i = 0; i < 256; i += 16) x.fillRect(i, 0, 3, 64); }) });
    const body = mesh(cylG(22, 23, 16, 18, 1, false, 0, Math.PI), wand, 0, 8, 0);
    body.rotation.y = -Math.PI / 2; body.position.x = 22; g.add(body);
    const roof = new THREE.Group();
    const dak = mesh(sphG(22, 18, 6, 0, Math.PI, 0, Math.PI / 2), M('#e8ecef'), 0, 0, 0); dak.scale.y = 0.35; dak.rotation.y = -Math.PI / 2; roof.add(dak);
    roof.position.set(22, 16, 0); g.add(roof);
    const bord = textPlane('GELREDOME', 20, 3, '#ffffff', '#1f1f1f'); bord.position.set(0.6, 11, 0); g.add(bord);
    return { g, len: 48, name: 'GelreDome', roof };
  },
  reuzenrad() {
    const g = new THREE.Group();
    const wiel = new THREE.Group(); wiel.position.set(6, 13, 0);
    const staal = M('#e8ecef');
    wiel.add(mesh(torG(10, 0.25, 6, 24).rotateY(Math.PI / 2), staal));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const spaak = mesh(box(0.15, 10, 0.15), staal, 0, Math.sin(a) * 5, Math.cos(a) * 5); spaak.rotation.x = -a; wiel.add(spaak);
      wiel.add(mesh(box(1, 1, 1.2), M(pick(['#c8202b', '#2667c9', '#e8b923', '#2bb673', '#ff7ae0'])), 0, Math.sin(a) * 10, Math.cos(a) * 10));
    }
    g.add(wiel);
    for (const z of [-4, 4]) { const poot = mesh(box(0.5, 14, 0.5), staal, 6, 6.5, z); poot.rotation.x = z > 0 ? -0.3 : 0.3; g.add(poot); }
    const bord = textPlane('KERMIS WIJCHEN', 10, 1.4, '#ffd23f', '#c8202b'); bord.position.set(0.4, 3, 0); g.add(bord);
    return { g, len: 26, name: 'Kermis Wijchen', upd(o, dt) { wiel.rotation.x += dt * 0.4; } };
  },
  kasteel() {
    const g = new THREE.Group(), steen = M('#d9cdb4'), dak = M('#3a3f45');
    g.add(mesh(new THREE.BoxGeometry(12, 10, 22, 2, 2, 3), steen, 6, 5, 0));
    const r = prismRoof(12.4, 22, 5, dak); r.position.set(6, 10, 0); g.add(r);
    for (const z of [-11, 11]) { g.add(mesh(cylG(2, 2, 15, 8), steen, 1.5, 7.5, z)); g.add(mesh(coneG(2.4, 4, 8), dak, 1.5, 17, z)); }
    const bord = textPlane('KASTEEL WIJCHEN', 8, 1, '#ffffff', '#2b2b2b'); bord.position.set(-0.06, 4, 0); g.add(bord);
    return { g, len: 28, name: 'Kasteel Wijchen' };
  },
  kerkje(naam) {
    const g = new THREE.Group(), steen = M('#9a6a4a'), dak = M('#3a3f45');
    g.add(mesh(new THREE.BoxGeometry(9, 8, 18, 2, 2, 3), steen, 5, 4, 0));
    const r = prismRoof(9.4, 18, 5, dak); r.position.set(5, 8, 0); g.add(r);
    g.add(mesh(box(4, 16, 4), steen, 3, 8, -9));
    g.add(mesh(coneG(3, 9, 4), dak, 3, 20.5, -9));
    const bord = textPlane(naam || 'DORPSKERK', 6, 0.9, '#ffffff', '#1f4f8f'); bord.position.set(0.44, 3, 0); g.add(bord);
    return { g, len: 24, name: naam ? cap(naam.toLowerCase()) : 'Dorpskerk' };
  },
  molen(naam) {
    const g = new THREE.Group();
    g.add(mesh(cylG(2.4, 3.6, 12, 8), M('#5a4a3a'), 6, 6, 0));
    g.add(mesh(coneG(2.7, 3.5, 8), M('#3a3f45'), 6, 13.7, 0));
    const wiek = new THREE.Group(); wiek.position.set(3.2, 12, 0);
    for (let i = 0; i < 4; i++) { const blad = mesh(box(0.15, 9, 1.4), M('#e8e2d2'), 0, 4.5, 0); const arm = new THREE.Group(); arm.rotation.x = (i * Math.PI) / 2; arm.add(blad); wiek.add(arm); }
    g.add(wiek);
    const bord = textPlane(naam || 'MOLEN', 5, 0.8, '#ffffff', '#2b2b2b'); bord.position.set(3.5, 2.5, 0); g.add(bord);
    return { g, len: 14, name: naam ? cap(naam.toLowerCase()) : 'Molen', upd(o, dt) { wiek.rotation.x += dt * 1.2; } };
  },
  duivelsberg() {
    const g = new THREE.Group(), hout = M('#7a5a3a');
    for (const [x, z] of [[4, -2], [8, -2], [4, 2], [8, 2]]) g.add(mesh(box(0.4, 16, 0.4), hout, x, 8, z));
    for (let y = 4; y <= 16; y += 4) g.add(mesh(box(5, 0.3, 5), hout, 6, y, 0));
    g.add(mesh(coneG(4, 3, 4), M('#3a3f45'), 6, 17.5, 0));
    const bord = textPlane('DUIVELSBERG', 6, 1, '#ffffff', '#3c6e47'); bord.position.set(0.3, 2.2, 0); g.add(bord);
    return { g, len: 14, name: 'Duivelsberg' };
  },
  klooster() {
    const g = new THREE.Group(), steen = M('#8a3a2a'), dak = M('#5a2a20');
    g.add(mesh(new THREE.BoxGeometry(10, 9, 40, 2, 2, 5), steen, 5, 4.5, 0));
    const r = prismRoof(10.4, 40, 7, dak); r.position.set(5, 9, 0); g.add(r);
    g.add(mesh(box(3, 6, 3), steen, 5, 18, 6));
    g.add(mesh(coneG(1.4, 4, 4), M('#2f4f4f'), 5, 23, 6));
    for (let i = 0; i < 6; i++) { g.add(mesh(box(0.2, 4, 1.6), M('#2b3946'), -0.05, 4.2, -15 + i * 6)); }
    const bord = textPlane('KLOOSTER TER APEL', 10, 1.1, '#ffffff', '#2b2b2b'); bord.position.set(-0.08, 7.6, 0); g.add(bord);
    return { g, len: 44, name: 'Klooster Ter Apel' };
  },
  podium() {
    const g = new THREE.Group();
    g.add(mesh(box(10, 1.5, 16), M('#2b2b2b'), 5, 0.75, 0));
    for (const z of [-8, 8]) g.add(mesh(box(0.4, 9, 0.4), M('#555'), 1, 4.5, z));
    g.add(mesh(box(0.4, 0.4, 16.4), M('#555'), 1, 9, 0));
    const doek = textPlane('DEMO MALIEVELD', 14, 2, '#ffffff', '#1f4f8f'); doek.position.set(0.9, 7.5, 0); g.add(doek);
    for (let i = 0; i < 5; i++) { const v = textPlane('', 1.4, 1, '#fff', ['#c8202b', '#f4f4f4', '#1f4f8f'][i % 3]); v.position.set(-0.2, 3.2, -6 + i * 3); g.add(v); }
    return { g, len: 20, name: 'Malieveld' };
  },
  kuip() {
    const g = new THREE.Group();
    const wand = M('#9aa0a6');
    const ring = mesh(cylG(18, 20, 14, 18, 1, true, 0, Math.PI), wand, 18, 7, 0); ring.rotation.y = -Math.PI / 2; g.add(ring);
    for (let i = 0; i < 10; i++) { const s = mesh(box(0.4, 16, 0.4), M('#5a5f66'), 1.5, 8, -16 + i * 3.5); s.rotation.z = 0.2; g.add(s); }
    const bord = textPlane('DE KUIP', 14, 2.4, '#ffffff', '#c8202b'); bord.position.set(0.3, 10, 0); g.add(bord);
    return { g, len: 40, name: 'De Kuip' };
  },
  erasmusbrug() {
    const g = new THREE.Group(), wit = new THREE.MeshLambertMaterial({ color: '#f4f6f8', emissive: '#2a2d33' });
    const poot1 = mesh(box(1.2, 26, 1.2), wit, ROAD_W / 2 + 2, 13, 0); poot1.rotation.z = 0.12; g.add(poot1);
    const knik = mesh(box(1.1, 22, 1.1), wit, ROAD_W / 2 + 0.6, 34, -2); knik.rotation.set(-0.15, 0, -0.18); g.add(knik);
    for (let i = 0; i < 7; i++) {
      const z = -30 + i * 9;
      const top = new THREE.Vector3(ROAD_W / 2 + 0.3, 40, -3), bot = new THREE.Vector3(-ROAD_W / 2 - 0.6, 0.8, z);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, bot]), new THREE.LineBasicMaterial({ color: '#dfe3e8' })));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, new THREE.Vector3(ROAD_W / 2 + 0.6, 0.8, z)]), new THREE.LineBasicMaterial({ color: '#dfe3e8' })));
    }
    for (const sx of [-1, 1]) g.add(mesh(box(0.15, 1.1, 70), M('#c9ccd1'), sx * (ROAD_W / 2 + 0.5), 0.6, 0));
    return { g, len: 70, name: 'Erasmusbrug' };
  },
  vuurtoren() {
    const g = new THREE.Group();
    g.add(mesh(cylG(1.8, 2.4, 16, 10), M('#f4f4f4'), 7, 8, 0));
    g.add(mesh(cylG(1.9, 1.9, 2, 10), M('#c8202b'), 7, 17, 0));
    g.add(mesh(cylG(1.3, 1.3, 1.6, 10), new THREE.MeshBasicMaterial({ color: '#fff6c0' }), 7, 18.8, 0));
    g.add(mesh(coneG(1.6, 1.6, 10), M('#c8202b'), 7, 20.4, 0));
    // kotter in het water
    const boot = new THREE.Group(); boot.position.set(16, 0.4, 8);
    boot.add(mesh(box(3, 1.6, 9), M('#1f4f8f'), 0, 0.6, 0));
    boot.add(mesh(box(2.4, 1.6, 2.6), M('#f4f4f4'), 0, 2.2, 1.5));
    boot.add(mesh(box(0.2, 7, 0.2), M('#555'), 0, 4, -2));
    boot.add(textPlane('UK 22', 2, 0.6, '#ffffff', '#1f4f8f').translateX(-1.52));
    g.add(boot);
    return { g, len: 22, name: 'Vuurtoren van Urk' };
  },
  arena() {
    const g = new THREE.Group();
    const wand = new THREE.MeshLambertMaterial({ map: canvasTex(256, 64, (x) => { x.fillStyle = '#d0d4d8'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#c8202b'; x.fillRect(0, 50, 256, 8); for (let i = 0; i < 256; i += 12) { x.fillStyle = '#9aa0a6'; x.fillRect(i, 0, 3, 50); } }) });
    g.add(mesh(new THREE.BoxGeometry(34, 22, 80, 2, 2, 6), wand, 17, 11, 0));
    const dak = mesh(cylG(40, 40, 82, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), M('#5a5f66'), 17, 14, 0);
    dak.scale.set(0.45, 0.25, 1); g.add(dak);
    const bord = textPlane('JOHAN CRUIJFF ARENA', 30, 3.4, '#ffffff', '#c8202b'); bord.position.set(-0.06, 17, 0); g.add(bord);
    const vlag = textPlane('NEDERLAND - DUITSLAND', 20, 2, '#ff7b00', '#141414'); vlag.position.set(-0.06, 6, 0); g.add(vlag);
    return { g, len: 86, name: 'Johan Cruijff ArenA' };
  },
});

// ---------- levels ----------
const LEVELS_NL = [
  { id: 'arnhem', wijk: 'Arnhem-Zuid', theme: 'arnhem', length: 1500, speed: 14, maxSpeed: 24, need: 2, star3: 4200, nitraten: 2,
    intro: 'Vanuit Hatert de brug over naar Arnhem. Doel: het GelreDome laten knallen.',
    uniek: 'Arnhemse trolleybussen',
    landmarks: [{ at: 520, b: 'gelredome', side: -1 }],
    tasks: [
      { at: 300, type: 'toeter', text: 'Toeter naar een trolleybus' },
      { at: 560, type: 'boem', text: 'Laat het GelreDome knallen' },
      { at: 1100, type: 'nitraat', obj: 'trolleybus', text: 'Blaas een trolleybus op' },
    ] },
  { id: 'wijchen', wijk: 'Wijchen', theme: 'kermis', length: 1500, speed: 14.5, maxSpeed: 25, need: 2, star3: 4400, nitraten: 1,
    intro: 'Kermis in Wijchen. Botsauto\'s die alle kanten op schieten en overal suikerspin.',
    uniek: 'Losgeslagen botsauto\'s',
    landmarks: [{ at: 300, b: 'reuzenrad', side: 1 }, { at: 800, b: 'kasteel', side: -1 }],
    tasks: [
      { at: 330, type: 'vuurwerk', show: 'cake', text: 'Cakebox onder het reuzenrad' },
      { at: 820, type: 'bel', text: 'Belletje trekken bij het kasteel' },
      { at: 1200, type: 'nitraat', obj: 'suikerspin', text: 'Blaas de suikerspinkraam op' },
    ] },
  { id: 'malden', wijk: 'Malden', theme: 'malden', length: 1600, speed: 15, maxSpeed: 25, need: 2, star3: 4700, nitraten: 1,
    intro: 'Rustig dorpje Malden. Bakfietsmoeders en een kerkplein. Nu nog wel rustig.',
    uniek: 'Bakfietsen',
    landmarks: [{ at: 500, b: 'kerkje', arg: 'KERK MALDEN', side: 1 }],
    tasks: [
      { at: 520, type: 'vuurwerk', text: 'Vuurwerk op het kerkplein' },
      { at: 900, type: 'kliko', text: 'Trap een kliko om' },
      { at: 1250, type: 'nitraat', obj: 'bakfiets', text: 'Blaas een bakfiets op' },
    ] },
  { id: 'bergendal', wijk: 'Berg en Dal', theme: 'bos', length: 1700, speed: 15.5, maxSpeed: 26, need: 2, star3: 5000,
    intro: 'Door de bossen en over de heuvels. Omgevallen bomen op de weg.',
    uniek: 'Omgevallen boomstammen',
    landmarks: [{ at: 650, b: 'duivelsberg', side: -1 }],
    tasks: [
      { at: 400, type: 'toeter', text: 'Toeter door het bos' },
      { at: 680, type: 'fakkel', text: 'Fakkel op de Duivelsberg' },
      { at: 1300, type: 'vuurwerk', show: 'mortier', text: 'Mortier boven de heuvels' },
    ] },
  { id: 'terapel', wijk: 'Ter Apel', theme: 'terapel', length: 1800, speed: 16, maxSpeed: 26, need: 2, star3: 5400, nitraten: 1,
    intro: 'Helemaal naar Groningen. Kanaal, hooibalen en het oude klooster.',
    uniek: 'Hooibalen en trekkers',
    landmarks: [{ at: 600, b: 'klooster', side: 1 }],
    tasks: [
      { at: 640, type: 'bel', text: 'Belletje trekken bij het klooster' },
      { at: 1000, type: 'nitraat', obj: 'hooibaal', text: 'Blaas een hooibaal op' },
      { at: 1450, type: 'vuurwerk', show: 'lawine', text: 'Lawinepijl over het kanaal' },
    ] },
  { id: 'overasselt', wijk: 'Overasselt', theme: 'polder', length: 1800, speed: 16.5, maxSpeed: 27, need: 2, star3: 5700,
    intro: 'Polder, molens en koeien. Heel veel koeien.',
    uniek: 'Overstekende koeien',
    landmarks: [{ at: 450, b: 'molen', arg: 'MOLEN OVERASSELT', side: -1 }, { at: 1100, b: 'kerkje', arg: 'KERKJE OVERASSELT', side: 1 }],
    tasks: [
      { at: 470, type: 'toeter', text: 'Laat de koeien schrikken' },
      { at: 1120, type: 'vuurwerk', text: 'Vuurwerk bij het kerkje' },
      { at: 1500, type: 'kliko', text: 'Trap een kliko de sloot in' },
    ] },
  { id: 'malieveld', wijk: 'Malieveld', theme: 'denhaag', length: 1900, speed: 17, maxSpeed: 27, need: 2, star3: 6000, nitraten: 2,
    intro: 'Den Haag: het Malieveld staat vol trekkers voor een grote demo. Jens mengt zich erin en zorgt voor chaos.',
    uniek: 'Trekkers en hooibalen op de weg',
    landmarks: [{ at: 550, b: 'podium', side: 1 }],
    tasks: [
      { at: 580, type: 'toeter', text: 'Toeter mee met de trekkers' },
      { at: 950, type: 'nitraat', obj: 'hooibaal', text: 'Blaas een hooibaal op' },
      { at: 1450, type: 'vuurwerk', show: 'mortier', text: 'Mortier boven het Malieveld' },
    ] },
  { id: 'rotterdam', wijk: 'Rotterdam-Zuid', theme: 'rotterdam', length: 2000, speed: 17.5, maxSpeed: 28, need: 2, star3: 6400, nitraten: 2,
    intro: 'Over de Erasmusbrug naar Zuid. Containers, hoge flats en De Kuip.',
    uniek: 'Zeecontainers',
    landmarks: [{ at: 250, b: 'erasmusbrug', side: 0 }, { at: 1000, b: 'kuip', side: -1 }],
    tasks: [
      { at: 280, type: 'vuurwerk', show: 'lawine', text: 'Lawinepijl op de Erasmusbrug' },
      { at: 1040, type: 'fakkel', text: 'Fakkel voor De Kuip' },
      { at: 1500, type: 'nitraat', obj: 'container', text: 'Blaas een container op' },
    ] },
  { id: 'urk', wijk: 'Urk', theme: 'urk', length: 2000, speed: 18, maxSpeed: 28, need: 2, star3: 6700, nitraten: 1,
    intro: 'Vissersdorp Urk. Viskratten, kotters en de vuurtoren.',
    uniek: 'Viskratten',
    landmarks: [{ at: 700, b: 'vuurtoren', side: 1 }],
    tasks: [
      { at: 400, type: 'bel', text: 'Belletje trekken in Wijk 1' },
      { at: 730, type: 'vuurwerk', text: 'Vuurwerk bij de vuurtoren' },
      { at: 1400, type: 'nitraat', obj: 'viskrat', text: 'Blaas de viskratten op' },
    ] },
  { id: 'arena', wijk: 'Amsterdam', theme: 'amsterdam', length: 2100, speed: 18, maxSpeed: 28, need: 3, star3: 8000, nitraten: 2, finale: true,
    intro: 'De finale: Nederland - Duitsland in de Johan Cruijff ArenA. Smokkel het spandoek "DIE BEKER IS VAN ONS" langs alle controles. Glijden (↓) onder de poortjes door, anders vinden ze het doek.',
    uniek: 'Stewards en controlepoortjes',
    winTitle: 'HET SPANDOEK HANGT!', winText: 'Het spandoek wappert in de ArenA. Heel Nederland ziet het: DIE BEKER IS VAN ONS.',
    landmarks: [{ at: 1700, b: 'arena', side: 1 }],
    tasks: [
      { at: 500, type: 'controle', must: true, text: 'Eerste controle' },
      { at: 1050, type: 'controle', must: true, text: 'Tweede controle' },
      { at: 1650, type: 'controle', must: true, text: 'Laatste controle bij de ingang' },
      { at: 1800, type: 'vuurwerk', show: 'mortier', text: 'Vuurwerk voor de ArenA' },
    ] },
];
TASK_ICON.boem = '💣'; TASK_ICON.controle = '🛂';
TASK_COLOR.boem = '#ff3b1a';

const CAMPAIGNS = {
  nijmegen: { name: 'Terroriseer Nijmegen', levels: LEVELS, unit: 'wijk' },
  nederland: { name: 'Terroriseer Nederland', levels: LEVELS_NL, unit: 'plaats' },
};
let campaign = ['nederland', 'europa', 'vierdaagse'].includes(save.campaign) ? save.campaign : 'nijmegen';
const LV = () => CAMPAIGNS[campaign].levels;
// =====================================================================
//  VERHAAL 3: TERRORISEER EUROPA — NEC door Europa, finale in de Goffert
// =====================================================================
FACADE_STYLES.wit = (x, L) => {
  // witte Griekse huizen met blauwe luiken
  x.fillStyle = pick(['#f4f1ea', '#ece6d8', '#f8f6f0']); x.fillRect(0, 0, 256, 320);
  for (let r = 0; r < 3; r++) for (const wx of [30, 140]) {
    glassWin(x, wx, 40 + r * 90, 60, 56); L(wx, 40 + r * 90, 60, 56);
    x.fillStyle = pick(['#1f5fa8', '#2a7ac0']); x.fillRect(wx - 14, 40 + r * 90, 12, 56); x.fillRect(wx + 62, 40 + r * 90, 12, 56);
  }
  x.fillStyle = '#c96a3a'; x.fillRect(0, 0, 256, 10);
};
FACADE_STYLES.hout = (x, L) => {
  // gekleurde Noorse houten huizen
  x.fillStyle = pick(['#a8322a', '#e8b923', '#2a5a8a', '#f2efe6', '#3a6a4a']); x.fillRect(0, 0, 256, 320);
  x.fillStyle = 'rgba(0,0,0,.14)'; for (let i = 0; i < 256; i += 14) x.fillRect(i, 0, 2, 320);
  for (let r = 0; r < 3; r++) for (const wx of [36, 150]) { x.fillStyle = '#f4f4f4'; x.fillRect(wx - 4, 46 + r * 88, 66, 62); glassWin(x, wx, 50 + r * 88, 58, 54); L(wx, 50 + r * 88, 58, 54); }
};
FACADE_STYLES.roze = (x, L) => {
  // roze tufsteen uit Jerevan
  x.fillStyle = pick(['#c98a7a', '#b8786a', '#d29a88']); x.fillRect(0, 0, 256, 320);
  x.fillStyle = 'rgba(0,0,0,.1)'; for (let y = 0; y < 320; y += 22) { x.fillRect(0, y, 256, 2); for (let xx = (y / 22) % 2 ? 0 : 30; xx < 256; xx += 60) x.fillRect(xx, y, 2, 22); }
  for (let r = 0; r < 3; r++) for (const wx of [28, 106, 184]) { x.fillStyle = 'rgba(0,0,0,.2)'; x.beginPath(); x.arc(wx + 22, 50 + r * 90, 22, Math.PI, 0); x.fill(); glassWin(x, wx, 50 + r * 90, 44, 50); L(wx, 50 + r * 90, 44, 50); }
};
Object.assign(THEMES, {
  athene: { houses: 'wit', heights: [7, 12], roof: false, grass: '#b8a46a', streets: ['Akti Miaouli', 'Odos Piraeus', 'Karaiskaki-plein', 'Haven van Piraeus'], obstacles: ['terras', 'terras', 'marktkraam', 'auto', 'gat', 'kliko'] },
  bodo: { houses: 'hout', heights: [6, 9], roof: true, grass: '#e6ecf0', snow: true, streets: ['Storgata', 'Sjøgata', 'Aspmyra', 'Kongens gate'], obstacles: ['boomstam', 'hooibaal', 'kliko', 'auto', 'gat', 'fietswrak'] },
  turijn: { houses: 'centrum', heights: [12, 17], roof: true, grass: '#8a8a72', streets: ['Via Roma', 'Corso Vittorio Emanuele', 'Piazza Castello', 'Corso Gaetano Scirea'], obstacles: ['terras', 'terras', 'deelscooter', 'auto', 'auto', 'gat'] },
  zagreb: { houses: 'flat', heights: [12, 20], roof: false, grass: '#6a8a4a', streets: ['Maksimirska', 'Ilica', 'Trg bana Jelačića', 'Vukovarska'], obstacles: ['trolleybus', 'trolleybus', 'kliko', 'auto', 'gat', 'fietswrak'] },
  jerevan: { houses: 'roze', heights: [8, 14], roof: false, grass: '#a89a6a', streets: ['Abovyan-straat', 'Plein van de Republiek', 'Mashtots-laan', 'Tigran Mets'], obstacles: ['marktkraam', 'winkelwagen', 'auto', 'auto', 'gat', 'kliko'] },
  celje: { houses: 'rij', heights: [6, 9], roof: true, grass: '#6f9a52', streets: ['Prešernova ulica', 'Glavni trg', 'Stanetova', 'Ljubljanska cesta'], obstacles: ['bakfiets', 'bakfiets', 'kliko', 'fietswrak', 'auto', 'gat'] },
});
// stadion langs de weg, in de clubkleuren
LANDMARKS.stadion = ([naam, a, b]) => {
  const g = new THREE.Group();
  const wand = new THREE.MeshLambertMaterial({ map: canvasTex(256, 64, (x) => { x.fillStyle = a; x.fillRect(0, 0, 256, 64); x.fillStyle = b; for (let i = 0; i < 256; i += 32) x.fillRect(i, 0, 14, 48); x.fillStyle = '#d0d4d8'; x.fillRect(0, 48, 256, 16); }) });
  g.add(mesh(new THREE.BoxGeometry(26, 15, 60, 2, 2, 5), wand, 13, 7.5, 0));
  for (const z of [-28, 28]) { g.add(mesh(box(0.5, 10, 0.5), M('#9aa0a6'), 1, 20, z)); g.add(mesh(box(2.6, 1.6, 2.6), new THREE.MeshBasicMaterial({ color: '#fff6d0' }), 1, 25.5, z)); }
  const bord = textPlane(naam.toUpperCase(), 22, 2.6, '#ffffff', a === '#f4f4f4' ? '#141414' : a); bord.position.set(-0.06, 12.5, 0); g.add(bord);
  return { g, len: 66, name: naam };
};
LANDMARKS.ararat = () => {
  const g = new THREE.Group();
  g.add(mesh(coneG(38, 42, 9), M('#8a7a6a', { flatShading: true }), 70, 20, -40));
  g.add(mesh(coneG(15, 16, 9), M('#f4f6f8', { flatShading: true }), 70, 33.5, -40));
  g.add(mesh(coneG(22, 22, 8), M('#7a6a5a', { flatShading: true }), 60, 10, 10));
  return { g, len: 60, name: 'Berg Ararat' };
};
const LEVELS_EU = [
  { id: 'athene', wijk: 'Athene', theme: 'athene', length: 1600, speed: 15, maxSpeed: 26, need: 2, star3: 4800, nitraten: 2,
    intro: 'NEC speelt in Piraeus tegen Olympiakos. Het Karaiskakis is een heksenketel van fakkels, rook en 30.000 Grieken. Jens rent dwars door de haven.',
    uniek: 'Griekse terrasjes op straat',
    landmarks: [{ at: 700, b: 'stadion', arg: ['Karaiskakis · Olympiakos', '#c8202b', '#f4f4f4'], side: 1 }],
    lore: [{ at: 120, text: '🇬🇷 Piraeus · Olympiakos verliest hier bijna nooit thuis. Tot vanavond.' }, { at: 950, text: '🔥 Rode fakkels overal. Jens neemt er stiekem eentje mee voor de Goffert.' }],
    tasks: [
      { at: 400, type: 'toeter', text: 'Toeter mee met de Griekse fans' },
      { at: 730, type: 'vuurwerk', show: 'cake', text: 'Vuurwerkshow bij het Karaiskakis' },
      { at: 1250, type: 'nitraat', obj: 'marktkraam', text: 'Blaas een souvlakikraam op' },
    ] },
  { id: 'bodo', wijk: 'Bodø', theme: 'bodo', length: 1600, speed: 15, maxSpeed: 26, need: 2, star3: 5000, nitraten: 2,
    intro: 'Bodø, boven de poolcirkel. Kunstgras, ijskoude wind en het Aspmyra vol gele vlaggen. Grote clubs gaan hier onderuit. NEC niet.',
    uniek: 'Sneeuw en gladheid',
    landmarks: [{ at: 650, b: 'stadion', arg: ['Aspmyra · Bodø/Glimt', '#e8c000', '#141414'], side: -1 }],
    lore: [{ at: 120, text: '❄️ Bodø, Noorwegen · Het is hier min twaalf. Jens rent gewoon in z\'n T-shirt.' }, { at: 1000, text: '🟡 Glimt-fans zwaaien met gele vlaggen. Jens zwaait terug met z\'n NEC-sjaal.' }],
    tasks: [
      { at: 380, type: 'bel', text: 'Bel aan bij een Noors houten huisje' },
      { at: 680, type: 'fakkel', text: 'Fakkel aan bij het Aspmyra' },
      { at: 1200, type: 'kliko', text: 'Schop een vuilnisbak de fjord in' },
    ] },
  { id: 'turijn', wijk: 'Turijn', theme: 'turijn', length: 1700, speed: 15.5, maxSpeed: 27, need: 2, star3: 5200, nitraten: 2,
    intro: 'Turijn, thuis van Juventus, de Oude Dame. Zwart-wit overal en de Allianz is chiquer dan heel Nijmegen bij elkaar.',
    uniek: 'Italiaanse terrassen en scooters',
    landmarks: [{ at: 800, b: 'stadion', arg: ['Allianz Stadium · Juventus', '#f4f4f4', '#141414'], side: 1 }],
    lore: [{ at: 120, text: '⚫⚪ Turijn · Juve werd al 36 keer kampioen van Italië. Vanavond telt dat niet.' }, { at: 1100, text: '🍕 Jens jat een pizzapunt van een terras. "Grazie!"' }],
    tasks: [
      { at: 420, type: 'toeter', text: 'Toeter onder een Italiaans balkon' },
      { at: 830, type: 'fakkel', text: 'Fakkel bij de Allianz' },
      { at: 1350, type: 'nitraat', obj: 'terras', text: 'Blaas een espressoterras op' },
    ] },
  { id: 'zagreb', wijk: 'Zagreb', theme: 'zagreb', length: 1700, speed: 16, maxSpeed: 27, need: 2, star3: 5400, nitraten: 2,
    intro: 'Zagreb. Dinamo speelt in het Maksimir en de Bad Blue Boys staan al op de tribune. Blauwe trams scheuren door de straten.',
    uniek: 'Blauwe trams die nergens voor stoppen',
    landmarks: [{ at: 750, b: 'stadion', arg: ['Maksimir · Dinamo Zagreb', '#1f4fa8', '#f4f4f4'], side: -1 }],
    lore: [{ at: 120, text: '🇭🇷 Zagreb · De blauwe trams stoppen voor niemand. Ook niet voor Jens.' }, { at: 1050, text: '🔵 De Bad Blue Boys zingen. Jens zingt harder: NEC! NEC! NEC!' }],
    tasks: [
      { at: 400, type: 'bel', text: 'Bel aan bij een flat in Maksimir' },
      { at: 780, type: 'vuurwerk', show: 'lawine', text: 'Lawinepijl bij het Maksimir' },
      { at: 1300, type: 'nitraat', obj: 'trolleybus', text: 'Blaas een blauwe tram op' },
    ] },
  { id: 'jerevan', wijk: 'Jerevan', theme: 'jerevan', length: 1700, speed: 16, maxSpeed: 28, need: 2, star3: 5600, nitraten: 2,
    intro: 'Jerevan, Armenië. Ararat-Armenia speelt onder de besneeuwde top van de berg Ararat. Roze stenen huizen, abrikozen en de langste reis tot nu toe.',
    uniek: 'De berg Ararat aan de horizon',
    landmarks: [{ at: 150, b: 'ararat', side: 1 }, { at: 800, b: 'stadion', arg: ['Republican Stadium · Ararat-Armenia', '#c8a020', '#1f3f8f'], side: -1 }],
    lore: [{ at: 120, text: '🇦🇲 Jerevan · De Ararat torent boven de hele stad uit.' }, { at: 1100, text: '🍑 Een opa biedt Jens een abrikoos aan. Geen tijd, opa!' }],
    tasks: [
      { at: 420, type: 'toeter', text: 'Toeter op het Plein van de Republiek' },
      { at: 830, type: 'fakkel', text: 'Fakkel bij het stadion' },
      { at: 1300, type: 'kliko', text: 'Schop een vuilnisbak omver' },
    ] },
  { id: 'celje', wijk: 'Celje', theme: 'celje', length: 1700, speed: 16.5, maxSpeed: 28, need: 2, star3: 5800, nitraten: 2,
    intro: 'Celje, Slovenië. Een klein stadje met een kasteel op de heuvel en een geel-blauwe club die niemand kent. Laatste uitwedstrijd voor de finale.',
    uniek: 'Bakfietsen op de Glavni trg',
    landmarks: [{ at: 800, b: 'stadion', arg: ["Z'dežele · NK Celje", '#1f4fa8', '#e8c000'], side: 1 }],
    lore: [{ at: 120, text: '🇸🇮 Celje · Boven de stad staat het oude kasteel. Jens wil er een sticker op.' }, { at: 1100, text: '✈️ Na Celje: terug naar huis. De finale is in de Goffert.' }],
    tasks: [
      { at: 400, type: 'vuurwerk', show: 'cake', text: 'Cakebox op de Glavni trg' },
      { at: 830, type: 'bel', text: 'Bel aan bij het stadion' },
      { at: 1300, type: 'nitraat', obj: 'bakfiets', text: 'Blaas een bakfiets op' },
    ] },
  { id: 'efinale', wijk: 'Goffert', theme: 'goffert', length: Infinity, speed: 14, maxSpeed: 22, need: 4, star3: 9000, nitraten: 8, goffert: true,
    intro: 'De Europa League-finale in de Goffert. NEC speelt, Jens staat op de tribune. Vier clubs willen de finale verpesten: Levski Sofia, Omonia Nicosia, Stade Rennes en Benfica. Bescherm de Goffert!',
    uniek: 'Vier golven supporters',
    winTitle: 'NEC WINT DE EUROPA LEAGUE!', winText: 'De Goffert is veilig, NEC heeft de beker. Jens schreeuwt het uit: DIE BEKER IS VAN ONS!',
    landmarks: [{ at: 60, b: 'goffert', side: -1 }, { at: 420, b: 'goffert', side: 1 }, { at: 800, b: 'goffert', side: -1 }, { at: 1180, b: 'goffert', side: 1 }, { at: 1560, b: 'goffert', side: -1 }, { at: 1940, b: 'goffert', side: 1 }],
    tasks: [
      { type: 'club', club: 0, must: true, text: 'Houd Levski Sofia tegen' },
      { type: 'club', club: 1, must: true, text: 'Houd Omonia Nicosia tegen' },
      { type: 'club', club: 2, must: true, text: 'Houd Stade Rennes tegen' },
      { type: 'club', club: 3, must: true, text: 'Houd Benfica tegen' },
    ] },
];
CAMPAIGNS.europa = { name: 'Terroriseer Europa', levels: LEVELS_EU, unit: 'stad' };
TASK_ICON.club = '🛡️';
// ---------- finale: de Goffert beschermen tegen vier clubs ----------
const CLUBS = [
  { name: 'Levski Sofia', flag: '🇧🇬', a: '#1f4fa8', b: '#f4f4f4', roep: ['LEVSKI!', 'SOFIA!', 'Sinite!'] },
  { name: 'Omonia Nicosia', flag: '🇨🇾', a: '#1f8a3a', b: '#f4f4f4', roep: ['OMONIA!', 'Thrylos!', 'Nicosia!'] },
  { name: 'Stade Rennes', flag: '🇫🇷', a: '#c8202b', b: '#141414', roep: ['ALLEZ RENNES!', 'Rouge et noir!', 'Allez!'] },
  { name: 'Benfica', flag: '🇵🇹', a: '#d0101e', b: '#f4f4f4', roep: ['BENFICA!', 'Glorioso!', 'Lisboa!'] },
];
const WAVE_N = 8, WAVE_NEED = 5;
let goff = null;
function makeClubFan(c) {
  const p = makePerson({ key: 'fan' + c.name, skin: pick(['#f2d0b8', '#e8c3a6', '#c99468', '#d8a882']), hair: '#1a1410', hairStyle: pick(['kaal', 'kort', 'boapet', 'bivak']),
    shirt: { base: c.a, paint(x) { x.fillStyle = c.b; x.fillRect(0, 40, 128, 16); } }, pants: '#1b1b1b', shoes: '#f4f4f4', face: { angry: true, stubble: '#2a2a2a' }, scale: [1.1, 1.04, 1.08] });
  p.body.add(mesh(box(0.32, 0.09, 0.3), M(c.b), 0, 1.57, 0));
  p.root.rotation.y = Math.PI;
  return p;
}
function goffertRow(z, ahead) {
  if (!goff) { goff = { wave: 0, spawned: 0, kills: 0, start: ahead + 60, between: false }; }
  const g = goff;
  if (g.wave >= CLUBS.length || ahead < g.start || g.between) { if (Math.random() < 0.4) spawnCoinsLine(Math.floor(Math.random() * 3), z, 4); return; }
  const c = CLUBS[g.wave];
  if (g.spawned === 0) toast(`${c.flag} ${c.name.toUpperCase()} KOMT DE GOFFERT IN!<small>Gooi nitraten (E / 🧨) · ${WAVE_NEED} van de ${WAVE_N} tegenhouden</small>`, 2.6);
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5), n = Math.min(Math.random() < 0.45 ? 2 : 1, WAVE_N - g.spawned);
  for (let i = 0; i < n; i++) {
    const p = makeClubFan(c), sp = rand(3.5, 6);
    addObj('hooligan', p.root, LANES[lanes[i]], z, 0.8, 0.6, 1.8, { gen: 'stumble', hooligan: true, club: g.wave,
      upd(o, dt) { if (o.hit) return; if (state === 'run') o.z += sp * dt; pose(p, o.z > -14 ? 'angry' : 'run', dt, 1);
        if (!o.yelled && o.z > -22) { o.yelled = true; if (Math.random() < 0.45) bubble(p.head, pick(c.roep), 'angry', 1.2); } } });
  }
  g.spawned += n;
  if (Math.random() < 0.55) addObj('power', makeSmallNitraat(), LANES[lanes[2]], z, 0, 0, 0, { y: 1.0, type: 'nitraat2' });
}
function updateGoffert() {
  const g = goff;
  if (!g || !curLevel?.goffert || state !== 'run' || g.wave >= CLUBS.length) return;
  if (g.spawned < WAVE_N || objs.some((o) => o.club === g.wave && !o.dead && !o.hit && o.z < 4)) return;
  const t = tasks[g.wave], c = CLUBS[g.wave];
  if (g.kills >= WAVE_NEED) completeTask(t, null);
  else { t.missed = true; toast(`❌ ${c.name} is de Goffert binnen…<small>${g.kills}/${WAVE_N} tegengehouden</small>`, 2.2); }
  g.wave++; g.spawned = 0; g.kills = 0; g.between = true;
  setTimeout(() => { if (goff === g) g.between = false; }, 2500);
  if (g.wave >= CLUBS.length) setTimeout(() => winLevel(), 1200);
  else if (t.missed) setTimeout(() => winLevel(), 1200); // verloren: meteen klaar
}
// ---------- vrienden langs de kant: Jesse, Tim en Patrick ----------
var nextVrienden = 900;
function makeVriend(id) {
  if (id === 'jesse') {
    const p = makePerson({ key: 'jesse', skin: '#efcdb4', hair: '#151515', hairStyle: 'muts', shirt: { base: '#161616', paint() {} }, pants: '#56603f', shoes: '#1a1a1a', face: { skin: '#efcdb4', brow: '#3a2a1a' } });
    longSleeves(p, fabricMat('#161616')); baggy(p, 1.35); p.body.add(mesh(box(0.34, 0.2, 0.14), fabricMat('#c9c9c9'), 0, 1.5, 0.14));
    return p;
  }
  if (id === 'tim') {
    const p = makePerson({ key: 'tim', skin: '#f0cdb2', hair: '#3a2617', hairStyle: 'kort', shirt: { base: '#1f4a2c', paint() {} }, pants: '#3d5a86', shoes: '#f0f0f0', face: { skin: '#f0cdb2', brow: '#3a2617' } });
    longSleeves(p, fabricMat('#1f4a2c')); baggy(p, 1.3);
    return p;
  }
  const p = makePerson({ key: 'patrick', skin: '#ecc8ac', hair: '#121010', hairStyle: 'kort', shirt: { base: '#4a4e55', paint() {} }, pants: '#3e4148', shoes: '#151515', face: { skin: '#ecc8ac', brow: '#121010' } });
  longSleeves(p, new THREE.MeshLambertMaterial({ color: '#141414' }));
  return p;
}
const VRIEND_ROEP = {
  tim: ['GO JENS! NEC!', 'Rennen Jens, REN!', 'Die beker is van ons!'],
  patrick: ['Rennen, sukkel!', 'Ik ben sneller op m\'n brommer', 'Kom op dan, slak!'],
  jesse: ['Waarom ren je nou weer?', 'Jens, wat doe je?!', 'Echt de raarste gast'],
};
function spawnVrienden(z) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const ids = ['tim', 'patrick', 'jesse'].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
  const g = new THREE.Group(), ps = [];
  ids.forEach((id, i) => { const p = makeVriend(id); p.root.position.set(0, 0, i * 0.9 - 0.45 * (ids.length - 1)); p.root.rotation.y = side < 0 ? -Math.PI / 2 + 0.5 : Math.PI / 2 - 0.5; g.add(p.root); ps.push([id, p]); });
  addObj('deco', g, side * (ROAD_W / 2 + 1.5), z, 0, 0, 0, { y: 0.14, upd(o, dt) {
    for (const [, p] of ps) pose(p, o.z > -18 && o.z < 6 ? 'grabbed' : 'idle', dt, 0.8);
    if (!o.yelled && o.z > -20) { o.yelled = true; ps.forEach(([id, p], i) => setTimeout(() => bubble(p.head, pick(VRIEND_ROEP[id]), id === 'patrick' ? 'angry' : '', 1.6), i * 450)); }
  } });
}

// =====================================================================
//  GEBEURTENISSEN: elke 30 s 1 op 4 kans op een uitstapje
//  Waal-zwemmen · kermis · Max & Moritz (Efteling) · glijbaan van de Stevenstoren
// =====================================================================
let seg = null, segRollT = 30, segBag = [];
const SEG_DEFS = {
  waal: { L: 240, mul: 0.8, name: '🌊 DE WAAL IN!', sub: 'Zwem tussen de vrachtschepen door', arch: ['DE WAAL · ZWEMMEN!', '#1f5fa8'] },
  kermis: { L: 280, mul: 1, name: '🎡 KERMIS!', sub: 'Pak de boosters en vlieg de lucht in', arch: ['KERMIS', '#e8203a'] },
  achtbaan: { L: 300, mul: 1.5, ride: true, name: '🎢 MAX & MORITZ', sub: 'Efteling · houd je vast!', arch: ['MAX & MORITZ · EFTELING', '#7a2e8c'] },
  glijbaan: { L: 210, mul: 1.45, ride: true, name: '🗼 STEVENSTOREN-GLIJBAAN', sub: 'Van boven naar beneden!', arch: ['STEVENSTOREN-GLIJBAAN', '#e8a020'] },
};
// hoogte van de baan op d meter in het uitstapje
function segH(type, d) {
  const L = SEG_DEFS[type].L;
  if (type === 'waal') return 0;
  if (type === 'glijbaan') { const k = clamp(d / (L - 15), 0, 1); return 21 * Math.pow(1 - k, 1.25) + Math.sin(d * 0.25) * 0.4 * (1 - k); }
  if (type === 'achtbaan') {
    const f = (x) => { if (x < 45) return 0.6 + (x / 45) * 13; const u = (x - 45) / (L - 75); return 2 + 11.6 * Math.pow(Math.cos(u * Math.PI * 2.5) * 0.5 + 0.5, 1.3) * (1 - u * 0.4); };
    if (d < L - 30) return f(Math.max(0, d));
    const e = f(L - 30); return e + (0.6 - e) * clamp((d - (L - 30)) / 30, 0, 1);
  }
  return 0;
}
function segArch(text, color) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(mesh(box(0.35, 6, 0.35), M(color), sx * (ROAD_W / 2 + 0.6), 3, 0));
  const t = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 1.6, 1.3), new THREE.MeshBasicMaterial({ map: canvasTex(512, 84, (x) => {
    x.fillStyle = color; x.fillRect(0, 0, 512, 84); x.fillStyle = '#ffd23f'; for (let i = 0; i < 512; i += 24) { x.beginPath(); x.arc(i + 12, 8, 5, 0, 7); x.fill(); x.beginPath(); x.arc(i + 12, 76, 5, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; x.font = '44px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 44, 490);
  }), side: THREE.DoubleSide }));
  t.position.y = 6.2; g.add(t);
  return g;
}
const segMats = {};
const sm = (k, c, extra) => (segMats[k] ||= new THREE.MeshLambertMaterial({ color: c, ...extra }));
function makeSchip() {
  const g = new THREE.Group();
  g.add(mesh(box(2, 1.2, 9), sm('romp', '#1b2a3a'), 0, 0.3, 0));
  g.add(mesh(box(2.02, 0.25, 9.02), sm('rand', '#c8202b'), 0, 0.95, 0));
  g.add(mesh(box(1.6, 1.4, 1.8), sm('brug', '#f4f4f4'), 0, 1.7, 3.2));
  g.add(mesh(box(1.7, 0.7, 4.5), sm('lading', '#e8a020'), 0, 1.4, -1.2));
  return g;
}
function makeBooster() {
  const g = new THREE.Group();
  g.add(mesh(box(1.6, 0.18, 1.8), sm('boost', '#ff7b00', { emissive: '#5a2a00' }), 0, 0.09, 0));
  for (let i = 0; i < 3; i++) { const a = mesh(coneG(0.25, 0.4, 3).rotateX(-Math.PI / 2), sm('pijl', '#ffd23f', { emissive: '#6a5000' }), 0, 0.22, 0.5 - i * 0.5); g.add(a); }
  return g;
}
const cart = (() => {
  const g = new THREE.Group();
  g.add(mesh(box(1.0, 0.45, 1.5), M('#7a2e8c'), 0, 0.42, 0.05));
  g.add(mesh(box(1.02, 0.12, 1.52), M('#ffd23f'), 0, 0.68, 0.05));
  g.add(mesh(box(0.9, 0.6, 0.12), M('#5a1e6a'), 0, 0.8, 0.75));
  for (const [x, z] of [[-0.4, -0.5], [0.4, -0.5], [-0.4, 0.6], [0.4, 0.6]]) g.add(mesh(cylG(0.12, 0.12, 0.1, 8).rotateZ(Math.PI / 2), M('#333'), x, 0.15, z));
  g.visible = false;
  jens.root.add(g);
  return g;
})();
// alles in één keer neerzetten: baan, bootjes, bekers
function buildSeg(s) {
  const D = (d) => -(s.s0 - dist + d); // z van een punt d meter in het uitstapje
  const type = s.type, L = s.L;
  addObj('deco', segArch(...SEG_DEFS[type].arch), 0, D(-2), 0, 0, 0, { y: type === 'glijbaan' ? segH(type, 0) - 0.5 : type === 'achtbaan' ? 0 : 0 });
  if (type === 'waal') {
    for (let d = 20; d < L - 15; d += rand(20, 28)) {
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5), n = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < n; i++) addObj('schip', makeSchip(), LANES[lanes[i]], D(d), 1.9, 9, 2.6, { y: -0.4, gen: 'stumble' });
      if (Math.random() < 0.8) for (let i = 0; i < 5; i++) addObj('beker', coinProxy(), LANES[lanes[n]], D(d - 6 + i * 1.6), 0, 0, 0, { y: 0.7 });
    }
  } else if (type === 'kermis') {
    spawnLandmark({ b: 'reuzenrad', side: -1 }, D(40));
    spawnLandmark({ b: 'reuzenrad', side: 1 }, D(170));
    for (let d = 25; d < L - 15; d += rand(26, 34)) {
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
      addObj('booster', makeBooster(), LANES[lanes[0]], D(d), 1.6, 1.8, 0);
      for (let i = 0; i < 8; i++) { const k = i / 7; addObj('beker', coinProxy(), LANES[lanes[0]], D(d + 3 + k * 26), 0, 0, 0, { y: 0.85 + Math.sin(k * Math.PI) * 8.2 }); }
      if (Math.random() < 0.7) SPECIAL_EXTRA.botsauto(lanes[1], D(d + 12));
    }
  } else {
    // rails (achtbaan) of goot (glijbaan), stukje voor stukje
    const ach = type === 'achtbaan';
    const rail = sm(ach ? 'rail' : 'goot', ach ? '#c8202b' : '#2a7ac0'), steun = sm('steun', ach ? '#f4f4f4' : '#e8a020');
    for (let d = 0; d < L; d += 2.4) {
      const h = segH(type, d), h2 = segH(type, d + 2.4), g = new THREE.Group(), tilt = Math.atan2(h2 - h, 2.4);
      if (ach) { for (const sx of [-0.5, 0.5]) { const r = mesh(box(0.12, 0.12, 2.5), rail, sx, 0, 0); r.rotation.x = tilt; g.add(r); } }
      else { const b = mesh(box(ROAD_W - 0.6, 0.12, 2.5), rail, 0, -0.06, 0); b.rotation.x = tilt; g.add(b); for (const sx of [-1, 1]) { const w = mesh(box(0.12, 0.7, 2.5), rail, sx * (ROAD_W / 2 - 0.3), 0.3, 0); w.rotation.x = tilt; g.add(w); } }
      if (Math.round(d / 2.4) % 4 === 0 && h > 0.8) g.add(mesh(box(0.2, h, 0.2), steun, 0, -h / 2, 0));
      addObj('deco', g, ach ? LANES[1] : 0, D(d + 1.2), 0, 0, 0, { y: h + (h2 - h) / 2 });
    }
    if (ach) { const d = 45 + (L - 75) * 0.55, ring = new THREE.Mesh(torG(3.2, 0.14, 6, 24), rail); s.loopD = d; addObj('deco', ring, LANES[1], D(d), 0, 0, 0, { y: segH(type, d) + 1.2 }); }
    else spawnLandmark({ b: 'stevenskerk', side: 1 }, D(-6));
    for (let d = 14; d < L - 10; d += 3.2) {
      const lane = ach ? 1 : Math.floor((Math.sin(d * 0.05) * 0.5 + 0.5) * 2.99);
      if (Math.random() < 0.75) addObj('beker', coinProxy(), LANES[lane], D(d), 0, 0, 0, { y: segH(type, d) + (ach ? 0.55 : 0) + 0.85 });
    }
  }
}
function startSeg(type) {
  const def = SEG_DEFS[type];
  if (fietsT > 0) stopFiets();
  if (brommerT > 0) { brommerT = 0; moped.visible = false; engineStop(); }
  const s = { type, L: def.L, s0: dist + 62, active: false, t: 0, scream: 0 };
  // ruim de weg vanaf het begin van het uitstapje leeg
  for (const o of objs) if (o.z < -(s.s0 - dist) + 6 && o.kind !== 'landmark' && o.kind !== 'sign') o.dead = true;
  spawnZ = -(s.s0 - dist + def.L + 6);
  seg = s;
  buildSeg(s);
  toast(`${def.name}<small>${def.sub}</small>`, 2.4);
}
function segActivate(s) {
  s.active = true;
  const t = s.type;
  if (t === 'waal') { fade(); setWaal(true); noise(0.6, 0.35); }
  if (t === 'glijbaan') { fade(); bubble(jens.head, 'WOEHOE!', 'shout', 1.4, 0.5); }
  if (t === 'achtbaan') { cart.visible = true; }
  nearT = 0;
}
function endSeg() {
  const s = seg;
  if (!s) return;
  seg = null;
  if (s.type === 'waal') { fade(); setWaal(false); }
  cart.visible = false;
  jens.root.rotation.x = 0;
  player.y = Math.max(0, Math.min(player.y, 0.6)); player.vy = 0; player.grounded = player.y <= 0.01;
  if (!player.grounded) player.vy = 0;
  invulnT = Math.max(invulnT, 1);
}
let waalOn = false;
const waalTex = canvasTex(64, 64, (x) => { x.fillStyle = '#2e5f80'; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 14; i++) x.fillRect(Math.random() * 64, Math.random() * 64, rand(6, 16), 2); });
waalTex.wrapS = waalTex.wrapT = THREE.RepeatWrapping; waalTex.repeat.set(2, 30);
function setWaal(on) {
  waalOn = on;
  road.material.map = on ? waalTex : roadTex; road.material.needsUpdate = true;
  for (const b of streetBits) b.visible = !on;
  for (const d of decor) for (const it of d.items) it.visible = !on && (d.kind !== 'makeParkedBikes' || !!curTheme?.houses);
  for (const w of waterPlanes) w.visible = on || !!curTheme?.water;
  if (groundMat) groundMat.color.set(on ? '#2e5f80' : (curTheme?.grass || '#6f9a52'));
}
function updateSeg(dt) {
  if (curLevel || indoor || state !== 'run' || jacht) return;
  if (!seg) {
    if (schoolPhase || bos || ebos || path || hill) return;
    if ((segRollT -= dt) > 0) return;
    segRollT = 30;
    seeded('seg' + ++segN, () => {
      if (Math.random() >= 1 / 4) return;
      if (!segBag.length) segBag = Object.keys(SEG_DEFS).sort(() => Math.random() - 0.5);
      startSeg(segBag.pop());
    });
    return;
  }
  const s = seg, d = dist - s.s0;
  if (!s.active && d >= 0) segActivate(s);
  if (!s.active) return;
  if (d > s.L) { endSeg(); return; }
  s.t += dt;
  if (waalOn) waalTex.offset.y += speed * dt / 8;
  if (s.type === 'achtbaan') {
    // schreeuwen bij elke afdaling, en een looping door de ring
    const slope = segH('achtbaan', d + 3) - segH('achtbaan', d);
    if ((s.scream -= dt) <= 0 && slope < -0.9) { s.scream = 2.2; scream(); bubble(jens.head, pick(['AAAAAAAAH!', 'WAAAAAH!', 'MAMAAA!', 'AAAHHH IK GA DOOD!']), 'shout', 1.4, 0.5); }
    const k = (d - (s.loopD - 4)) / 8;
    jens.root.rotation.x = k > 0 && k < 1 ? -k * Math.PI * 2 : 0;
  }
}
// speler op de baan houden
function segPlayer() {
  const s = seg;
  if (!s?.active) return false;
  const d = dist - s.s0, def = SEG_DEFS[s.type];
  if (s.type === 'waal') { player.y = segH('waal', d); player.vy = 0; player.grounded = true; player.slideT = 0; return true; }
  if (def.ride) { player.y = segH(s.type, d) + (s.type === 'achtbaan' ? 0.15 : 0); player.vy = 0; player.grounded = true; if (s.type === 'achtbaan') player.lane = 1; return true; }
  return false;
}
function scream() {
  if (!ac || !save.sound) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.3); o.frequency.exponentialRampToValueAtTime(380, t + 1.3);
  lfo.frequency.value = 7; lg.gain.value = 18; lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  for (const [fq, q] of [[800, 5], [1250, 7], [2600, 9]]) { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q; o.connect(bp).connect(g); }
  g.connect(master); o.start(t); lfo.start(t); o.stop(t + 1.5); lfo.stop(t + 1.5);
}

// =====================================================================
//  VAKKENVULLEN BIJ DE PLUS WALRAVEN (vervangt de terror-modus)
// =====================================================================
const PLUS_GROEN = '#2a8a3a', PLUS_ROOD = '#d8202b';
SHIRTS.pluspolo = { base: PLUS_GROEN, paint(x, side) {
  x.fillStyle = '#f4f4f4'; x.beginPath(); x.ellipse(64, 0, 26, 12, 0, 0, Math.PI); x.fill(); // kraag
  if (side === 'front') { x.fillStyle = PLUS_ROOD; x.fillRect(74, 36, 34, 14); x.fillStyle = '#fff'; x.font = 'bold 12px Arial'; x.fillText('PLUS', 77, 47); x.fillStyle = '#fff'; x.fillRect(30, 40, 22, 9); }
  else text(x, 'PLUS', '#fff', 26, 46);
} };
function makeLeidinggevende() {
  const p = makePerson({ key: 'leidinggevende', skin: '#ecc4a4', hair: '#8a8a8a', hairStyle: 'kort',
    shirt: { base: '#2a8a3a', paint(x, side) {
      x.fillStyle = '#f4f4f4'; x.beginPath(); x.ellipse(64, 0, 26, 12, 0, 0, Math.PI); x.fill();
      if (side === 'front') { x.fillStyle = '#d8202b'; x.fillRect(74, 36, 34, 14); x.fillStyle = '#fff'; x.font = 'bold 12px Arial'; x.fillText('PLUS', 77, 47); x.fillStyle = '#fff'; x.fillRect(22, 38, 40, 14); x.fillStyle = '#111'; x.font = 'bold 8px Arial'; x.fillText('TEAMLEIDER', 23, 48); }
      else text(x, 'PLUS', '#fff', 26, 46);
    } }, pants: '#2a2f3a', shoes: '#1a1a1a', face: { skin: '#ecc4a4', angry: true, glasses: true, brow: '#6a6a6a' }, scale: [1.08, 1.04, 1.08] });
  p.style = 'point';
  return p;
}
// tien producten om naar de leidinggevende te gooien
const PRODUCTEN = [
  { name: 'pak melk', splat: '#f4f4f4', line: 'Melk?! Over m\'n hele bril!', make: () => { const g = new THREE.Group(); g.add(mesh(box(0.14, 0.24, 0.14), M('#f4f4f4'))); g.add(mesh(box(0.145, 0.07, 0.145), M('#2667c9'), 0, 0.05, 0)); return g; } },
  { name: 'pot pindakaas', splat: '#a8702a', line: 'PINDAKAAS?! JENS!', make: () => { const g = new THREE.Group(); g.add(mesh(cylG(0.08, 0.08, 0.16, 10), M('#a8702a'))); g.add(mesh(cylG(0.085, 0.085, 0.04, 10), M('#e8c020'), 0, 0.1, 0)); return g; } },
  { name: 'tros bananen', splat: '#ffe14a', line: 'Bananen?! Ben je een aap ofzo?', make: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = mesh(box(0.05, 0.05, 0.24), M('#ffd23f'), (i - 1.5) * 0.05, Math.abs(i - 1.5) * 0.02, 0); b.rotation.x = 0.4; g.add(b); } return g; } },
  { name: 'doos eieren', splat: '#ffcc33', line: 'Eieren! Overal eieren!', make: () => mesh(box(0.3, 0.08, 0.14), M('#c9b28a')) },
  { name: 'fles cola', splat: '#4a2a14', line: 'Dat kost je een dag loon!', make: () => { const g = new THREE.Group(); g.add(mesh(cylG(0.05, 0.05, 0.26, 8), M('#3a1a10'))); g.add(mesh(cylG(0.052, 0.052, 0.06, 8), M('#e41e2b'), 0, 0.02, 0)); return g; } },
  { name: 'zak chips', splat: '#e8a020', line: 'Paprikachips in m\'n haar!', make: () => mesh(box(0.22, 0.28, 0.08), M('#e8203a')) },
  { name: 'Goudse kaas', splat: '#ffd23f', line: 'Een héle kaas?!', make: () => mesh(cylG(0.18, 0.18, 0.1, 12).rotateX(Math.PI / 2), M('#ffc928')) },
  { name: 'komkommer', splat: '#4a9a3a', line: 'Au! Een komkommer!', make: () => mesh(cylG(0.04, 0.04, 0.3, 8).rotateZ(Math.PI / 2), M('#2e7a35')) },
  { name: 'blik soep', splat: '#d8301b', line: 'Tomatensoep?! JENS!', make: () => mesh(cylG(0.06, 0.06, 0.12, 10), M('#d8202b')) },
  { name: 'volkorenbrood', splat: '#a0702a', line: 'Een volkoren?! Kom hier jij!', make: () => mesh(box(0.26, 0.14, 0.14), M('#a0702a')) },
];
function plusDecor() {
  // schap met spullen, een pallet en de gevel van de Plus
  const g = new THREE.Group();
  g.add(mesh(box(0.5, 1.8, 2.6), M('#e8e8e8'), 0, 0.9, 0));
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) g.add(mesh(box(0.3, 0.2, 0.3), M(pick(['#e8203a', '#2667c9', '#ffd23f', '#2e7a35', '#f4f4f4', '#a0702a'])), -0.3, 0.3 + r * 0.42, -1.05 + i * 0.42));
  const gevel = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), new THREE.MeshBasicMaterial({ map: canvasTex(320, 50, (x) => { x.fillStyle = PLUS_GROEN; x.fillRect(0, 0, 320, 50); x.fillStyle = PLUS_ROOD; x.fillRect(8, 8, 74, 34); x.fillStyle = '#fff'; x.font = 'bold 26px Arial'; x.fillText('PLUS', 14, 35); x.font = 'bold 24px Arial'; x.fillText('WALRAVEN', 100, 34); }), side: THREE.DoubleSide }));
  gevel.position.set(-0.4, 3.4, 0); gevel.rotation.y = Math.PI / 2; g.add(gevel);
  return g;
}
let prodBag = [];
function plusVariant() {
  return {
    cap: 'Vakkenvullen bij de Plus Walraven', cam: [2.6, 1.5, -2.6],
    start(A) {
      if (!prodBag.length) prodBag = PRODUCTEN.map((_, i) => i).sort(() => Math.random() - 0.5);
      A.p = PRODUCTEN[prodBag.pop()];
      jens.setShirt('pluspolo');
      aanProp(plusDecor(), -1.6, 0, -0.4);
      const pallet = new THREE.Group(); pallet.add(mesh(box(1, 0.14, 1), M('#b08a5a'), 0, 0.07, 0)); for (let i = 0; i < 4; i++) pallet.add(mesh(box(0.42, 0.3, 0.42), M('#c9a274'), (i % 2 - 0.5) * 0.45, 0.3, (Math.floor(i / 2) - 0.5) * 0.45)); aanProp(pallet, -0.9, 0, 1.2);
      A.c.root.position.set(1.8, 0, 1.6);
      A.prod = aanProp(A.p.make(), 0, 1.4, -0.1); A.prod.visible = false;
    },
    upd(A, t, dt) {
      const c = A.c;
      if (t < 0.9) { faceDir(jens.root, -1.6, -0.4); pose(jens, 'reach', dt); }
      if (t < 1.0) { c.root.position.z = lerpN(1.6, 1.0, t); faceDir(c.root, 0, 0); pose(c, 'point', dt, 0.3); }
      if (t > 0.2 && !A.s1) { A.s1 = 1; bubble(c.head, 'Jens! Je moet SNELLER vullen!', 'angry', 1.4); }
      if (t > 0.95 && t < 1.6) {
        faceDir(jens.root, c.root.position.x, c.root.position.z); pose(jens, 'reach', dt);
        const k = clamp((t - 1.0) / 0.45, 0, 1);
        A.prod.visible = k < 1; A.prod.position.set(lerpN(0.2, c.root.position.x, k), 1.4 + Math.sin(k * Math.PI) * 0.6, lerpN(-0.1, c.root.position.z, k)); A.prod.rotation.x += dt * 12;
        if (k >= 1 && !A.s2) { A.s2 = 1; noise(0.2, 0.3); burst(new THREE.Vector3(c.root.position.x, 1.75, c.root.position.z), 16, 2.5, M(A.p.splat), 0.6); bubble(c.head, A.p.line, 'angry', 1.4); c.body.rotation.x = 0.3; }
      }
      if (t >= 1.6) { faceDir(jens.root, 0, -6); pose(jens, 'run', dt, 0.6); jens.root.position.z = -(t - 1.6) * 0.8; pose(c, 'point', dt, 0.3); faceDir(c.root, 0, jens.root.position.z); }
      // polo uit: weer in z'n eigen outfit
      if (t > 2.05 && !A.s3) {
        A.s3 = 1; jens.setShirt(save.eq.shirt);
        burst(new THREE.Vector3(0, 1.4, jens.root.position.z), 10, 1.5, M(PLUS_GROEN), 0.4);
        aanProp(mesh(box(0.5, 0.04, 0.4), M(PLUS_GROEN)), 0.3, 0.03, jens.root.position.z + 0.6);
        bubble(jens.head, 'Ik neem ontslag!', 'shout', 1.2, 0.5);
      }
    },
  };
}


// =====================================================================
//  BROMMER MET PATRICK: Jens springt achterop
// =====================================================================
let patrickRijder = null, patrickPraatT = 0;
const PATRICK_BROMMER = ['Hou je vast, sukkel!', 'Hij loopt 70, ik zweer het!', 'Niet tegen m\'n moeder zeggen hè', 'Opzij, sukkels!', 'Tering, wat gaat ie hard!', 'Hoor je die uitlaat?!'];
function brommerPatrick(on) {
  if (on && !patrickRijder) {
    patrickRijder = makeVriend('patrick');
    patrickRijder.shadow.visible = false;
    patrickRijder.root.position.set(0, 0, -0.05);
    moped.add(patrickRijder.root);
  }
  if (patrickRijder) patrickRijder.root.visible = on;
  moped.position.z = on ? -0.42 : 0;
  if (on) { patrickPraatT = 0.6; }
}
function updatePatrickRijder(dt) {
  if (!patrickRijder?.root.visible) return;
  if (!moped.visible) { brommerPatrick(false); return; }
  pose(patrickRijder, 'sit', dt);
  patrickRijder.armL.rotation.x = patrickRijder.armR.rotation.x = 1.5; // handen aan het stuur
  if ((patrickPraatT -= dt) <= 0) { patrickPraatT = rand(2.2, 3.4); bubble(patrickRijder.head, pick(PATRICK_BROMMER), Math.random() < 0.4 ? 'angry' : '', 1.6); }
}

// =====================================================================
//  SEIZOENSPAS: elke maand 20 treden, XP door te rennen
// =====================================================================
const PASS_XP = 100, PASS_TIERS = 20;
const PASS_REWARD = (i) => i === 9 ? { item: 'head:kroon', label: '👑 Kroon (Hoofd)' } : i === 14 ? { item: 'shirt:pas', label: '🎟️ Seizoensshirt' } : i === 19 ? { item: 'hand:minibeker', label: '🏆 Mini-beker (Hand)' } : { bekers: 40 + i * 15, label: `🏆 ${40 + i * 15} bekers` };
const monthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
function passState() {
  if (!save.pass || save.pass.month !== monthKey()) save.pass = { month: monthKey(), xp: 0, claimed: {} };
  return save.pass;
}
function passAddXp(meters) {
  const p = passState(), before = Math.floor(p.xp / PASS_XP);
  p.xp += Math.max(0, Math.floor(meters / 10));
  const after = Math.min(PASS_TIERS, Math.floor(p.xp / PASS_XP));
  if (after > before && before < PASS_TIERS) setTimeout(() => note(`🎟️ Seizoenspas: trede ${after} gehaald! Haal je beloning op`), 1600);
  persist();
}
function openPass() { showScreen('#pass'); renderPass(); }
function renderPass() {
  const p = passState(), lvl = Math.min(PASS_TIERS, Math.floor(p.xp / PASS_XP));
  const d = new Date(), end = new Date(d.getFullYear(), d.getMonth() + 1, 1), days = Math.ceil((end - d) / 864e5);
  $('#passHead').innerHTML = `<b>${d.toLocaleString('nl-NL', { month: 'long' })}</b> · trede ${lvl}/${PASS_TIERS} · nog ${days} ${days === 1 ? 'dag' : 'dagen'}`;
  $('#passBar').style.width = `${lvl >= PASS_TIERS ? 100 : ((p.xp % PASS_XP) / PASS_XP) * 100}%`;
  $('#passList').innerHTML = Array.from({ length: PASS_TIERS }, (_, i) => {
    const r = PASS_REWARD(i), got = p.claimed[i], open = lvl > i;
    return `<div class="pt ${got ? 'got' : open ? 'open' : ''} ${r.item ? 'special' : ''}"><span>${i + 1}</span><b>${r.label}</b>${got ? '<small>✓</small>' : open ? `<button class="btn" data-claim="${i}">Ophalen</button>` : '<small>🔒</small>'}</div>`;
  }).join('');
}
$('#passList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-claim]');
  if (!b) return;
  const i = +b.dataset.claim, p = passState(), r = PASS_REWARD(i);
  if (p.claimed[i] || Math.floor(p.xp / PASS_XP) <= i) return;
  p.claimed[i] = 1;
  if (r.item) save.owned[r.item] = true; else save.bekers += r.bekers;
  persist(); sfx.power?.(); note(`🎟️ ${r.label}`);
  renderPass();
});
$('#passBtn').addEventListener('click', () => { audioInit(); openPass(); });
$('#passBack').addEventListener('click', () => showScreen('#menu'));

// =====================================================================
//  NIJMEGENACTUEEL-KRANT: elke dag de voorpagina van gisteren
// =====================================================================
const KRANT_DOOD = {
  gat: (n, s) => `${n} verdween in een gat op de ${s}. De gemeente onderzoekt het.`,
  auto: (n, s) => `${n} knalde vol op een foutgeparkeerde auto op de ${s}.`,
  afzetting: (n, s) => `${n} rende dwars door een wegafzetting op de ${s}.`,
  vlucht: (n, s) => `${n} zat te snappen op de fiets en vloog drie postcodes verder. Startpunt: ${s}.`,
  gevloerd: (n, s) => `${n} werd op de ${s} gevloerd door een vrouw met een hond.`,
  gepakt: (n, s) => `${n} werd op de ${s} in de kraag gevat.`,
  botsing: (n, s) => `${n} botste op de ${s} ergens frontaal tegenaan.`,
};
const dagRange = (offset) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return [d.getTime(), d.getTime() + 864e5]; };
async function openKrant() {
  showScreen('#krant');
  const el = $('#krantBody');
  el.innerHTML = '<p class="hint">De krant wordt gedrukt…</p>';
  try {
    let [from, to] = dagRange(-1), label = 'gisteren';
    let r = await fetch(`/api/krant?from=${from}&to=${to}`).then((x) => x.json());
    if (!r.runs) { [from, to] = dagRange(0); label = 'vandaag tot nu toe'; r = await fetch(`/api/krant?from=${from}&to=${to}`).then((x) => x.json()); }
    const d = new Date(from);
    $('#krantDate').textContent = `${d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${label}`;
    if (!r.runs) { el.innerHTML = '<p class="kr-lead">Stil in Nijmegen. Niemand heeft gerend. Verdacht.</p>'; return; }
    const top = r.top[0], esc = escHtml, ml = (m) => MODES[m]?.label || m;
    const kop = top ? `${esc(top.name).toUpperCase()} TERRORISEERT ${esc(top.street || 'NIJMEGEN').toUpperCase()}` : 'RUSTIGE DAG IN NIJMEGEN';
    const dood = r.dood ? (KRANT_DOOD[r.dood.reason] || KRANT_DOOD.botsing)(esc(r.dood.name), esc(r.dood.street || 'onbekende straat')) : null;
    el.innerHTML = `
      <h3 class="kr-kop">${kop}</h3>
      ${top ? `<p class="kr-lead">${esc(top.name)} haalde ${label} maar liefst <b>${top.score.toLocaleString('nl-NL')}</b> punten in de ${ml(top.mode)}-modus. Buurtbewoners: "We kennen hem wel."</p>` : ''}
      <div class="kr-cols">
        <div><h4>🏆 Top 3</h4><ol>${r.top.map((t) => `<li><b>${esc(t.name)}</b> ${t.score.toLocaleString('nl-NL')} <small>${ml(t.mode)}</small></li>`).join('')}</ol></div>
        <div><h4>📏 Langste run</h4><p>${r.lang ? `<b>${esc(r.lang.name)}</b> rende ${r.lang.dist.toLocaleString('nl-NL')} meter aan één stuk.` : '-'}</p>
          <h4>🔁 Verslaafd</h4><p>${r.vaak ? `<b>${esc(r.vaak.name)}</b> speelde ${r.vaak.n} potjes.` : '-'}</p></div>
      </div>
      ${dood ? `<div class="kr-box"><h4>💀 Gekste dood</h4><p>${dood}</p></div>` : ''}
      <p class="kr-foot">In totaal ${r.runs.toLocaleString('nl-NL')} potjes en ${(r.meters / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km gerend. Meer nieuws op nijmegenactueel.nl</p>`;
  } catch (e) { el.innerHTML = '<p class="hint">Geen verbinding, de krantenjongen is verdwaald.</p>'; }
}
$('#krantBtn').addEventListener('click', openKrant);
$('#krantBack').addEventListener('click', () => showScreen('#menu'));

// =====================================================================
//  VIERDAAGSE: vier dagen lopen tussen duizenden wandelaars
// =====================================================================
const WANDEL_SHIRTS = ['#1f8f4e', '#ff7b00', '#2667c9', '#c8202b', '#e8b923', '#7a3f8c'];
function makeWandelaars(n) {
  const g = new THREE.Group(), ps = [];
  for (let i = 0; i < n; i++) {
    const ci = Math.floor(Math.random() * WANDEL_SHIRTS.length);
    const p = makePerson({ key: 'wandelaar' + ci, skin: pick(['#f2d0b8', '#e8c3a6', '#c99468', '#f0cbb0']), hair: pick(['#3a2a1e', '#c9a866', '#8d8d8d', '#1a1410']), hairStyle: pick(['kort', 'lang', 'pet', 'kaal']),
      shirt: { base: WANDEL_SHIRTS[ci], paint(x, side) { if (side === 'front') { x.fillStyle = '#fff'; x.fillRect(48, 50, 32, 22); x.fillStyle = '#111'; x.font = 'bold 14px Arial'; x.fillText(String(1000 + ci * 731), 50, 66); } } }, pants: pick(['#2b2b3a', '#5a4a3a', '#1f2a3a']), shoes: '#f4f4f4' });
    p.root.position.set((i - (n - 1) / 2) * 0.62, 0, rand(-0.3, 0.3));
    p.body.add(mesh(box(0.3, 0.36, 0.16), fabricMat(pick(['#2a2a2a', '#3c6e47', '#7a2e3a'])), 0, 1.25, 0.2)); // rugzak
    g.add(p.root); ps.push(p);
  }
  g.userData.ps = ps;
  return g;
}
LANDMARKS.gladiola = () => {
  const g = new THREE.Group();
  const groen = M('#3f7a33'), kl = ['#e8203a', '#ff7b00', '#ff4d8a', '#f4f4f4'].map((c) => M(c));
  for (const sx of [-1, 1]) for (let z = -30; z <= 30; z += 1.4) {
    const x = sx * (ROAD_W / 2 + 0.8);
    g.add(mesh(box(0.05, 1.2, 0.05), groen, x, 0.6, z));
    for (let k = 0; k < 4; k++) g.add(mesh(box(0.14, 0.12, 0.14), pick(kl), x, 0.9 + k * 0.12, z));
  }
  const boog = textPlane('VIA GLADIOLA · FINISH', ROAD_W + 2, 1.4, '#ffffff', '#1f8f4e'); boog.rotation.y = 0; boog.position.set(0, 5.4, -30); g.add(boog);
  for (const sx of [-1, 1]) g.add(mesh(box(0.25, 5.4, 0.25), M('#f4f4f4'), sx * (ROAD_W / 2 + 0.6), 2.7, -30));
  return { g, len: 66, name: 'Via Gladiola' };
};
Object.assign(THEMES, {
  vd_elst: { houses: 'rij', heights: [5, 7], roof: true, grass: '#7aa84f', streets: ['Wedren', 'Dorpsstraat Elst', 'Grote Molenstraat', 'Rijksweg'], obstacles: ['wandelaars', 'wandelaars', 'wandelaars', 'dranghek', 'kliko'] },
  vd_wijchen: { houses: 'rij', heights: [6, 8.5], roof: true, grass: '#6f9a52', streets: ['Markt Wijchen', 'Homberg', 'Touwslagersbaan', 'Kasteellaan'], obstacles: ['wandelaars', 'wandelaars', 'wandelaars', 'terras', 'dranghek'] },
  vd_groesbeek: { houses: null, heights: [6, 8], roof: true, grass: '#3f6b2e', streets: ['Zevenheuvelenweg', 'Wylerbaan', 'Canadese begraafplaats', 'Derde heuvel'], obstacles: ['wandelaars', 'wandelaars', 'wandelaars', 'boomstam', 'dranghek'] },
  vd_cuijk: { houses: 'centrum', heights: [8, 12], roof: true, grass: '#6f9a52', streets: ['Pontonbrug', 'Grotestraat Cuijk', 'Charlemagne', 'Via Gladiola'], obstacles: ['wandelaars', 'wandelaars', 'wandelaars', 'dranghek', 'marktkraam'] },
});
const LEVELS_4D = [
  { id: 'v4d1', wijk: 'Dag 1 · Elst', theme: 'vd_elst', length: 2400, speed: 14, maxSpeed: 22, need: 2, star3: 6000, nitraten: 1,
    intro: 'De Vierdaagse begint. Dag van Elst: 40 kilometer door de Betuwe, en Jens doet het rennend. De BOA loopt mee.',
    uniek: 'Duizenden wandelaars op de weg',
    lore: [{ at: 100, text: '🥾 Dag 1 · 47.000 wandelaars, en Jens rent er dwars doorheen.' }, { at: 1300, text: '🎺 Overal muziekkapellen en mensen die je aanmoedigen.' }],
    tasks: [{ at: 600, type: 'bel', text: 'Haal een stempel bij de post' }, { at: 1200, type: 'toeter', text: 'Toeter mee met de muziekkapel' }, { at: 1900, type: 'kliko', text: 'Schop een prullenbak van de verzorgingspost om' }] },
  { id: 'v4d2', wijk: 'Dag 2 · Wijchen', theme: 'vd_wijchen', length: 2500, speed: 14.5, maxSpeed: 23, need: 2, star3: 6300, nitraten: 1,
    intro: 'Dag van Wijchen. Iedereen heeft blaren, behalve Jens. Op de Markt staat heel Wijchen te juichen.',
    uniek: 'Terrassen vol supporters',
    lore: [{ at: 100, text: '🥾 Dag 2 · "Hou vol!" roept een oma. Jens houdt vol.' }, { at: 1400, text: '🍬 Kinderen delen snoep uit. Jens pakt er drie.' }],
    tasks: [{ at: 650, type: 'bel', text: 'Stempel halen in Wijchen' }, { at: 1300, type: 'vuurwerk', show: 'cake', text: 'Cakebox op de Markt' }, { at: 2000, type: 'toeter', text: 'Toeter naar de EHBO-post' }] },
  { id: 'v4d3', wijk: 'Dag 3 · Groesbeek', theme: 'vd_groesbeek', length: 2600, speed: 15, maxSpeed: 24, need: 2, star3: 6600, nitraten: 1,
    intro: 'Dag van de Zevenheuvelen. Zeven heuvels, en bovenop elke heuvel staat iemand met een spandoek.',
    uniek: 'Boomstammen in het bos',
    lore: [{ at: 100, text: '⛰️ Dag 3 · De Zevenheuvelenweg. Jens telt er acht.' }, { at: 1500, text: '🇨🇦 Langs de Canadese begraafplaats: even stil. Daarna weer rennen.' }],
    tasks: [{ at: 700, type: 'bel', text: 'Stempel op de derde heuvel' }, { at: 1400, type: 'fakkel', text: 'Fakkel op de top' }, { at: 2100, type: 'toeter', text: 'Toeter bij de finish van de dag' }] },
  { id: 'v4d4', wijk: 'Dag 4 · Cuijk', theme: 'vd_cuijk', length: 2800, speed: 15.5, maxSpeed: 25, need: 2, star3: 7000, nitraten: 2,
    intro: 'Dag van Cuijk. Over de pontonbrug en dan de Via Gladiola op. Heel Nijmegen staat langs de kant met gladiolen.',
    uniek: 'De Via Gladiola met gladiolen',
    winTitle: 'VIERDAAGSE UITGELOPEN!', winText: 'Vier dagen, en Jens heeft er geen meter van gewandeld. Hij krijgt een kruisje én een bos gladiolen.',
    landmarks: [{ at: 2700, b: 'gladiola', side: 0 }],
    lore: [{ at: 100, text: '🌉 Dag 4 · De pontonbrug over de Maas. Die wiebelt.' }, { at: 2600, text: '🌸 De Via Gladiola! Gladiolen overal.' }],
    tasks: [{ at: 700, type: 'bel', text: 'Laatste stempel in Cuijk' }, { at: 1500, type: 'vuurwerk', show: 'lawine', text: 'Lawinepijl op de pontonbrug' }, { at: 2300, type: 'toeter', text: 'Toeter voor de tribune' }] },
];
CAMPAIGNS.vierdaagse = { name: 'De Vierdaagse', levels: LEVELS_4D, unit: 'dag', cat: 'event' };



// =====================================================================
//  CUTSCENES: korte filmpjes in het verhaal (begin, Hatert, na de Koning,
//  Terroriseer Nederland en de ArenA). Gebouwd op een eigen 'set' ver weg.
// =====================================================================
const CUT_X = -400;
const cutStage = new THREE.Group();
cutStage.position.x = CUT_X;
cutStage.visible = false;
scene.add(cutStage);
let cut = null;
if (!save.cuts) save.cuts = {};
function cutCam(px, py, pz, lx, ly, lz) { camera.position.set(CUT_X + px, py, pz); camera.lookAt(CUT_X + lx, ly, lz); }
const lerpN = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
// draai iemand naar een punt (personen kijken standaard naar -z)
const faceTo = (o, x, z) => { o.rotation.y = Math.atan2(-(x - o.position.x), -(z - o.position.z)); };
// een Jens voor in de filmpjes, in z'n huidige outfit
function cutJens() {
  const p = makePerson({ key: 'jens', skin: '#f2cfbf', hair: '#6e5038', hairStyle: 'normaal', shirt: save.eq.shirt || 'wit', pants: '#2f3f5c', shoes: '#f4f4f4', face: { skin: '#f2cfbf', eye: '#4a6b8a', cheeks: true } });
  const hc = save.eq.head === 'manen' ? '#e3c47e' : save.eq.head === 'spike' ? '#4a3626' : save.eq.head === 'kuif' ? '#e8e3d4' : '#6e5038';
  buildHair(p.hair, save.eq.head, hc);
  buildBril(p.bril, save.eq.bril);
  return p;
}
function makeKroon() {
  const g = new THREE.Group(), goud = new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#7a5200' });
  g.add(mesh(cylG(0.15, 0.14, 0.09, 10, 1, true), goud));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(mesh(coneG(0.035, 0.11, 4), goud, Math.sin(a) * 0.14, 0.09, Math.cos(a) * 0.14)); }
  g.add(mesh(sphG(0.03, 6, 4), M('#c8202b'), 0, 0.02, -0.15));
  return g;
}
// eenvoudige decorstukken
function cutGround(dark) {
  const asfalt = new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = dark ? '#3a3d42' : '#4a4d52'; x.fillRect(0, 0, 64, 64); grain(x, 64, 64, 18); }) });
  cutStage.add(mesh(box(160, 0.1, 160), asfalt, 0, -0.05, 0));
  for (const sx of [-1, 1]) cutStage.add(mesh(box(4, 0.14, 160), walkMat, sx * 6, 0.02, 0));
  for (let z = -70; z < 70; z += 6) cutStage.add(mesh(box(0.15, 0.02, 2.4), M('#e8e8e8'), 0, 0.01, z));
}
function cutRow(side, from, to) {
  for (let z = from; z < to; z += 8) {
    const h = rand(6.5, 9);
    const tex = canvasTex(64, 64, (x) => {
      x.fillStyle = pick(['#8a3a2a', '#9a4a32', '#7a3424', '#a8a090']); x.fillRect(0, 0, 64, 64);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { x.fillStyle = Math.random() < 0.6 ? '#ffd27a' : '#1d2a3a'; x.fillRect(10 + c * 28, 8 + r * 20, 16, 13); }
      grain(x, 64, 64, 12);
    });
    const m = new THREE.Mesh(box(6, h, 7.8), [new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: phaseT > 1.5 ? 0.75 : 0.2 }), M('#6a2e20'), M('#3a3a3a'), M('#3a3a3a'), M('#6a2e20'), M('#6a2e20')]);
    m.position.set(side * 11, h / 2, z);
    if (side > 0) m.rotation.y = Math.PI;
    cutStage.add(m);
  }
}
function cutLamp(x, z) {
  const side = x > 0 ? 1 : -1;
  cutStage.add(mesh(cylG(0.06, 0.09, 4.6, 6), M('#3a3d42'), x, 2.3, z));
  cutStage.add(mesh(box(0.35, 0.12, 0.25), lampHeadMat, x - side * 0.8, 4.48, z));
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(7, 8).rotateX(-Math.PI / 2), lampGlowMat); spot.position.set(x - side * 1.4, 0.04, z); cutStage.add(spot);
}
function nlKaart() {
  return canvasTex(256, 300, (x) => {
    x.fillStyle = '#e8e2d2'; x.fillRect(0, 0, 256, 300);
    x.fillStyle = '#ff7b00'; x.beginPath();
    for (const [px, py] of [[120, 20], [190, 40], [230, 110], [215, 170], [230, 230], [180, 290], [120, 270], [60, 250], [40, 200], [70, 140], [60, 90], [90, 40]]) x.lineTo(px, py);
    x.closePath(); x.fill(); x.strokeStyle = '#141414'; x.lineWidth = 3; x.stroke();
    const steden = [['Arnhem', 190, 175], ['Wijchen', 165, 200], ['Malden', 175, 215], ['Ter Apel', 215, 70], ['Overasselt', 160, 220], ['Den Haag', 70, 180], ['Rotterdam', 85, 200], ['Urk', 140, 105], ['Amsterdam', 105, 135]];
    x.font = 'bold 13px Arial';
    for (const [n, px, py] of steden) { x.fillStyle = '#c8202b'; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); x.fillStyle = '#141414'; x.fillText(n, px + 7, py + 4); }
    x.fillStyle = '#141414'; x.font = 'bold 20px Impact, Arial'; x.fillText('TERRORISEER NL', 50, 296);
  });
}
// ---------- de vijf filmpjes ----------
const CUTS = {
  start: {
    look: 2,
    build() {
      cutGround(true); cutRow(-1, -60, 40); cutRow(1, -60, 40);
      for (const z of [-24, 8]) { cutLamp(-4.3, z); cutLamp(4.3, z + 16); }
      // Jens' voordeur
      cutStage.add(mesh(box(0.1, 2.3, 1.2), M('#5a2a12'), 7.9, 1.15, 0));
      const j = cutJens(); j.root.position.set(8.4, 0, 0); j.root.rotation.y = Math.PI / 2; cutStage.add(j.root);
      const boa = makePerson({ key: 'boa', skin: '#e8c3a6', hair: '#3a2a1e', hairStyle: 'boapet', shirt: { base: '#1c2433', paint(x, side) { if (side === 'back') text(x, 'HANDHAVING', '#ffd23f', 18, 40); else { x.fillStyle = '#ffd23f'; x.fillRect(80, 30, 18, 12); } } }, pants: '#141a26', shoes: '#111', face: { skin: '#e8c3a6', angry: true, brow: '#3a2a1e', stubble: '#3a2a1e' }, scale: [1.08, 1.05, 1.08] });
      boa.root.position.set(-1.5, 0, -22); boa.root.rotation.y = Math.PI; boa.root.visible = false; cutStage.add(boa.root);
      return { j, boa };
    },
    shots: [
      { d: 4.5, cap: 'Nijmegen-Oost. Zaterdagavond, 23:47.', cam: (t) => cutCam(lerpN(-3, 2, t), lerpN(10, 4, ease(t)), lerpN(22, 12, t), 0, 1.5, -8), act: (t, A, dt) => pose(A.j, 'idle', dt) },
      { d: 3.5, who: 'Jens', line: 'Saai hier. Iedereen ligt al te pitten.', cam: (t, A) => cutCam(3.2, 1.7, 3.2, A.j.root.position.x, 1.3, 0),
        act: (t, A, dt) => { A.j.root.position.x = lerpN(8.4, 5.6, Math.min(1, t * 1.6)); if (t < 0.6) A.j.root.rotation.y = Math.PI / 2; else faceTo(A.j.root, 3.2, 3.2); pose(A.j, t < 0.6 ? 'run' : 'idle', dt, 0.45); } },
      { d: 3.6, who: 'Jens', line: 'Weet je wat? Ik ga Nijmegen eens even wakker maken.', cam: (t, A) => cutCam(4.1, 1.72, 1.1, 5.6, 1.62, 0), act: (t, A, dt) => { faceTo(A.j.root, 4.1, 1.1); pose(A.j, 'idle', dt); } },
      { d: 3.6, who: 'BOA', line: 'Jens! We houden je in de gaten, jongen.', cam: (t, A) => cutCam(6.6, 2, 1.8, A.boa.root.position.x, 1.5, A.boa.root.position.z),
        act: (t, A, dt) => { A.boa.root.visible = true; A.boa.root.position.z = lerpN(-22, -13, t); pose(A.boa, 'run', dt, 0.4); } },
      { d: 3.2, who: 'BOA', line: 'Eén fout en je krijgt een bonnetje.', cam: (t, A) => cutCam(-0.6, 1.8, -10.2, -1.5, 1.7, -13), act: (t, A, dt) => { A.boa.root.position.z = -13; faceTo(A.boa.root, -0.6, -10.2); pose(A.boa, 'point', dt, 0.2); } },
      { d: 3.4, who: 'Jens', line: 'Pak me dan, als je kan!', cam: (t, A) => cutCam(lerpN(3, -1, t), 1.2, 4, A.j.root.position.x, 1, A.j.root.position.z),
        act: (t, A, dt) => { A.j.root.rotation.y = 0; A.j.root.position.x = lerpN(5.6, 2.2, Math.min(1, t * 2)); A.j.root.position.z = -t * 8; pose(A.j, 'run', dt); } },
      { d: 2.6, title: 'TERRORISEER NIJMEGEN', cam: (t, A) => cutCam(0, 2.5, 6 - t * 4, 0, 1, -20), act: (t, A, dt) => { A.j.root.position.z = -8 - t * 14; pose(A.j, 'run', dt); } },
    ],
  },
  hatert: {
    look: 1,
    build() {
      cutGround(false);
      const wc = LANDMARKS.winkelcentrum('WINKELCENTRUM HATERT'); wc.g.position.set(9, 0, 0); cutStage.add(wc.g);
      const koning = makeDrerrie(true); koning.position.set(3.2, 0, 0); koning.rotation.y = Math.PI / 2; cutStage.add(koning);
      const kroon = makeKroon(); kroon.position.y = 0.25; koning.userData.person.head.add(kroon);
      const drerries = [];
      for (let i = 0; i < 4; i++) { const d = makeDrerrie(false); cutStage.add(d); drerries.push(d); }
      const j = cutJens(); j.root.position.set(-6, 0, 0); j.root.rotation.y = -Math.PI / 2; cutStage.add(j.root);
      return { koning, drerries, j };
    },
    shots: [
      { d: 4, cap: 'Hatert. Hier gelden andere regels.', cam: (t) => cutCam(-14 + t * 4, 7, 16 - t * 4, 4, 2, 0) },
      { d: 3.6, who: 'Drerrie', line: 'Wollah, wie is die gast?', cam: (t) => cutCam(-2, 1.1, 7, 0, 1.2, 0) },
      { d: 3.6, who: 'Koning van Hatert', line: 'Niemand komt zomaar mijn Hatert in.', cam: (t) => cutCam(lerpN(0.4, -0.2, t), 2.6, lerpN(1.4, 1.1, t), 3.2, 2.55, 0) },
      { d: 3.2, who: 'Jens', line: 'Ik wel. Ik kom je kroon halen.', cam: () => cutCam(-4.2, 1.72, -0.9, -6, 1.6, 0) },
      { d: 3.2, who: 'Koning van Hatert', line: 'Dan lig jij straks in de sloot, jochie.', cam: (t) => cutCam(1.2, 2.2, -0.8, 3.2, 2.5, 0) },
      { d: 2.6, title: 'EINDBAAS: DE KONING VAN HATERT', cam: (t) => cutCam(-9, 3 + t, 6, 2, 2, 0) },
    ],
    every: (t, A, dt, T) => {
      A.drerries.forEach((d, i) => { const a = T * 0.9 + (i / 4) * Math.PI * 2; d.position.set(-1 + Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5); d.rotation.y = -a + Math.PI; pose(d.userData.person, 'bike', dt, 0.6); });
      pose(A.koning.userData.person, 'bike', dt, 0.1);
      pose(A.j, 'idle', dt);
    },
  },
  koning: {
    look: 1,
    build() {
      cutGround(false);
      const wc = LANDMARKS.winkelcentrum('WINKELCENTRUM HATERT'); wc.g.position.set(9, 0, 0); cutStage.add(wc.g);
      cutStage.add(mesh(box(3, 0.06, 18), new THREE.MeshLambertMaterial({ color: '#2e5a6a', emissive: '#0c2028' }), -6.5, 0.04, 0)); // sloot
      const koning = makeDrerrie(true); koning.children[0].visible = false; koning.position.set(-6.5, -1.05, 0); koning.rotation.y = Math.PI / 2; cutStage.add(koning);
      const kroon = makeKroon(); kroon.position.set(-3.8, 0.08, 0.6); kroon.rotation.z = 1.2; cutStage.add(kroon);
      const drerries = [];
      for (let i = 0; i < 3; i++) { const d = makeDrerrie(false); d.position.set(1.5 + i * 1.6, 0, -3.5); d.rotation.y = Math.PI * 0.85; cutStage.add(d); drerries.push(d); }
      const j = cutJens(); j.root.position.set(-1, 0, 2.5); j.root.rotation.y = Math.PI / 2; cutStage.add(j.root);
      return { koning, kroon, drerries, j };
    },
    shots: [
      { d: 3.8, who: 'Koning van Hatert', line: 'Dit… dit kan niet. Ik ben de Koning!', cam: () => cutCam(-3.6, 1.6, 1.6, -6.5, 1.4, 0) },
      { d: 3.4, who: 'Jens', line: 'Was. Je wás de Koning.', cam: (t, A) => cutCam(-1.5, 2.2, 5, -3, 0.8, 1),
        act: (t, A, dt) => { A.j.root.position.x = lerpN(-1, -3.3, Math.min(1, t * 1.5)); A.j.root.position.z = lerpN(2.5, 1.2, Math.min(1, t * 1.5)); pose(A.j, t < 0.65 ? 'run' : 'reach', dt, 0.45);
          if (t > 0.8 && A.kroon.parent === cutStage) { A.kroon.position.set(0, 0.25, 0); A.kroon.rotation.set(0, 0, 0); A.j.head.add(A.kroon); } } },
      { d: 3.4, who: 'Jens', line: 'Hatert is van mij.', cam: () => cutCam(-1.6, 1.85, 1.2, -3.3, 1.75, 1.2), act: (t, A, dt) => { faceTo(A.j.root, -1.6, 1.2); pose(A.j, 'idle', dt); } },
      { d: 3.2, who: 'Drerries', line: 'Lang leve Koning Jens!', cam: () => cutCam(-2, 1.4, 1, 3, 1.2, -3.5), act: (t, A, dt) => A.drerries.forEach((d) => { d.userData.person.body.rotation.x = 0.25 + Math.sin(t * 12) * 0.15; }) },
      { d: 3.6, cap: 'Maar Nijmegen was pas het begin…', cam: (t) => cutCam(lerpN(-8, -9, t), lerpN(2, 5, t), lerpN(5, 9, t), -3.3, 1.5, -10) },
      { d: 3, title: 'TERRORISEER NEDERLAND VRIJGESPEELD', cam: () => cutCam(-9, 5, 9, -3.3, 1.5, -10) },
    ],
    every: (t, A, dt) => { pose(A.koning.userData.person, 'sit', dt); A.drerries.forEach((d) => pose(d.userData.person, 'idle', dt)); },
  },
  nederland: {
    look: 1,
    build() {
      cutGround(false);
      const brug = makeArch('#3f6b4a', 90, 26); cutStage.add(brug.g);
      const bord = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), new THREE.MeshLambertMaterial({ map: nlKaart(), side: THREE.DoubleSide }));
      bord.position.set(2.2, 1.9, -2); bord.rotation.y = -0.5; cutStage.add(bord);
      cutStage.add(mesh(box(0.08, 1.2, 0.08), M('#555'), 2.2, 0.6, -2));
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: psxTex(new THREE.TextureLoader().load('img/spandoek.png')), side: THREE.DoubleSide, transparent: true }));
      sp.position.set(-0.6, 1.5, -0.6); sp.scale.set(0.01, 1, 1); cutStage.add(sp);
      const j = cutJens(); j.root.position.set(0.4, 0, 0.6); j.root.rotation.y = 0.6; cutStage.add(j.root);
      return { j, bord, sp };
    },
    shots: [
      { d: 4.2, cap: 'De Waalbrug. Nijmegen ligt aan z\'n voeten.', cam: (t) => cutCam(lerpN(18, 14, t), lerpN(14, 9, t), lerpN(20, 12, t), 0, 4, -5) },
      { d: 3.6, who: 'Jens', line: 'Tien steden. Van Arnhem tot Amsterdam.', cam: () => cutCam(-1.6, 1.9, 2.6, 1.4, 1.6, -1.4) },
      { d: 3.2, cap: 'Terroriseer Nederland: 10 levels', cam: (t) => cutCam(lerpN(0.6, 0.9, t), 1.95, lerpN(0.2, -0.3, t), 2.2, 1.9, -2) },
      { d: 3.8, who: 'Jens', line: 'En dit spandoek gaat mee. Helemaal tot in de ArenA.', cam: () => cutCam(-0.4, 1.6, 3.4, -0.6, 1.5, -0.6),
        act: (t, A) => { A.sp.scale.x = Math.min(1, t * 2); A.j.root.rotation.y = Math.PI; } },
      { d: 2.8, title: 'TERRORISEER NEDERLAND', cam: (t) => cutCam(0, 2 + t * 3, 8 + t * 6, 0, 2, -20), act: (t, A, dt) => { A.sp.visible = false; A.j.root.rotation.y = 0; A.j.root.position.z = 0.6 - t * 10; pose(A.j, 'run', dt); } },
    ],
    every: (t, A, dt) => { if (A.j.root.position.z > 0.5) pose(A.j, 'idle', dt); },
  },
  arena: {
    look: 2,
    build() {
      cutGround(true);
      const a = LANDMARKS.arena(); a.g.position.set(10, 0, -10); cutStage.add(a.g);
      for (const z of [-30, -10, 10]) cutLamp(4.3, z);
      cutStage.add(mesh(box(0.2, 2.2, 6), M('#9aa0a6'), 6.5, 1.1, -2)); // hekken
      const stewards = [];
      for (let i = 0; i < 3; i++) { const s = makeSteward(); s.root.position.set(5.5, 0, -4 + i * 2); s.root.rotation.y = Math.PI / 2; cutStage.add(s.root); stewards.push(s); }
      const j = cutJens(); j.root.position.set(-3, 0, 0); j.root.rotation.y = -Math.PI / 2; cutStage.add(j.root);
      const rol = new THREE.Group(); ['#c8202b', '#f4f4f4', '#1f4f8f'].forEach((c, i) => rol.add(mesh(cylG(0.11, 0.11, 0.24, 8).rotateZ(Math.PI / 2), M(c), -0.24 + i * 0.24, 0, 0)));
      rol.position.set(0, 1.42, 0.2); j.body.add(rol);
      return { stewards, j };
    },
    shots: [
      { d: 4.4, cap: 'Amsterdam. De Johan Cruijff ArenA. De finale.', cam: (t) => cutCam(lerpN(-16, -10, t), lerpN(12, 6, t), lerpN(22, 14, t), 8, 6, -10) },
      { d: 3.6, who: 'Steward', line: 'Tassen open! Niks verbodens mee naar binnen.', cam: () => cutCam(3, 1.8, -2.2, 5.5, 1.7, -2) },
      { d: 3.4, who: 'Steward', line: 'En spandoeken zijn vandaag streng verboden.', cam: () => cutCam(3.4, 1.75, 0.6, 5.5, 1.7, 0) },
      { d: 3.8, who: 'Jens', line: 'Rustig blijven, Jens… gewoon eronder door glijden.', cam: () => cutCam(-1.6, 1.7, -0.8, -3, 1.6, 0) },
      { d: 3.2, who: 'Jens', line: 'DIE BEKER IS VAN ONS!', enter: () => { if (!playClip('dbivo', true)) speak('Die beker is van ons!'); }, cam: (t) => cutCam(-0.8 - t, 1.2, 1.4, -3, 1.7, 0), act: (t, A, dt) => pose(A.j, 'angry', dt, 0.6) },
      { d: 2.8, title: 'FINALE: DE ARENA', cam: (t) => cutCam(-10, 3 + t, 8, 6, 4, -8) },
    ],
    every: (t, A, dt) => { A.stewards.forEach((s) => pose(s, 'idle', dt)); },
  },
};
// ---------- afspelen ----------
function playCut(id, then) {
  const def = CUTS[id];
  if (!def) { then(); return; }
  audioInit();
  while (cutStage.children.length) cutStage.remove(cutStage.children[0]);
  const prevLook = phaseT;
  applyLook(def.look);
  const A = def.build();
  cutStage.visible = true;
  jens.root.visible = false;
  cut = { id, def, A, i: -1, t: 0, T: 0, then, prevLook, prevState: state };
  state = 'cutscene';
  showScreen(null);
  $('#hud').classList.add('hidden');
  $('#cutUi').classList.remove('hidden');
  nextShot();
}
function nextShot() {
  const c = cut;
  c.i++; c.t = 0;
  const sh = c.def.shots[c.i];
  if (!sh) { endCut(); return; }
  if (sh.enter) sh.enter(c.A);
  const line = $('#cutLine'), title = $('#cutTitle');
  title.classList.toggle('hidden', !sh.title);
  if (sh.title) { title.textContent = sh.title; title.classList.remove('in'); void title.offsetWidth; title.classList.add('in'); noise(0.5, 0.25); tone(110, 0.6, 'sawtooth', 0.12, 55); }
  line.classList.toggle('hidden', !(sh.line || sh.cap));
  c.text = sh.line || sh.cap || '';
  c.shown = 0;
  line.classList.toggle('cap', !!sh.cap);
  $('#cutWho').textContent = sh.who || '';
  $('#cutText').textContent = '';
  if (sh.line) tone(sh.who === 'Jens' ? 740 : 520, 0.05, 'square', 0.04);
}
function updateCut(dt) {
  const c = cut;
  if (!c) return;
  const sh = c.def.shots[c.i];
  if (!sh) return;
  c.t += dt; c.T += dt;
  const k = Math.min(1, c.t / sh.d);
  if (c.def.every) c.def.every(k, c.A, dt, c.T);
  if (sh.act) sh.act(k, c.A, dt);
  sh.cam(k, c.A);
  // tekst letter voor letter
  if (c.shown < c.text.length) { c.shown = Math.min(c.text.length, c.shown + dt * 38); $('#cutText').textContent = c.text.slice(0, Math.floor(c.shown)); }
  if (c.t >= sh.d) nextShot();
}
function cutTap() {
  const c = cut;
  if (!c) return;
  if (c.shown < c.text.length) { c.shown = c.text.length; $('#cutText').textContent = c.text; return; }
  nextShot();
}
function endCut() {
  const c = cut;
  if (!c) return;
  cut = null;
  save.cuts[c.id] = 1; persist();
  while (cutStage.children.length) cutStage.remove(cutStage.children[0]);
  cutStage.visible = false;
  jens.root.visible = true;
  $('#cutUi').classList.add('hidden');
  applyLook(c.prevLook);
  state = c.prevState === 'cutscene' ? 'menu' : c.prevState;
  c.then();
}
canvas.addEventListener('pointerdown', () => { if (state === 'aanloop' && aan?.t > 0.4) endAanloop(); }); // tik = overslaan
$('#cutUi').addEventListener('click', (e) => { if (e.target.id === 'cutSkip') endCut(); else cutTap(); });
window.addEventListener('keydown', (e) => {
  if (state !== 'cutscene') return;
  if (e.key === 'Escape') endCut();
  else if ([' ', 'Enter', 'e', 'E'].includes(e.key)) { e.preventDefault(); cutTap(); }
});
// welk filmpje hoort bij een level
function cutForLevel(i) {
  const l = LV()[i];
  if (campaign === 'nijmegen') return i === 0 ? 'start' : l?.id === 'hatert' ? 'hatert' : null;
  if (campaign === 'europa') return i === 0 ? 'europa' : l?.id === 'efinale' ? 'efinale' : null;
  if (campaign !== 'nederland') return null;
  return i === 0 ? 'nederland' : l?.id === 'arena' ? 'arena' : null;
}

// =====================================================================
//  AANLOOP: 3 seconden vóór elk potje zie je waarom Jens achterna gezeten
//  wordt. Gebeurt in de echte straat en loopt zo over in het rennen.
// =====================================================================
const AANLOOP_T = 3;
let aan = null;
const faceDir = (o, x, z) => { o.rotation.y = Math.atan2(-(x - o.position.x), -(z - o.position.z)); };
function aanProp(m, x, y, z) { m.position.set(x, y, z); addObj('deco', m, x, z, 0, 0, 0, { y }); return m; }
// per modus 3 varianten; c = achtervolger, at = tijd
const AANLOOP = {
  fiets: [
    { cap: 'Jens draait het ventiel uit z\'n band', cam: [2.6, 1.3, -2.4],
      start(A) { A.c.root.position.set(1.4, 0, 0.6); },
      upd(A, t, dt) { if (t < 1.5) { faceDir(jens.root, 1.4, 0.6); pose(jens, 'reach', dt); } if (t > 0.4 && !A.s1) { A.s1 = 1; noise(1.1, 0.12); } if (t > 1.5 && !A.s2) { A.s2 = 1; chaserSay('HÉ! MIJN BAND!', 'angry', 1.4); } } },
    { cap: 'Jens jat z\'n fietsbel', cam: [-2.4, 1.4, -2.6],
      start(A) { A.c.root.position.set(1.1, 0, 0.9); },
      upd(A, t, dt) { if (t < 1.4) { faceDir(jens.root, 1.1, 0.9); pose(jens, 'reach', dt); } if (t > 0.6 && !A.s1) { A.s1 = 1; sfx.bel(); bubble(jens.head, 'Tring tring!', '', 1.2); } if (t > 1.5 && !A.s2) { A.s2 = 1; chaserSay('Geef terug, JENS!', 'angry', 1.4); } } },
    { cap: 'Jens gooit een waterballon', cam: [2.8, 1.5, -1.8],
      start(A) { A.c.root.position.set(0.6, 0, 3.2); const b = new THREE.Mesh(sphG(0.13, 8, 6), M('#4dd2ff')); A.ball = aanProp(b, 0.2, 1.4, -0.1); },
      upd(A, t, dt) {
        faceDir(jens.root, 0.6, 3.2); pose(jens, t < 0.7 ? 'reach' : 'idle', dt);
        const k = clamp((t - 0.5) / 0.6, 0, 1);
        if (A.ball && k > 0 && k < 1) A.ball.position.set(lerpN(0.2, 0.6, k), 1.4 + Math.sin(k * Math.PI) * 0.8, lerpN(-0.1, 3.2, k));
        if (k >= 1 && !A.s1) { A.s1 = 1; A.ball.visible = false; noise(0.3, 0.3); burst(new THREE.Vector3(0.6, 1.6, 3.2), 14, 3, M('#4dd2ff'), 0.5); chaserSay('JENS!! Ik ben kletsnat!', 'angry', 1.4); }
      } },
  ],
  telefoon: [
    { cap: 'Jens zit gewoon op z\'n telefoon', cam: [2.3, 1.5, -2.4],
      start(A) { A.c.root.position.set(-1.6, 0, 2.6); },
      upd(A, t, dt) { pose(jens, 'phoneIdle', dt); if (t < 1.6) { A.c.root.position.z = lerpN(2.6, 1.2, t / 1.6); pose(A.c, 'run', dt, 0.4); } faceDir(A.c.root, 0, 0); if (t > 0.5 && !A.s1) { A.s1 = 1; chaserSay(SHANE_VOICE[5], '', 2); } } },
    { cap: 'Jens maakt een selfie met Shane erachter', cam: [-2.2, 1.5, -2.2],
      start(A) { A.c.root.position.set(0.9, 0, 2); },
      upd(A, t, dt) { pose(jens, 'phoneIdle', dt); faceDir(A.c.root, 0, 0); if (t > 0.6 && !A.s1) { A.s1 = 1; burst(new THREE.Vector3(0.25, 1.45, -0.3), 10, 1.5, M('#ffffff'), 0.25); tone(1800, 0.05, 'square', 0.05); } if (t > 1 && !A.s2) { A.s2 = 1; chaserSay(SHANE_VOICE[2], '', 2); } } },
    { cap: 'Jens z\'n telefoon gaat keihard af', cam: [2.4, 1.4, -2.2],
      start(A) { A.c.root.position.set(1.5, 0, 1.4); },
      upd(A, t, dt) { pose(jens, 'phoneIdle', dt); faceDir(A.c.root, 0, 0); if (!A.s1) { A.s1 = 1; sfx.ring(); setTimeout(() => sfx.ring(), 450); } if (t > 1 && !A.s2) { A.s2 = 1; chaserSay(SHANE_VOICE[3], '', 2); } } },
  ],
  terror: [
    { cap: 'Jens toetert in z\'n oor', cam: [2.4, 1.5, -2],
      start(A) { A.c.root.position.set(0.9, 0, 0.5); A.c.root.rotation.y = Math.PI / 2; },
      upd(A, t, dt) { faceDir(jens.root, 0.9, 0.5); pose(jens, 'reach', dt); if (t > 0.4 && !A.s1) { A.s1 = 1; sfx.toet(); setTimeout(() => sfx.toet(), 300); } if (t > 0.9) { faceDir(A.c.root, 0, 0); A.c.body.position.y = t < 1.2 ? 0.25 : 0; } if (t > 1.3 && !A.s2) { A.s2 = 1; chaserSay('STOP MET TOETEREN!', 'angry', 1.4); } } },
    { cap: 'Jens toetert hem wakker op een bankje', cam: [-2.5, 1.4, -2],
      start(A) { const bank = new THREE.Group(); bank.add(mesh(box(1.6, 0.08, 0.5), M('#6b4a2e'), 0, 0.45, 0)); for (const sx of [-0.7, 0.7]) bank.add(mesh(box(0.08, 0.45, 0.45), M('#3a3a3a'), sx, 0.22, 0)); aanProp(bank, 1.6, 0, 0.6); A.c.root.position.set(1.6, 0, 0.6); A.c.root.rotation.y = Math.PI / 2; },
      upd(A, t, dt) { faceDir(jens.root, 1.6, 0.6); pose(jens, 'reach', dt); if (t < 1) { pose(A.c, 'sit', dt); A.c.root.position.y = 0.05; } else { A.c.root.position.y = 0; faceDir(A.c.root, 0, 0); pose(A.c, 'angry', dt); } if (t > 0.5 && !A.s1) { A.s1 = 1; sfx.toet(); } if (t > 1.1 && !A.s2) { A.s2 = 1; chaserSay('IK SLIEP, JIJ…', 'angry', 1.4); } } },
    { cap: 'Hij laat van schrik z\'n koffie vallen', cam: [2.3, 1.5, -2.3],
      start(A) { A.c.root.position.set(1.0, 0, 1.0); const cup = mesh(cylG(0.05, 0.04, 0.12, 8), M('#f4f4f4')); A.cup = aanProp(cup, 0.85, 1.05, 0.8); },
      upd(A, t, dt) { faceDir(jens.root, 1.0, 1.0); pose(jens, 'reach', dt); if (t > 0.5 && !A.s1) { A.s1 = 1; sfx.toet(); } if (t > 0.6 && A.cup.position.y > 0.06) { A.cup.position.y = Math.max(0.06, A.cup.position.y - dt * 4); A.cup.rotation.z += dt * 8; } if (t > 1.1 && !A.s2) { A.s2 = 1; noise(0.15, 0.2); faceDir(A.c.root, 0, 0); chaserSay('M\'N KOFFIE!', 'angry', 1.4); } } },
  ],
  school: [
    { cap: 'Jens steekt een babypijltje af', cam: [2.4, 1.6, -2.6],
      start(A) { A.c.root.position.set(-1.4, 0, 2.8); A.r = mesh(coneG(0.04, 0.2, 6), M('#ffd23f')); aanProp(A.r, 0.5, 0.2, -0.5); },
      upd(A, t, dt) {
        faceDir(jens.root, 0.5, -0.5); pose(jens, t < 0.5 ? 'reach' : 'idle', dt);
        if (t > 0.5) { A.r.position.y += dt * 9; if (!A.s1) { A.s1 = 1; sfx.fluit?.(); } }
        if (t > 1.0 && !A.s2) { A.s2 = 1; A.r.visible = false; noise(0.4, 0.35); burst(new THREE.Vector3(0.5, A.r.position.y, -0.5), 24, 5, pick(fireMats), 0.8); }
        faceDir(A.c.root, 0, 0); if (t > 1.3 && !A.s3) { A.s3 = 1; chaserSay('JENS! NAAR DE CONRECTOR!', 'angry', 1.5); }
      } },
    { cap: 'Jens gooit een prop papier', cam: [-2.4, 1.5, -2.2],
      start(A) { A.c.root.position.set(0.9, 0, 3); A.c.root.rotation.y = Math.PI; A.p = aanProp(mesh(new THREE.IcosahedronGeometry(0.07, 0), M('#f4f4ee')), 0.2, 1.4, 0); },
      upd(A, t, dt) {
        faceDir(jens.root, 0.9, 3); pose(jens, t < 0.6 ? 'reach' : 'idle', dt);
        const k = clamp((t - 0.4) / 0.5, 0, 1);
        if (k > 0 && k < 1) A.p.position.set(lerpN(0.2, 0.9, k), 1.4 + Math.sin(k * Math.PI) * 0.4, lerpN(0, 3, k));
        if (k >= 1 && !A.s1) { A.s1 = 1; A.p.visible = false; tone(300, 0.05, 'square', 0.05); faceDir(A.c.root, 0, 0); chaserSay('Wie gooide dat?! JENS!', 'angry', 1.5); }
      } },
    { cap: 'Jens loopt midden in de les weg', cam: [2.2, 1.6, -2.6],
      start(A) { A.c.root.position.set(-1.2, 0, 2.2); sfx.schoolbel(); },
      upd(A, t, dt) { faceDir(jens.root, 0, -4); pose(jens, 'run', dt, 0.35); jens.root.position.z = -t * 0.4; faceDir(A.c.root, 0, jens.root.position.z); pose(A.c, 'point', dt, 0.3); if (t > 0.8 && !A.s1) { A.s1 = 1; chaserSay('Waar ga jij heen?! Ga zitten!', 'angry', 1.5); } } },
  ],
};
function startAanloop() {
  const list = AANLOOP[mode];
  if (!list) return false;
  if (!save.aanBag || !save.aanBag[mode]?.length || save.aanBag[mode].some((i) => i >= list.length)) save.aanBag = { ...(save.aanBag || {}), [mode]: list.map((_, i) => i).sort(() => Math.random() - 0.5) };
  const v = list[save.aanBag[mode].pop()];
  persist();
  const c = chaser();
  aan = { v, t: 0, A: { c }, ry: c.root.rotation.y };
  for (const [k, p] of Object.entries(chasers)) p.root.visible = k === mode;
  jens.root.position.set(0, 0, 0); jens.root.rotation.set(0, 0, 0);
  c.root.position.set(1.4, 0, 1.2);
  v.start(aan.A);
  state = 'aanloop';
  $('#hud').classList.add('hidden');
  $('#aanCap').textContent = v.cap; $('#aanCap').classList.remove('hidden');
  return true;
}
function updateAanloop(dt) {
  const a = aan;
  a.t += dt;
  const t = a.t, v = a.v, c = a.A.c;
  if (t < AANLOOP_T - 0.45) v.upd(a.A, t, dt);
  else { jens.root.rotation.y = damp(jens.root.rotation.y, 0, 12, dt); pose(jens, 'run', dt, 0.6); pose(c, c.style === 'bike' ? 'bike' : 'run', dt, 0.5); }
  if (c.vehicle) pose(c, 'bike', dt, 0.05);
  // camera: schuin voor ze, schuift langzaam bij
  const [cx, cy, cz] = v.cam, k = t / AANLOOP_T;
  const midX = (jens.root.position.x + c.root.position.x) / 2, midZ = (jens.root.position.z + c.root.position.z) / 2;
  camera.position.set(cx * (1 - k * 0.15), cy, cz + k * 0.5);
  camera.lookAt(midX, 1.05, midZ);
  if (t >= AANLOOP_T) endAanloop();
}
function endAanloop() {
  const a = aan;
  if (!a) return;
  aan = null;
  const c = a.A.c;
  c.root.rotation.y = a.ry; c.root.position.y = 0; c.body.position.y = 0;
  if (mode === 'terror') jens.setShirt(save.eq.shirt);
  jens.root.rotation.set(0, 0, 0); jens.root.position.set(player.x, 0, 0);
  chaseX = c.root.position.x; chaseDist = Math.max(0.8, c.root.position.z);
  camPos.copy(camera.position);
  camLook.set((jens.root.position.x + c.root.position.x) / 2, 1.05, 0.6);
  $('#aanCap').classList.add('hidden');
  state = 'run'; introT = 0;
  $('#hud').classList.remove('hidden');
  toast(`📍 ${STREETS[streetIdx]}<small>${cap(MODES[mode].chaser)} komt eraan… REN!</small>`, 2);
}

// ---------- filmpjes voor Terroriseer Europa ----------
function loudClip(name, gain = 2.8) {
  if (!ac || !save.sound || !clips[name]) return false;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = clips[name]; g.gain.value = gain;
  s.connect(g).connect(master); s.start();
  return true;
}
function cutFireworks(A, dt) {
  A.fwT = (A.fwT || 0) - dt;
  if (A.fwT <= 0) { A.fwT = rand(0.25, 0.6); burst(new THREE.Vector3(CUT_X + rand(-14, 14), rand(10, 18), rand(-30, -10)), 26, 6, pick(fireMats.slice(0, 4)), 1.1); if (Math.random() < 0.5) noise(0.3, 0.12); }
}
function smears(j) {
  const red = new THREE.MeshBasicMaterial({ color: '#8a0f0f', transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const list = [];
  for (const [x, y, z, s] of [[0.11, -0.07, -0.222, 0.08], [-0.12, -0.1, -0.215, 0.07], [-0.04, 0.2, -0.19, 0.08]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.45), red); m.position.set(x, y, z); m.rotation.z = rand(-0.6, 0.6); j.head.add(m); list.push(m); }
  for (const [x, y, z] of [[0.12, 1.3, -0.17], [-0.08, 1.18, -0.17]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), red); m.position.set(x, y, z); m.rotation.set(0, Math.PI, rand(-0.5, 0.5)); j.body.add(m); list.push(m); }
  return list;
}
Object.assign(CUTS, {
  europa: {
    look: 2,
    build() {
      cutGround(true);
      const a = LANDMARKS.arena(); a.g.position.set(10, 0, -10); cutStage.add(a.g);
      const bord = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), new THREE.MeshBasicMaterial({ map: canvasTex(256, 74, (x) => {
        x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, 256, 74); x.fillStyle = '#ffb000'; x.font = 'bold 17px Courier New, monospace'; x.textAlign = 'center';
        x.fillText('NEDERLAND 2 - 1 DUITSLAND', 128, 32); x.fillStyle = '#ff7b00'; x.font = 'bold 16px Courier New, monospace'; x.fillText('EINDSTAND', 128, 58);
      }) }));
      bord.position.set(8.6, 7.5, -10); bord.rotation.y = -Math.PI / 2; cutStage.add(bord);
      const j = cutJens(); j.root.position.set(2, 0, 0); j.root.rotation.y = -Math.PI / 2; cutStage.add(j.root);
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: psxTex(new THREE.TextureLoader().load('img/spandoek.png')), side: THREE.DoubleSide, transparent: true }));
      sp.position.set(1.6, 1.85, 0); sp.rotation.y = -Math.PI / 2; cutStage.add(sp);
      return { j, sp };
    },
    shots: [
      { d: 4, cap: 'De Johan Cruijff ArenA, die avond…', cam: (t) => cutCam(lerpN(-14, -9, t), lerpN(9, 6, t), lerpN(14, 8, t), 8, 10, -10) },
      { d: 3.2, cap: 'Oranje wint van Duitsland. Met dank aan één spandoek.', cam: (t) => cutCam(lerpN(-3, -1.5, t), 6.8, -10, 8.6, 7.5, -10) },
      { d: 3.6, who: 'Jens', line: 'Het spandoek heeft het gedaan. Oranje won door óns!', cam: () => cutCam(-1.2, 1.8, 1.2, 2, 1.7, 0), act: (t, A, dt) => pose(A.j, 'grabbed', dt, 0.6) },
      { d: 3.6, who: 'Jens', line: 'Als het voor Oranje werkt… dan werkt het ook voor NEC.', cam: () => cutCam(-0.6, 1.75, -0.8, 2, 1.65, 0), act: (t, A, dt) => { A.sp.visible = false; faceTo(A.j.root, -0.6, -0.8); pose(A.j, 'idle', dt); } },
      { d: 3.6, who: 'Jens', line: 'NEC speelt Europees. Ik ga ze overal achterna.', cam: (t) => cutCam(-1.6, 1.6, 2.2 - t, 2, 1.5, 0), act: (t, A, dt) => pose(A.j, 'idle', dt) },
      { d: 3.8, cap: 'Athene · Bodø · Turijn · Zagreb · Jerevan · Celje · en de finale in de Goffert', cam: (t) => cutCam(-6, 4 + t * 2, 6, 6, 8, -12) },
      { d: 2.8, title: 'TERRORISEER EUROPA', cam: (t) => cutCam(-8, 4 + t, 10, 6, 8, -12) },
    ],
    every: (t, A, dt) => cutFireworks(A, dt),
  },
  efinale: {
    look: 2,
    build() {
      cutGround(true); cutRow(-1, -60, 20);
      const gf = LANDMARKS.goffert(); gf.g.position.set(9, 0, -14); cutStage.add(gf.g);
      for (const z of [-20, 0]) cutLamp(4.3, z);
      const j = cutJens(); j.root.position.set(0, 0, 6); cutStage.add(j.root);
      const sm = smears(j);
      return { j, sm };
    },
    shots: [
      { d: 3.6, cap: 'Zes landen later. Terug in Nijmegen.', cam: (t) => cutCam(3, 2.2, 12, 0, 1.2, 0), act: (t, A, dt) => { A.j.root.position.z = lerpN(6, 1.5, t); A.j.root.rotation.y = 0; pose(A.j, 'run', dt, 0.4); } },
      { d: 3.6, who: 'Jens', line: 'Athene, Bodø, Turijn, Zagreb, Jerevan, Celje… ik zit onder de schrammen.', cam: () => cutCam(0.3, 1.72, 0.3, 0, 1.68, 1.5), act: (t, A, dt) => { faceTo(A.j.root, 0.3, 0.3); pose(A.j, 'idle', dt); } },
      { d: 3.8, who: 'Jens', line: 'Even alles eraf vegen…', cam: () => cutCam(0.35, 1.7, 0.6, 0, 1.6, 1.5),
        act: (t, A, dt) => { pose(A.j, 'reach', dt, 0.5); A.j.armR.rotation.x = 2.4 + Math.sin(t * 30) * 0.3; A.j.elR.rotation.x = 1.6; A.sm.forEach((m, i) => { const k = clamp((t - i * 0.12) * 2, 0, 1); m.material.opacity = 0.85 * (1 - k); }); } },
      { d: 3.6, cap: 'De Europa League-finale. NEC in de Goffert, het stadion zit vol.', cam: (t) => cutCam(lerpN(-8, -5, t), lerpN(10, 6, t), 10, 9, 8, -14), act: (t, A, dt) => pose(A.j, 'idle', dt) },
      { d: 3.8, who: 'Jens', line: 'Levski, Omonia, Rennes en Benfica willen de finale verpesten.', cam: () => cutCam(-1.4, 1.8, 0.4, 0, 1.6, 1.5), act: (t, A, dt) => { faceTo(A.j.root, -1.4, 0.4); pose(A.j, 'idle', dt); } },
      { d: 3, who: 'Jens', line: 'Niet in mijn Goffert.', cam: (t) => cutCam(-0.5, 1.65, 0.7 + t * 0.2, 0, 1.68, 1.5), act: (t, A, dt) => pose(A.j, 'angry', dt, 0.3) },
      { d: 2.8, title: 'FINALE: BESCHERM DE GOFFERT', cam: (t) => cutCam(-7, 4 + t, 10, 9, 6, -14) },
    ],
  },
  eubeker: {
    look: 2,
    build() {
      cutGround(true);
      const gf = LANDMARKS.goffert(); gf.g.position.set(9, 0, -14); cutStage.add(gf.g);
      const j = cutJens(); j.root.position.set(0, 0, 0); j.root.rotation.y = 0.2; cutStage.add(j.root);
      const cup = makeCup(1.4, new THREE.MeshLambertMaterial({ color: '#e8e8ec', emissive: '#4a4a55' }), 'high'); cup.position.set(0, 2.55, -0.05); j.root.add(cup);
      return { j, cup };
    },
    shots: [
      { d: 3.2, cap: 'Laatste fluitsignaal in de Goffert…', cam: (t) => cutCam(-9, 6, 12, 6, 8, -14), act: (t, A, dt) => pose(A.j, 'idle', dt) },
      { d: 3, title: 'NEC WINT DE EUROPA LEAGUE', cam: (t) => cutCam(-7 + t, 5, 10, 6, 8, -14) },
      { d: 4.2, who: 'Jens', line: 'DIE BEKER IS VAN ONS!!!', enter: () => { if (!loudClip('dbivo', 3)) speak('Die beker is van ons!'); setTimeout(() => loudClip('dbivo', 2.2), 1600); },
        cam: (t) => cutCam(lerpN(0.6, 1.2, t), 1.75, lerpN(-2.4, -3.2, t), 0, 1.95, 0), act: (t, A, dt) => { pose(A.j, 'grabbed', dt, 0.6); A.cup.position.y = 2.55 + Math.sin(t * 18) * 0.06; } },
      { d: 3.6, cap: 'Heel Nijmegen viert feest. En Jens? Die heeft nu álles gewonnen.', cam: (t) => cutCam(lerpN(4, -4, t), 3, -7, 0, 1.6, 0), act: (t, A, dt) => pose(A.j, 'grabbed', dt, 0.6) },
    ],
    every: (t, A, dt) => cutFireworks(A, dt),
  },
});

AANLOOP.terror = [plusVariant()];

// het spandoek op Jens' rug in de finale
const spandoekRol = new THREE.Group();
{
  const kl = ['#c8202b', '#f4f4f4', '#1f4f8f'];
  kl.forEach((c, i) => spandoekRol.add(mesh(cylG(0.11, 0.11, 0.24, 8).rotateZ(Math.PI / 2), M(c), -0.24 + i * 0.24, 0, 0)));
  spandoekRol.position.set(0, 1.42, 0.26);
  spandoekRol.visible = false;
  jens.body.add(spandoekRol);
}

// grote knal bij een gebouw (GelreDome)
function bigBoom(where) {
  let lm = null;
  for (const o of objs) if (o.kind === 'landmark' && o.roof && (!lm || Math.abs(o.z - where.z) < Math.abs(lm.z - where.z))) lm = o;
  const at = lm ? new THREE.Vector3(lm.x + lm.side * 22, 14, lm.z) : new THREE.Vector3(where.x, 4, where.z - 20);
  shakeT = 1.2;
  flash(false);
  if (!miniSnd('groot', 1)) { sfx.boem(); setTimeout(() => sfx.boem(), 250); }
  burst(at, 140, 16, fireMats, 2.4);
  for (const t of ['mortier', 'lawine', 'cake']) startShowAt(t, { x: rand(-3, 3), z: where.z - 10 });
  if (lm) lm.upd = (o, dt) => { o.roof.position.y += dt * 18; o.roof.rotation.z += dt * 0.6; };
}

// controlepoort als opdracht
function spawnControle(task, z) {
  addObj('controle', makePoort(), 0, z, ROAD_W, 0.4, 1.5, { task,
    upd(o) { if (!o.task.done && !o.hit && o.z > 0.6 && state === 'run') completeTask(o.task, null); } });
}

// =====================================================================
//  OPDRACHTEN + MULTIPLIER + DAGBONUS (om te blijven spelen)
// =====================================================================
const MISSION_POOL = [
  { id: 'bekers', stat: 'bekers', goals: [80, 150, 250, 400], text: (n) => `Pak ${n} bekers` },
  { id: 'bekersRun', stat: 'bekers', run: true, goals: [40, 70, 110, 160], text: (n) => `Pak ${n} bekers in één potje` },
  { id: 'score', stat: 'score', run: true, max: true, goals: [2000, 4000, 7000, 12000], text: (n) => `Haal ${n.toLocaleString('nl-NL')} punten in één potje` },
  { id: 'dist', stat: 'dist', run: true, max: true, goals: [700, 1200, 1800, 2600], text: (n) => `Ren ${n} m in één potje` },
  { id: 'sticker', stat: 'sticker', goals: [3, 6, 10, 15], text: (n) => `Plak ${n} NEC-stickers` },
  { id: 'stickerRun', stat: 'sticker', run: true, goals: [2, 3, 5, 7], text: (n) => `Plak ${n} stickers in één potje` },
  { id: 'jump', stat: 'jump', goals: [40, 80, 140, 220], text: (n) => `Spring ${n} keer` },
  { id: 'slide', stat: 'slide', goals: [20, 40, 70, 110], text: (n) => `Glij ${n} keer` },
  { id: 'sloop', stat: 'sloop', goals: [3, 6, 10, 16], text: (n) => `Sloop ${n} dingen met nitraat` },
  { id: 'fiets', stat: 'fiets', goals: [2, 4, 7, 10], text: (n) => `Pak ${n} keer de fiets` },
  { id: 'power', stat: 'power', goals: [4, 8, 12, 18], text: (n) => `Pak ${n} power-ups` },
  { id: 'school', stat: 'school', goals: [1, 2, 3, 5], text: (n) => `Fiets ${n} keer door het Montessori` },
  { id: 'games', stat: 'games', goals: [3, 5, 8, 12], text: (n) => `Speel ${n} potjes` },
  { id: 'level', stat: 'level', goals: [1, 2, 3, 4], text: (n) => `Haal ${n} level${n > 1 ? 's' : ''} in de verhaalmodus` },
];
const MULT_MAX = 20;
if (!save.mult) save.mult = 1;
if (!Array.isArray(save.missions)) save.missions = [];
const tier = () => Math.min(3, Math.floor((save.mult - 1) / 3));
function newMission() {
  const taken = new Set(save.missions.map((m) => m.id));
  const def = pick(MISSION_POOL.filter((d) => !taken.has(d.id)));
  return { id: def.id, goal: def.goals[tier()], prog: 0 };
}
while (save.missions.length < 3) save.missions.push(newMission());
const missionDef = (m) => MISSION_POOL.find((d) => d.id === m.id);
let runProg = {};
function missionStartRun() { runProg = {}; for (const m of save.missions) if (missionDef(m)?.run) m.prog = 0; }
function missionEvent(stat, amount = 1, value = null) {
  if (stat === 'score' || stat === 'dist') recordStat(stat, 0, value); else recordStat(stat, amount);
  let changed = false;
  for (const m of save.missions) {
    const d = missionDef(m);
    if (!d || d.stat !== stat || m.prog >= m.goal) continue;
    const before = m.prog;
    m.prog = d.max ? Math.max(m.prog, Math.floor(value ?? 0)) : m.prog + amount;
    if (m.prog !== before) changed = true;
    if (m.prog >= m.goal) completeMission(m);
  }
  if (changed && !(stat === 'score' || stat === 'dist')) persist();
}
function completeMission(m) {
  const d = missionDef(m);
  const reward = 60 * (tier() + 1);
  save.bekers += reward;
  if (save.mult < MULT_MAX) save.mult++;
  note('', `🎯 <b>${d.text(m.goal)}</b> · +${reward} 🏆 · score ×${save.mult}`);
  sfx.power();
  const i = save.missions.indexOf(m);
  save.missions.splice(i, 1);
  save.missions.splice(i, 0, newMission());
  persist();
  renderMissions();
}
function renderMissions(sel = '#missionBox') {
  const el = $(sel);
  if (!el) return;
  el.innerHTML = `<div class="mhead"><b>🎯 Opdrachten</b><span class="mult">score ×${save.mult}</span></div>` +
    save.missions.map((m) => {
      const d = missionDef(m), p = Math.min(1, m.prog / m.goal);
      return `<div class="mission"><span>${d.text(m.goal)}</span><small>${Math.min(m.prog, m.goal).toLocaleString('nl-NL')}/${m.goal.toLocaleString('nl-NL')}</small><i style="width:${(p * 100).toFixed(0)}%"></i></div>`;
    }).join('') + `<div class="mfoot">Elke opdracht: bekers + score-multiplier omhoog (max ×${MULT_MAX})</div>`;
}

// dagbonus: elke dag terugkomen loont, met een reeks
function checkDaily() {
  const today = new Date().toISOString().slice(0, 10);
  const d = save.daily || {};
  if (d.last === today) return;
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const streak = d.last === yesterday ? (d.streak || 0) + 1 : 1;
  const reward = 50 * Math.min(streak, 7) + (streak % 7 === 0 ? 300 : 0);
  save.daily = { last: today, streak };
  save.bekers += reward;
  persist();
  setTimeout(() => toast(`📅 DAG ${streak} BONUS<small>+${reward} bekers · kom morgen terug voor meer</small>`, 3), 400);
  $('#menuBekers').textContent = save.bekers.toLocaleString('nl-NL'); if ($('#mBekers')) $('#mBekers').textContent = $('#menuBekers').textContent;
}

// =====================================================================
//  TRILLEN (Android-app en Android-browsers; iPhone ondersteunt het niet)
// =====================================================================
if (save.vibe === undefined) save.vibe = true;
function buzz(pattern) {
  if (!save.vibe || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) { /* niet ondersteund */ }
}
// vaste trilpatronen per soort beloning (Android; iPhones trillen niet vanuit een webpagina)
const TRIL = {
  rakelings: 12, ontweken: 6, level: [40, 30, 40, 30, 110], koorts: [60, 40, 60, 40, 60, 40, 160], kist: [15, 25, 15, 25, 15, 25, 70],
  jackpot: [80, 40, 80, 40, 80, 40, 250], streak: [20, 20, 45], sneller: [10, 30, 10, 30, 10], record: [100, 50, 100, 50, 300], slomo: [70],
};

// =====================================================================
//  COMBO: rakelings ontwijken en springen/glijden bouwt een combo op
// =====================================================================
let feverBeat = 0, feverStep = 0, slomoT = 0, slomoCD = 0;
// SLOW-MOTION: superrakelings op snelheid = de tijd staat heel even (bijna) stil
function slomo(o) {
  slomoT = 0.38; slomoCD = 6;
  fxFlash('#5ad1ff', 0.3); buzz(TRIL.slomo);
  tone(180, 0.5, 'sine', 0.18, 70); whoosh(0.18);
  const pts = 100 * scoreMult(); score += pts;
  runPop(`😮 SUPERRAKELINGS +${pts}`, 'big');
}
let combo = 0, comboT = 0, comboShown = -1, feverT = 0, nearRecord = false, hudK = 0, renHype = true;
const comboMult = () => 1 + Math.min(8, Math.floor(combo / 4)) * 0.25; // tot ×3
const COMBO_HYPE = { 10: 'COMBO 10!', 20: 'ON FIRE! 🔥', 30: 'NIET TE STOPPEN!', 50: 'LEGENDARISCH!', 75: 'JENS IS EEN GOD', 100: '100 COMBO?!' };
// losse tekstjes tijdens het rennen: boven de horizon, nooit op de weg; op de telefoon alleen de grote
const isPhone = () => innerWidth <= 700;
function runPop(text, cls) {
  if (isPhone() && !cls.includes('big') && !cls.includes('rij')) return;
  popAt(text, innerWidth / 2 + rand(-40, 40), innerHeight * (cls.includes('rij') ? 0.34 : 0.2), cls); // de rij-bonus onder de grote meldingen
}
function comboHit(label) {
  const before = comboMult();
  combo++;
  comboT = 3.5;
  if (label) { whoosh(label === 'rakelings' ? 0.13 : 0.08); buzz(TRIL[label] || 10); }
  if (label && (label !== 'ontweken' || combo % 5 === 0)) runPop(label === 'over' ? (player.slideT > 0 ? 'ERONDERDOOR!' : 'EROVERHEEN!') : label === 'ontweken' ? 'ONTWEKEN!' : 'RAKELINGS!', 'blue');
  if (COMBO_HYPE[combo]) hype(COMBO_HYPE[combo], combo >= 30 ? 'mega' : '');
  // elke 15 combo: KOORTS, 8 seconden dubbele punten
  if (combo % 15 === 0) { feverT = 8; hype('🔥 KOORTS!<small>8 seconden dubbele punten</small>', 'mega'); fxFlash('#ff8a00', 0.35); buzz(TRIL.koorts); }
  recordStat('combo', 0, combo);
  if (combo === 10) verslaggever('combo');
  score += 15 * comboMult() * scoreMult();
  if (comboMult() > before) { if (!isPhone()) note(`🔥 Combo ×${comboMult().toFixed(2).replace(/\.?0+$/, '')}!`); buzz(25); tone(880 + combo * 20, 0.08, 'square', 0.05); }
  else if (label) tone(660 + combo * 15, 0.05, 'square', 0.035);
}
function comboBreak() {
  if (combo >= 6 && state === 'run') { note(`💔 Combo ${combo} kwijt`); tone(392, 0.18, 'square', 0.07, 196); tone(262, 0.3, 'square', 0.06, 130, 0.16); }
  combo = 0; comboT = 0;
}
function updateCombo(dt) {
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
  if (feverT > 0 && state === 'run') {
    feverT -= dt;
    feverBeat -= dt;
    if (feverBeat <= 0) { feverBeat = 0.125; const f = [523, 659, 784, 1047, 784, 659][feverStep++ % 6]; tone(f, 0.07, 'square', 0.022); if (feverStep % 4 === 1) tone(65, 0.1, 'sine', 0.12, 40); }
  }
  if (state !== 'run' && state !== 'paused') feverT = 0;
  const hud = $('#hud');
  hud.classList.toggle('fever', feverT > 0);
  hud.classList.toggle('fast', state === 'run' && (feverT > 0 || brommerT > 0 || fietsT > 0 || speed > 24));
  const el = $('#combo');
  const key = state === 'run' && (combo >= 2 || feverT > 0) ? combo * 100 + Math.ceil(feverT) : -1;
  if (key === comboShown) return;
  comboShown = key;
  el.classList.toggle('hidden', key < 0);
  if (key >= 0) el.innerHTML = `🔥 ${combo} <b>×${comboMult().toFixed(2).replace(/\.?0+$/, '')}</b>${feverT > 0 ? ` <i class="koorts">KOORTS ×2 · ${Math.ceil(feverT)}s</i>` : ''}`;
}
// een obstakel passeert Jens (z gaat door 0): rakelings, eroverheen of eronderdoor?
const NO_COMBO = new Set(['beker', 'power', 'deco', 'sign', 'landmark', 'checkpoint', 'finish', 'ingang', 'lkdeur', 'schat', 'kaart', 'fork']);
function comboPass(o) {
  if (state !== 'run' || o.hit || o.dead || NO_COMBO.has(o.kind) || !o.w) return;
  const edge = Math.abs(player.x - o.x) - o.w / 2;
  if (runTime < 40 && edge >= 1.3 && edge < 2.6) { comboHit('ontweken'); return; } // in het begin telt alles
  if (edge < 0.25) { if (player.y > 0.3 || player.slideT > 0) comboHit('over'); } // overheen of eronder door
  else if (edge < 1.3) { comboHit('rakelings'); if (edge < 0.6 && speed > 17 && slomoCD <= 0) slomo(o); }
}

// =====================================================================
//  WEER: helder, regen (glad!) of mist
// =====================================================================
let weather = 'helder';
const WEER = { helder: { icon: '☀️', name: 'Helder' }, regen: { icon: '🌧️', name: 'Regen' }, mist: { icon: '🌫️', name: 'Mist' }, sneeuw: { icon: '❄️', name: 'Sneeuw' } };
const PRECIP = 900, precipBox = { x: 14, y: 16, z0: -60, z1: 12 };
const precipPos = new Float32Array(PRECIP * 6);
const precipCol = new Float32Array(PRECIP * 3);
const precipGeo = new THREE.BufferGeometry();
precipGeo.setAttribute('position', new THREE.BufferAttribute(precipPos, 3));
const rainLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#d4e0ec', transparent: true, opacity: 0.32, fog: false }));
rainLines.geometry.setAttribute('position', new THREE.BufferAttribute(precipPos, 3));
rainLines.frustumCulled = false; rainLines.visible = false; scene.add(rainLines);
const flakeGeo = new THREE.BufferGeometry();
const flakePos = new Float32Array(PRECIP * 3);
flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
flakeGeo.setAttribute('color', new THREE.BufferAttribute(precipCol, 3));
const flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, fog: false }));
flakes.frustumCulled = false; flakes.visible = false; scene.add(flakes);
let precipKind = null;
function seedPrecip(kind) {
  precipKind = kind;
  rainLines.visible = kind === 'regen';
  rainLines.geometry.setDrawRange(0, Math.floor(PRECIP * 0.55) * 2); // lichte regen: ruim de helft van de druppels
  flakes.visible = kind === 'sneeuw' || kind === 'confetti';
  const conf = ['#ff3b3b', '#ffd23f', '#3bd16a', '#4dd2ff', '#ff7ae0', '#ff9a1f'].map((c) => new THREE.Color(c));
  for (let i = 0; i < PRECIP; i++) {
    const x = rand(-precipBox.x, precipBox.x), y = rand(0, precipBox.y), z = rand(precipBox.z0, precipBox.z1);
    precipPos.set([x, y, z, x + 0.04, y + 0.7, z + 0.1], i * 6);
    flakePos.set([x, y, z], i * 3);
    const c = kind === 'confetti' ? pick(conf) : new THREE.Color('#ffffff');
    precipCol.set([c.r, c.g, c.b], i * 3);
  }
  flakes.material.size = kind === 'confetti' ? 4 : 2;
  flakeGeo.setDrawRange(0, kind === 'sneeuw' ? Math.floor(PRECIP * 0.3) : PRECIP);
  rainLines.geometry.attributes.position.needsUpdate = true;
  flakeGeo.attributes.position.needsUpdate = true;
  flakeGeo.attributes.color.needsUpdate = true;
}
function updatePrecip(dt, m) {
  if (!precipKind || indoor) { rainLines.visible = false; flakes.visible = false; return; }
  rainLines.visible = precipKind === 'regen';
  flakes.visible = !rainLines.visible;
  const t = now();
  if (precipKind === 'regen') {
    for (let i = 0; i < PRECIP; i++) {
      const b = i * 6;
      let y = precipPos[b + 1] - 26 * dt, z = precipPos[b + 2] + m;
      if (y < 0) y += precipBox.y;
      if (z > precipBox.z1) z -= precipBox.z1 - precipBox.z0;
      precipPos[b + 1] = y; precipPos[b + 2] = z; precipPos[b + 4] = y + 0.7; precipPos[b + 5] = z + 0.1;
    }
    rainLines.geometry.attributes.position.needsUpdate = true;
  } else {
    const fall = precipKind === 'sneeuw' ? 1.8 : 2.8;
    for (let i = 0; i < PRECIP; i++) {
      const b = i * 3;
      let y = flakePos[b + 1] - fall * dt, z = flakePos[b + 2] + m;
      if (y < 0) y += precipBox.y;
      if (z > precipBox.z1) z -= precipBox.z1 - precipBox.z0;
      flakePos[b] += Math.sin(t * 1.5 + i) * dt * 0.6;
      flakePos[b + 1] = y; flakePos[b + 2] = z;
    }
    flakeGeo.attributes.position.needsUpdate = true;
  }
}
// na setNight: mist, regenlucht en sneeuw over de verlichting heen leggen
function envAfterNight() {
  const f = curFeest();
  if (weather === 'mist') {
    const c = night ? '#2a2f3a' : '#a9b1b8';
    SKY.set(c); scene.background = SKY; scene.fog.color.set(c);
    scene.fog.near = 5; scene.fog.far = 42;
  } else if (weather === 'regen') {
    // lichte regen: de lucht blijft zichtbaar, alleen wat grijzer
    SKY.lerp(lc1.set(night ? '#2a3350' : '#b9c4cf'), 0.45); scene.background = SKY; scene.fog.color.copy(SKY);
    scene.fog.near *= 0.85;
    hemi.intensity *= 0.92; sun.intensity *= 0.75;
  }
  skyGroup.visible = weather !== 'mist' && !indoor;
  const snow = weather === 'sneeuw' || f?.snow;
  if (groundMat) groundMat.color.set(snow ? '#eef2f6' : (curTheme?.grass || '#6f9a52'));
  walkMat.color.set(snow ? '#f2f6fa' : '#ffffff');
  road.material.color.set(weather === 'regen' ? '#b8bcc4' : '#ffffff');
}
function rollWeather() {
  const f = curFeest();
  if (f?.snow) weather = 'sneeuw';
  else { const r = Math.random(); weather = r < 0.62 ? 'helder' : r < 0.85 ? 'regen' : 'mist'; }
  seedPrecip(weather === 'regen' ? 'regen' : weather === 'sneeuw' ? 'sneeuw' : f?.confetti ? 'confetti' : null);
  if (weather !== 'helder') setTimeout(() => { if (state === 'run') note(`${WEER[weather].icon} ${WEER[weather].name}${weather === 'regen' ? ': het is glad!' : weather === 'mist' ? ': je ziet niet ver!' : ''}`); }, 2600);
}
const laneGrip = () => (weather === 'regen' ? 7 : weather === 'sneeuw' ? 9 : 16);

// =====================================================================
//  FEESTEN: de hele straat in feeststemming (endless)
// =====================================================================
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
function thirdTuesdayOfJuly(y) { const d = new Date(y, 6, 1); const off = (2 - d.getDay() + 7) % 7; return new Date(y, 6, 1 + off + 14); }
const DAY = 864e5;
const between = (d, a, b) => d >= new Date(a.getFullYear(), a.getMonth(), a.getDate()) && d < new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1);
const FEESTEN = {
  vierdaagse: { name: 'Vierdaagse(feesten)', icon: '🥾', garland: 'lampjes', colors: ['#1f7a3a', '#ffffff', '#c8202b', '#ffd23f', '#4dd2ff'], banner: 'VIERDAAGSE · VIERDAAGSEFEESTEN', fw: 0.6,
    obstacles: ['wandelaars', 'wandelaars', 'bierbekers', 'feestganger', 'dranghek'], when: () => false },
  bekerfinale: { name: 'NEC Bekerfinale', icon: '🏆', garland: 'vlag', colors: ['#c8202b', '#1f7a3a', '#141414', '#ffd23f'], banner: 'NEC · BEKERFINALE · DIE BEKER IS VAN ONS', beker: true, fw: 0.8,
    obstacles: ['supporter', 'supporter', 'supporter', 'dranghek', 'bierbekers'], when: () => false },
  kerst: { name: 'Kerst', icon: '🎄', snow: true, garland: 'lampjes', colors: ['#fff6c0', '#ff3b3b', '#3bff6a', '#4dd2ff'], banner: 'FIJNE KERSTDAGEN',
    obstacles: ['sneeuwpop', 'sneeuwpop', 'pakjes', 'pakjes'],
    when: (d) => d.getMonth() === 11 && d.getDate() <= 26 },
  oudnieuw: { name: 'Oud en nieuw', icon: '🎆', night: true, garland: 'lampjes', colors: ['#ffd23f', '#ffffff', '#ff9a1f'], banner: 'GELUKKIG NIEUWJAAR!', fw: 0.25,
    obstacles: ['vuurwerkrest', 'vuurwerkrest', 'carbid', 'carbid', 'kliko'],
    when: (d) => (d.getMonth() === 11 && d.getDate() >= 27) || (d.getMonth() === 0 && d.getDate() === 1) },
};
const todaysFeest = () => Object.keys(FEESTEN).find((k) => FEESTEN[k].when(new Date())) || null;
let feest = null;
const FEEST_ROTATIE = ['wedstrijd', 'bekerfinale', 'vierdaagse', 'kerst', 'oudnieuw'];
const THEMA_SECS = 30;
let themaIdx = 0, themaT = THEMA_SECS;
const curFeest = () => (curLevel ? null : FEESTEN[feest] || null);

// versiering over de straat: slingers en spandoeken die meescrollen
const feestDecor = [];
const LAMPJE_GEO = sphG(0.11, 6, 4);
function makeSlinger(f) {
  const g = new THREE.Group();
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = -7.5 + t * 15, y = 5.6 - 1.1 * (1 - (2 * t - 1) ** 2);
    const col = f.colors[i % f.colors.length];
    if (f.garland === 'lampjes') g.add(mesh(LAMPJE_GEO, cached('lampje' + col, () => new THREE.MeshBasicMaterial({ color: col, fog: false })), x, y - 0.12, 0));
    else { const v = mesh(coneG(0.28, 0.5, 3), M(col), x, y - 0.25, 0); v.rotation.x = Math.PI; g.add(v); }
  }
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = -7.5 + t * 15, y = 5.6 - 1.1 * (1 - (2 * t - 1) ** 2);
    g.add(mesh(box(15 / n + 0.02, 0.02, 0.02), M('#222'), x, y, 0));
  }
  return g;
}
function makeSpandoek(f) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(mesh(box(0.15, 6, 0.15), M('#8a8f96'), sx * (ROAD_W / 2 + 0.3), 3, 0));
  const tex = canvasTex(512, 64, (x) => {
    for (let i = 0; i < 16; i++) { x.fillStyle = f.colors[i % f.colors.length]; x.fillRect(i * 32, 0, 32, 8); x.fillRect(i * 32, 56, 32, 8); }
    x.fillStyle = '#141414'; x.fillRect(0, 8, 512, 48);
    x.fillStyle = '#ffffff'; x.font = '36px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(`${f.icon} ${f.banner} ${f.icon}`, 256, 34, 496);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 0.6, 1.0), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  p.position.y = 5.2; g.add(p);
  return g;
}
function makeKerstboom() {
  const g = new THREE.Group();
  g.add(mesh(cylG(0.1, 0.12, 0.6, 6), M('#6b4a2e'), 0, 0.3, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(coneG(1.1 - i * 0.3, 1.3, 7), M('#2f6b3a'), 0, 1.1 + i * 0.75, 0));
  for (let i = 0; i < 10; i++) { const a = i * 2.4, h = 0.9 + (i / 10) * 2; g.add(mesh(sphG(0.07, 5, 3), new THREE.MeshBasicMaterial({ color: pick(['#ff3b3b', '#ffd23f', '#4dd2ff']) }), Math.cos(a) * (1 - i / 12) * 0.9, h, Math.sin(a) * (1 - i / 12) * 0.9)); }
  g.add(mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: '#ffd23f' }), 0, 3.4, 0));
  return g;
}
const feestMakeCache = new Map();
function cachedDecor(key, make) {
  // eenmaal samengevoegd en daarna gekloond (gedeelde vormen): bouwen kost dan bijna niks
  if (!feestMakeCache.has(key)) feestMakeCache.set(key, markShared(mergeStatic(make())));
  return feestMakeCache.get(key).clone();
}
function applyFeest(soft) {
  if (soft) for (const d of feestDecor) d.dying = true;
  else { for (const d of feestDecor) for (const it of d.items) scene.remove(it); feestDecor.length = 0; }
  const f = curFeest();
  if (!f) return;
  const start = soft ? -95 : 30;
  const add = (key, make, x, spacing, count, offset = 0) => {
    const items = [];
    for (let i = 0; i < count; i++) { const m = batchify(cachedDecor(key, make)); m.position.set(x, 0.14, start - offset - i * spacing); scene.add(m); items.push(m); }
    feestDecor.push({ items, span: count * spacing });
  };
  add('slinger' + feest, () => makeSlinger(f), 0, 24, 10, 4);
  add('spandoek' + feest, () => makeSpandoek(f), 0, 120, 2, 60);
  if (f.snow) { add('boom', makeKerstboom, -(ROAD_W / 2 + 3.2), 30, 8, 10); add('boom', makeKerstboom, ROAD_W / 2 + 3.2, 30, 8, 25); }
  if (f.beker) {
    add('trofee', makeTrofee, -(ROAD_W / 2 + 3.0), 40, 6, 12); add('trofee', makeTrofee, ROAD_W / 2 + 3.0, 40, 6, 32);
    add('doekL', () => makeDoekBord(-1), -(ROAD_W / 2 + 1.2), 60, 4, 22); add('doekR', () => makeDoekBord(1), ROAD_W / 2 + 1.2, 60, 4, 52);
  }
}
// NEC-bekerfinale: grote gouden bekers op sokkels en het spandoek langs de weg
function makeTrofee() {
  const g = new THREE.Group();
  const kl = ['#c8202b', '#1f7a3a', '#141414'];
  for (let i = 0; i < 3; i++) g.add(mesh(box(0.9, 0.6, 0.9), M(kl[i]), 0, 0.3 + i * 0.6, 0));
  const cup = makeCup(2.6, bekerMat, 'high');
  cup.position.y = 2.6; g.add(cup);
  return g;
}
const doekMat = new THREE.MeshLambertMaterial({ map: psxTex(new THREE.TextureLoader().load('img/spandoek.png')), side: THREE.DoubleSide });
function makeDoekBord(side) {
  const g = new THREE.Group();
  for (const dz of [-1, 1]) g.add(mesh(box(0.1, 3.2, 0.1), M('#8a8f96'), 0, 1.6, dz));
  const p = mesh(new THREE.PlaneGeometry(2.0, 2.0).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2), doekMat, 0, 2.1, 0);
  g.add(p);
  return g;
}
// elke 30 seconden het volgende thema (endless)
function updateThema(dt) {
  if (curLevel || indoor || bos) return;
  themaT -= dt;
  if (themaT > 0) return;
  themaT = THEMA_SECS;
  themaIdx = (themaIdx + 1) % FEEST_ROTATIE.length;
  const was = curFeest();
  feest = FEEST_ROTATIE[themaIdx];
  const f = curFeest();
  applyFeest(true);
  if (f.snow !== was?.snow) { weather = f.snow ? 'sneeuw' : 'helder'; seedPrecip(f.snow ? 'sneeuw' : null); envAfterNight(); }
  note(`${f.icon} ${f.name}`);
  save.feestPlayed = { ...save.feestPlayed, [feest]: 1 };
  recordStat('feesten', 0, Object.keys(save.feestPlayed).length);
}
function scrollFeest(m) {
  for (let i = feestDecor.length - 1; i >= 0; i--) {
    const d = feestDecor[i];
    for (let j = d.items.length - 1; j >= 0; j--) {
      const it = d.items[j];
      it.position.z += m;
      if (it.position.z > 30) {
        if (d.dying) { scene.remove(it); d.items.splice(j, 1); continue; }
        it.position.z -= d.span;
      }
      it.visible = !indoor;
    }
    if (d.dying && !d.items.length) feestDecor.splice(i, 1);
  }
}

// feest-obstakels
function feestPerson(o) {
  const p = makePerson({ key: 'feest', skin: pick(['#f2d0b8', '#e8c3a6', '#c99468', '#a8714a']), hair: pick(['#2a1d14', '#6b4a2e', '#c9a25b', '#1a1410']), hairStyle: pick(['kort', 'normaal', 'lang', 'knot']),
    shirt: { base: o.shirt, paint: o.paint || (() => {}) }, pants: o.pants || '#2f3f5c', shoes: '#f0f0f0', face: { skin: '#e8c3a6' } });
  if (o.hat) { const h = mesh(coneG(0.2, 0.5, 6), M(o.hat), 0, 0.42, 0); p.head.add(h); }
  return p;
}
Object.assign(SPECIAL_EXTRA, {
  wandelaars: (lane, z) => {
    const g = new THREE.Group(), people = [];
    for (let i = 0; i < 2; i++) {
      const p = feestPerson({ shirt: pick(['#1f7a3a', '#2667c9', '#c8202b', '#ff7b00']), paint(x, side) { if (side === 'back') { x.fillStyle = '#fff'; x.fillRect(40, 30, 48, 40); x.fillStyle = '#000'; x.font = 'bold 18px sans-serif'; x.fillText(String(1000 + Math.floor(Math.random() * 40000)), 44, 56); } } });
      p.root.position.set(-0.35 + i * 0.7, 0, rand(-0.3, 0.3));
      p.body.add(mesh(box(0.34, 0.42, 0.18), fabricMat(pick(['#3a3f4a', '#6b4a2e', '#2f6b3a'])), 0, 1.25, 0.26)); // rugzak
      g.add(p.root); people.push(p);
    }
    return addObj('wandelaars', g, LANES[lane], z, 1.7, 0.9, 1.9, { gen: 'stumble', upd(o, dt) { if (state === 'run' && !o.hit) o.z -= 1.4 * dt; for (const p of people) pose(p, 'run', dt, 0.45); } });
  },
  bierbekers: (lane, z) => {
    const g = new THREE.Group(), beker = new THREE.MeshLambertMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.85 }), bier = M('#e8b923');
    for (let i = 0; i < 14; i++) { const c = mesh(cylG(0.06, 0.045, 0.14, 6), i % 3 ? beker : bier, rand(-0.8, 0.8), 0.07, rand(-0.3, 0.3)); if (Math.random() < 0.5) { c.rotation.z = Math.PI / 2; c.position.y = 0.06; } g.add(c); }
    return addObj('bierbekers', g, LANES[lane], z, 1.8, 0.8, 0.35, { gen: 'stumble' });
  },
  feestganger: (lane, z) => {
    const p = feestPerson({ shirt: pick(['#ff3b3b', '#ffd23f', '#3bd16a', '#ff7ae0', '#141414']) });
    p.root.rotation.y = Math.PI;
    return addObj('feestganger', p.root, LANES[lane], z, 0.8, 0.6, 1.8, { gen: 'stumble', upd(o, dt) { pose(p, 'angry', dt, 0.7); if (!o.yelled && o.z > -16) { o.yelled = true; if (Math.random() < 0.4) bubble(p.head, pick(['PROOST!', 'Nog eentje!', 'FEEST!', 'Waar is de Waalkade?']), '', 1.3); } } });
  },
  verkleed: (lane, z) => {
    const oranje = curFeest()?.name === 'Koningsdag';
    const p = feestPerson({ shirt: oranje ? '#ff7b00' : pick(['#c8202b', '#ffd23f', '#1f7a3a', '#8a2be2', '#ff7ae0']), pants: oranje ? '#ff9a1f' : pick(['#ffd23f', '#1f4f8f', '#c8202b']), hat: oranje ? '#ff7b00' : pick(['#ffd23f', '#c8202b', '#1f7a3a', '#ffffff']) });
    p.root.rotation.y = Math.PI;
    return addObj('verkleed', p.root, LANES[lane], z, 0.8, 0.6, 1.8, { gen: 'stumble', upd(o, dt) { pose(p, 'angry', dt, 0.6); if (!o.yelled && o.z > -16) { o.yelled = true; if (Math.random() < 0.35) bubble(p.head, pick(['ALAAF!', 'Oranje boven!', 'Joehoe!']), '', 1.2); } } });
  },
  oranjefan: (lane, z) => SPECIAL_EXTRA.verkleed(lane, z),
  praalwagen: (lane, z) => {
    const g = new THREE.Group(), kl = pick(['#c8202b', '#ffd23f', '#1f7a3a', '#ff7ae0']);
    g.add(mesh(box(2.3, 1.0, 6), M(kl), 0, 0.8, 0));
    g.add(mesh(box(2.2, 0.3, 6.2), M('#ffffff'), 0, 1.4, 0));
    const kop = mesh(new THREE.IcosahedronGeometry(1.2, 0), M(pick(['#ffd23f', '#ff9a1f', '#4dd2ff'])), 0, 3, -1.5); g.add(kop);
    g.add(mesh(coneG(0.9, 1.6, 6), M('#c8202b'), 0, 4.6, -1.5));
    for (const [x, zz] of [[-1, -2.3], [1, -2.3], [-1, 2.3], [1, 2.3]]) { const w = wheel(0.4, 0.3, M('#1b1b1b')); w.position.set(x, 0.4, zz); g.add(w); }
    g.add(makeShadow(2.8, 6.6));
    return addObj('praalwagen', g, LANES[lane], z - 2, 2.3, 6, 3, { gen: 'die', deathText: 'Jens rende vol tegen een praalwagen. Knotsenburg lag dubbel.' });
  },
  kleedje: (lane, z) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.9, 0.04, 1.5), M(pick(['#ff7b00', '#c8202b', '#2667c9', '#e8b923'])), 0, 0.03, 0));
    for (let i = 0; i < 6; i++) g.add(mesh(box(rand(0.2, 0.4), rand(0.15, 0.35), rand(0.2, 0.4)), M(pick(['#8a6a44', '#c9ccd1', '#ff7ae0', '#4dd2ff', '#ffffff'])), rand(-0.7, 0.7), 0.15, rand(-0.5, 0.5)));
    return addObj('kleedje', g, LANES[lane], z, 1.9, 1.5, 0.35, { gen: 'stumble' });
  },
  pompoen: (lane, z) => {
    const g = new THREE.Group();
    const p = mesh(sphG(0.42, 10, 7), M('#ff7b00'), 0, 0.38, 0); p.scale.y = 0.8; g.add(p);
    g.add(mesh(box(0.08, 0.18, 0.08), M('#2f6b3a'), 0, 0.75, 0));
    const ogen = new THREE.MeshBasicMaterial({ color: '#ffe680' });
    g.add(mesh(box(0.1, 0.08, 0.02), ogen, -0.13, 0.45, 0.41)); g.add(mesh(box(0.1, 0.08, 0.02), ogen, 0.13, 0.45, 0.41)); g.add(mesh(box(0.26, 0.05, 0.02), ogen, 0, 0.28, 0.4));
    g.add(makeShadow(1, 1));
    return addObj('pompoen', g, LANES[lane], z, 0.9, 0.9, 0.7, { gen: 'stumble' });
  },
  sneeuwpop: (lane, z) => {
    const g = new THREE.Group(), wit = M('#f4f6f8');
    g.add(mesh(sphG(0.5, 10, 7), wit, 0, 0.45, 0)); g.add(mesh(sphG(0.36, 10, 7), wit, 0, 1.1, 0)); g.add(mesh(sphG(0.25, 10, 7), wit, 0, 1.55, 0));
    const neus = mesh(coneG(0.05, 0.25, 6), M('#ff7b00'), 0, 1.55, 0.3); neus.rotation.x = Math.PI / 2; g.add(neus);
    g.add(mesh(cylG(0.18, 0.2, 0.3, 8), M('#141414'), 0, 1.85, 0));
    g.add(mesh(box(0.5, 0.08, 0.1), M('#c8202b'), 0, 1.33, 0.18));
    g.add(makeShadow(1.2, 1.2));
    return addObj('sneeuwpop', g, LANES[lane], z, 1.0, 1.0, 1.4, { gen: 'stumble' });
  },
  pakjes: (lane, z) => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const s = rand(0.35, 0.55), y = i < 3 ? s / 2 : 0.75; const p = mesh(box(s, s, s), M(pick(['#c8202b', '#1f7a3a', '#2667c9', '#ffd23f'])), i < 3 ? -0.5 + i * 0.5 : 0, y, rand(-0.2, 0.2)); p.rotation.y = rand(0, 1); g.add(p); g.add(mesh(box(s + 0.02, s + 0.02, 0.06), M('#ffffff'), p.position.x, y, p.position.z)); }
    return addObj('pakjes', g, LANES[lane], z, 1.6, 0.8, 0.95, { gen: 'stumble' });
  },
  vuurwerkrest: (lane, z) => {
    const g = new THREE.Group();
    for (let i = 0; i < 10; i++) { const c = mesh(box(rand(0.1, 0.3), rand(0.05, 0.3), rand(0.1, 0.3)), M(pick(['#c8202b', '#4a4a4a', '#8a6a44', '#1b1b1b'])), rand(-0.7, 0.7), 0.1, rand(-0.4, 0.4)); c.rotation.y = rand(0, 3); g.add(c); }
    return addObj('vuurwerkrest', g, LANES[lane], z, 1.6, 0.9, 0.4, { gen: 'stumble', upd(o) { if (Math.random() < 0.15 && o.z > -40) burst(new THREE.Vector3(o.x + rand(-0.4, 0.4), 0.3, o.z), 1, 1, fireMats[4], 0.6); } });
  },
  carbid: (lane, z) => {
    const g = new THREE.Group();
    const bus = mesh(cylG(0.28, 0.3, 0.9, 10), M('#c9ccd1'), 0, 0.3, 0); bus.rotation.x = Math.PI / 2 - 0.2; g.add(bus);
    g.add(mesh(cylG(0.29, 0.29, 0.06, 10).rotateX(Math.PI / 2 - 0.2), M('#c8202b'), 0, 0.38, -0.44));
    return addObj('carbid', g, LANES[lane], z, 0.8, 1.0, 0.7, { gen: 'stumble', upd(o) {
      if (!o.boomed && o.z > -22) { o.boomed = true; sfx.knal(); buzz(40); shakeT = 0.25; burst(new THREE.Vector3(o.x, 0.4, o.z - 0.6), 25, 6, fireMats, 0.8); note('💥 Carbidschieten!'); }
    } });
  },
});
const feestObstacles = () => { const f = curFeest(); return f ? [...f.obstacles, ...f.obstacles] : []; };
function renderFeesten() {
  const el = $('#feesten');
  if (!el || true) return; // thema's wisselen nu vanzelf
  const today = todaysFeest();
  el.innerHTML = [['', 'Gewoon', '🏙️'], ...Object.entries(FEESTEN).map(([k, f]) => [k, f.name, f.icon])].map(([k, n, ic]) =>
    `<button class="fchip ${(feest || '') === k ? 'sel' : ''}" data-feest="${k}">${ic} ${n}${k && k === today ? ' <small>VANDAAG</small>' : ''}</button>`).join('');
}
$('#feesten').addEventListener('click', (e) => {
  const b = e.target.closest('[data-feest]');
  if (!b) return;
  feest = b.dataset.feest || null;
  save.feest = feest; persist();
  tone(660, 0.06, 'square', 0.05);
  renderFeesten();
  applyFeest(); envAfterNight();
});

// =====================================================================
//  PROFIELEN
// =====================================================================
function myProfile() {
  const starsOf = (lv) => lv.reduce((n, l) => n + (save.story[l.id]?.stars || 0), 0);
  return { ach: Object.keys(save.ach || {}), outfit: { ...save.eq }, stars: starsOf(LEVELS), starsNl: starsOf(LEVELS_NL), mult: save.mult, hatert: !!save.story.hatert?.cleared, arena: !!save.story.arena?.cleared };
}
async function syncProfile() {
  if (!save.name) return;
  try { await apiCall('/api/profile', { id: save.playerId, profile: myProfile() }); } catch (e) { /* offline */ }
}
let profileFrom = '#board';
async function openProfile(name, from = '#board') {
  profileFrom = from;
  showScreen('#profile');
  $('#prName').textContent = name;
  $('#prBody').innerHTML = '<p>Laden…</p>';
  try {
    const r = await apiCall('/api/profile?name=' + encodeURIComponent(name) + '&me=' + save.playerId);
    if (!r.ok) throw new Error();
    const p = r.profile || {};
    const ITEM = (slot, id) => SHOP[slot].items.find((i) => i.id === id)?.name || '—';
    if (p.outfit) applyOutfit({ ...save.eq, ...p.outfit });
    const scores = Object.entries(MODES).filter(([k, m]) => !m.hidden || k === 'bazen').map(([k, m]) => {
      const s = r.scores.find((x) => x.mode === k);
      return `<li><span class="pos">${m.icon}</span><span class="nm">${m.label}</span><span class="sc">${s ? `${s.score.toLocaleString('nl-NL')} <small>#${s.rank}</small>` : '–'}</span></li>`;
    }).join('');
    $('#prBody').innerHTML = `
      <p>Speelt sinds ${new Date(r.created).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}${p.mult ? ` · score ×${p.mult}` : ''}</p>
      <div class="badges">${r.fame ? '<span>👑 Hatert verslagen</span>' : ''}${r.fameNl ? '<span>🏟️ Spandoek in de ArenA</span>' : ''}${p.stars != null ? `<span>★ ${p.stars}/24 Nijmegen</span><span>★ ${p.starsNl}/30 Nederland</span>` : ''}${p.ach?.length ? `<span>🏅 ${p.ach.length}/${ACH.length} prestaties</span>` : ''}</div>
      ${p.ach?.length ? `<div class="achrow">${ACH.filter((a) => p.ach.includes(a.id)).map((a) => `<span title="${a.name}">${a.icon}</span>`).join('')}</div>` : ''}
      <div class="reacts">${REACTIES.map((e) => `<button class="react ${r.myReaction === e ? 'sel' : ''}" data-react="${e}">${e} <small>${r.reactions?.[e] || 0}</small></button>`).join('')}</div>
      <button id="prReact" class="glas-kies" data-mijn="${r.myReaction || ''}" data-tel="${escHtml(JSON.stringify(r.reactions || {}))}"><span>${REACTIES.filter((e) => r.reactions?.[e]).map((e) => `${e} ${r.reactions[e]}`).join(' &nbsp; ') || 'Reageren'}</span></button>
      <ol class="board">${scores}</ol>
      ${p.outfit ? `<div class="outfit"><b>Outfit</b><span>👕 ${ITEM('shirt', p.outfit.shirt)}</span><span>💇 ${ITEM('head', p.outfit.head)}</span><span>🕶️ ${ITEM('bril', p.outfit.bril)}</span><span>📣 ${ITEM('shout', p.outfit.shout)}</span><span>🦸 ${ITEM('rug', p.outfit.rug)}</span><span>✋ ${ITEM('hand', p.outfit.hand)}</span><span>🐾 ${ITEM('maatje', p.outfit.maatje)}</span></div>` : ''}`;
  } catch (e) { $('#prBody').innerHTML = '<p>Kan dit profiel niet laden.</p>'; }
}
$('#prBack').addEventListener('click', () => { applyOutfit(); if (profileFrom === '#weekly') { openWeekly(); return; } if (profileFrom === '#social') { openSocial(); return; } showScreen(profileFrom); if (profileFrom === '#board') renderBoard(); });
$('#boardList').addEventListener('click', (e) => { const li = e.target.closest('[data-name]'); if (li) openProfile(li.dataset.name); });
$('#fameList').addEventListener('click', (e) => { const li = e.target.closest('[data-name]'); if (li) openProfile(li.dataset.name, '#fame'); });

// =====================================================================
//  UITDAGINGEN DELEN
// =====================================================================
let challenge = null;
{
  const q = new URLSearchParams(location.search);
  const m = q.get('m'), s = parseInt(q.get('s'), 10), n = (q.get('n') || '').slice(0, 20);
  if (location.pathname === '/daag' && MODES[m] && !MODES[m].hidden && s > 0) {
    challenge = { mode: m, score: s, name: n || 'Iemand', feest: FEESTEN[q.get('f')] ? q.get('f') : null };
    history.replaceState(null, '', '/');
  }
}
function renderChallenge() {
  const el = $('#challenge');
  if (!challenge) { el.classList.add('hidden'); return; }
  const m = MODES[challenge.mode], f = FEESTEN[challenge.feest];
  el.classList.remove('hidden');
  el.innerHTML = `<b>👊 ${escHtml(challenge.name)} daagt je uit!</b><span>Haal meer dan <b>${challenge.score.toLocaleString('nl-NL')}</b> punten in ${m.icon} ${m.label}${f ? ` (${f.icon} ${f.name})` : ''}.</span><button class="btn big" id="chGo">ACCEPTEER</button>`;
  $('#chGo').addEventListener('click', () => {
    weekly = null;
    setMode(challenge.mode, true);

    startRun();
  });
}
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function challengeResult(s) {
  if (!challenge || challenge.mode !== mode) return '';
  const won = s > challenge.score;
  const txt = won ? `🏆 Je hebt ${escHtml(challenge.name)} verslagen! (${challenge.score.toLocaleString('nl-NL')})` : `Nog ${(challenge.score - s + 1).toLocaleString('nl-NL')} punten om ${escHtml(challenge.name)} te verslaan.`;
  if (won) { buzz([40, 60, 40]); challenge = null; }
  return txt;
}
async function shareChallenge() {
  if (!lastRun) return;
  const url = `${location.origin}/daag?m=${lastRun.mode}&s=${lastRun.score}&n=${encodeURIComponent(save.name || 'Iemand')}${feest ? `&f=${feest}` : ''}`;
  const text = `Ik haalde ${lastRun.score.toLocaleString('nl-NL')} punten in Jens Run (${MODES[lastRun.mode].label}). Versla me dan!`;
  try {
    if (navigator.share) await navigator.share({ title: 'Jens Run', text: stripEmoji(text), url });
    else { await navigator.clipboard.writeText(`${stripEmoji(text)} ${url}`); note('📋 Link gekopieerd, plak hem in de groepsapp!'); }
  } catch (e) { /* geannuleerd */ }
}
$('#shareBtn').addEventListener('click', shareChallenge);

// alles per frame
function updateExtras(dt, m) {
  updateCombo(dt);
  updatePrecip(dt, m);
  scrollFeest(m);
}

// Op de fiets filmt Jens zichzelf voor Snapchat: inzetje met het beeld van zijn telefoon
const snapCam = new THREE.PerspectiveCamera(78, 9 / 16, 0.05, 120);
const snapV = new THREE.Vector3(), snapH = new THREE.Vector3(), snapSize = new THREE.Vector2();
let snapOn = false, snapT = 0;
// selfie: de telefoon hangt schuin voor hem, en filmt terug naar zijn gezicht en de weg onder hem.
// crashK: tijd sinds de klap, dan vliegt de telefoon mee en tolt rond
function aimSnapCam(c, crashK) {
  jens.head.getWorldPosition(snapH);
  if (crashK !== null) {
    const ang = crashK * 6;
    c.position.set(snapH.x + Math.sin(ang) * 1.7, Math.max(0.4, snapH.y + 0.6 + Math.cos(crashK * 4) * 0.4), snapH.z + Math.cos(ang) * 1.7);
    c.lookAt(snapH.x + rand(-0.15, 0.15), snapH.y - 0.2, snapH.z);
    c.rotateZ(Math.sin(crashK * 11) * 1.2);
  } else {
    c.position.set(snapH.x + 0.35, snapH.y + 0.05, snapH.z - 0.75);
    c.lookAt(snapH.x, snapH.y - 0.35, snapH.z + 0.6);
  }
}
function renderSnap() {
  const crashing = !!(snapDeath && snapDeath.t < 1.9 && state === 'dying');
  const on = (fietsT > 0 && state === 'run' && !indoor) || crashing;
  $('#snap').classList.toggle('glitch', crashing && snapDeath.t > 0.05);
  if (snapDeath && snapDeath.t >= 1.9 && state === 'dying') $('#snap').classList.add('dead');
  if (on !== snapOn) {
    snapOn = on; snapT = 0;
    $('#snap').classList.toggle('hidden', !on);
    if (on && !crashing) { $('#snapCap').textContent = pick(['Op de fiets 🚲', 'Nijmegen-Oost 💯', 'Even naar huis 🏠', 'Wie gaat er mee? 🍻', 'Kijk dit dan 😂', 'NEC 🔴🟢⚫', 'Lekker bezig 🔥', `${STREETS[streetIdx]} 📍`]); recCaption = $('#snapCap').textContent; }
    jensPhone.visible = on || mode === 'telefoon';
  }
  updateGear(1 / 60);
  updatePet(1 / 60);
  if (!on) return;
  snapT += 1 / 60;
  $('#snapTime').textContent = `0:${String(Math.floor(snapT)).padStart(2, '0')}`;
  $('#snap').style.setProperty('--snapleft', (100.5 * (1 - snapT / Math.max(1, fietsMax))).toFixed(1));
  aimSnapCam(snapCam, crashing ? snapDeath.t : null);
  // precies binnen het telefoonkader tekenen (kader in CSS-pixels -> canvas-pixels)
  renderer.getSize(snapSize);
  const r = $('#snap').getBoundingClientRect(), cr = canvas.getBoundingClientRect();
  const kx = snapSize.x / cr.width, ky = snapSize.y / cr.height, b = 4;
  const x = Math.round((r.left + b - cr.left) * kx), w = Math.round((r.width - 2 * b) * kx);
  const h = Math.round((r.height - 2 * b) * ky), y = Math.round((cr.bottom - r.bottom + b) * ky);
  snapCam.aspect = w / h; snapCam.updateProjectionMatrix();
  renderer.setScissorTest(true);
  renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
  renderer.render(scene, snapCam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, snapSize.x, snapSize.y);
}

// =====================================================================
//  INSTELLINGEN
// =====================================================================
function applyVolumes() {
  if (master) master.gain.value = save.sound ? 0.5 * (save.set.sfx / 100) : 0;
}
function renderSettings() {
  for (const k of ['music', 'sfx', 'voice']) { $(`#set_${k}`).value = save.set[k]; $(`#set_${k}_v`).textContent = save.set[k] + '%'; }
  $('#set_sound').textContent = save.sound ? '🔊 Geluid: aan' : '🔇 Geluid: uit';
  $('#set_vibe').textContent = save.vibe ? '📳 Trillen: aan' : '📴 Trillen: uit';

  $('#set_vibe').classList.toggle('hidden', !navigator.vibrate);
  $('#set_dash').textContent = save.set.dashcam ? '📺 NijmegenActueel-filmpje: aan' : '📺 NijmegenActueel-filmpje: uit';
  $('#set_dash').classList.toggle('hidden', !dashSupported);
  for (const b of document.querySelectorAll('[data-q]')) b.classList.toggle('sel', b.dataset.q === save.set.quality);
  $('#set_q_info').textContent = save.set.quality === 'auto' ? `Automatisch: nu ${PSX_RES}p` : '';
}
let settingsFrom = '#menu';
function openSettings(from) { settingsFrom = from; showScreen('#settings'); renderSettings(); renderAccount(); }
for (const k of ['music', 'sfx', 'voice']) {
  $(`#set_${k}`).addEventListener('input', (e) => {
    save.set[k] = +e.target.value; persist(); applyVolumes(); renderSettings();
    if (k === 'sfx') sfx.beker();
  });
}
$('#set_sound').addEventListener('click', () => {
  save.sound = !save.sound; persist();
  audioInit();
  if (!save.sound) { stopGameover(); stopVoice(); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  applyVolumes(); renderSettings();
});

$('#set_dash').addEventListener('click', () => { save.set.dashcam = !save.set.dashcam; persist(); renderSettings(); });
$('#set_vibe').addEventListener('click', () => { save.vibe = !save.vibe; persist(); buzz(40); renderSettings(); });
$('#set_quality').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  save.set.quality = b.dataset.q; persist();
  PSX_RES = save.set.quality === 'auto' ? AUTO_STEPS[autoIdx] : QUALITY[save.set.quality];
  lowFx = save.set.quality === 'ps1' || (save.set.quality === 'auto' && autoIdx <= 1);
  resize(); renderSettings();
});
$('#setBtn').addEventListener('click', () => openSettings('#menu'));
$('#pauseSet').addEventListener('click', () => openSettings('#pause'));
$('#setBack').addEventListener('click', () => showScreen(settingsFrom));
// alleen in de Android-app: zelf kijken of er een nieuwere APK op GitHub staat
if (window.JensRunNative?.checkUpdate) {
  $('#set_app').classList.remove('hidden');
  try { $('#set_appver').textContent = `Versie ${window.JensRunNative.version()}`; } catch (e) { /* oude app */ }
  $('#set_update').addEventListener('click', () => { note('🔄 Zoeken naar updates…'); window.JensRunNative.checkUpdate(); });
}

// =====================================================================
//  CONTROLLER (PlayStation / Xbox / elke standaard gamepad)
// =====================================================================
const padPrev = {};
let padAxis = 0, padSeen = false;
function pollPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  if (!pads.length) return;
  const p = pads[0];
  if (!padSeen) { padSeen = true; note('🎮 Controller verbonden'); }
  const down = (i) => !!p.buttons[i]?.pressed;
  const hit = (i) => { const d = down(i), was = padPrev[i]; padPrev[i] = d; return d && !was; };
  // stick: één stap per beweging
  const ax = p.axes[0] || 0, dir = ax < -0.55 ? -1 : ax > 0.55 ? 1 : 0;
  const stickHit = dir !== 0 && dir !== padAxis; padAxis = dir;
  const left = hit(14) || (stickHit && dir < 0), right = hit(15) || (stickHit && dir > 0);
  const a = hit(0), b = hit(1), x = hit(2), y = hit(3), up = hit(12), dn = hit(13), start = hit(9);
  if (!started) { if (a || start) leaveStart(); return; }
  if (state === 'run') {
    if (left) act('left');
    if (right) act('right');
    if (a || up) act('jump');
    if (b || dn) act('slide');
    if (x || y) throwNitraat();
    if (start) pauseGame();
  } else if (state === 'paused') {
    if (start || a) resumeGame();
  } else if (curScreen === '#menu') {
    if (left || right) { const ks = Object.keys(MODES).filter((k) => !MODES[k].hidden); const open = ks.filter(modeOpen); setMode(open[(open.indexOf(mode) + (right ? 1 : open.length - 1)) % open.length]); }
    if (a || start) startRun();
  } else if (state === 'over' && curScreen === '#over') {
    if (a || start) startRun();
    if (b) toMenu();
  } else if (b) {
    toMenu();
  }
}

// =====================================================================
//  PRESTATIES
// =====================================================================
if (!save.stats) save.stats = {};
if (!save.ach) save.ach = {};
const ACH = [
  { id: 'kruisje', icon: '✚', name: 'Vierdaagsekruisje', desc: 'Loop alle vier de dagen van de Vierdaagse', test: () => !!save.story.v4d4?.cleared },
  { id: 'europaleague', icon: '🏆', name: 'Europa League', desc: 'Win de Europa League met NEC in de Goffert', test: () => !!save.story.efinale?.cleared },
  { id: 'eerste', icon: '👟', name: 'Eerste rondje', desc: 'Speel je eerste potje', test: (s) => s.games >= 1 },
  { id: 'verslaafd', icon: '🎮', name: 'Verslaafd', desc: 'Speel 100 potjes', test: (s) => s.games >= 100 },
  { id: 'beker1k', icon: '🏆', name: 'Bekerjager', desc: 'Pak in totaal 1.000 bekers', test: (s) => s.bekers >= 1000 },
  { id: 'beker10k', icon: '💰', name: 'Bekerkoning', desc: 'Pak in totaal 10.000 bekers', test: (s) => s.bekers >= 10000 },
  { id: 'score50k', icon: '🚀', name: '50K', desc: 'Haal 50.000 punten in één potje', test: (s) => s.score >= 50000 },
  { id: 'marathon', icon: '🏃', name: 'Vierdaagseloper', desc: 'Ren 5.000 m in één potje', test: (s) => s.dist >= 5000 },
  { id: 'sticker100', icon: '🟥', name: 'Nijmegen beplakt', desc: 'Plak 100 NEC-stickers', test: (s) => s.sticker >= 100 },
  { id: 'snapper', icon: '🚲', name: 'Snapchat-ster', desc: 'Pak 50 keer de fiets', test: (s) => s.fiets >= 50 },
  { id: 'montessori', icon: '🏫', name: 'Vaste gast', desc: 'Fiets 10 keer door het Montessori', test: (s) => s.school >= 10 },
  { id: 'sloop', icon: '💥', name: 'Sloophamer', desc: 'Sloop 100 dingen met nitraat', test: (s) => s.sloop >= 100 },
  { id: 'combo', icon: '🔥', name: 'On fire', desc: 'Haal een combo van 20', test: (s) => s.combo >= 20 },
  { id: 'feestbeest', icon: '🎉', name: 'Feestbeest', desc: 'Speel 4 verschillende feesten', test: (s) => (s.feesten || 0) >= 4 },
  { id: 'hatert', icon: '👑', name: 'Koning af', desc: 'Versla de Koning van Hatert', test: () => !!save.story.hatert?.cleared },
  { id: 'nijmegen', icon: '⭐', name: 'Heel Nijmegen', desc: 'Haal alle 24 sterren in Nijmegen', test: () => LEVELS.every((l) => (save.story[l.id]?.stars || 0) >= 3) },
  { id: 'arena', icon: '🏟️', name: 'Die beker is van ons', desc: 'Smokkel het spandoek de ArenA in', test: () => !!save.story.arena?.cleared },
  { id: 'bosgevecht', icon: '⚔️', name: 'Bosgevecht gewonnen', desc: 'Schakel 9 van de 12 Vitesse-hooligans uit', test: (s) => s.bos >= 1 },
  { id: 'week', icon: '🗓️', name: 'Weekstrijder', desc: 'Doe mee aan een weekuitdaging', test: (s) => s.weekly >= 1 },
  { id: 'snapdeler', icon: '👻', name: 'Snap gedeeld', desc: 'Deel een snap van de fiets', test: (s) => s.snapShare >= 1 },
  { id: 'maatje', icon: '🐕', name: 'Beste maatje', desc: 'Neem een maatje mee', test: () => save.eq.maatje && save.eq.maatje !== 'geen' },
  { id: 'verzamelaar', icon: '🛍️', name: 'Verzamelaar', desc: 'Koop 12 dingen in de winkel', test: () => Object.keys(save.owned).length >= 12 },
];
let achDirty = false;
function recordStat(name, amount = 1, max = null) {
  const s = save.stats;
  if (max != null) { if (max <= (s[name] || 0)) return; s[name] = Math.floor(max); }
  else s[name] = (s[name] || 0) + amount;
  achDirty = true;
}
let achCheckT = 0;
function checkAch() {
  if (!achDirty || performance.now() - achCheckT < 1000) return;
  achCheckT = performance.now();
  achDirty = false;
  for (const a of ACH) {
    if (save.ach[a.id] || !a.test(save.stats)) continue;
    save.ach[a.id] = Date.now();
    save.bekers += 100;
    persist();
    toast(`${a.icon} PRESTATIE: ${a.name}<small>${a.desc} · +100 bekers</small>`, 2.6);
    sfx.power();
    buzz([30, 50, 30]);
    syncProfile();
  }
}
function renderAch() {
  const n = Object.keys(save.ach).length;
  $('#achCount').textContent = `${n}/${ACH.length}`;
  $('#achGrid').innerHTML = ACH.map((a) => `<div class="ach ${save.ach[a.id] ? 'on' : ''}"><span>${save.ach[a.id] ? a.icon : '🔒'}</span><b>${a.name}</b><small>${a.desc}</small></div>`).join('');
}
$('#achBtn').addEventListener('click', () => { achDirty = true; checkAch(); showScreen('#awards'); renderAch(); });
$('#achBack').addEventListener('click', openKamer);

// =====================================================================
//  MAATJE (rent met Jens mee en pakt af en toe een beker)
// =====================================================================
function makeDuif() {
  const g = new THREE.Group(), grijs = M('#8a8f9a');
  const lijf = mesh(sphG(0.16, 8, 6), grijs); lijf.scale.set(0.9, 0.85, 1.4); g.add(lijf);
  g.add(mesh(sphG(0.09, 8, 6), M('#5f6a7a'), 0, 0.1, -0.17));
  g.add(mesh(box(0.1, 0.02, 0.06), M('#3aa07a'), 0, 0.04, -0.12));
  const snavel = mesh(coneG(0.025, 0.07, 4), M('#d9b45a'), 0, 0.09, -0.27); snavel.rotation.x = -Math.PI / 2; g.add(snavel);
  const vl = [];
  for (const sx of [-1, 1]) { const v = new THREE.Group(); v.position.set(sx * 0.12, 0.05, 0); v.add(mesh(box(0.28, 0.02, 0.18), M('#6f7684'), sx * 0.14, 0, 0)); g.add(v); vl.push(v); }
  g.userData.wings = vl;
  return g;
}
// Saar: grote witte pluizige hond (Pyrenese berghond-achtig) met zwarte neus en hangoren
function makeSaar() {
  const g = new THREE.Group();
  const wit = M('#f2ede3'), creme = M('#e4d9c6'), zwart = M('#141414');
  g.add(mesh(box(0.44, 0.42, 0.86), wit, 0, 0.56, 0));
  g.add(mesh(box(0.5, 0.48, 0.26), wit, 0, 0.64, 0.3)); // dikke vacht om de nek
  g.add(mesh(box(0.4, 0.1, 0.7), creme, 0, 0.34, 0)); // pluizige buik
  const head = new THREE.Group(); head.position.set(0, 0.84, 0.5); g.add(head);
  head.add(mesh(box(0.36, 0.32, 0.32), wit));
  head.add(mesh(box(0.42, 0.14, 0.2), wit, 0, -0.14, -0.02)); // wangen
  head.add(mesh(box(0.18, 0.14, 0.16), creme, 0, -0.07, 0.22)); // snuit
  head.add(mesh(box(0.1, 0.08, 0.05), zwart, 0, -0.02, 0.31)); // neus
  head.add(mesh(box(0.08, 0.02, 0.02), M('#5a4a42'), 0, -0.12, 0.305)); // bek
  head.add(mesh(box(0.06, 0.04, 0.02), zwart, -0.09, 0.06, 0.165));
  head.add(mesh(box(0.06, 0.04, 0.02), zwart, 0.09, 0.06, 0.165));
  head.add(mesh(box(0.07, 0.18, 0.13), creme, -0.21, -0.02, -0.04)); // hangoren
  head.add(mesh(box(0.07, 0.18, 0.13), creme, 0.21, -0.02, -0.04));
  const legs = [];
  for (const [x, z] of [[-0.13, 0.3], [0.13, 0.3], [-0.13, -0.3], [0.13, -0.3]]) {
    const l = new THREE.Group(); l.position.set(x, 0.4, z);
    l.add(mesh(box(0.13, 0.4, 0.13), wit, 0, -0.2, 0));
    l.add(mesh(box(0.15, 0.06, 0.17), creme, 0, -0.37, 0.02)); // poot
    g.add(l); legs.push(l);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.7, -0.42); g.add(tail);
  const pluim = mesh(box(0.16, 0.16, 0.4), wit, 0, 0.08, -0.18); pluim.rotation.x = 0.8; tail.add(pluim);
  g.add(makeShadow(0.95, 1.2));
  g.userData = { legs, tail, head };
  return g;
}
let pet = null, petKind = null, petT = 6, petDash = 0, petDashX = 0;
function buildPet(kind) {
  if (pet) { scene.remove(pet); pet = null; }
  petKind = kind && kind !== 'geen' ? kind : null;
  if (!petKind) return;
  pet = petKind === 'duif' ? makeDuif() : makeSaar();
  if (petKind === 'hond') pet.rotation.y = Math.PI;
  pet.scale.setScalar(petKind === 'hond' ? 0.9 : 1);
  scene.add(pet);
}
function updatePet(dt) {
  if (!pet) return;
  const running = state === 'run' || state === 'dying';
  const side = player.lane === 2 ? -1 : 1;
  let tx = running ? player.x + side * 0.85 : 0.9, tz = running ? -0.4 : -0.6;
  if (petDash > 0) { petDash -= dt; tx = petDashX; tz = -1.5; }
  pet.position.x = damp(pet.position.x, tx, 8, dt);
  pet.position.z = damp(pet.position.z, tz, 8, dt);
  const t = now();
  if (petKind === 'duif') {
    pet.position.y = 1.9 + Math.sin(t * 3) * 0.12 + (running ? 0 : -1.3);
    pet.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * (running ? 22 : 6)) * 0.7; });
  } else {
    pet.position.y = running ? Math.abs(Math.sin(t * 14)) * 0.06 : 0;
    pet.userData.legs.forEach((l, i) => { l.rotation.x = running ? Math.sin(t * 16 + (i % 2 ? Math.PI : 0) + (i > 1 ? 1 : 0)) * 0.8 : 0; });
    pet.userData.tail.rotation.y = Math.sin(t * 10) * 0.6;
  }
  pet.visible = !indoor || petKind === 'hond';
  if (state !== 'run') return;
  petT -= dt;
  if (petT > 0) return;
  petT = rand(4.5, 7.5);
  const o = objs.find((k) => k.kind === 'beker' && !k.dead && k.z > -11 && k.z < -2);
  if (!o) { petT = 1; return; }
  o.dead = true;
  const n = bekerT > 0 ? 2 : 1;
  runBekers += n; save.bekers += n; score += 10 * n * scoreMult();
  missionEvent('bekers', n);
  petDash = 0.45; petDashX = o.x;
  tone(petKind === 'duif' ? 1400 : 520, 0.08, 'square', 0.06); tone(petKind === 'duif' ? 1800 : 700, 0.1, 'square', 0.05, null, 0.08);
  buzz(8);
}

// =====================================================================
//  BOSGEVECHT tegen de Vitesse-hooligans (endless)
// =====================================================================
let bos = null, nextBos = 1100;
function makeHooligan() {
  const p = makePerson({ key: 'hooligan', skin: pick(['#f2d0b8', '#e8c3a6', '#f0cbb0', '#c99468']), hair: '#141414', hairStyle: pick(['kaal', 'kort', 'boapet']),
    shirt: { base: '#141414', paint(x) { x.fillStyle = '#ffd200'; for (let i = 8; i < 128; i += 24) x.fillRect(i, 0, 11, 128); } },
    pants: '#1b1b1b', shoes: '#f4f4f4', face: { skin: '#e8c3a6', angry: true, stubble: '#2a2a2a' }, scale: [1.12, 1.05, 1.1] });
  p.body.add(mesh(box(0.32, 0.09, 0.3), M('#ffd200'), 0, 1.57, 0)); // sjaal
  p.root.rotation.y = Math.PI;
  return p;
}
function startBos() {
  bos = { kills: 0, spawned: 0, total: 12, t: 0 };
  fade();
  applyTheme(THEMES.bos);
  nitraten = Math.max(nitraten, 6); hudNitro = -1;
  verslaggever('bos', true);
  toast('⚔️ BOSGEVECHT!<small>Vitesse-hooligans komen uit het bos · gooi nitraten (E / 🧨)</small>', 2.8);
  sfx.toet(); buzz([60, 40, 60]);
  for (const o of objs) if (o.z < -20 && o.kind !== 'beker') o.dead = true;
}
function spawnHooliganRow(z) {
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const n = Math.min(2, bos.total - bos.spawned);
  for (let i = 0; i < n; i++) {
    const p = makeHooligan(), speedH = rand(3.5, 5.5);
    addObj('hooligan', p.root, LANES[lanes[i]], z, 0.8, 0.6, 1.8, { gen: 'stumble', hooligan: true,
      upd(o, dt) {
        if (o.hit) return;
        if (state === 'run') o.z += speedH * dt;
        pose(p, o.z > -14 ? 'angry' : 'run', dt, 1);
        if (!o.yelled && o.z > -22) { o.yelled = true; if (Math.random() < 0.45) bubble(p.head, pick(['VITESSE!', 'KOM DAN!', 'ARNHEM!', 'Jij bent er geweest!']), 'angry', 1.2); }
      } });
  }
  bos.spawned += n;
  if (Math.random() < 0.45) addObj('power', makeSmallNitraat(), LANES[lanes[2]], z, 0, 0, 0, { y: 1.0, type: 'nitraat2' });
  else if (Math.random() < 0.5) spawnCoinsLine(lanes[2], z, 4);
}
function updateBos() {
  if (curLevel || indoor || schoolPhase || jacht) return;
  if (!bos && dist > nextBos) { startBos(); return; }
  if (bos && bos.spawned >= bos.total && !objs.some((o) => o.hooligan && !o.dead && !o.hit && o.z < 4)) endBos();
}
function endBos() {
  const k = bos.kills, bonus = k * 150 * scoreMult();
  score += bonus;
  toast(`⚔️ ${k >= 9 ? 'BOSGEVECHT GEWONNEN!' : 'Bosgevecht voorbij'}<small>${k}/${bos.total} hooligans uitgeschakeld · +${bonus.toLocaleString('nl-NL')}</small>`, 2.6);
  if (k >= 9) { recordStat('bos'); goodShout(true); verslaggever('boswin', true); }
  bos = null;
  nextBos = dist + rand(1800, 2600);
  fade();
  applyTheme(THEMES.oost);
}

// =====================================================================
//  WEEKUITDAGING (zelfde regels voor iedereen, eigen ranglijst per week)
// =====================================================================
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
const WEEK_RULES = [
  { id: 'geenpower', icon: '🚫', name: 'Zonder power-ups', desc: 'Er komen geen power-ups. Alleen jij en je benen.' },
  { id: 'regen', icon: '🌧️', name: 'Hondenweer', desc: 'Het regent het hele potje. Alles is glad.' },
  { id: 'nacht', icon: '🌫️', name: 'Nachtrit in de mist', desc: 'Donker en mistig: je ziet bijna niks.' },
  { id: 'snel', icon: '⚡', name: 'Turbo', desc: 'Je begint meteen op hoge snelheid.' },
  { id: 'drerries', icon: '🧢', name: 'Drerrie-invasie', desc: 'De straat staat vol drerries op fatbikes.' },
  { id: 'bos', icon: '⚔️', name: 'Bosgevecht-week', desc: 'Na 150 meter staan de Vitesse-hooligans al klaar.' },
];
function thisWeek() {
  const w = isoWeek();
  let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const modes = Object.keys(MODES).filter((k) => !MODES[k].hidden && !MODES[k].mini);
  return { week: w, rule: WEEK_RULES[h % WEEK_RULES.length], mode: modes[(h >>> 4) % modes.length] };
}
let weekly = null; // actief tijdens een weekuitdaging-potje
const scoreMult = () => (weekly ? 1 : save.mult) * (feverT > 0 ? 2 : 1); // KOORTS telt ook in de weekuitdaging: die verdien je zelf
async function openWeekly() {
  const wk = thisWeek(), m = MODES[wk.mode];
  showScreen('#weekly');
  $('#wkTitle').textContent = `${wk.rule.icon} ${wk.rule.name}`;
  $('#wkDesc').innerHTML = `${wk.rule.desc}<br>Modus: <b>${m.icon} ${m.label}</b> · Week ${wk.week.split('-W')[1]} · zonder score-multiplier, dus eerlijk voor iedereen.`;
  $('#wkBest').textContent = save.weekBest?.week === wk.week ? `Jouw beste: ${save.weekBest.score.toLocaleString('nl-NL')}` : 'Nog niet gespeeld deze week';
  const list = $('#wkList');
  list.innerHTML = '<li class="empty">Laden…</li>';
  try {
    const r = await apiCall('/api/weekly');
    list.innerHTML = r.rows?.length
      ? r.rows.map((row, i) => `<li data-name="${escHtml(row.name)}" class="click ${row.name === save.name ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="nm">${escHtml(row.name)}</span><span class="sc">${row.score.toLocaleString('nl-NL')}</span></li>`).join('')
      : '<li class="empty">Nog niemand deze week. Pak de eerste plek!</li>';
  } catch (e) { list.innerHTML = '<li class="empty">Kan de weekranglijst niet laden.</li>'; }
}
function startWeekly() {
  const wk = thisWeek();
  setMode(wk.mode, true);
  feest = null; applyFeest();
  weekly = wk;
  startRun();
}
$('#wkBtn').addEventListener('click', openWeekly);
$('#wkPlay').addEventListener('click', startWeekly);
$('#wkBack').addEventListener('click', () => { weekly = null; showScreen('#menu'); });
$('#wkList').addEventListener('click', (e) => { const li = e.target.closest('[data-name]'); if (li) openProfile(li.dataset.name, '#weekly'); });
async function submitWeekly(run) {
  recordStat('weekly');
  const wk = weekly;
  if (!save.weekBest || save.weekBest.week !== wk.week || run.score > save.weekBest.score) { save.weekBest = { week: wk.week, score: run.score }; persist(); }
  if (!save.name) return;
  try {
    const r = await apiCall('/api/weekly', { id: save.playerId, week: wk.week, score: run.score, dist: run.dist, secs: run.secs, bekers: run.bekers });
    if (r.ok && state === 'over') { $('#overRank').textContent = `🗓️ #${r.rank} in de weekuitdaging`; $('#overRank').classList.remove('hidden'); }
  } catch (e) { /* offline */ }
}

// =====================================================================
//  NIJMEGENACTUEEL: na elk potje een 'breaking news'-filmpje (16:9, echte MP4)
//  Logo-intro, dan de crash vanuit 3 camerahoeken in willekeurige volgorde.
//  Wordt na afloop offline getekend uit de replay-opname.
// =====================================================================
if (save.set.dashcam === undefined) save.set.dashcam = true;
let lastSnap = null, recCaption = '', snapClip = null;
const dashSupported = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
const NEWS_W = lowFx ? 480 : 640, NEWS_H = lowFx ? 270 : 360, NEWS_FPS = 30;
const newsRT = new THREE.WebGLRenderTarget(NEWS_W, NEWS_H);
// als 'XR-doel' krijgt het beeld dezelfde sRGB-kleuren als het scherm (en dezelfde shaders)
newsRT.texture.colorSpace = THREE.SRGBColorSpace;
newsRT.texture.internalFormat = 'RGBA8';
newsRT.isXRRenderTarget = true;
const newsCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 110);
const newsCanvas = document.createElement('canvas'); newsCanvas.width = NEWS_W; newsCanvas.height = NEWS_H;
const newsCtx = newsCanvas.getContext('2d');
const newsTmp = document.createElement('canvas'); newsTmp.width = NEWS_W; newsTmp.height = NEWS_H;
const newsTmpCtx = newsTmp.getContext('2d');
const newsPix = new Uint8Array(NEWS_W * NEWS_H * 4);
const naImg = new Image(); naImg.src = 'img/na-logo.png';
const NEWS_ANGLES = {
  heli: 'HELIKOPTER', drone: 'DRONE', achter: 'ACHTERVOLGING', voor: 'FRONTCAM', zij: 'MEERIJDER',
  reporter: 'NIJMEGENACTUEEL-CAM', bewaking: 'BEWAKINGSCAMERA', deurbel: 'DEURBELCAMERA',
};
const INTRO = 2.0, OUTRO = 1.0, SEG = 1.9; // samen ~8,7 s: de tune duurt 8,4 s
let newsJob = null, newsUrl = null, newsPlaying = false, newsSong = null;

function newsAvailable() { return dashSupported && save.set.dashcam && !curLevel && !weakDevice && !fps30; } // een filmpje maken is te zwaar voor zwakke apparaten
// replay-toestand toepassen (zelfde als de oude replay, zonder camera/scherm)
function newsApply(r, f, D) {
  if (r.prev) for (const m of r.prev) m.visible = false;
  r.prev = [];
  for (let i = 0; i < f.n; i++) {
    const m = f.objs[i], b = i * 6;
    if (!m.parent) { scene.add(m); r.added.push(m); }
    m.visible = true; m.position.set(f.od[b], f.od[b + 1], f.od[b + 2] + D); m.rotation.set(f.od[b + 3], f.od[b + 4], f.od[b + 5]);
    r.prev.push(m);
  }
  personApply(jens, f.jens); jens.root.position.z += D;
  const c = chaser(); personApply(c, f.chaser); c.root.position.z += D;
}
function newsRestore(r) {
  for (const m of r.added) if (!objs.some((o) => o.mesh === m)) scene.remove(m);
  if (r.prev) for (const m of r.prev) m.visible = false;
  for (const m of r.hidden) m.visible = true;
  const last = replayBuf[replayBuf.length - 1];
  if (last) { personApply(jens, last.jens); personApply(chaser(), last.chaser); }
}
function aimNews(seg, f, k, D) {
  const jx = f.jens[0], jy = f.jens[1], jz = f.jens[2] + D;
  const shake = (n, a) => (Math.sin(k * 37 + n) * 0.04 + Math.sin(k * 91 + n * 2) * 0.02) * a;
  newsCam.fov = 50;
  switch (seg.angle) {
    case 'heli': { // draait hoog boven hem rond
      const a = seg.a0 + k * 0.9;
      newsCam.position.set(jx + Math.sin(a) * 7, 8.5, jz + Math.cos(a) * 7 + 2);
      newsCam.lookAt(jx, jy + 0.6, jz);
      break;
    }
    case 'drone': // vliegt laag voor hem uit
      newsCam.position.set(jx * 0.6 + seg.side * 1.2, 3.4, jz - 6.5);
      newsCam.lookAt(jx, jy + 0.9, jz);
      break;
    case 'achter':
      newsCam.position.set(jx * 0.5 + 0.7, 1.35, jz + 3.6);
      newsCam.lookAt(jx, 1.0, jz - 4);
      break;
    case 'voor':
      newsCam.position.set(jx + 0.4, 1.5, jz - 3.8);
      newsCam.lookAt(jx, jy + 1.0, jz);
      break;
    case 'zij': // rijdt naast hem mee
      newsCam.position.set(seg.side * 4.6, 1.3, jz + 0.8);
      newsCam.lookAt(jx, jy + 1, jz - 0.6);
      break;
    case 'bewaking': // hangt vast aan een lantaarnpaal, draait mee
      newsCam.fov = 58;
      newsCam.position.set(seg.side * 3.9, 5.2, seg.z0);
      newsCam.lookAt(jx, jy + 0.8, jz);
      break;
    case 'deurbel': // vast in een voordeur, groothoek
      newsCam.fov = 96;
      newsCam.position.set(seg.side * 7.4, 1.5, seg.z0 + 4);
      newsCam.lookAt(jx, jy + 1, jz);
      break;
    case 'reporter': default: // staat op de stoep, uit de hand, ingezoomd
      newsCam.fov = 34;
      newsCam.position.set(seg.side * 4.3 + shake(1, 1), 1.7 + shake(2, 1), seg.z0 - 2 + shake(5, 1));
      newsCam.lookAt(jx + shake(3, 4), jy + 1.1 + shake(4, 3), jz);
      break;
  }
  newsCam.aspect = NEWS_W / NEWS_H; newsCam.updateProjectionMatrix();
}
// ---------- 2D-opmaak ----------
function newsBg(c, t) {
  const W = NEWS_W, H = NEWS_H, g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b3f94'); g.addColorStop(1, '#04214f');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = -2; i < 8; i++) { const x = ((i * 120 + t * 160) % (W + 240)) - 120; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 60, 0); c.lineTo(x - 60, H); c.lineTo(x - 120, H); c.fill(); }
}
function drawLogo(c, x, y, s) { if (naImg.complete && naImg.naturalWidth) c.drawImage(naImg, x - s / 2, y - s / 2, s, s); }
function breakingBar(c, t, job, from) {
  const W = NEWS_W, H = NEWS_H;
  if (t <= from) return;
  const s = Math.min(1, (t - from) / 0.25);
  c.fillStyle = '#d8101f'; c.fillRect(0, H * 0.8, W * s, H * 0.11);
  c.fillStyle = '#fff'; c.font = `bold ${Math.round(H * 0.055)}px Arial`; c.textAlign = 'left'; c.textBaseline = 'middle';
  if (s >= 1) c.fillText('BREAKING NEWS  ·  ' + job.head, W * 0.04, H * 0.855, W * 0.92);
}
const NEWS_INTROS = [
  // 1. klassiek: logo zoomt in, rode balk
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, e = 1 - Math.pow(1 - Math.min(1, t / 0.5), 3);
    newsBg(c, t);
    drawLogo(c, W / 2, H * 0.4, H * 0.42 * (0.3 + 0.7 * e));
    c.globalAlpha = Math.min(1, Math.max(0, (t - 0.35) / 0.3));
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(H * 0.075)}px Arial`;
    c.fillText('NIJMEGENACTUEEL', W / 2, H * 0.7);
    c.globalAlpha = 1;
    breakingBar(c, t, job, 1.0);
  },
  // 2. veeg: blauw en rood schuiven over elkaar, grote BREAKING
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#04214f'; c.fillRect(0, 0, W, H);
    const a = Math.min(1, t / 0.35), b = Math.min(1, Math.max(0, (t - 0.25) / 0.35));
    c.fillStyle = '#0b3f94'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * 1.3 * a, 0); c.lineTo(W * 1.3 * a - H * 0.6, H); c.lineTo(0, H); c.fill();
    c.fillStyle = '#d8101f'; c.beginPath(); c.moveTo(W, H * 0.35); c.lineTo(W - W * 1.2 * b, H * 0.35); c.lineTo(W - W * 1.2 * b - 40, H * 0.65); c.lineTo(W, H * 0.65); c.fill();
    if (t > 0.6) {
      const x = W / 2 + Math.max(0, 1 - (t - 0.6) / 0.2) * W;
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `italic bold ${Math.round(H * 0.17)}px Arial`; c.fillText('BREAKING', x, H * 0.5);
      c.font = `bold ${Math.round(H * 0.06)}px Arial`; c.fillText('NIEUWS UIT NIJMEGEN', x, H * 0.75);
    }
    drawLogo(c, H * 0.12, H * 0.12, H * 0.16 * Math.min(1, t / 0.4));
    breakingBar(c, t, job, 1.4);
  },
  // 3. typemachine: zwart, LIVE, de kop wordt letter voor letter getypt
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#05070c'; c.fillRect(0, 0, W, H);
    c.fillStyle = Math.floor(t * 3) % 2 ? '#ff2020' : '#8a0a0a'; c.beginPath(); c.arc(W * 0.06, H * 0.09, H * 0.02, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(H * 0.045)}px Arial`; c.fillText('LIVE', W * 0.09, H * 0.09);
    c.globalAlpha = Math.min(1, t / 0.6); drawLogo(c, W - H * 0.12, H * 0.12, H * 0.16); c.globalAlpha = 1;
    c.fillStyle = '#7fa6e6'; c.font = `${Math.round(H * 0.045)}px Arial`; c.fillText('NijmegenActueel meldt:', W * 0.08, H * 0.32);
    const txt = job.head.slice(0, Math.floor(Math.max(0, t - 0.2) * 75));
    c.fillStyle = '#fff'; c.font = `bold ${Math.round(H * 0.065)}px Courier New, monospace`;
    const words = txt.split(' '); let line = '', y = H * 0.45;
    for (const w of words) { if (c.measureText(line + w).width > W * 0.84) { c.fillText(line, W * 0.08, y); line = ''; y += H * 0.085; } line += w + ' '; }
    c.fillText(line + (Math.floor(t * 4) % 2 ? '▌' : ''), W * 0.08, y);
  },
  // 4. aftellen: ringen draaien om het logo, 3-2-1
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, g = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6);
    g.addColorStop(0, '#16326e'); g.addColorStop(1, '#020818'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.lineWidth = H * 0.012;
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = i === 1 ? '#d8101f' : 'rgba(255,255,255,.7)';
      c.beginPath(); c.arc(W / 2, H * 0.45, H * (0.24 + i * 0.05), t * (2 + i) * (i % 2 ? -1 : 1), t * (2 + i) * (i % 2 ? -1 : 1) + 4.2); c.stroke();
    }
    if (t < 1.2) {
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(H * 0.22)}px Arial`;
      c.fillText(String(3 - Math.floor(t / 0.4)), W / 2, H * 0.46);
    } else {
      drawLogo(c, W / 2, H * 0.45, H * 0.38 * Math.min(1, (t - 1.2) / 0.2));
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `bold ${Math.round(H * 0.06)}px Arial`; c.fillText('NIJMEGENACTUEEL NIEUWS', W / 2, H * 0.83);
    }
    if (Math.abs(t - 1.2) < 0.08) { c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(0, 0, W, H); }
  },
  // 5. nieuwsflits: waarschuwingsstrepen, rood knipperend vak
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#111'; c.fillRect(0, 0, W, H);
    for (const y of [0, H * 0.88]) {
      c.save(); c.beginPath(); c.rect(0, y, W, H * 0.12); c.clip();
      c.fillStyle = '#ffd400'; c.fillRect(0, y, W, H * 0.12); c.fillStyle = '#111';
      for (let x = -80 + ((t * 120) % 40); x < W + 40; x += 40) { c.beginPath(); c.moveTo(x, y + H * 0.12); c.lineTo(x + 20, y + H * 0.12); c.lineTo(x + 40, y); c.lineTo(x + 20, y); c.fill(); }
      c.restore();
    }
    drawLogo(c, W * 0.2, H * 0.48, H * 0.34 * Math.min(1, t / 0.3));
    const on = Math.floor(t * 4) % 2 === 0;
    c.fillStyle = on ? '#d8101f' : '#8a0a0a'; c.fillRect(W * 0.38, H * 0.3, W * 0.56, H * 0.24);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(H * 0.11)}px Arial`; c.fillText('NIEUWSFLITS', W * 0.66, H * 0.42);
    c.font = `${Math.round(H * 0.045)}px Arial`; c.fillText('Jens-alarm · Nijmegen-Oost', W * 0.66, H * 0.64);
    if (t > 1.3) { c.font = `bold ${Math.round(H * 0.04)}px Arial`; c.fillStyle = '#ffd400'; c.fillText(job.head, W * 0.5, H * 0.78, W * 0.9); }
  },  // 6. wereldbol: draaiende bol met lengtegraden, logo plopt erop
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, r = H * 0.3, cx = W / 2, cy = H * 0.44;
    c.fillStyle = '#020a1e'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.12})`; c.fillRect((i * 97) % W, (i * 53) % H, 2, 2); }
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r); g.addColorStop(0, '#2f7ad8'); g.addColorStop(1, '#0b2a6a');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) { const a = ((i / 8) * Math.PI + t * 1.6) % Math.PI; c.beginPath(); c.ellipse(cx, cy, Math.abs(Math.cos(a)) * r, r, 0, 0, 7); c.stroke(); }
    for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.ellipse(cx, cy + k * r, Math.sqrt(1 - k * k) * r, r * 0.12, 0, 0, 7); c.stroke(); }
    if (t > 0.9) drawLogo(c, cx, cy, r * 1.3 * Math.min(1, (t - 0.9) / 0.2));
    breakingBar(c, t, job, 1.2);
  },
  // 7. puzzel: vier stukken logo schuiven in elkaar
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, s = H * 0.46, cx = W / 2, cy = H * 0.42, k = 1 - Math.pow(1 - Math.min(1, t / 0.8), 3);
    newsBg(c, t);
    if (naImg.complete && naImg.naturalWidth) for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const ox = (qx ? 1 : -1) * W * 0.6 * (1 - k), oy = (qy ? 1 : -1) * H * 0.6 * (1 - k);
      c.drawImage(naImg, (qx * naImg.naturalWidth) / 2, (qy * naImg.naturalHeight) / 2, naImg.naturalWidth / 2, naImg.naturalHeight / 2, cx - s / 2 + qx * s / 2 + ox, cy - s / 2 + qy * s / 2 + oy, s / 2, s / 2);
    }
    if (k >= 1) { c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(H * 0.06)}px Arial`; c.fillText('ALLE STUKJES VALLEN OP Z\'N PLEK', W / 2, H * 0.75); }
    breakingBar(c, t, job, 1.2);
  },
  // 8. VHS-storing: RGB-verschuiving en strepen
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#0a0a10'; c.fillRect(0, 0, W, H);
    const sh = Math.max(0, 1 - t / 1.2) * 14;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(H * 0.12)}px Arial`;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = '#ff0040'; c.fillText('NIJMEGEN', W / 2 - sh, H * 0.38); c.fillText('ACTUEEL', W / 2 - sh, H * 0.55);
    c.fillStyle = '#00e0ff'; c.fillText('NIJMEGEN', W / 2 + sh, H * 0.38 + sh * 0.3); c.fillText('ACTUEEL', W / 2 + sh, H * 0.55 + sh * 0.3);
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) if (Math.random() < 0.5 - t * 0.2) { c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(0, Math.random() * H, W, rand(2, 12)); }
    c.fillStyle = '#fff'; c.font = `${Math.round(H * 0.04)}px Courier New, monospace`; c.textAlign = 'left'; c.fillText(`▶ PLAY   ${String(Math.floor(t * 30)).padStart(2, '0')}:00`, W * 0.05, H * 0.1);
    breakingBar(c, t, job, 1.3);
  },
  // 9. radar: groene sweep, Jens wordt gedetecteerd
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, cx = W / 2, cy = H * 0.45, r = H * 0.36;
    c.fillStyle = '#001408'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(60,255,120,.4)'; c.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(cx, cy, (r * i) / 3, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy - r); c.lineTo(cx, cy + r); c.stroke();
    const a = t * 4;
    const g = c.createLinearGradient(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.addColorStop(0, 'rgba(60,255,120,.7)'); g.addColorStop(1, 'rgba(60,255,120,0)');
    c.fillStyle = 'rgba(60,255,120,.25)'; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a - 0.5, a); c.fill();
    if (t > 0.7) { c.fillStyle = Math.floor(t * 6) % 2 ? '#ff3030' : '#ffd23f'; c.beginPath(); c.arc(cx + r * 0.45, cy - r * 0.3, 6, 0, 7); c.fill(); }
    c.fillStyle = '#3cff78'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(H * 0.05)}px Courier New, monospace`;
    if (t > 0.9) c.fillText('JENS GEDETECTEERD', W / 2, H * 0.9);
    drawLogo(c, W - H * 0.12, H * 0.12, H * 0.16);
  },
  // 10. tollende krant
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, k = Math.min(1, t / 1.1);
    c.fillStyle = '#111'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H / 2); c.rotate((1 - k) * Math.PI * 6); c.scale(0.1 + k * 0.9, 0.1 + k * 0.9);
    c.fillStyle = '#f3efe4'; c.fillRect(-W * 0.4, -H * 0.42, W * 0.8, H * 0.84);
    c.fillStyle = '#0b3f94'; c.font = `bold ${Math.round(H * 0.07)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('NijmegenActueel', 0, -H * 0.3);
    c.fillStyle = '#141414'; c.fillRect(-W * 0.36, -H * 0.22, W * 0.72, 2);
    c.font = `bold ${Math.round(H * 0.06)}px Impact, Arial`; c.fillText('JENS SLAAT WEER TOE', 0, -H * 0.08);
    c.fillStyle = '#888'; for (let i = 0; i < 5; i++) c.fillRect(-W * 0.34, H * 0.04 + i * H * 0.06, W * (0.3 + (i % 2) * 0.2), 4);
    c.restore();
    breakingBar(c, t, job, 1.3);
  },
  // 11. Waalbrug bij zonsondergang, logo komt op als de zon
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1a5a'); g.addColorStop(0.6, '#ff7b3a'); g.addColorStop(1, '#ffd27a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    drawLogo(c, W / 2, H * (0.9 - Math.min(1, t / 1.1) * 0.45), H * 0.34);
    c.fillStyle = '#1a1424'; c.fillRect(0, H * 0.72, W, H * 0.28);
    c.strokeStyle = '#1a1424'; c.lineWidth = H * 0.02; c.beginPath(); c.moveTo(W * 0.1, H * 0.72); c.quadraticCurveTo(W / 2, H * 0.2, W * 0.9, H * 0.72); c.stroke();
    c.lineWidth = 2; for (let i = 1; i < 12; i++) { const x = W * 0.1 + (W * 0.8 * i) / 12, y = H * 0.72 - Math.sin((i / 12) * Math.PI) * H * 0.26; c.beginPath(); c.moveTo(x, y); c.lineTo(x, H * 0.72); c.stroke(); }
    breakingBar(c, t, job, 1.2);
  },
  // 12. muur van lopende tickers
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#04214f'; c.fillRect(0, 0, W, H);
    c.font = `bold ${Math.round(H * 0.04)}px Arial`; c.textBaseline = 'middle'; c.textAlign = 'left';
    const txt = 'BREAKING · JENS · NIJMEGEN · NEC · DIE BEKER IS VAN ONS · ';
    for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.18)' : 'rgba(216,16,31,.5)'; const off = ((t * (80 + i * 25)) % 400) * (i % 2 ? 1 : -1); c.fillText(txt.repeat(4), off - 300, H * (0.06 + i * 0.11)); }
    c.fillStyle = 'rgba(4,33,79,.8)'; c.beginPath(); c.arc(W / 2, H * 0.45, H * 0.26, 0, 7); c.fill();
    drawLogo(c, W / 2, H * 0.45, H * 0.4 * Math.min(1, t / 0.4));
    breakingBar(c, t, job, 1.2);
  },
  // 13. vier vlakken die omklappen
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, letters = 'NIEUWS';
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const k = clamp((t - i * 0.12) / 0.3, 0, 1), w = W / 6, sx = Math.abs(Math.cos(k * Math.PI));
      c.save(); c.translate(i * w + w / 2, H * 0.42); c.scale(k < 0.5 ? sx : sx, 1);
      c.fillStyle = k < 0.5 ? '#0b3f94' : i % 2 ? '#d8101f' : '#f4f4f4'; c.fillRect(-w / 2 + 2, -H * 0.3, w - 4, H * 0.6);
      if (k >= 0.5) { c.fillStyle = i % 2 ? '#fff' : '#0b3f94'; c.font = `bold ${Math.round(H * 0.24)}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(letters[i], 0, 0); }
      c.restore();
    }
    breakingBar(c, t, job, 1.3);
  },
  // 14. klok: de wijzers vliegen rond, ding!
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, cx = W / 2, cy = H * 0.44, r = H * 0.3;
    newsBg(c, t);
    c.fillStyle = '#f4f4f4'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
    c.strokeStyle = '#0b3f94'; c.lineWidth = 5; c.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.fillStyle = '#0b3f94'; c.fillRect(cx + Math.sin(a) * r * 0.85 - 2, cy - Math.cos(a) * r * 0.85 - 2, 4, 4); }
    const sp = Math.max(0, 1.2 - t) * 20, ah = t * sp + 0.3, am = t * sp * 12;
    c.strokeStyle = '#141414'; c.lineCap = 'round';
    c.lineWidth = 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(ah) * r * 0.5, cy - Math.cos(ah) * r * 0.5); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(am) * r * 0.75, cy - Math.cos(am) * r * 0.75); c.stroke();
    c.fillStyle = '#d8101f'; c.beginPath(); c.arc(cx, cy, 5, 0, 7); c.fill();
    if (t > 1.2) { c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `bold ${Math.round(H * 0.06)}px Arial`; c.fillText('HET IS TIJD VOOR HET NIEUWS', W / 2, H * 0.84); }
  },
  // 15. spotlight op een donker podium
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H, x = W / 2 + Math.cos(t * 2.4) * W * 0.35 * Math.max(0, 1 - t / 1.2);
    c.fillStyle = '#05060a'; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(x, H * 0.45, 10, x, H * 0.45, H * 0.45); g.addColorStop(0, 'rgba(255,245,210,.85)'); g.addColorStop(1, 'rgba(255,245,210,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.beginPath(); c.arc(x, H * 0.45, H * 0.3, 0, 7); c.clip(); drawLogo(c, W / 2, H * 0.45, H * 0.42); c.restore();
    if (t > 1.2) { c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `bold ${Math.round(H * 0.055)}px Arial`; c.fillText('EN NU… HET NIEUWS', W / 2, H * 0.85); }
  },
  // 16. confetti-nieuws
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    newsBg(c, t);
    for (let i = 0; i < 80; i++) { const sx = (i * 131) % W, sy = ((i * 71) % H) + t * (60 + (i % 7) * 30) - 40; c.fillStyle = ['#ffd23f', '#d8101f', '#3bd16a', '#4dd2ff', '#fff'][i % 5]; c.fillRect(sx, sy % (H + 20), 6, 4); }
    drawLogo(c, W / 2, H * 0.4, H * 0.38 * (1 + Math.sin(t * 9) * 0.04));
    c.fillStyle = '#ffd23f'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${Math.round(H * 0.07)}px Arial`; c.fillText('FEESTELIJK NIEUWS!', W / 2, H * 0.72);
    breakingBar(c, t, job, 1.3);
  },
  // 17. stempel: BREAKING klapt met een dreun op het scherm
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#e8e2d2'; c.fillRect(0, 0, W, H);
    drawLogo(c, W * 0.15, H * 0.15, H * 0.18);
    const k = clamp((t - 0.5) / 0.15, 0, 1), s = 3 - k * 2;
    if (t > 0.5) {
      const sh = t < 0.75 ? rand(-6, 6) : 0;
      c.save(); c.translate(W / 2 + sh, H * 0.46 + sh); c.rotate(-0.12); c.scale(s, s); c.globalAlpha = k;
      c.strokeStyle = '#c8101a'; c.lineWidth = 6; c.strokeRect(-W * 0.3, -H * 0.12, W * 0.6, H * 0.24);
      c.fillStyle = '#c8101a'; c.font = `bold ${Math.round(H * 0.15)}px Impact, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BREAKING', 0, 4);
      c.restore(); c.globalAlpha = 1;
    }
    if (t > 1.1) { c.fillStyle = '#141414'; c.textAlign = 'center'; c.font = `bold ${Math.round(H * 0.045)}px Georgia, serif`; c.fillText(job.head, W / 2, H * 0.82, W * 0.9); }
  },
  // 18. kaart van Nijmegen met een vallende pin
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#e8eadf'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#9ec8e8'; c.beginPath(); c.moveTo(0, H * 0.18); c.bezierCurveTo(W * 0.3, H * 0.1, W * 0.6, H * 0.28, W, H * 0.16); c.lineTo(W, 0); c.lineTo(0, 0); c.fill(); // de Waal
    c.strokeStyle = '#fff'; c.lineWidth = 6; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(0, H * (0.3 + i * 0.1)); c.lineTo(W, H * (0.28 + i * 0.11) + Math.sin(i) * 20); c.stroke(); c.beginPath(); c.moveTo(W * (0.1 + i * 0.14), H * 0.2); c.lineTo(W * (0.05 + i * 0.15), H); c.stroke(); }
    c.fillStyle = '#b9d8a0'; c.fillRect(W * 0.62, H * 0.55, W * 0.18, H * 0.2); // Goffertpark
    const y = H * 0.5 - Math.max(0, 1 - t / 0.6) * H * 0.6;
    c.fillStyle = '#d8101f'; c.beginPath(); c.arc(W * 0.42, y - 18, 14, 0, 7); c.fill(); c.beginPath(); c.moveTo(W * 0.42 - 10, y - 12); c.lineTo(W * 0.42, y); c.lineTo(W * 0.42 + 10, y - 12); c.fill();
    if (t > 0.7) { c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(W * 0.46, H * 0.4, W * 0.42, H * 0.1); c.fillStyle = '#fff'; c.font = `bold ${Math.round(H * 0.045)}px Arial`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('📍 ' + (job.street || 'Nijmegen-Oost'), W * 0.48, H * 0.45, W * 0.38); }
    drawLogo(c, W - H * 0.12, H * 0.88, H * 0.16);
  },
  // 19. tunnel van vierkanten naar het midden
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) { const k = ((i / 12) + t * 0.8) % 1, s = Math.pow(k, 2) * W * 1.2; c.strokeStyle = i % 2 ? '#0b3f94' : '#d8101f'; c.lineWidth = 2 + k * 10; c.strokeRect(W / 2 - s / 2, H / 2 - (s * H) / W / 2, s, (s * H) / W); }
    drawLogo(c, W / 2, H / 2, H * 0.36 * Math.min(1, t / 0.8));
    breakingBar(c, t, job, 1.3);
  },
  // 20. oude tv springt aan
  (c, t, job) => {
    const W = NEWS_W, H = NEWS_H;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (t < 0.25) { const k = t / 0.25; c.fillStyle = '#fff'; c.fillRect(W * (0.5 - k / 2), H / 2 - 2, W * k, 4); return; }
    const k = Math.min(1, (t - 0.25) / 0.2), h = H * k;
    c.save(); c.beginPath(); c.rect(0, H / 2 - h / 2, W, h); c.clip();
    if (t < 0.8) { for (let i = 0; i < 300; i++) { c.fillStyle = Math.random() < 0.5 ? '#ddd' : '#333'; c.fillRect(Math.random() * W, Math.random() * H, 4, 3); } }
    else { newsBg(c, t); drawLogo(c, W / 2, H * 0.42, H * 0.4); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `bold ${Math.round(H * 0.06)}px Arial`; c.fillText('KANAAL 1 · NIJMEGENACTUEEL', W / 2, H * 0.78); }
    c.restore();
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  },
];
// alle intro's om de beurt in een gehusselde volgorde, nooit twee keer dezelfde achter elkaar
function nextNewsIntro() {
  let bag = Array.isArray(save.newsBag) ? save.newsBag.filter((i) => i < NEWS_INTROS.length) : [];
  if (!bag.length) {
    bag = NEWS_INTROS.map((_, i) => i).sort(() => Math.random() - 0.5);
    if (bag[bag.length - 1] === save.newsLast && bag.length > 1) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  const i = bag.pop();
  save.newsBag = bag; save.newsLast = i; persist();
  return i;
}
function newsIntro(c, t, job) {
  NEWS_INTROS[job.intro](c, t, job);
  if (t < 0.1) { c.fillStyle = `rgba(255,255,255,${1 - t / 0.1})`; c.fillRect(0, 0, NEWS_W, NEWS_H); }
}
function newsOutro(c, t) {
  const W = NEWS_W, H = NEWS_H;
  newsBg(c, t + 3);
  drawLogo(c, W / 2, H * 0.38, H * 0.34);
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `bold ${Math.round(H * 0.07)}px Arial`; c.fillText('nijmegenactueel.nl', W / 2, H * 0.68);
  c.font = `${Math.round(H * 0.042)}px Arial`; c.fillStyle = '#bcd0f0'; c.fillText('Meer nieuws uit Nijmegen-Oost', W / 2, H * 0.78);
  c.font = `${Math.round(H * 0.03)}px Arial`; c.fillStyle = 'rgba(255,255,255,.5)'; c.fillText('een Jens Run-uitzending', W / 2, H * 0.92);
  if (t > OUTRO - 0.5) { c.fillStyle = `rgba(0,0,0,${Math.min(1, (t - (OUTRO - 0.5)) / 0.5)})`; c.fillRect(0, 0, W, H); }
}
function newsOverlay(c, job, seg, n, k, t) {
  const W = NEWS_W, H = NEWS_H, u = H / 360;
  c.textBaseline = 'middle';
  // logo-bug linksboven
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(8 * u, 8 * u, 150 * u, 34 * u);
  drawLogo(c, 25 * u, 25 * u, 28 * u);
  c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `bold ${12 * u}px Arial`; c.fillText('NijmegenActueel', 44 * u, 25 * u);
  // REPLAY + camera rechtsboven
  c.textAlign = 'right';
  c.fillStyle = Math.floor(t * 2) % 2 ? '#ff3030' : '#b81010';
  c.beginPath(); c.arc(W - 78 * u, 20 * u, 5 * u, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.font = `bold ${13 * u}px Arial`; c.fillText('REPLAY', W - 10 * u, 20 * u);
  c.font = `${10 * u}px Arial`; c.fillText(`CAM ${n} · ${NEWS_ANGLES[seg.angle]}`, W - 10 * u, 36 * u);
  // onderbalk: breaking news + kop + lopende tekst
  const y = H - 74 * u;
  c.fillStyle = '#d8101f'; c.fillRect(0, y, 112 * u, 30 * u);
  c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `bold ${12 * u}px Arial`; c.fillText('BREAKING NEWS', 8 * u, y + 15 * u);
  c.fillStyle = 'rgba(255,255,255,.95)'; c.fillRect(112 * u, y, W - 112 * u, 30 * u);
  c.fillStyle = '#0b1f45'; c.font = `bold ${14 * u}px Arial`; c.fillText(job.head, 120 * u, y + 15 * u, W - 128 * u);
  c.fillStyle = '#0b3f94'; c.fillRect(0, y + 30 * u, W, 22 * u);
  c.fillStyle = '#fff'; c.font = `${11 * u}px Arial`;
  const tw = c.measureText(job.ticker).width, tx = 8 * u - ((t * 70 * u) % (tw + 40 * u));
  c.fillText(job.ticker, tx, y + 41 * u); c.fillText(job.ticker, tx + tw + 40 * u, y + 41 * u);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.textAlign = 'right'; c.font = `bold ${9 * u}px Arial`; c.fillText('JENS RUN', W - 8 * u, H - 9 * u);
  // overgang naar een nieuwe hoek: korte witte flits
  if (k < 0.04) { c.fillStyle = `rgba(255,255,255,${0.8 * (1 - k / 0.04)})`; c.fillRect(0, 0, W, H); }
  if (seg.angle === 'bewaking' || seg.angle === 'deurbel') {
    c.fillStyle = 'rgba(0,0,0,.14)'; for (let i = 0; i < H; i += 3) c.fillRect(0, i, W, 1);
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `${10 * u}px Courier New, monospace`;
    c.fillText(`${seg.angle === 'deurbel' ? 'VOORDEUR' : 'CAM 07'}  ${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(Math.floor(d.getSeconds() + t) % 60)}`, 10 * u, 56 * u);
  }
  if (seg.angle === 'deurbel') {
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
}
// ---------- geluid: jingle, onderlaag en de klap ----------
async function newsAudio(job) {
  if (typeof AudioEncoder === 'undefined' || typeof OfflineAudioContext === 'undefined') return null;
  // AAC waar het kan, anders Opus (sommige browsers kunnen geen AAC maken); zonder geluid alleen als beide niet gaan
  let acfg = null;
  for (const c of [{ codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 1, bitrate: 96000, mux: 'aac' }, { codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 96000, mux: 'opus' }]) {
    try { const { mux, ...cfg } = c; if ((await AudioEncoder.isConfigSupported(cfg)).supported) { acfg = cfg; acfg.mux = mux; break; } } catch (e) { /* volgende proberen */ }
  }
  if (!acfg) return null;
  const sr = acfg.sampleRate, oc = new OfflineAudioContext(1, Math.ceil(job.dur * sr), sr), out = oc.createGain();
  out.gain.value = 0.8; out.connect(oc.destination);
  const tone = (f, t0, d, type, v, f1) => {
    const o = oc.createOscillator(), g = oc.createGain(), lp = oc.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + d);
    lp.type = 'lowpass'; lp.frequency.value = 2200;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(lp).connect(g).connect(out); o.start(t0); o.stop(t0 + d + 0.05);
  };
  const noiseAt = (t0, d, v, freq, type = 'lowpass') => {
    const buf = oc.createBuffer(1, Math.floor(sr * d), sr), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2);
    const s = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain();
    s.buffer = buf; f.type = type; f.frequency.value = freq; g.gain.value = v;
    s.connect(f).connect(g).connect(out); s.start(t0);
  };
  const chord = (t0, fs, d, v) => fs.forEach((f) => { tone(f, t0, d, 'sawtooth', v); tone(f * 1.005, t0, d, 'square', v * 0.5); });
  // de nieuwstune loopt onder de hele uitzending door
  try {
    newsSong ||= await fetch('audio/news-intro.mp3').then((r) => r.arrayBuffer());
    const song = await oc.decodeAudioData(newsSong.slice(0));
    const src = oc.createBufferSource(), g = oc.createGain();
    src.buffer = song; g.gain.value = 1.1;
    g.gain.setValueAtTime(1.1, Math.max(0, job.dur - 0.9)); g.gain.linearRampToValueAtTime(0, job.dur); // korte fade-out
    src.connect(g).connect(oc.destination); src.start(0);
  } catch (e) { /* liedje niet geladen: dan zonder */ }
  for (const s of job.segs) {
    noiseAt(s.t0, 0.35, 0.15, 1200, 'bandpass'); // swoosh
    if (s.deathAt !== null) { noiseAt(s.deathAt, 0.6, 0.45, 2500); tone(130, s.deathAt, 0.6, 'sine', 0.4, 38); }
  }
  const buf = await oc.startRendering();
  return { buf, acfg };
}
// ---------- de klus: plannen en in stukjes afwerken in de tekenlus ----------
// =====================================================================
//  NIJMEGENACTUEEL-KOPPEN: honderden sjablonen zodat het nieuws vers blijft
//  {s} straat · {p} score · {m} meters · {c} achtervolger · {b} bekers · {u} uur · {n} willekeurig getal
// =====================================================================
const KOP = {
  algemeen: [
    'Jens opnieuw gesignaleerd op de {s}', 'Buurt in rep en roer: Jens rent door de {s}', 'Politie zoekt getuigen van chaos op de {s}', 'Jens breekt opnieuw alle records op de {s}',
    'Bewoners {s} slapen slecht door rennende jongen', 'Wéér Jens. Wéér de {s}', '{c} geeft niet op: achtervolging op de {s}', 'Nijmegen houdt adem in: Jens op de vlucht',
    'Rennende jongen haalt {p} punten op de {s}', 'Jens legt {m} meter af voor de klap', 'Getuigen: "Hij was zo snel weg"', 'Wie stopt Jens? Niemand, blijkt op de {s}',
    'Jens laat spoor van chaos achter op de {s}', 'Gemeente overweegt Jens-vrije zone op de {s}', 'Toeristen filmen rennende Nijmegenaar', 'Jens is terug, en hoe',
    'Stille avond op de {s}? Niet met Jens', 'Bekers verdwijnen massaal van de {s}', '{b} bekers zoek na actie Jens', 'Jens zet de {s} op z\'n kop',
    'Nieuw hoofdstuk in de saga van Jens', 'Jens trekt sprint door half Nijmegen', 'De {s} is nooit meer hetzelfde', 'Breaking: Jens rent weer',
    'Recordpoging Jens eindigt abrupt', 'Hardloopwedstrijd? Nee, gewoon Jens', 'Jens en {c} zorgen voor opschudding', 'Bewoners delen massaal beelden van Jens',
    'Snelste jongen van Nijmegen slaat weer toe', 'Jens houdt heel Oost wakker', 'Is Jens het nieuwe icoon van Nijmegen?', 'Burgemeester "niet verbaasd" over Jens',
    'Jens rent, Nijmegen kijkt', 'Opnieuw onrust rond de {s}', 'Jens: "Ik moest gewoon even rennen"', 'Ooggetuige: "Ik zag alleen een witte schim"',
    'Nijmegen verbijsterd door snelheid Jens', '{m} meter rennen, en toen ging het mis', 'Jens zorgt voor file op de {s}', 'Duiven op de {s} geschrokken door Jens',
    'Jens weer onderwerp van gesprek in de kroeg', 'Hoe ver komt Jens vandaag?', 'Jens scoort {p} punten en een hoop boze buren', 'De dag dat de {s} stil viel',
    'Rennende tiener verbaast voorbijgangers', 'Jens-alarm afgegaan in Nijmegen-Oost', 'Zelfs de NEC-supporters keken op', 'Bekertje hier, bekertje daar: Jens verzamelt',
    'Jens wint niet, maar niemand vergeet hem', 'Burenruzie op de {s} door Jens', 'Opnieuw chaos, opnieuw Jens', 'Nijmegen telt {m} meter Jens-terreur',
    'Jens laat {c} zweten op de {s}', 'Is dit de snelste run van het jaar?', 'Jens rent zichzelf de geschiedenisboeken in', 'Lokale held of plaaggeest? Jens verdeelt de stad',
    'Jens stuit op obstakel op de {s}', 'Jongen in wit shirt houdt stad in de greep', 'Grote schrik op de {s}', 'Jens gaat viraal (weer)',
    'Iedereen praat over Jens en de {s}', 'Spectaculaire beelden van de {s}', 'Exclusief: zo ging Jens onderuit', 'Na {m} meter was het over',
    'Kroegbaas {s}: "Hij kwam niet eens binnen"', 'Hondenuitlaters {s} in paniek', 'Schoolkinderen juichen voor Jens', 'Jens laat bekers achter voor de volgende',
    'Waalkade hoort het nieuws: Jens weer bezig', 'Stevenstoren ziet alles: Jens op de {s}', 'Jens vliegt over de {s}', 'De stoep van de {s} heeft het zwaar',
    'Stad discussieert: moet Jens een rijbewijs voor rennen?', 'Stoeptegels {s} beschadigd na Jens-actie', 'Jens: een fenomeen in Nijmegen', 'Vandaag in het nieuws: (alweer) Jens',
    'Avondklok voor Jens? Gemeente ontkent', 'Jens-route trekt nieuwsgierigen', 'Fietsers wijken uit voor Jens', 'Snackbar {s} verkoopt "Jens-frikandel"',
    'NEC overweegt Jens als spits', 'Jens ontsnapt bijna, maar net niet', 'De {s} herstelt van bezoek Jens', 'Jens maakt van gewone dinsdag een feest',
    'Nijmegen trots én bezorgd', 'Jens loopt harder dan de stadsbus', 'Gemeenteraad bespreekt "het Jens-probleem"', 'Ook vandaag geen dag zonder Jens',
    'Jens: altijd onderweg, nooit op tijd', 'Opa (84) op de {s}: "Zo snel was ik nooit"', 'Brandweer rukt uit, maar het was gewoon Jens', 'Live: de gevolgen van Jens op de {s}',
    'Jens neemt {b} bekers mee naar huis', 'Wat bezielde Jens op de {s}?', 'Experts verbaasd over loopstijl Jens', 'Sportdokter: "Jens moet even rusten"',
    'Jens vergeet weer even te remmen', 'Wie heeft Jens gezien? Bijna iedereen', 'Breaking: {p} punten op de teller', 'Bewoners {s} willen verkeersdrempel tegen Jens',
    'Rennen, springen, glijden: Jens doet alles', 'De legende van Jens groeit', 'Jens blijft Nijmegen verrassen', 'Weer een nieuw record? Bijna',
    'Jens en de {s}: het blijft botsen', 'Nachtelijke sprint schudt buurt wakker', 'Jens: "Volgende keer haal ik het"', 'Nijmegenaren zetten stoeltjes klaar voor Jens',
    'De run van {u}:{n} gaat de boeken in', 'Jens zorgt voor gespreksstof bij de bakker', 'Ook Lent hoorde het: Jens in Oost', 'Zelfs Arnhem kijkt mee naar Jens',
    'Jens: de snelste plaaggeest van de stad', 'Opnieuw veel bekijks op de {s}', 'Jens laat zich niet stoppen, tot nu', 'Rennende jongen breekt stilte op de {s}',
    'Nieuws uit Oost: Jens heeft het weer gedaan', 'Gaat Jens ooit wandelen?', 'Hollen of stilstaan: Jens kiest altijd hollen', 'Jens-fans verzamelen zich op de {s}',
    'Jens laat zijn sporen na in Nijmegen', 'Meer dan {m} meter vol actie', 'Jens wordt een begrip in de {s}', 'Jens ten val op de {s}, buurt bezorgd',
    'Wekker niet nodig: Jens rende langs', 'Iedereen opzij, Jens komt eraan', 'Vlak voor de finish ging het mis', 'Run van Jens eindigt in drama',
    'Jens weer volop in het nieuws', 'De {s} heeft een nieuwe legende', 'Jens-koorts grijpt om zich heen', 'Stille straat, luide jongen',
    'Die beker is van ons, zegt Jens. Op de {s}', 'Jens toont lef op de {s}', 'Nijmegen-Oost: hoofdstad van de chaos', 'Jens maakt er weer een show van',
    'Een gewone avond werd een Jens-avond', 'Jens verrast vriend en vijand', '{c} hijgend achter Jens aan', 'Twee mannen, één straat: {c} tegen Jens',
    'Jens zet {c} voor schut', 'Nieuwe aflevering: Jens tegen de wereld', 'Is Jens de snelste van Gelderland?', 'Jens even uitgeteld na wilde run',
    'De Goffert hoorde het geschreeuw tot daar', 'Jens rent, rent, rent… en stopt', 'Run van {p} punten eindigt op de {s}', 'Jens gaat te ver op de {s}',
  ],
  gat: [
    'Jens verdwijnt in gat op de {s}', 'Gemeente: "Dat gat lag er al weken"', 'Gat in de {s} slokt Jens op', 'Jens ziet gat te laat',
    'Wegwerkzaamheden eisen slachtoffer: Jens', 'Jens valt in de diepte op de {s}', 'Put op de {s} wordt Jens fataal', 'Waar is Jens? In een gat',
    'Gemeente sluit gat na val Jens', 'Jens springt net niet ver genoeg', 'Valpartij: Jens en het gat op de {s}', 'Boze buren: "We zeiden al dat dat gat gevaarlijk was"',
    'Jens tuimelt in gat, {c} kijkt toe', 'Na {m} meter: plof, weg was Jens', 'Gat in de weg, gat in de run', 'Wethouder belooft gaten te dichten na val Jens',
    'Jens ontdekt de onderkant van de {s}', 'Jens kopje-onder op de {s}', 'Diepe val voor Jens', 'Het gat won, Jens verloor',
    'Jens maakt kennis met het riool', 'Oranje kegels hielpen niet: Jens in gat', 'Rioolwerkers vinden Jens', 'Jens vergeet te springen',
    'Gat op de {s} krijgt bijnaam "het Jens-gat"', 'Was het een gat of een val? Jens weet het niet', 'Jens zakt door de {s}', 'Graafwerk wordt Jens te veel',
    '"Ik keek even naar m\'n telefoon," aldus Jens', 'Jens heeft nu een eigen gat', 'Jens verdwijnt spoorloos (in een gat)', 'Ook {c} schrok van de val',
    'Gat verandert run in drama', 'Toeschouwers horen alleen een plof', 'Jens valt, de {s} lacht', 'Stoep gaat open, Jens gaat erin',
    'Nijmegen telt één gat en één Jens minder', 'Jens springt, mist, valt', 'Laatste stap van Jens: de diepte in', 'Het gat aan de {s} is nu beroemd',
  ],
  auto: [
    'Jens knalt op foutgeparkeerde auto op de {s}', 'Auto op de {s} stopt Jens abrupt', 'Parkeerprobleem {s} wordt Jens fataal', 'Jens versus auto: auto wint',
    'Boze automobilist vindt Jens op z\'n motorkap', 'Jens maakt deuk in auto op de {s}', 'Handhaving: "Auto stond fout, Jens ook"', 'Botsing op de {s}: jongen tegen auto',
    'Jens ziet geparkeerde auto over het hoofd', 'Eigenaar auto: "Mijn auto heeft nu een Jens-vorm"', 'Jens landt op dak van auto', 'Autoalarm gaat af na actie Jens',
    'Parkeerplaats {s} wordt eindstation voor Jens', 'Jens knalt, auto toetert', 'Autoschade na wilde run van Jens', 'Jens neemt de auto net niet',
    'Dubbel geparkeerd en daar kwam Jens', 'Verzekeraar zoekt uit: wie betaalt de Jens-deuk?', 'Jens rent zich vast tegen auto', 'Na {m} meter: BOEM, auto',
    'Auto op de {s} verliest spiegel én Jens zijn run', 'Automobilist {s}: "Ik zat er nog in!"', 'Jens weer slachtoffer van slecht parkeren', 'Gemeente gaat parkeren op de {s} aanpakken',
    'Jens en auto in innige omhelzing', 'Wie parkeert er nou midden op de {s}?', 'Jens: "Die auto stond er net nog niet"', '{c} pakt Jens bij de auto',
    'Kras op de lak, kras op Jens', 'Jens test kreukelzone op de {s}', 'Autodeur blijkt sterker dan Jens', 'Jens maakt kennis met bumper',
    'Toeterende buurt na botsing Jens', 'Motorkap {s} draagt sporen van Jens', 'Jens stopt pas bij de auto', 'Auto 1, Jens 0',
    'Parkeerboete én Jens op de {s}', 'Jens klapt tegen stilstaande auto', 'Botsing legt verkeer {s} stil', 'Een auto. Jens. De rest is geschiedenis',
  ],
  afzetting: [
    'Jens rent dwars door wegafzetting', 'Werk in uitvoering, Jens ook', 'Afzetting op de {s} houdt Jens tegen', 'Jens negeert bord "weg afgesloten"',
    'Wegwerkers verbaasd over Jens', 'Rood-wit lint geen partij voor Jens, hek wel', 'Jens knalt op afzetting {s}', 'Bouwvakkers lachen om val Jens',
    'Omleiding? Jens koos de afzetting', 'Hek op de {s} sterker dan gedacht', 'Jens: "Ik dacht dat ik eroverheen kon"', 'Afzetting wint van Jens',
    'Wegwerkzaamheden {s} lopen vertraging op door Jens', 'Jens neemt hek mee in z\'n val', 'Na {m} meter: hek', 'Afgesloten weg, open einde',
    'Jens vliegt over afzetting, landt verkeerd', 'Bord "Let op" niet gelezen door Jens', 'Jens en de afzetting: geen goede combinatie', 'Stratenmakers maken pauze om Jens te helpen',
    'Gemeente zet extra hekken neer na Jens', 'Jens rent tegen de lamp, of eigenlijk een hek', 'Ook {c} schrok van de knal', 'Wegafzetting {s} beschadigd',
    'Jens op zijn plek gezet door een hek', 'Afgesloten, ook voor Jens', 'Jens test stevigheid van bouwhek', 'Bouwput {s} krijgt onverwacht bezoek',
    'Lint, hek, Jens: in die volgorde', 'Jens: "Waarom staat dat hek daar?"', 'Klap tegen afzetting maakt einde aan run', 'Afzetting {s} krijgt een selfie met Jens',
    'Jens springt, hek blijft staan', 'Gemeente: "Afzetting doet wat het moet doen"', 'Run eindigt bij werkzaamheden', 'Jens vergeet dat er gewerkt wordt',
    'Werkverkeer {s} stilgelegd na actie Jens', 'Afzetting houdt de buurt veilig, en Jens stil', 'Jens tegen de afzetting: een harde les', 'Wegwerker: "Dit hebben we nog nooit gezien"',
  ],
  gepakt: [
    '{c} heeft Jens te pakken op de {s}', 'Na {m} meter is het voorbij: gepakt', 'Jens in de kraag gevat', '{c} wint de wedstrijd van Jens',
    'Achtervolging op de {s} eindigt met aanhouding', 'Jens net niet snel genoeg', '{c}: "Ik had hem al lang zien aankomen"', 'Eindelijk: {c} pakt Jens',
    'Jens gestopt door {c}', 'Het spel is uit voor Jens', 'Hijgende {c} grijpt Jens', 'Jens verliest race tegen {c}',
    'Nijmegen ziet {c} triomferen', 'Jens moet zich gewonnen geven', '{c} juicht op de {s}', 'Jens tegen {c}: 0-1',
    'Gepakt! De {s} zag het gebeuren', 'Jens zat te dichtbij, en toen', '{c} krijgt applaus van omstanders', 'Jens even te traag, {c} even te snel',
    'Grote opluchting bij {c}', 'Jens: "Hij was gewoon sneller vandaag"', 'Arm om de schouder, en weg was de vrijheid', 'Het einde van een wilde jacht op de {s}',
    '{c} na de vangst: "Wat een jongen"', 'Run van Jens stopt bij {c}', 'Jens loopt in de val van {c}', '{c} haalt Jens in op de {s}',
    'Na {p} punten was het klaar', 'Jens kijkt verbaasd om: daar is {c}', 'Ontsnapping mislukt', 'De jager wint deze keer',
    '{c} trakteert zichzelf op een frietje', 'Jens wordt meegenomen op de {s}', '{c} pakt Jens bij z\'n shirt', 'Uitgerend: Jens gepakt',
    'De achtervolger heeft gewonnen', 'Jens kan geen kant meer op', 'Op heterdaad: {c} pakt Jens', 'Het spel is gespeeld op de {s}',
  ],
  botsing: [
    'Jens botst frontaal op de {s}', 'Harde klap op de {s}', 'Jens loopt ergens keihard tegenaan', 'Botsing maakt einde aan run Jens',
    'BOEM! De {s} schrikt wakker', 'Jens ziet obstakel te laat', 'Onverwachte klap voor Jens', 'Jens: "Wat was dat?!"',
    'Ooggetuigen horen harde knal op de {s}', 'Jens ramt alles wat in de weg staat', 'Niet opgelet, hard geraakt', 'Klap op de {s} stopt Jens',
    'Jens vergeet uit te wijken', 'Run eindigt met een dreun', 'Botsing in Oost: Jens betrokken', 'Na {m} meter: frontaal',
    'Jens en een obstakel: geen goede vrienden', 'Pijnlijk einde op de {s}', 'Buurt hoort de klap tot de Goffert', 'Jens tegen de lamp gelopen',
    'Hard, harder, Jens', 'Obstakel op de {s} houdt stand', 'Jens zag sterretjes op de {s}', 'Botsing schudt buurt wakker',
    'Jens stuitert terug van obstakel', 'Een knal, een kreet, een einde', 'Jens remt te laat op de {s}', 'De {s} heeft een deuk erbij',
    'Jens maakt harde landing', 'Wie zette dat daar neer? vraagt Jens zich af', 'Jens krijgt een flinke tik', 'Run abrupt beëindigd na klap',
    'Jens tegen de {s}: 0-1', 'De straat won het van Jens', 'Hevige klap legt Jens stil', 'Jens: "Volgende keer kijk ik beter"',
    'Klap op de {s} hoorbaar tot in Lent', 'Jens loopt zich vast', 'Obstakel 1, Jens 0', 'Een harde les op de {s}',
  ],
  vlucht: [
    'Jens vliegt drie postcodes ver na crash op de fiets', 'Snappen op de fiets loopt slecht af', 'Jens vertrok in 6522, landde ergens anders', 'Telefoon filmde alles: Jens vliegt',
    'Snapchat-crash: Jens lanceert zichzelf', 'Fiets blijft liggen, Jens vliegt door', 'Jens maakt luchtreis boven de {s}', 'Beelden van vliegende Jens gaan rond',
    'Schiphol? Nee, gewoon de {s}', 'Jens ontdekt de wetten van de zwaartekracht', 'Fietsen en snappen: geen goed idee', 'Jens landt meters verder',
    'Vliegende jongen gespot boven Oost', 'Jens kiest de luchtweg na botsing', 'Telefoon nog aan, Jens al weg', 'Crash op de fiets: Jens in de lucht',
    'Het laatste snapje van Jens', 'Jens filmt zijn eigen vlucht', 'Luchtverkeersleiding verbaasd over Jens', 'Fietser vliegt over de {s}',
    'Jens maakt de langste sprong ooit (onvrijwillig)', 'Ooggetuige: "Hij vloog over m\'n schutting"', 'Snap van het jaar: Jens in de lucht', 'Fiets kapot, telefoon kapot, Jens ok(ish)',
    'Jens: "Ik wilde alleen een snapje maken"', 'Na {m} meter fietsen: lancering', 'Postbode vindt Jens drie straten verder', 'De fiets ligt nog op de {s}',
    'Jens bewijst: snappen tijdens fietsen is gevaarlijk', 'Jens verlaat de aarde even', 'Opgestegen op de {s}, geland in een tuin', 'Snapchat-streak eindigt dramatisch',
    'Vluchtnummer JR-{n}: Jens', 'Jens en zijn fiets gaan elk een eigen kant op', 'Duiven kijken op: wie vliegt daar?', 'Jens wordt even astronaut',
    'De snap die nooit verstuurd werd', 'Jens vliegt langs de Stevenstoren', 'Telefoon in de hand, Jens in de lucht', 'Een vlucht die niemand vergeet',
  ],
  gevloerd: [
    'Vrouw met hond vloert Jens op de {s}', 'Hond blaft, vrouw grijpt, Jens ligt', 'Wandelende vrouw stopt Jens', 'Jens gevloerd door hondenbezitter',
    'Hond en baasje winnen van Jens', 'Rustige wandeling wordt actiefilm', 'Jens onderschat vrouw met hond', 'Vrouw (en hond) helden van de {s}',
    'Labrador houdt Jens tegen', 'Jens struikelt over hondenriem', 'Vrouw: "Ik pakte hem gewoon"', 'Jens ligt op de stoep na tackle',
    'Hondenuitlaatservice wordt Jens-stopservice', 'Jens krijgt tackle van wandelaar', 'Buurtbewoonster pakt Jens in één beweging', 'Hond kwispelt, Jens ligt',
    'Jens gevloerd: de video gaat viraal', 'Vrouw met hond doet wat niemand lukte', 'Jens loopt in de armen van hondenbezitter', 'Riem, hond, vrouw, Jens: einde',
    'Jens en de hond: liefde op het eerste gezicht? Nee', 'Wandelaarster {s} krijgt applaus', 'Jens tegen de grond gewerkt', 'Hond verdient extra koekje',
    'Jens: "Die hond was sneller dan ik"', 'De {s} heeft een nieuwe heldin', 'Vrouw met hond: "Zo, dat was dat"', 'Jens gaat onderuit door hondenriem',
    'Avondwandeling eindigt met tackle', 'Jens krijgt lik van hond na val', 'Hondenbezitters van Nijmegen zijn er klaar voor', 'Jens verrast door snelle wandelaarster',
    'Vrouw grijpt in: Jens ligt', 'Jens gevloerd na {m} meter', 'Hond en baasje sluiten de {s} af', 'Een tackle om nooit te vergeten',
    'Jens maakt kennis met de stoep', 'Hond blaft, Nijmegen lacht', 'Vrouw met hond houdt de buurt veilig', 'Jens wordt gevloerd, hond wordt held',
  ],
  ticker: [
    'Buurtbewoners: "We kennen hem wel"', 'Politie: "We zijn op de hoogte"', 'Snackbar meldt recordomzet', 'Stevenskerk luidt de klokken (toevallig)',
    'Weerbericht: kans op Jens 90%', 'NEC wint met 2-0', 'Waalbrug even dicht voor onderhoud', 'Gemeente plant extra bankjes op de {s}',
    'Duivenvereniging klaagt over onrust', 'Vierdaagse-wandelaars trainen al', 'Nieuwe frietzaak open in Oost', 'Bekers gevonden in de Waal',
    'Lokale bakker noemt brood naar Jens', 'Opa (91) wint dammen in buurthuis', 'Fietsendief opgepakt in centrum', 'Glasbak {s} weer vol',
    'Parkeerplekken {s} blijven schaars', 'Verkeersdrempel {s} ter discussie', 'Supporters NEC verzamelen voor uitwedstrijd', 'Basisschool houdt sportdag',
    'Kermis komt eraan', 'Regen verwacht vanavond', 'Zonnig weekend op komst', 'Jens: "Geen commentaar"',
    'Reactie {c}: "Volgende keer pak ik hem"', 'Score van deze run: {p}', 'Afgelegde afstand: {m} meter', 'Verzamelde bekers: {b}',
    'Wijkagent {s}: "Ik zag niks"', 'Hondenbezitters gewaarschuwd', 'Kinderen spelen Jens-tikkertje', 'Lantaarnpaal {s} heeft nieuwe NEC-sticker',
    'Sneeuw voorspeld? Nee hoor', 'Toeristen vragen naar "die rennende jongen"', 'Buurtapp {s} ontploft', 'Kapper {s}: "Hij kwam niet voor z\'n afspraak"',
    'Plus Walraven zoekt nieuwe vakkenvuller', 'Montessori College: "Jens, kom even langs"', 'Shane wacht nog op de telefoon', 'Patrick: "Mijn brommer is sneller"',
    'Tim: "Die beker is van ons!"', 'Jesse: "Waarom ren je nou weer?"', 'De osso van Jens blijft rommelig', 'Fanta in de aanbieding',
    'Lezers stemmen: is Jens een held?', 'Peiling: 72% wil meer Jens', 'Gemeenteraad vergadert vanavond', 'Stadsbus rijdt met vertraging',
    'Wijkfeest op zaterdag', 'Rommelmarkt op het Kronenburgerpark', 'Goffertpark zoekt vrijwilligers', 'Waalstrand weer open',
    'Hardloopclub zoekt nieuwe leden (Jens?)', 'Fietspad {s} wordt verbreed', 'Nieuwe speeltuin in Oost', 'Bibliotheek verlengt openingstijden',
    'Brand in containertje snel geblust', 'Stroomstoring kort voorbij', 'Kat uit boom gered', 'Gevonden: één witte sneaker',
    'Verloren: geduld van {c}', 'Verkeersinfo: {s} weer vrij', 'Jens is inmiddels weer thuis', 'Moeder van Jens: "Ik heb er niks mee te maken"',
    'Dierenambulance had rustige dag', 'Burgemeester opent nieuwe rotonde', 'Supermarkt {s} sluit later', 'NEC-shirt uitverkocht',
    'Jens-fanclub telt {n} leden', 'De {s} krijgt nieuwe bomen', 'Ijscokar spotted in Oost', 'Stadsomroep wacht op reactie Jens',
    'Volgende run al aangekondigd', 'Getuigen worden gezocht', 'Beelden binnen via de NijmegenActueel-app', 'Tip de redactie: 024-JENSRUN',
    'Hoeveel bekers? {b}, zegt de teller', 'Nieuwe zebrapaden op de {s}', 'Fietsenstalling station vol', 'Bezorgers klagen over drukte', 'Avondmarkt Waalkade groot succes', 'Concert in de Vasim uitverkocht', 'Vrijwilligers ruimen zwerfafval op', 'Pizzeria {s} bakt Jens-pizza', 'Taxi\'s rijden om via de {s}', 'Speelgoedwinkel verkoopt mini-Jens', 'Lantaarnpalen {s} vervangen', 'Schoolreis naar de Efteling gaat door', 'Max & Moritz extra populair', 'Kanoverhuur Waal weer open', 'Tribune Goffert opgeknapt', 'Trainer NEC tevreden', 'Jeugdteam NEC wint toernooi', 'Dakdekkers waarschuwen voor wind', 'Aspergeseizoen geopend', 'Oliebollenkraam staat al klaar', 'Koningsdag-route bekend', 'Kinderboerderij heeft nieuwe geitjes', 'Ophaaldienst kliko\'s later', 'Bewoners {s} organiseren buurtborrel', 'Studenten verhuizen massaal', 'Bouw nieuwe wijk in Lent begonnen', 'Ooievaar gespot op de Stevenskerk', 'Bakfiets-file bij basisschool', 'Groenteman {s} lyrisch over Jens', 'Lokale rapper maakt nummer over Jens',
  ],
};
function kopFill(t, v) { return t.replace(/\{(\w)\}/g, (_, k) => v[k] ?? ''); }
// niet twee keer kort na elkaar dezelfde kop
function pickKop(list, tag) {
  const seen = (save.kopSeen ||= []);
  const fresh = list.map((t, i) => tag + i).filter((k) => !seen.includes(k));
  const k = (fresh.length ? fresh : list.map((t, i) => tag + i))[Math.floor(Math.random() * (fresh.length || list.length))];
  seen.push(k); if (seen.length > 300) seen.splice(0, seen.length - 300);
  return list[+k.slice(tag.length)];
}
function newsTexts(reason, street, v) {
  const own = KOP[reason] && Math.random() < 0.65 ? KOP[reason] : KOP.algemeen;
  const head = kopFill(pickKop(own, own === KOP.algemeen ? 'a' : reason[0] + reason[1]), v).toUpperCase();
  const tick = [];
  for (let i = 0; i < 4; i++) tick.push(kopFill(pickKop(KOP.ticker, 't'), v));
  return { head, tick };
}
const KOP_TOTAAL = Object.values(KOP).reduce((n, l) => n + l.length, 0);
async function startNews(title, txt) {
  newsCancel();
  lastSnap = null;
  if (!newsAvailable() || replayBuf.length < 45) { renderNewsBtn(); return; }
  const vcfg = { codec: 'avc1.42001f', width: NEWS_W, height: NEWS_H, bitrate: 1_800_000, framerate: NEWS_FPS };
  try { if (!(await VideoEncoder.isConfigSupported(vcfg)).supported) { renderNewsBtn(); return; } } catch (e) { renderNewsBtn(); return; }
  const buf = replayBuf.slice();
  let deathIdx = buf.findIndex((f) => f.dead);
  if (deathIdx < 0) deathIdx = buf.length - 1;
  // stuk rond de klap: tot ~1,6 s erna
  const wEnd = buf[buf.length - 1].w ?? 0;
  let end = Math.min(buf.length - 1, deathIdx + 26), start = end, acc = 0;
  // niet verder terug dan ~26 m: verder achter Jens zijn de huizen al doorgeschoven
  while (start > 0 && acc < SEG && wEnd - (buf[start - 1].w ?? wEnd) < 26) { acc += buf[start].dt; start--; }
  const street = STREETS[streetIdx];
  const job = {
    buf, wEnd, street: STREETS[streetIdx], intro: nextNewsIntro(), frames: [], segs: [], i: 0, chunks: [], vmeta: null, abort: false,
    ...(() => {
      const d = new Date(), v = { s: street, p: Math.floor(score).toLocaleString('nl-NL'), m: Math.floor(dist).toLocaleString('nl-NL'), c: cap(MODES[mode]?.chaser || 'de BOA'), b: runBekers, u: String(d.getHours()).padStart(2, '0'), n: String(10 + Math.floor(Math.random() * 89)) };
      const { head, tick } = newsTexts(deathReason, street, v);
      return { head, ticker: `${txt}  ·  ${tick.join('  ·  ')}  ·  Lees meer op nijmegenactueel.nl  ·  ` };
    })(),
    r: { added: [], hidden: objs.map((o) => o.mesh).filter((m) => m.visible), prev: null },
  };
  // planning
  let t = 0;
  const dtF = 1 / NEWS_FPS;
  for (; t < INTRO - 1e-6; t += dtF) job.frames.push({ type: 'intro', t, ts: t });
  const angles = Object.keys(NEWS_ANGLES).sort(() => Math.random() - 0.5).slice(0, 3);
  angles.forEach((angle, n) => {
    const fd = buf[deathIdx];
    const seg = { angle, n: n + 1, side: Math.random() < 0.5 ? -1 : 1, a0: rand(0, Math.PI * 2), t0: t, deathAt: null, z0: fd.jens[2] + (wEnd - (fd.w ?? wEnd)) - rand(3, 7) };
    let segT = 0;
    const total = buf.slice(start, end + 1).reduce((s, f) => s + f.dt, 0);
    for (let i = start; i <= end; i++) {
      if (i === deathIdx) seg.deathAt = t;
      job.frames.push({ type: 'replay', seg, idx: i, k: segT / total, ts: t, dur: buf[i].dt });
      t += buf[i].dt; segT += buf[i].dt;
    }
    job.segs.push(seg);
  });
  const o0 = t;
  for (; t < o0 + OUTRO - 1e-6; t += dtF) job.frames.push({ type: 'outro', t: t - o0, ts: t });
  job.dur = t;
  job.venc = new VideoEncoder({ output: (chunk, meta) => { if (meta?.decoderConfig) job.vmeta = meta; job.chunks.push(chunk); }, error: () => { job.abort = true; } });
  job.venc.configure(vcfg);
  for (const m of job.r.hidden) m.visible = false;
  newsJob = job;
  renderNewsBtn();
}
// een stukje werk per beeld van de tekenlus; het spel staat zolang stil achter het eindscherm
function newsStep() {
  const job = newsJob;
  const until = performance.now() + 22;
  while (job.i < job.frames.length && performance.now() < until && !job.abort) {
    const fr = job.frames[job.i], c = newsCtx;
    if (fr.type === 'intro') newsIntro(c, fr.t, job);
    else if (fr.type === 'outro') newsOutro(c, fr.t);
    else {
      const f = job.buf[fr.idx], D = job.wEnd - (f.w ?? job.wEnd);
      newsApply(job.r, f, D);
      aimNews(fr.seg, f, fr.k, D);
      updateBatches();
      renderer.setRenderTarget(newsRT);
      renderer.render(scene, newsCam);
      renderer.readRenderTargetPixels(newsRT, 0, 0, NEWS_W, NEWS_H, newsPix);
      renderer.setRenderTarget(null);
      newsTmpCtx.putImageData(new ImageData(new Uint8ClampedArray(newsPix.buffer), NEWS_W, NEWS_H), 0, 0);
      c.save(); c.translate(0, NEWS_H); c.scale(1, -1); if (fr.seg.angle === 'bewaking') c.filter = 'grayscale(1) contrast(1.25)'; c.drawImage(newsTmp, 0, 0); c.restore(); // WebGL leest van onder naar boven
      newsOverlay(c, job, fr.seg, fr.seg.n, fr.k, fr.ts);
    }
    try {
      const vf = new VideoFrame(newsCanvas, { timestamp: Math.round(fr.ts * 1e6), duration: Math.round((fr.dur || 1 / NEWS_FPS) * 1e6) });
      job.venc.encode(vf, { keyFrame: job.i % 45 === 0 });
      vf.close();
    } catch (e) { job.abort = true; }
    job.i++;
  }
  renderNewsBtn();
  if (job.abort) { newsCancel(); return; }
  if (job.i >= job.frames.length) { newsRestore(job.r); newsJob = null; newsFinish(job); }
}
async function newsFinish(job) {
  try {
    await job.venc.flush();
    const au = await newsAudio(job);
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: 'avc', width: NEWS_W, height: NEWS_H },
      audio: au ? { codec: au.acfg.mux, sampleRate: au.acfg.sampleRate, numberOfChannels: 1 } : undefined, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    job.chunks.forEach((ch, i) => muxer.addVideoChunk(ch, i === 0 ? job.vmeta : undefined));
    if (au) {
      let ameta = null; const achunks = [];
      const aenc = new AudioEncoder({ output: (ch, meta) => { if (meta?.decoderConfig) ameta = meta; achunks.push(ch); }, error: () => {} });
      const { mux, ...aconf } = au.acfg; aenc.configure(aconf);
      const data = au.buf.getChannelData(0), N = 1024, asr = au.buf.sampleRate;
      for (let i = 0; i < data.length; i += N) {
        const part = data.slice(i, i + N);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: asr, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round((i / asr) * 1e6), data: part });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush(); aenc.close();
      achunks.forEach((ch, i) => muxer.addAudioChunk(ch, i === 0 ? ameta : undefined));
    }
    muxer.finalize();
    lastSnap = { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4', type: 'video/mp4' };
  } catch (e) { lastSnap = null; }
  try { job.venc.close(); } catch (e) { /* al dicht */ }
  if (newsUrl) URL.revokeObjectURL(newsUrl);
  newsUrl = lastSnap ? URL.createObjectURL(lastSnap.blob) : null;
  renderNewsBtn();
}
function newsCancel() {
  const job = newsJob;
  if (!job) return;
  newsJob = null;
  newsRestore(job.r);
  try { job.venc.close(); } catch (e) { /* al dicht */ }
  renderNewsBtn();
}
function renderNewsBtn() {
  const b = $('#replayBtn');
  if (!b) return;
  if (!newsAvailable()) { b.textContent = '🎬 Bekijk de replay'; b.disabled = false; b.classList.toggle('hidden', replayBuf.length < 30); $('#snapShare').classList.add('hidden'); return; }
  if (newsJob) {
    b.textContent = `📺 NijmegenActueel maakt het nieuws… ${Math.round((newsJob.i / newsJob.frames.length) * 100)}%`;
    b.disabled = true; b.classList.remove('hidden');
  } else if (lastSnap) { b.textContent = '📺 NijmegenActueel: bekijk het nieuws'; b.disabled = false; b.classList.remove('hidden'); }
  else { b.classList.add('hidden'); }
  $('#snapShare').classList.toggle('hidden', !lastSnap || !!newsJob);
}
function openNews() {
  if (!newsAvailable()) { startReplay(); return; }
  if (!newsUrl) return;
  const v = $('#newsVideo');
  v.src = newsUrl; v.currentTime = 0;
  $('#newsUi').classList.remove('hidden');
  newsPlaying = true;
  v.play().catch(() => {});
}
function closeNews() {
  const v = $('#newsVideo');
  v.pause();
  $('#newsUi').classList.add('hidden');
  newsPlaying = false;
}

async function blobToB64(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
}
async function shareSnap() {
  if (!lastSnap) return;
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const name = `jens-run-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}.${lastSnap.ext}`;
  recordStat('snapShare'); checkAch();
  // in de Android-app: rechtstreeks in Downloads zetten
  if (window.JensRunNative?.saveFile) {
    try { if (window.JensRunNative.saveFile(await blobToB64(lastSnap.blob), lastSnap.type, name)) { note(`💾 Opgeslagen in Downloads: ${name}`); return; } } catch (e) { /* oude app */ }
  }
  if (window.JensRunNative?.shareFile) { window.JensRunNative.shareFile(await blobToB64(lastSnap.blob), lastSnap.type, name); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastSnap.blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  note(`💾 Gedownload: ${name}`);
}
$('#snapShare').addEventListener('click', shareSnap);

// =====================================================================
//  VERSLAGGEVER: vooraf opgenomen stem, klinkt op elk apparaat hetzelfde
// =====================================================================
let verslag = null, verslagT = 0, verslagUntil = 0;
fetch('audio/verslag/index.json').then((r) => r.json()).then((j) => { verslag = j; }).catch(() => {});
if (save.set.verslag === undefined) save.set.verslag = true;
async function playUrl(url, vol) {
  if (!ac || !save.sound) return;
  if (!clips[url]) await loadClip(url, url);
  if (!clips[url]) return;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = clips[url]; g.gain.value = vol;
  s.connect(g).connect(voiceBus);
  s.start();
  verslagUntil = ac.currentTime + clips[url].duration;
}
function verslaggever(key, force, idx) {
  return; // verslaggever staat uit
  // eslint-disable-next-line no-unreachable
  const opts = verslag?.[key];
  if (!opts || !save.set.verslag || !ac || !save.sound) return;
  const t = now();
  if (!force && (t < verslagT || voiceSrc)) return;
  if (ac.currentTime < verslagUntil) return;
  verslagT = t + rand(8, 13);
  const line = idx != null ? opts[idx] : pick(opts);
  if (!line) return;
  playUrl(line.f, 0.95 * save.set.voice / 100);
  note(`🎙️ ${line.t}`);
}
const SPEAK_MAP = { hup: 'hup', 'go nederland': 'gonl', 'die beker is van ons': 'dbivo' };

// =====================================================================
//  SPLASHSCREEN: laadbalk terwijl de belangrijkste bestanden binnenkomen
// =====================================================================
{
  const files = ['img/menu-bg.jpg', 'img/jens-face.png', 'icons/icon-512.png', 'audio/menu.mp3', 'audio/game.mp3', 'audio/dbivo.mp3', 'audio/gameover.mp3'];
  let done = 0;
  const bar = $('#splashBar'), press = $('#start .press');
  press.style.visibility = 'hidden';
  const tick = () => { done++; bar.style.width = (done / files.length * 100) + '%'; if (done >= files.length) ready(); };
  let isReady = false;
  const ready = () => { if (isReady) return; isReady = true; bar.parentElement.classList.add('done'); press.style.visibility = ''; };
  for (const f of files) fetch(f).then(tick, tick);
  setTimeout(ready, 7000);
}

// =====================================================================
//  DUBBELSPRINGEN + NEC-SJAAL (magneet)
// =====================================================================
let sjaalT = 0;
const SJAAL_TIME = 10;
const jensSjaal = new THREE.Group();
{
  const kl = ['#c8202b', '#1f7a3a', '#141414'];
  for (let i = 0; i < 3; i++) jensSjaal.add(mesh(box(0.34, 0.035, 0.3), M(kl[i]), 0, 1.6 - i * 0.035, 0));
  const sl = new THREE.Group(); sl.position.set(0.1, 1.55, -0.16);
  for (let i = 0; i < 6; i++) sl.add(mesh(box(0.08, 0.06, 0.02), M(kl[i % 3]), 0, -i * 0.06, 0));
  jensSjaal.add(sl);
  jensSjaal.visible = false;
  jens.body.add(jensSjaal);
}
function makeSjaalPower() {
  const g = new THREE.Group(), kl = ['#c8202b', '#1f7a3a', '#141414'];
  for (let i = 0; i < 9; i++) g.add(mesh(box(0.2, 0.12, 0.05), M(kl[i % 3]), -0.8 + i * 0.2, Math.sin(i * 0.7) * 0.12, 0));
  return g;
}
function updateMagnet(dt) {
  if (sjaalT <= 0) return;
  sjaalT -= dt;
  jensSjaal.visible = sjaalT > 0;
  for (const o of objs) {
    if (o.kind !== 'beker' || o.dead || o.z > 1 || o.z < -16) continue;
    o.x = damp(o.x, player.x, 7, dt);
    o.y = damp(o.y, player.y + 0.9, 7, dt);
    o.z = damp(o.z, 0, 4, dt);
    o.mesh.position.set(o.x, o.y, o.z);
  }
}

// =====================================================================
//  DAG-NACHTRITME (endless): na een tijdje gaat de zon onder
// =====================================================================
let dayMix = 0, sunsetFrom = 0;
function updateDayNight(m) {
  if (curLevel || indoor || weekly || phaseT >= 2) return;
  if (!sunsetFrom) sunsetFrom = rand(1800, 2600);
  if (dist < sunsetFrom) return;
  const before = phaseT;
  phaseGoal = Math.min(2, Math.max(phaseGoal, phaseT) + m / 700);
  if (phaseGoal - phaseT < 0.004 && phaseGoal < 2) return; // in kleine stapjes, niet elk beeld de hele lucht herkleuren
  applyLook(phaseGoal);
  if (before < 1 && phaseT >= 1) note('🌅 Het wordt avond');
  if (phaseT >= 2) note('🌙 De zon is onder');
}

// =====================================================================
//  HEUVELS: bergop is zwaar, bergaf gaat het hard
// =====================================================================
let hill = null, nextHill = 900, hillTilt = 0;
const HILL_NAMES = ['Sint Annastraat', 'Berg en Dalseweg', 'Kwakkenberg', 'Hengstdal', 'Ubbergseweg'];
function updateHills() {
  if (curLevel || indoor || bos || ebos) { hill = null; return; }
  if (!hill && dist > nextHill) {
    hill = { dir: 1, until: dist + rand(260, 380) };
    note(`⛰️ Bergop: ${pick(HILL_NAMES)}`);
    verslaggever('heuvel');
  } else if (hill && dist > hill.until) {
    if (hill.dir > 0) { hill = { dir: -1, until: dist + rand(200, 300) }; note('⛷️ Bergaf: gas erop!'); }
    else { hill = null; nextHill = dist + rand(900, 1500); }
  }
}
const hillSpeed = () => (hill ? (hill.dir > 0 ? 0.8 : 1.22) : 1);

// =====================================================================
//  ZIJPADEN: links het park (meer bekers, meer obstakels), rechts rustig
// =====================================================================
THEMES.park = { ...THEMES.bos, grass: '#6fae4a', streets: ['Goffertpark', 'Kronenburgerpark'] };
let path = null, nextFork = 1300;
function makeForkSign() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(mesh(box(0.15, 5, 0.15), M('#8a8f96'), sx * (ROAD_W / 2 + 0.3), 2.5, 0));
  const tex = canvasTex(512, 96, (x) => {
    x.fillStyle = '#1f6b3a'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#1b3f8f'; x.fillRect(256, 0, 256, 96);
    x.fillStyle = '#fff'; x.font = '34px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('◀ PARK', 128, 34); x.fillText('STRAAT ▶', 384, 34);
    x.font = '18px Anton, sans-serif'; x.fillText('meer bekers, meer obstakels', 128, 70); x.fillText('rustig doorrennen', 384, 70);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 0.6, 1.3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  p.position.y = 4.7; g.add(p);
  return g;
}
function spawnFork(z) {
  addObj('fork', makeForkSign(), 0, z, 0, 0, 0, { upd(o) {
    if (o.chosen || o.z < 0 || state !== 'run') return;
    o.chosen = true;
    const park = player.x < -1;
    path = { kind: park ? 'park' : 'straat', until: dist + 450 };
    if (park) { fade(); applyTheme(THEMES.park); note('🌳 Het park in: bekers en obstakels!'); }
    else note('🏘️ Rustige straat');
  } });
}
function updatePath() {
  if (path && dist > path.until) {
    if (path.kind === 'park') { fade(); applyTheme(THEMES.oost); }
    path = null; nextFork = dist + rand(1100, 1700);
  }
}

// =====================================================================
//  SCHATKIST: een gouden beker op een lastige plek
// =====================================================================
let nextSchat = 700;
function spawnSchat(lane, z) {
  spawnObstacle('kliko', lane, z);
  const cup = makeCup(2.2, bekerMat, 'high');
  addObj('schat', cup, LANES[lane], z, 0, 0, 0, { y: 2.55, upd(o) { o.mesh.rotation.y += 0.08; if (Math.random() < 0.3) burst(new THREE.Vector3(o.x + rand(-0.4, 0.4), o.y + rand(-0.3, 0.5), o.z), 1, 0.5, fwMats[1], 0.4); } });
}
function collectSchat(o) {
  o.dead = true;
  const n = 50 * (bekerT > 0 ? 2 : 1);
  runBekers += n; save.bekers += n; score += 500 * scoreMult();
  missionEvent('bekers', n);
  toast(`🏆 GOUDEN BEKER!<small>+${n} bekers</small>`, 1.8);
  sfx.power(); buzz([30, 30, 60]);
  verslaggever('schat', true);
}

// =====================================================================
//  EINDELOZE BAASRACE: elke 5000 m een baas die steeds sterker wordt
// =====================================================================
let ebos = null, nextEbos = 5000, bazen = 0;
const EBOS_TYPES = [
  { id: 'boa', name: 'BOA op de scooter' },
  { id: 'vuilniswagen', name: 'De vuilniswagen' },
  { id: 'me', name: 'Het ME-busje' },
];
function makeEbosMesh(type) {
  const g = new THREE.Group();
  if (type === 'boa') {
    const m = makeMoped(); g.add(m);
    const p = makePerson({ key: 'boa2', skin: '#e8c3a6', hair: '#3a2a1e', hairStyle: 'boapet', shirt: { base: '#1c2433', paint(x, s) { if (s === 'back') text(x, 'HANDHAVING', '#ffd23f', 18, 40); } }, pants: '#141a26', shoes: '#111', face: { skin: '#e8c3a6', angry: true } });
    p.shadow.visible = false; g.add(p.root); g.userData.person = p;
    g.rotation.y = Math.PI; g.scale.setScalar(1.3);
  } else if (type === 'vuilniswagen') {
    const groen = M('#2f7d32'), grijs = M('#c9ccd1');
    g.add(mesh(box(2.3, 2.6, 4.4), grijs, 0, 1.7, 0.6));
    g.add(mesh(box(2.3, 1.9, 1.8), groen, 0, 1.35, -2.4));
    g.add(mesh(box(2.0, 0.8, 0.05), M('#26313d'), 0, 1.8, -3.31));
    const bord = textPlane('DAR · AFVAL', 2.2, 0.5, '#ffffff', '#2f7d32'); bord.rotation.y = Math.PI / 2; bord.position.set(0, 2.6, -1.3); g.add(bord);
    for (const [x, z] of [[-1.05, -2.2], [1.05, -2.2], [-1.05, 1.6], [1.05, 1.6]]) { const w = wheel(0.5, 0.35, M('#1b1b1b')); w.position.set(x, 0.5, z); g.add(w); }
    g.rotation.y = Math.PI;
  } else {
    const wit = M('#f4f4f4'), blauw = M('#1f4f8f');
    g.add(mesh(box(2.1, 2.1, 5), wit, 0, 1.4, 0));
    g.add(mesh(box(2.12, 0.35, 5.02), blauw, 0, 1.2, 0));
    g.add(mesh(box(1.9, 0.7, 0.05), M('#26313d'), 0, 1.9, -2.52));
    g.add(mesh(box(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: '#2a6bff' }), 0, 2.55, -1.6));
    const bord = textPlane('ME', 1.2, 0.5, '#ffffff', '#1f4f8f'); bord.rotation.y = Math.PI / 2; bord.position.set(0, 2.0, 2.52); g.add(bord);
    for (const [x, z] of [[-1, -1.7], [1, -1.7], [-1, 1.7], [1, 1.7]]) { const w = wheel(0.42, 0.3, M('#1b1b1b')); w.position.set(x, 0.42, z); g.add(w); }
    g.rotation.y = Math.PI;
  }
  return g;
}
function startEbos() {
  const t = EBOS_TYPES[bazen % EBOS_TYPES.length];
  const level = bazen + 1;
  const m = makeEbosMesh(t.id);
  const lab = makeLabel(`👹 ${t.name} · lvl ${level}`, '#c8202b');
  lab.position.y = 4; lab.scale.set(3, 0.75, 1); m.add(lab);
  scene.add(m);
  ebos = { mesh: m, x: 0, z: -70, hp: 2 + level * 2, max: 2 + level * 2, lane: 1, laneT: 2, throwT: 3, level, type: t };
  nitraten = Math.max(nitraten, 6); hudNitro = -1;
  toast(`👹 BAAS: ${t.name.toUpperCase()}<small>Level ${level} · gooi nitraten (E / 🧨)</small>`, 2.6);
  verslaggever('baas', true);
  buzz([60, 40, 60]);
}
function updateEbos(dt) {
  if (curLevel || indoor) return;
  if (!ebos && !bos && dist > nextEbos) { startEbos(); return; }
  if (!ebos) return;
  const b = ebos;
  if (b.dead) {
    b.vy -= 20 * dt; b.mesh.position.y += b.vy * dt; b.mesh.rotation.x += dt * 4; b.mesh.position.z += dt * 10;
    if (b.mesh.position.y < -6) { scene.remove(b.mesh); ebos = null; }
    return;
  }
  b.z = damp(b.z, -20, 1.2, dt);
  b.laneT -= dt;
  if (b.laneT <= 0) { b.laneT = rand(1.4, 2.8) / Math.min(2, 1 + b.level * 0.15); b.lane = Math.floor(Math.random() * 3); }
  b.x += clamp(LANES[b.lane] - b.x, -4 * dt, 4 * dt);
  b.mesh.position.set(b.x, 0, b.z);
  if (b.mesh.userData.person) pose(b.mesh.userData.person, 'sit', dt);
  b.throwT -= dt;
  if (b.throwT <= 0 && b.z > -28) {
    b.throwT = rand(2.2, 3.6) / Math.min(1.8, 1 + b.level * 0.12);
    spawnObstacle(pick(['kliko', 'fietswrak', 'kliko']), b.lane, b.z + 3);
    if (Math.random() < 0.35) addObj('power', makeSmallNitraat(), LANES[(b.lane + 1) % 3], b.z + 6, 0, 0, 0, { y: 1.0, type: 'nitraat2' });
  }
}
function hitEbos(x, z) {
  const b = ebos;
  if (!b || b.dead || Math.abs(b.x - x) > 2.4 || Math.abs(b.z - z) > 5) return;
  b.hp--;
  shakeT = 0.5; buzz(80);
  score += 300 * scoreMult();
  if (b.hp > 0) { toast(`👹 RAAK! Nog ${b.hp}`, 0.9); return; }
  b.dead = true; b.vy = 14;
  bazen++;
  recordStat('bazen', 0, bazen);
  const bonus = 2000 * b.level * scoreMult();
  score += bonus;
  toast(`👹 ${b.type.name.toUpperCase()} VERSLAGEN!<small>+${bonus.toLocaleString('nl-NL')} punten · ${bazen} ${bazen === 1 ? 'baas' : 'bazen'} deze run</small>`, 2.8);
  burst(new THREE.Vector3(b.x, 2, b.z), 100, 12, fireMats, 2);
  verslaggever('baaswin', true);
  nextEbos = dist + 5000;
}
function ebosTarget() { return ebos && !ebos.dead && ebos.z > -40 ? { x: ebos.x, z: ebos.z, w: 2, d: 3, isBoss: true, hit: false, dead: false } : null; }

// =====================================================================
//  NEC-PLAKBOEK: zeldzame stickers verzamelen
// =====================================================================
const PLAK = [
  ['goffert', '🏟️', 'Goffertstadion'], ['rgz', '🔴🟢⚫', 'Rood-groen-zwart'], ['nr6', '6️⃣', 'Nejašmić #6'], ['europa', '🌍', 'Europa League'],
  ['uitvak', '🚌', 'Uitvak'], ['sjaal', '🧣', 'Sjaal omhoog'], ['fakkel', '🔥', 'Fakkel'], ['spandoek', '🏳️', 'Spandoek'],
  ['waalbrug', '🌉', 'Waalbrug'], ['stevens', '⛪', 'Stevenskerk'], ['vierdaagse', '🥾', 'Vierdaagse'], ['dbivo', '🏆', 'Die beker is van ons'],
  ['goal', '⚽', 'GOAL!'], ['hoekvlag', '🚩', 'Hoekvlag'], ['scheids', '🟨', 'Gele kaart'], ['bier', '🍺', 'Bierbeker'],
  ['tribune', '📣', 'Tribune'], ['wedstrijd', '🎟️', 'Wedstrijdkaartje'], ['oost', '🏘️', 'Nijmegen-Oost'], ['jens', '🏃', 'Jens'],
  ['nitraat', '🧨', 'Dum Bum Nitraat'], ['brommer', '🛵', 'Puch'], ['fiets', '🚲', 'Snapchat-fiets'], ['goud', '👑', 'Gouden beker'],
].map(([id, icon, name], i) => ({ id, icon, name, rare: i % 6 === 5 }));
if (!save.plak) save.plak = {};
let nextKaart = 800;
const kaartMat = new THREE.MeshLambertMaterial({ map: canvasTex(64, 96, (x) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 96);
  const kl = ['#c8202b', '#1f7a3a', '#141414']; for (let i = 0; i < 3; i++) { x.fillStyle = kl[i]; x.fillRect(4, 4 + i * 8, 56, 8); }
  x.fillStyle = '#141414'; x.font = 'bold 44px Impact, sans-serif'; x.textAlign = 'center'; x.fillText('?', 32, 80);
}), emissive: '#332200' });
function spawnKaart(lane, z) {
  const g = new THREE.Group();
  g.add(mesh(box(0.45, 0.68, 0.03), kaartMat));
  addObj('kaart', g, LANES[lane], z, 0, 0, 0, { y: 1.1, upd(o) { o.mesh.rotation.y += 0.06; o.mesh.position.y = o.y + Math.sin(now() * 4) * 0.1; } });
}
function collectKaart(o) {
  o.dead = true;
  const pool = PLAK.flatMap((p) => (p.rare ? [p] : [p, p, p, p, p]));
  const s = pick(pool);
  const isNew = !save.plak[s.id];
  save.plak[s.id] = (save.plak[s.id] || 0) + 1;
  persist();
  sfx.beker(); buzz(20);
  note(`${s.icon} Sticker: <b>${s.name}</b>${isNew ? ' · NIEUW!' : ' · dubbel'}${s.rare ? ' ✨' : ''}`);
  $('#note').innerHTML = `${s.icon} Sticker: <b>${escHtml(s.name)}</b>${isNew ? ' · NIEUW!' : ' · dubbel'}${s.rare ? ' ✨' : ''}`;
  if (isNew && PLAK.every((p) => save.plak[p.id]) && !save.owned['shirt:goud']) {
    save.owned['shirt:goud'] = true; persist();
    setTimeout(() => toast('📒 PLAKBOEK VOL!<small>Je hebt het Gouden NEC-shirt verdiend (winkel → shirt)</small>', 3.2), 800);
  }
}
function renderPlakboek() {
  const n = PLAK.filter((p) => save.plak[p.id]).length;
  $('#pbCount').textContent = `${n}/${PLAK.length}`;
  $('#pbGrid').innerHTML = PLAK.map((p) => {
    const c = save.plak[p.id] || 0;
    return `<div class="pk ${c ? 'on' : ''} ${p.rare ? 'rare' : ''}"><span>${c ? p.icon : '?'}</span><b>${c ? p.name : '???'}</b>${c > 1 ? `<i>×${c}</i>` : ''}</div>`;
  }).join('');
  $('#pbReward').textContent = save.owned['shirt:goud'] ? '👑 Gouden NEC-shirt verdiend!' : 'Vol plakboek = Gouden NEC-shirt';
}
$('#pbBack').addEventListener('click', openKamer);

// =====================================================================
//  NEC-WEDSTRIJDDAG en de MUUR (komen van de server)
// =====================================================================
let serverCfg = { wedstrijden: [], wall: null };
FEESTEN.wedstrijd = { name: 'NEC-wedstrijddag', icon: '⚽', garland: 'vlag', colors: ['#c8202b', '#1f7a3a', '#141414', '#ffffff'], banner: 'WEDSTRIJDDAG · NEC NIJMEGEN',
  obstacles: ['supporter', 'supporter', 'supporter', 'dranghek', 'bierbekers'],
  when: (d) => serverCfg.wedstrijden.includes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) };
SPECIAL_EXTRA.supporter = (lane, z) => {
  const p = feestPerson({ shirt: '#141414', paint(x) { x.fillStyle = '#c8202b'; x.fillRect(0, 0, 60, 128); x.fillStyle = '#1f7a3a'; x.fillRect(68, 0, 60, 128); } });
  p.body.add(mesh(box(0.32, 0.09, 0.3), M('#c8202b'), 0, 1.57, 0));
  p.root.rotation.y = Math.PI;
  return addObj('supporter', p.root, LANES[lane], z, 0.8, 0.6, 1.8, { gen: 'stumble', upd(o, dt) { pose(p, 'angry', dt, 0.8); if (!o.yelled && o.z > -18) { o.yelled = true; if (Math.random() < 0.5) bubble(p.head, pick(['NEC! NEC!', 'Wij zijn NEC!', 'Rood-groen-zwart!']), '', 1.2); } } });
};
function renderWall() {
  const w = serverCfg.wall, el = $('#wall');
  if (!w?.text) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `📢 <b>${escHtml(w.name)}</b> <span>${escHtml(w.text)}</span>`;
}
async function loadConfig() {
  try {
    const r = await apiCall('/api/config');
    if (!r.ok) return;
    serverCfg = { wedstrijden: r.wedstrijden || [], wall: r.wall || null };
    const today = todaysFeest();
    if (today === 'wedstrijd' && !save.feest) { feest = 'wedstrijd'; applyFeest(); }
    renderWall();
    if (curScreen === '#menu') renderFeesten();
  } catch (e) { /* offline */ }
}
loadConfig();
// #1 op een ranglijst mag iets op de muur zetten
$('#wallForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#wallForm .err');
  err.textContent = '';
  try {
    const r = await apiCall('/api/wall', { id: save.playerId, text: $('#wallInput').value });
    if (!r.ok) throw new Error(r.error || 'Dat lukte niet.');
    $('#wallForm').classList.add('hidden');
    note('📢 Je bericht staat op de muur!');
    loadConfig();
  } catch (ex) { err.textContent = ex.message; }
});

// =====================================================================
//  EMOJI-REACTIES op profielen
// =====================================================================
const REACTIES = ['😂', '🔥', '👑', '💀', '🤡'];
const REACTIE_NAAM = { '😂': 'Lachen', '🔥': 'Vuur', '👑': 'Koning', '💀': 'Dood', '🤡': 'Clown' };
async function reactTo(name, emoji) {
  if (!save.name) { note('Kies eerst een naam op de ranglijst'); return; }
  try { await apiCall('/api/react', { id: save.playerId, target: name, emoji }); buzz(15); openProfile(name, profileFrom); } catch (e) { /* offline */ }
}
$('#prBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-react]');
  if (b) return reactTo($('#prName').textContent, b.dataset.react);
  const k = e.target.closest('#prReact');
  if (!k) return;
  const tel = JSON.parse(k.dataset.tel);
  glasMenu(k, REACTIES.map((em) => ({
    title: REACTIE_NAAM[em] + (tel[em] ? ` (${tel[em]})` : ''), icon: em, checked: k.dataset.mijn === em,
    run: () => reactTo($('#prName').textContent, em),
  })));
});

// =====================================================================
//  JENS' KAMER + RADIO
// =====================================================================
const KAMER_X = 400;
const kamer = new THREE.Group();
kamer.position.x = KAMER_X;
kamer.visible = false;
scene.add(kamer);
let kamerBuilt = false;
const STATIONS = [
  { id: 'menu', name: 'Menumuziek' },
  { id: 'eltune', name: '📻 Eltune' },
  { id: 'chip', name: '📻 Chiptune' },
  { id: 'uit', name: 'Radio uit' },
];
if (!save.radio) save.radio = 'menu';
// =====================================================================
//  JENS Z'N OSSO: in first person door het huis lopen
// =====================================================================
const fp = { x: 0, z: 1.4, yaw: 0, pitch: -0.05, keys: {}, joy: null, look: null, bob: 0, target: null, sub: false, tv: false, tvTex: null, sleepT: 0 };
let ossoCols = [], ossoUse = [];
const WALL_H = 3.4, DOOR_H = 2.3;
function buildKamer() {
  for (const c of kamer.children) freeObject(c);
  while (kamer.children.length) kamer.remove(kamer.children[0]);
  ossoCols = []; ossoUse = []; steve = null;
  const col = (x1, z1, x2, z2) => ossoCols.push([Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2)]);
  const solid = (w, h, d, mat, x, y, z) => { kamer.add(mesh(box(w, h, d), mat, x, y, z)); col(x - w / 2, z - d / 2, x + w / 2, z + d / 2); };
  const use = (x, y, z, r, label, fn) => ossoUse.push({ p: new THREE.Vector3(x, y, z), r, label, fn });
  const behang = new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (x) => {
    x.fillStyle = '#e8dcc4'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(200,32,43,.25)'; for (let i = 0; i < 128; i += 32) x.fillRect(i, 0, 10, 128);
    grain(x, 128, 128, 10);
  }) });
  const wit = new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = '#d9d4c8'; x.fillRect(0, 0, 64, 64); grain(x, 64, 64, 12); }) });
  const tegels = (a, b) => new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (x) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? a : b; x.fillRect(i * 16, j * 16, 16, 16); } grain(x, 64, 64, 10); }) });
  const vloer = new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#8a5a34' : '#7a4e2c'; x.fillRect(0, i * 16, 128, 16); } grain(x, 128, 128, 16); }) });
  const tapijt = new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = '#5c6670'; x.fillRect(0, 0, 64, 64); grain(x, 64, 64, 22); }) });
  // vloeren en plafond: slaapkamer, wc, woonkamer, keuken
  const floor = (x1, z1, x2, z2, mat) => kamer.add(mesh(box(x2 - x1, 0.1, z2 - z1), mat, (x1 + x2) / 2, -0.05, (z1 + z2) / 2));
  floor(-4, -4.5, 4, 2.5, vloer); floor(4, -1, 6, 2.5, tegels('#e8e8e8', '#9fb7c9'));
  floor(-4, 2.5, 6, 10, vloer); floor(6, 2.5, 11, 10, tegels('#f2f2f2', '#c8202b'));
  kamer.add(mesh(box(4.6, 0.02, 3.2), tapijt, -1.6, 0.01, 6.5));
  kamer.add(mesh(box(15, 0.1, 14.5), wit, 3.5, WALL_H + 0.05, 2.75));
  // muren: van (a,b) naar (c,d) langs x of z, met deuropeningen [van, tot]
  const wall = (x1, z1, x2, z2, mat, gaps = []) => {
    const alongX = z1 === z2, a = alongX ? x1 : z1, b = alongX ? x2 : z2;
    const seg = (s, e, y0, y1) => {
      if (e - s < 0.01) return;
      const m = (s + e) / 2, l = e - s, h = y1 - y0;
      kamer.add(alongX ? mesh(box(l, h, 0.12), mat, m, (y0 + y1) / 2, z1) : mesh(box(0.12, h, l), mat, x1, (y0 + y1) / 2, m));
    };
    let s = a;
    for (const [g0, g1] of gaps) {
      seg(s, g0, 0, WALL_H); seg(g0, g1, DOOR_H, WALL_H);
      if (alongX) col(s, z1 - 0.06, g0, z1 + 0.06); else col(x1 - 0.06, s, x1 + 0.06, g0);
      s = g1;
    }
    seg(s, b, 0, WALL_H);
    if (alongX) col(s, z1 - 0.06, b, z1 + 0.06); else col(x1 - 0.06, s, x1 + 0.06, b);
  };
  wall(-4, -4.5, 4, -4.5, behang); wall(-4, -4.5, -4, 2.5, behang); wall(4, -4.5, 4, 2.5, behang);
  wall(4, -1, 6, -1, wit); wall(6, -1, 6, 2.5, wit);
  wall(-4, 2.5, 6, 2.5, behang, [[-0.6, 0.6], [4.5, 5.5]]);
  wall(-4, 2.5, -4, 10, wit); wall(6, 2.5, 11, 2.5, wit); wall(11, 2.5, 11, 10, wit);
  wall(6, 2.5, 6, 10, wit, [[5, 7]]);
  wall(-4, 10, 11, 10, wit);
  const lamp = (x, z) => kamer.add(mesh(box(1, 0.06, 1), new THREE.MeshBasicMaterial({ color: '#fff4d0' }), x, WALL_H - 0.03, z));
  lamp(0, -1); lamp(1, 6.3); lamp(8.5, 6.2); lamp(5, 0.7);
  const poster = (url, w, h, x, y, z, ry = 0) => {
    const t = psxTex(new THREE.TextureLoader().load(url));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t }));
    p.position.set(x, y, z); p.rotation.y = ry; kamer.add(p);
  };
  // ---------- slaapkamer ----------
  poster('img/spandoek.png', 1.8, 1.8, -1.6, 2.3, -4.43);
  poster('img/shane-foto.jpg', 1.4, 1.04, 1.4, 2.4, -4.43);
  poster('img/menu-bg.jpg', 2.4, 1.35, -3.93, 2.3, -1.5, Math.PI / 2);
  poster('img/poster-jens.jpg', 1.7, 1.06, 3.93, 2.0, -2.7, -Math.PI / 2); // "Jens in, like, 2 jaar" boven het bed
  poster('img/poster-laser.jpg', 1.05, 1.36, 3.93, 1.95, 0.9, -Math.PI / 2);
  // bed in NEC-kleuren
  solid(2, 0.5, 3, M('#5a3a22'), 2.9, 0.25, -2.7);
  kamer.add(mesh(box(1.9, 0.2, 2.9), fabricMat('#c8202b'), 2.9, 0.6, -2.7));
  kamer.add(mesh(box(1.9, 0.21, 1.2), fabricMat('#1f7a3a'), 2.9, 0.61, -1.8));
  kamer.add(mesh(box(0.8, 0.2, 0.5), fabricMat('#f4f4f4'), 2.9, 0.75, -3.8));
  use(2.9, 0.7, -2.4, 1.1, () => 'Even pitten', () => {
    fp.sleepT = 2.2; noteOsso('😴 Jens knapt een uiltje in z\'n osso... zzz');
  });
  // bureau met radio
  kamer.add(mesh(box(2.2, 0.08, 1), M('#6b4a2e'), -2.6, 1, -3.8)); col(-3.7, -4.3, -1.5, -3.3);
  for (const [x, z] of [[-3.6, -4.2], [-1.6, -4.2], [-3.6, -3.4], [-1.6, -3.4]]) kamer.add(mesh(box(0.08, 1, 0.08), M('#4a3220'), x, 0.5, z));
  const radio = new THREE.Group(); radio.position.set(-2.6, 1.04, -3.85);
  radio.add(mesh(box(0.9, 0.42, 0.3), M('#2a2a2a'), 0, 0.21, 0));
  for (const sx of [-0.25, 0.25]) radio.add(mesh(cylG(0.14, 0.14, 0.02, 12).rotateX(Math.PI / 2), M('#555'), sx, 0.21, 0.16));
  radio.add(mesh(box(0.2, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: '#ffb84a' }), 0, 0.33, 0.16));
  const ant = mesh(box(0.02, 0.8, 0.02), M('#c9ccd1'), 0.35, 0.8, 0); ant.rotation.z = -0.4; radio.add(ant);
  kamer.add(radio);
  use(-2.6, 1.25, -3.85, 0.45, () => `Radio: ${STATIONS.find((s) => s.id === save.radio)?.name || ''} → volgende`, () => {
    const i = STATIONS.findIndex((s) => s.id === save.radio);
    save.radio = STATIONS[(i + 1) % STATIONS.length].id; persist();
    noise(0.25, 0.25); // radio-ruis bij het wisselen
    noteOsso(`📻 ${STATIONS.find((s) => s.id === save.radio).name.replace('📻 ', '')}`);
    renderKamer();
  });
  // plank met trofeeën: één per prestatie (max 12), een grote voor de Wall of Fame
  kamer.add(mesh(box(3.2, 0.08, 0.5), M('#6b4a2e'), 0.6, 1.7, -4.2));
  const n = Math.min(12, Object.keys(save.ach || {}).length);
  for (let i = 0; i < n; i++) { const c = makeCup(0.35); c.position.set(-0.8 + i * 0.25, 1.86, -4.2); kamer.add(c); }
  use(0.6, 1.9, -4.2, 0.8, () => `Prijzenkast (${Object.keys(save.ach || {}).length}/${ACH.length})`, () => ossoTo(() => $('#achBtn').click()));
  if (save.story?.hatert?.cleared || save.story?.arena?.cleared) {
    const c = makeCup(1.1, bekerMat, 'high'); c.position.set(-3.2, 0.45, -1); kamer.add(c); col(-3.6, -1.4, -2.8, -0.6);
    use(-3.2, 1, -1, 0.6, () => 'De echte beker', () => { if (!playClip('dbivo', true)) speak('Die beker is van ons!'); noteOsso('🏆 DIE BEKER IS VAN ONS!'); });
  }
  // plakboek op het bureau
  kamer.add(mesh(box(0.5, 0.06, 0.35), M('#c8202b'), -1.9, 1.07, -3.6));
  use(-1.9, 1.1, -3.6, 0.35, () => 'Plakboek', () => ossoTo(() => { showScreen('#plakboek'); renderPlakboek(); }));
  // ---------- wc ----------
  const wcMat = ossoHas('goudwc') ? goldMat : M('#f4f4f4');
  solid(0.45, 0.45, 0.6, wcMat, 5, 0.22, -0.6);
  kamer.add(mesh(box(0.45, 0.6, 0.2), wcMat, 5, 0.7, -0.85));
  use(5, 0.6, -0.6, 0.5, () => 'Doortrekken', () => { noise(1.2, 0.3); noteOsso('🚽 *spoel*'); });
  // ---------- woonkamer ----------
  solid(0.5, 0.7, 1.6, M('#2a2a2a'), -3.65, 0.35, 6.5); // tv-meubel
  kamer.add(mesh(box(0.3, 0.9, 1.4), M('#3a3a3a'), -3.65, 1.15, 6.5));
  fp.tvTex = canvasTex(64, 48, (x) => { x.fillStyle = '#111'; x.fillRect(0, 0, 64, 48); });
  const scherm = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.78), new THREE.MeshBasicMaterial({ map: fp.tvTex }));
  scherm.position.set(-3.49, 1.15, 6.5); scherm.rotation.y = Math.PI / 2; kamer.add(scherm);
  use(-3.5, 1.15, 6.5, 0.7, () => fp.tv ? 'Tv uit' : 'Tv aan', () => { fp.tv = !fp.tv; noise(0.15, 0.2); if (fp.tv) noteOsso('📺 NEC TV: herhaling van de bekerfinale'); else drawTv(0); });
  // geheime knop naast de tv
  kamer.add(mesh(box(0.05, 0.11, 0.11), M('#7a1010'), -3.93, 0.95, 7.55));
  use(-3.93, 0.95, 7.55, 0.22, () => '???', () => summonSteve());
  // bank met kussens
  const bankMat = fabricMat(ossoHas('necbank') ? '#c8202b' : '#7a1a1f');
  solid(1, 0.45, 2.6, bankMat, 0.2, 0.22, 6.5);
  kamer.add(mesh(box(0.3, 0.6, 2.6), ossoHas('necbank') ? fabricMat('#141414') : bankMat, 0.6, 0.75, 6.5));
  if (ossoHas('necbank')) kamer.add(mesh(box(0.32, 0.12, 2.62), fabricMat('#1f7a3a'), 0.6, 1.0, 6.5));
  for (const z of [5.6, 7.4]) kamer.add(mesh(box(0.2, 0.3, 0.4), fabricMat(z < 6 ? '#c8202b' : '#1f7a3a'), 0.4, 0.6, z));
  use(0.2, 0.5, 6.5, 0.9, () => 'Op de bank hangen', () => { fp.x = -0.62; fp.z = 6.5; fp.yaw = Math.PI / 2; fp.pitch = -0.05; fp.sit = 1.5; noteOsso('🛋️ Chillen in de osso'); });
  // salontafel met blikjes
  solid(0.8, 0.4, 1.2, M('#6b4a2e'), -1.7, 0.2, 6.5);
  for (const [z, c] of [[6.2, '#ff8a00'], [6.6, '#e41e2b'], [6.9, '#ff8a00']]) kamer.add(mesh(cylG(0.04, 0.04, 0.13, 8), M(c), -1.7, 0.47, z));
  poster('img/poster-patricus.jpg', 0.85, 1.2, 2.6, 1.9, 9.93, Math.PI);
  poster('img/spandoek.png', 1.4, 1.4, -3.93, 2.3, 4.2, Math.PI / 2);
  // plant
  kamer.add(mesh(cylG(0.22, 0.18, 0.4, 8), M('#8a4a2a'), 5.4, 0.2, 9.4)); col(5.1, 9.1, 5.7, 9.7);
  kamer.add(mesh(new THREE.IcosahedronGeometry(0.45, 0), M('#2e7a35'), 5.4, 0.85, 9.4));
  // voordeur: naar buiten = terug naar het menu
  kamer.add(mesh(box(1.1, 2.2, 0.08), M('#5a2a12'), 0.6, 1.1, 9.92));
  kamer.add(mesh(box(0.08, 0.08, 0.1), M('#c9a227'), 0.2, 1.05, 9.86));
  use(0.6, 1.2, 9.9, 0.7, () => 'Naar buiten (osso uit)', () => closeKamer());
  // ---------- keuken ----------
  solid(0.7, 0.95, 4.6, M('#e9e4da'), 10.6, 0.47, 5.1); // aanrecht
  kamer.add(mesh(box(0.72, 0.05, 4.62), M('#3a3a3a'), 10.6, 0.97, 5.1));
  kamer.add(mesh(box(0.4, 0.04, 0.5), M('#9aa0a6'), 10.6, 1.0, 4.2)); // gootsteen
  solid(0.8, 2, 0.8, M('#f2f2f2'), 10.55, 1, 8.9); // koelkast
  kamer.add(mesh(box(0.04, 0.5, 0.04), M('#9aa0a6'), 10.12, 1.3, 8.65));
  use(10.4, 1.2, 8.9, 0.7, () => 'Koelkast: pak een Fanta', () => {
    save.stats.fanta = (save.stats.fanta || 0) + 1; persist();
    sfx.beker();
    noteOsso(['🥤 Fanta! Koud en lekker.', '🥤 Nog eentje dan.', '🥤 Dit is al Fanta nummer ' + save.stats.fanta + '.', '🥤 De koelkast in de osso is nooit leeg.'][Math.floor(Math.random() * 4)]);
  });
  // keukentafel met pizzadoos
  solid(1.4, 0.06, 1, M('#6b4a2e'), 8.3, 0.78, 6.2);
  for (const [x, z] of [[7.7, 5.8], [8.9, 5.8], [7.7, 6.6], [8.9, 6.6]]) kamer.add(mesh(box(0.06, 0.78, 0.06), M('#4a3220'), x, 0.39, z));
  for (const z of [5.3, 7.1]) solid(0.45, 0.45, 0.45, M('#c8202b'), 8.3, 0.22, z);
  kamer.add(mesh(box(0.6, 0.06, 0.6), M('#d9b26a'), 8.3, 0.84, 6.2));
  use(8.3, 0.9, 6.2, 0.5, () => 'Pizzadoos', () => noteOsso('🍕 Leeg. Wie heeft m\'n pizza op?!'));
  // Jens Arcade: kast met minigames
  solid(0.9, 1.9, 0.8, M('#1a1030'), 3.9, 0.95, 9.45);
  kamer.add(mesh(box(0.92, 0.3, 0.82), M('#c8202b'), 3.9, 1.95, 9.45));
  kamer.add(mesh(box(0.8, 0.08, 0.3), M('#2a2a2a'), 3.9, 1.05, 9.0));
  kamer.add(mesh(box(0.06, 0.06, 0.06), M('#ff3b3b'), 3.75, 1.1, 8.95)); kamer.add(mesh(box(0.06, 0.06, 0.06), M('#ffd23f'), 3.95, 1.1, 8.95));
  { const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(64, 48, (x) => { x.fillStyle = '#0b1030'; x.fillRect(0, 0, 64, 48); x.fillStyle = '#ffd23f'; x.font = 'bold 9px monospace'; x.textAlign = 'center'; x.fillText('JENS', 32, 16); x.fillText('ARCADE', 32, 28); x.fillStyle = '#7dff6a'; x.fillText('▶ START', 32, 42); }) }));
    sc.position.set(3.9, 1.5, 9.04); sc.rotation.y = Math.PI; sc.rotation.x = -0.15; kamer.add(sc); }
  use(3.9, 1.4, 9.0, 0.7, () => 'Jens Arcade: minigames', () => ossoTo(() => openArcade()));
  buildOssoItems(col, solid, use);
  // deur naar het Montessori College
  kamer.add(mesh(box(1.1, 2.2, 0.08), M('#9a6a3a'), 2.4, 1.1, 2.6));
  kamer.add(mesh(box(0.08, 0.08, 0.1), M('#c9a227'), 2.0, 1.05, 2.66));
  { const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.41), new THREE.MeshBasicMaterial({ map: montessoriSign() })); sg.position.set(2.4, 2.48, 2.58); kamer.add(sg); }
  use(2.4, 1.2, 2.6, 0.7, () => 'Naar het Montessori College', () => enterKlas());
  buildKlas(col, solid, use, poster, floor, wall, behang, wit);
  const merged = mergeStatic(kamer);
  while (kamer.children.length) kamer.remove(kamer.children[0]);
  for (const c of [...merged.children]) kamer.add(c);
  addKlasPeople();
  kamerBuilt = true;
}
// Steve: komt tevoorschijn als je de geheime knop vindt
let steve = null;
function makeSteve() {
  const g = new THREE.Group();
  const skin = M('#c69276'), shirt = M('#2fa8a8'), broek = M('#3b3f9e'), schoen = M('#6a6a6a'), haar = M('#3b2614');
  const faceTex = canvasTex(8, 8, (x) => {
    x.fillStyle = '#c69276'; x.fillRect(0, 0, 8, 8);
    x.fillStyle = '#3b2614'; x.fillRect(0, 0, 8, 2); x.fillRect(0, 2, 1, 1); x.fillRect(7, 2, 1, 1);
    x.fillStyle = '#ffffff'; x.fillRect(1, 4, 1, 1); x.fillRect(5, 4, 1, 1);
    x.fillStyle = '#4b3a8c'; x.fillRect(2, 4, 1, 1); x.fillRect(6, 4, 1, 1);
    x.fillStyle = '#8a5a44'; x.fillRect(3, 5, 2, 1);
    x.fillStyle = '#5a3424'; x.fillRect(2, 6, 4, 1);
  });
  const head = new THREE.Mesh(box(0.5, 0.5, 0.5), [skin, skin, haar, skin, skin, new THREE.MeshLambertMaterial({ map: faceTex })]);
  head.position.y = 1.75; g.add(head);
  g.add(mesh(box(0.5, 0.75, 0.25), shirt, 0, 1.125, 0));
  for (const sx of [-0.375, 0.375]) { g.add(mesh(box(0.25, 0.75, 0.25), skin, sx, 1.125, 0)); g.add(mesh(box(0.25, 0.3, 0.25), shirt, sx, 1.35, 0)); }
  for (const sx of [-0.125, 0.125]) { g.add(mesh(box(0.25, 0.75, 0.25), broek, sx, 0.375, 0)); g.add(mesh(box(0.25, 0.1, 0.25), schoen, sx, 0.05, 0)); }
  // vuursteen en staal in z'n hand
  g.add(mesh(box(0.06, 0.18, 0.06), M('#9aa0a6'), 0.42, 0.72, -0.1));
  g.add(mesh(box(0.08, 0.08, 0.08), M('#3a3a3a'), 0.42, 0.66, -0.2));
  g.userData.head = head;
  return g;
}
function summonSteve() {
  if (!steve) { steve = makeSteve(); steve.position.set(-2.4, 0, 8.7); kamer.add(steve); }
  steve.rotation.y = Math.atan2(-(fp.x - steve.position.x), -(fp.z - steve.position.z)); // kijkt je aan
  steve.visible = true;
  noise(0.3, 0.2);
  setTimeout(() => {
    if (state !== 'kamer') return;
    if (!playClip('steve', true)) speak('Flint and steel');
    bubble(steve.userData.head, 'Flint and steel.', '', 2.4);
  }, 300);
}
function drawTv(t) {
  const c = fp.tvTex?.image;
  if (!c) return;
  const x = c.getContext('2d');
  if (!fp.tv) { x.fillStyle = '#111'; x.fillRect(0, 0, 64, 48); fp.tvTex.needsUpdate = true; return; }
  x.fillStyle = '#2f8a3a'; x.fillRect(0, 0, 64, 48);
  x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(31, 0, 2, 48);
  for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#c8202b' : '#000'; x.fillRect((Math.sin(t * 0.8 + i * 1.3) * 0.5 + 0.5) * 58, 14 + (i * 7) % 24, 4, 6); }
  x.fillStyle = '#fff'; x.fillRect((Math.sin(t * 1.7) * 0.5 + 0.5) * 60, 26 + Math.sin(t * 2.3) * 8, 3, 3);
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 9); x.fillStyle = '#ffd23f'; x.font = '7px monospace'; x.fillText('NEC 3-0 VIT', 2, 7);
  if (Math.random() < 0.15) { x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(0, Math.random() * 48, 64, 2); }
  fp.tvTex.needsUpdate = true;
}
function noteOsso(t) { const el = $('#ossoMsg'); el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
// vanuit de osso even een ander scherm openen; TERUG daar brengt je weer naar dezelfde plek
function ossoTo(fn) {
  fp.sub = true;
  if (document.pointerLockElement) document.exitPointerLock();
  klasTalk = null; renderTalk(); clearBubbles();
  kamer.visible = false; jens.root.visible = true; state = 'menu'; applyLook(phaseT);
  fn();
}
// ---------- Montessori-lokaal: via de deur in de osso ----------
const KLAS_X = 40; // ligt los van het huis, je wordt erheen 'gebracht' door de deur
const klasPeople = [];
let klasTalk = null, klasChatT = 8, klasGreeted = {};
function montessoriSign() {
  const t = canvasTex(512, 192, (x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 192); });
  loadImg(LOGO_URL).then((im) => { t.image.getContext('2d').drawImage(im, 256 - 96 * LOGO_RATIO, 0, 192 * LOGO_RATIO, 192); t.needsUpdate = true; }).catch(() => {});
  return t;
}
function scribble(seed) {
  return canvasTex(64, 80, (x) => {
    x.fillStyle = '#f7f5ee'; x.fillRect(0, 0, 64, 80);
    x.strokeStyle = 'rgba(80,120,200,.35)'; for (let y = 10; y < 80; y += 7) { x.beginPath(); x.moveTo(0, y); x.lineTo(64, y); x.stroke(); }
    x.lineWidth = 2;
    if (seed % 4 === 0) { x.strokeStyle = '#c8202b'; x.font = 'bold 18px Arial'; x.fillStyle = '#c8202b'; x.fillText('NEC', 12, 40); x.strokeRect(6, 20, 52, 28); }
    else if (seed % 4 === 1) { x.strokeStyle = '#222'; x.beginPath(); x.arc(18, 58, 9, 0, 7); x.arc(48, 58, 9, 0, 7); x.moveTo(18, 58); x.lineTo(32, 40); x.lineTo(48, 58); x.moveTo(32, 40); x.lineTo(40, 32); x.stroke(); } // brommer
    else if (seed % 4 === 2) { x.strokeStyle = '#222'; x.beginPath(); x.arc(32, 22, 8, 0, 7); x.moveTo(32, 30); x.lineTo(32, 52); x.moveTo(20, 40); x.lineTo(44, 40); x.moveTo(32, 52); x.lineTo(22, 70); x.moveTo(32, 52); x.lineTo(42, 70); x.stroke(); x.fillStyle = '#c8202b'; x.fillRect(36, 18, 22, 3); } // poppetje met laserogen
    else { x.fillStyle = '#333'; x.font = '9px Arial'; for (let i = 0; i < 7; i++) x.fillText(['x = 2y + 4', 'H4 opg 12', 'wtf', 'saai', '3² = 9', 'NEC!!', '???'][i], 6, 14 + i * 9); }
  });
}
function necPoster(i) {
  return canvasTex(64, 90, (x) => {
    const k = ['#c8202b', '#1f7a3a', '#141414'];
    for (let s = 0; s < 9; s++) { x.fillStyle = k[s % 3]; x.fillRect(0, s * 10, 64, 10); }
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(4, 20, 56, 48);
    x.fillStyle = '#fff'; x.font = 'bold 20px Impact, Arial'; x.textAlign = 'center';
    x.fillText('NEC', 32, 44);
    x.font = 'bold 8px Arial';
    x.fillText(['NIJMEGEN', 'DIE BEKER IS VAN ONS', 'GOFFERT 1900', 'EUROPA 2026'][i % 4], 32, 60, 58);
  });
}
// statische inrichting; personen komen er pas na het samenvoegen bij
function buildKlas(col, solid, use, poster, floor, wall, behang, wit) {
  const X = KLAS_X;
  const lino = new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = '#9aa5a8'; x.fillRect(0, 0, 64, 64); grain(x, 64, 64, 14); x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, 31, 64, 2); x.fillRect(31, 0, 2, 64); }) });
  floor(X - 6, -5, X + 6, 5, lino);
  kamer.add(mesh(box(12, 0.1, 10), wit, X, WALL_H + 0.05, 0));
  wall(X - 6, -5, X + 6, -5, wit); wall(X - 6, 5, X + 6, 5, wit); wall(X - 6, -5, X - 6, 5, wit); wall(X + 6, -5, X + 6, 5, wit);
  for (const [lx, lz] of [[X - 3, -2], [X + 3, -2], [X - 3, 2.5], [X + 3, 2.5]]) kamer.add(mesh(box(1.4, 0.06, 0.5), new THREE.MeshBasicMaterial({ color: '#f4f8ff' }), lx, WALL_H - 0.03, lz));
  // ramen
  const raam = new THREE.MeshBasicMaterial({ color: '#bfe0ff' });
  for (const z of [-3, 0, 3]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4), raam); r.position.set(X + 5.93, 1.9, z); r.rotation.y = -Math.PI / 2; kamer.add(r); }
  // whiteboard
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.4), new THREE.MeshLambertMaterial({ map: canvasTex(256, 90, (x) => {
    x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 256, 90);
    x.fillStyle = '#1d3f8f'; x.font = 'bold 15px Arial'; x.fillText('Wiskunde H4', 12, 22);
    x.font = '12px Arial'; x.fillText('Huiswerk: opg. 12 t/m 25', 12, 44); x.fillText('Toets volgende week!!', 12, 62);
    x.fillStyle = '#c8202b'; x.fillText('NIET op het bord tekenen JENS', 12, 82);
  }) }));
  bord.position.set(X, 1.9, -4.93); kamer.add(bord);
  // docentenbureau
  solid(2.2, 0.08, 1, M('#8a6a4a'), X + 2.4, 0.78, -3.4);
  kamer.add(mesh(box(2.2, 0.7, 0.05), M('#6b4a2e'), X + 2.4, 0.4, -2.92));
  kamer.add(mesh(box(0.3, 0.04, 0.22), M('#1d3f8f'), X + 1.8, 0.84, -3.3));
  kamer.add(mesh(cylG(0.05, 0.04, 0.1, 8), M('#f4f4f4'), X + 3.2, 0.87, -3.2)); // koffie
  // lege leerlingtafels
  for (const tz of [-1.4, 0.4]) for (const tx of [X - 0.4, X + 1.8, X + 4]) {
    solid(1.3, 0.06, 0.6, M('#c9a77a'), tx, 0.72, tz);
    for (const sx of [-0.55, 0.55]) kamer.add(mesh(box(0.05, 0.72, 0.05), M('#555'), tx + sx, 0.36, tz));
    kamer.add(mesh(box(0.42, 0.05, 0.42), M('#2f5d9a'), tx, 0.45, tz + 0.55));
  }
  // de tafel van de jongens: één grote rotzooi
  solid(2.6, 0.06, 1.3, M('#c9a77a'), X - 3.4, 0.72, 1.9);
  for (const [sx, sz] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]]) kamer.add(mesh(box(0.05, 0.72, 0.05), M('#555'), X - 3.4 + sx, 0.36, 1.9 + sz));
  const boekKl = ['#c8202b', '#1d3f8f', '#2e7a35', '#e8a52a', '#7a3a8c', '#ffffff'];
  for (let i = 0; i < 9; i++) {
    const b = mesh(box(0.24, 0.04 + (i % 3) * 0.015, 0.32), M(boekKl[i % boekKl.length]), X - 4.5 + (i % 5) * 0.5 + rand(-0.1, 0.1), 0.77 + Math.floor(i / 5) * 0.06, 1.55 + (i % 2) * 0.6 + rand(-0.1, 0.1));
    b.rotation.y = rand(-0.8, 0.8); kamer.add(b);
  }
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshLambertMaterial({ map: scribble(i) }));
    p.rotation.x = -Math.PI / 2; p.rotation.z = rand(-1, 1);
    p.position.set(X - 4.4 + rand(0, 2.1), 0.757 + i * 0.002, 1.4 + rand(0, 1)); kamer.add(p);
  }
  for (let i = 0; i < 4; i++) { const pen = mesh(box(0.012, 0.012, 0.14), M(pick(['#c8202b', '#1d3f8f', '#111'])), X - 4 + rand(0, 1.6), 0.765, 1.5 + rand(0, 0.8)); pen.rotation.y = rand(0, 3); kamer.add(pen); }
  for (const [cx, cz, c] of [[X - 2.5, 1.5, '#ff8a00'], [X - 2.3, 2.3, '#e41e2b']]) kamer.add(mesh(cylG(0.035, 0.035, 0.12, 8), M(c), cx, 0.81, cz));
  // proppen papier en tassen op de vloer
  for (let i = 0; i < 6; i++) kamer.add(mesh(new THREE.IcosahedronGeometry(0.05, 0), M('#f4f4ee'), X - 5 + rand(0, 3), 0.05, 0.5 + rand(0, 2.8)));
  for (const [bx, bz, c] of [[X - 5.3, 0.6, '#1a1a1a'], [X - 2, 0.7, '#2e4a2e'], [X - 4.9, 3, '#3a2a5a']]) { solid(0.35, 0.4, 0.22, M(c), bx, 0.2, bz); }
  // posters bij de jongens: NEC + eigen posters
  poster('img/poster-patricus.jpg', 0.85, 1.2, X - 5.93, 1.9, 0.6, Math.PI / 2);
  poster('img/poster-ajax.jpg', 0.85, 1.08, X - 5.93, 1.9, 3.6, Math.PI / 2);
  for (const [i, z] of [[0, 1.6], [1, 2.6], [2, -0.4]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.05), new THREE.MeshLambertMaterial({ map: necPoster(i) })); p.position.set(X - 5.93, 1.95, z); p.rotation.y = Math.PI / 2; kamer.add(p); }
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.26), new THREE.MeshLambertMaterial({ map: necPoster(3) })); p.position.set(X - 3.4, 2.0, 4.93); p.rotation.y = Math.PI; kamer.add(p); }
  // deur terug naar de osso
  kamer.add(mesh(box(1.1, 2.2, 0.08), M('#9a6a3a'), X - 4.5, 1.1, 4.92));
  { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.41), new THREE.MeshBasicMaterial({ map: montessoriSign() })); s.position.set(X - 4.5, 2.5, 4.9); s.rotation.y = Math.PI; kamer.add(s); }
  use(X - 4.5, 1.2, 4.9, 0.7, () => 'Terug naar m\'n osso', () => { fp.x = 2.4; fp.z = 3.4; fp.yaw = Math.PI; fp.pitch = -0.05; clearBubbles(); klasTalk = null; renderTalk(); noteOsso('🏠 Weer in m\'n osso'); });
  // stoelen van de jongens en de docenten (zitten in de weg)
  col(X - 4.2, 0.6, X - 2.2, 1.2); col(X - 5.4, 1.4, X - 4.7, 2.4); col(X + 1.4, -4.6, X + 3.4, -3.9);
}
function longSleeves(p, mat) { for (const [sh, el] of [[p.armL, p.elL], [p.armR, p.elR]]) { sh.children[1].material = mat; el.children[0].material = mat; } }
function baggy(p, k = 1.3) { for (const leg of [p.legL, p.legR]) { leg.children[0].scale.set(k, 1, k); leg.children[1].children[0].scale.set(k * 1.05, 1, k * 1.05); } }
const KLAS_LINES = {
  tim: {
    hi: ['Ewaa Jens! Boks.', 'Yo broer, hoe is \'t?', 'Jenss! Alles goed man?'],
    talk: ['Zag je NEC zondag? Wat een goal man, ik ging helemaal los', 'NEC gaat dit jaar Europa in, let maar op', 'Ik heb kaartjes voor de Goffert, ga je mee?', 'Die beker is van ons, broer. DIE BEKER IS VAN ONS!', 'Als NEC wint kom ik de hele week met m\'n sjaal naar school', 'Die scheids zondag was echt blind, man', 'Volgend seizoen neem ik een seizoenskaart, zeker weten', 'Heb je de samenvatting van NEC gezien? Moet je echt kijken'],
  },
  patrick: {
    hi: ['Ey Jens. Wat moet je?', 'Yo. Alles kits?', 'Kijk wie we daar hebben, kut-Jens'],
    talk: ['M\'n brommer loopt nu 70, ik zweer het', 'Nieuwe uitlaat erop gezet, je hoort me van drie straten', 'Wie heeft er aan m\'n brommer gezeten? Ik sla je tering hard', 'Hou je bek, ik ben aan het praten over m\'n Puch', 'Die handhaver kan de pot op, ik rij gewoon over de stoep', 'Wat kijk je nou, sukkel', 'Kut-wiskunde. Ik ga lekker brommeren straks', 'Ik heb hem opgevoerd, niet tegen m\'n moeder zeggen hè', 'Godverdomme, m\'n brommer staat weer in de regen'],
  },
  jesse: {
    hi: ['Ewa Jens... wat ben je nu weer aan het doen?', 'Yo Jens. Waarom kijk je zo?', 'Hey gek'],
    talk: ['Jens, waarom kwamen er gisteren lasers uit je ogen?', 'Bro, waarom ren je altijd weg van iedereen?', 'Jij bent echt de raarste gast die ik ken', 'Waarom noem je je huis een osso, man', 'Je hebt weer een babypijltje afgestoken hè. Iedereen weet het', 'Ik zag je gisteren tegen je radio praten', 'Waarom zit er Fanta op je broek?', 'Jens, waarom heb je je haar ineens platinablond?'],
  },
};
const JENS_HI = (n) => pick([`Ewa ${n}!`, `Yo ${n}, alles goed?`, `Wollah ${n}, daar ben je`, 'Hey gekkie!', `${n}! Boks.`]);
const JENS_RE = ['Haha echt?', 'Serieus?', 'Broer…', 'Nee man', 'Hahaha', 'Wollah?', 'Zeker weten'];
const KLAS_CHAT = [
  ['tim', 'Patrick, ga je zondag mee naar NEC?', 'patrick', 'Als ik m\'n brommer voor de deur mag zetten ja'],
  ['jesse', 'Heb jij gezien wat Jens gisteren deed?', 'tim', 'Hahaha ja, echt de raarste'],
  ['patrick', 'Wie heeft m\'n pen gejat? Tering.', 'jesse', 'Hij ligt gewoon voor je neus man'],
  ['tim', 'Die beker is van ons!', 'jesse', 'Ja ja, rustig nou'],
  ['patrick', 'Ik ga zo naar de brommerwinkel', 'tim', 'Neem je me achterop mee?'],
];
function addKlasPeople() {
  klasPeople.length = 0;
  const X = KLAS_X;
  const add = (id, name, p, x, z, ry, kind) => {
    p.root.position.set(x, 0, z); p.root.rotation.y = ry; p.baseRy = ry; kamer.add(p.root);
    const c = { id, name, p, kind }; klasPeople.push(c);
    ossoUse.push({ p: new THREE.Vector3(x, 1.15, z), r: 0.45, label: () => (kind === 'read' ? `${name} (docent)` : `Praat met ${name}`), fn: () => talkTo(c) });
    return p;
  };
  // Jesse: zwarte muts, zwarte hoodie met lichtgrijze capuchon, baggy legerbroek
  const jesse = makePerson({ key: 'jesse', skin: '#efcdb4', hair: '#151515', hairStyle: 'muts', shirt: { base: '#161616', paint(x, side) { if (side === 'front') { x.fillStyle = '#222'; x.fillRect(40, 78, 48, 22); x.strokeStyle = '#cfcfcf'; x.lineWidth = 2; x.beginPath(); x.moveTo(58, 0); x.lineTo(56, 30); x.moveTo(70, 0); x.lineTo(72, 30); x.stroke(); } } },
    pants: '#56603f', shoes: '#1a1a1a', face: { skin: '#efcdb4', brow: '#3a2a1a' } });
  longSleeves(jesse, fabricMat('#161616')); baggy(jesse, 1.35);
  jesse.body.add(mesh(box(0.34, 0.2, 0.14), fabricMat('#c9c9c9'), 0, 1.5, 0.14)); // capuchon
  add('jesse', 'Jesse', jesse, X - 5, 1.9, -Math.PI / 2, 'seat');
  // Tim: baggy jeans, donkergroene trui, kort donkerbruin haar
  const tim = makePerson({ key: 'tim', skin: '#f0cdb2', hair: '#3a2617', hairStyle: 'kort', shirt: { base: '#1f4a2c', paint() {} }, pants: '#3d5a86', shoes: '#f0f0f0', face: { skin: '#f0cdb2', brow: '#3a2617' } });
  longSleeves(tim, fabricMat('#1f4a2c')); baggy(tim, 1.3);
  add('tim', 'Tim', tim, X - 3.9, 0.9, Math.PI, 'seat');
  // Patrick: donkergrijze spijkerbroek, donkergrijs spijkerjack met zwarte leren mouwen, kort zwart haar
  const patrick = makePerson({ key: 'patrick', skin: '#ecc8ac', hair: '#121010', hairStyle: 'kort', shirt: { base: '#4a4e55', paint(x, side) { if (side === 'front') { x.fillStyle = '#2a2d32'; x.fillRect(62, 0, 4, 128); x.fillStyle = '#b8b8b8'; for (let y = 20; y < 120; y += 22) x.fillRect(68, y, 4, 4); x.fillStyle = '#3a3d42'; x.fillRect(38, 34, 20, 14); x.fillRect(74, 34, 20, 14); } } },
    pants: '#3e4148', shoes: '#151515', face: { skin: '#ecc8ac', brow: '#121010' } });
  const leer = new THREE.MeshLambertMaterial({ color: '#141414', emissive: '#0a0a0a' });
  patrick.armL.children[0].material = leer; patrick.armR.children[0].material = leer; longSleeves(patrick, leer);
  add('patrick', 'Patrick', patrick, X - 2.8, 0.9, Math.PI, 'seat');
  // twee docenten achter het bureau, lezen gewoon
  for (const [i, dx] of [[0, 1.8], [1, 3.0]]) {
    const d = makePerson({ key: 'leraar' + i, skin: i ? '#d9a982' : '#f0cfb6', hair: i ? '#2a2018' : '#9a8a70', hairStyle: i ? 'kort' : 'lang', shirt: { base: i ? '#5a4a6a' : '#7a8a6a', paint() {} }, pants: '#333844', shoes: '#2a2a2a', face: { skin: i ? '#d9a982' : '#f0cfb6', brow: '#3a3020', glasses: !!i } });
    longSleeves(d, fabricMat(i ? '#5a4a6a' : '#7a8a6a'));
    const boek = mesh(box(0.22, 0.28, 0.04), M(i ? '#c8202b' : '#1d3f8f'), 0, -0.05, -0.05); boek.rotation.x = 0.4; d.handR.add(boek);
    add('leraar' + i, i ? 'Meneer' : 'Mevrouw', d, X + dx, -4.25, Math.PI, 'read');
  }
}
function renderTalk() {
  const el = $('#ossoTalk');
  if (!klasTalk || !klasTalk.lines[klasTalk.i]) { el.classList.add('hidden'); return; }
  const [who, txt] = klasTalk.lines[klasTalk.i];
  el.innerHTML = `<b>${escHtml(who)}</b> ${escHtml(txt)}`;
  el.classList.remove('hidden');
  const c = klasPeople.find((k) => k.name === who);
  if (c) bubble(c.p.head, txt, c.id === 'patrick' && /tering|sukkel|kut|godver|bek/i.test(txt) ? 'angry' : '', 2.6);
}
function talkTo(c) {
  if (c.kind === 'read') {
    klasTalk = { lines: [[c.name, pick(['Sst… ik ben aan het lezen.', 'Jens, ga eens zitten.', 'Heb jij je huiswerk al af?', 'Niet nu, Jens.', 'Hmm-hm.'])]], i: 0, t: 0, c };
  } else if (!klasGreeted[c.id]) {
    klasGreeted[c.id] = true;
    klasTalk = { lines: [['Jens', JENS_HI(c.name)], [c.name, pick(KLAS_LINES[c.id].hi)], [c.name, pick(KLAS_LINES[c.id].talk)]], i: 0, t: 0, c };
  } else {
    const l = [[c.name, pick(KLAS_LINES[c.id].talk)]];
    if (Math.random() < 0.5) l.push(['Jens', pick(JENS_RE)]);
    klasTalk = { lines: l, i: 0, t: 0, c };
  }
  renderTalk();
}
function updateKlas(dt) {
  if (!klasPeople.length) return;
  const inKlas = fp.x > KLAS_X - 7;
  for (const c of klasPeople) {
    pose(c.p, c.kind, dt);
    // wie praat, draait naar je toe
    const talking = klasTalk?.c === c;
    const want = talking ? Math.atan2(-(fp.x - c.p.root.position.x), -(fp.z - c.p.root.position.z)) : c.p.baseRy;
    let d = want - c.p.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    c.p.root.rotation.y += d * Math.min(1, dt * 5);
  }
  if (klasTalk) {
    klasTalk.t += dt;
    if (klasTalk.t > 2.8) { klasTalk.i++; klasTalk.t = 0; renderTalk(); if (!klasTalk.lines[klasTalk.i]) klasTalk = null; }
  } else if (inKlas && (klasChatT -= dt) <= 0) {
    // de jongens kletsen onderling
    klasChatT = rand(9, 15);
    const [a, ta, b, tb] = pick(KLAS_CHAT);
    const A = klasPeople.find((k) => k.id === a), B = klasPeople.find((k) => k.id === b);
    bubble(A.p.head, ta, '', 2.6);
    setTimeout(() => { if (state === 'kamer' && fp.x > KLAS_X - 7) bubble(B.p.head, tb, a === 'patrick' || b === 'patrick' ? '' : '', 2.6); }, 2400);
  }
}
function enterKlas() {
  fp.x = KLAS_X - 4.5; fp.z = 4.1; fp.yaw = 0.35; fp.pitch = -0.08;
  klasGreeted = {}; klasTalk = null; klasChatT = 7; renderTalk();
  noteOsso('🏫 Montessori College');
  setTimeout(() => {
    const [t, p, j] = ['tim', 'patrick', 'jesse'].map((id) => klasPeople.find((k) => k.id === id));
    bubble(t.p.head, 'JEEENS!', '', 1.8);
    setTimeout(() => bubble(j.p.head, 'Daar is ie weer…', '', 1.8), 700);
    setTimeout(() => bubble(p.p.head, 'Ey, doe de deur dicht man', 'angry', 1.8), 1400);
  }, 500);
}
// ---------- osso inrichten: meubels kopen met bekers ----------
const OSSO_ITEMS = [
  { id: 'necbank', icon: '🛋️', name: 'NEC-bank', price: 900 },
  { id: 'gamekast', icon: '🕹️', name: 'Gamekast', price: 1350 },
  { id: 'voetbaltafel', icon: '⚽', name: 'Voetbaltafel', price: 1200 },
  { id: 'aquarium', icon: '🐠', name: 'Aquarium', price: 1050 },
  { id: 'discobal', icon: '🪩', name: 'Discobal', price: 750 },
  { id: 'vlag', icon: '🚩', name: 'Grote NEC-vlag', price: 450 },
  { id: 'lavalamp', icon: '🔮', name: 'Lavalamp', price: 360 },
  { id: 'snoep', icon: '🍬', name: 'Snoepautomaat', price: 900 },
  { id: 'kerstboom', icon: '🎄', name: 'Kerstboom', price: 600 },
  { id: 'goudwc', icon: '🚽', name: 'Gouden wc', price: 2400 },
  { id: 'boombox', icon: '📻', name: 'JBL Boombox 5', price: 1500 },
  { id: 'flip', icon: '🔊', name: 'JBL Flip 5', price: 500 },
  { id: 'ps4', icon: '🎮', name: 'PS4', price: 1100 },
  { id: 'dvd', icon: '📀', name: 'Rammstein dvd-collectie', price: 420 },
  { id: 'jensfiets', icon: '🚲', name: 'Jens zijn fiets', price: 800 },
  { id: 'vouwfiets', icon: '🚲', name: 'Witte vouwfiets', price: 650 },
  { id: 'vwdoos', icon: '📦', name: 'Vuurwerkdoos', price: 380 },
  { id: 'cakes', icon: '🎆', name: 'Cakeboxen', price: 700 },
  { id: 'lawine', icon: '🚀', name: 'Lawinepijlen', price: 550 },
  { id: 'munitie', icon: '🧨', name: 'Munitiekist met rotjes', price: 480 },
];
const ossoHas = (id) => !!save.ossoItems?.[id];
let disco = null;
function buildOssoItems(col, solid, use) {
  disco = null;
  buildOssoItems2(col, solid, use);
  if (ossoHas('gamekast')) {
    const scr = canvasTex(64, 48, (x) => { x.fillStyle = '#05070c'; x.fillRect(0, 0, 64, 48); x.fillStyle = '#ff8a00'; x.font = 'bold 11px monospace'; x.fillText('JENS', 16, 18); x.fillText('RUN', 20, 32); x.fillStyle = '#ffd23f'; x.fillRect(8, 40, 48, 2); });
    solid(0.9, 1.8, 0.8, M('#1f4fa8'), -3.4, 0.9, 9.3);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ map: scr })); s.position.set(-3.4, 1.35, 8.89); s.rotation.y = Math.PI; kamer.add(s);
    kamer.add(mesh(box(0.8, 0.08, 0.3), M('#141414'), -3.4, 1.0, 8.8));
    use(-3.4, 1.3, 8.9, 0.5, () => 'Speel op de gamekast', () => { tone(660, 0.08, 'square', 0.06); tone(880, 0.1, 'square', 0.06, null, 0.1); noteOsso(`🕹️ Jens' record: ${Math.max(0, ...Object.values(save.best || {})).toLocaleString('nl-NL')} punten`); });
  }
  if (ossoHas('voetbaltafel')) {
    solid(1.4, 0.15, 0.8, M('#6b4a2e'), 3.6, 0.85, 5.6);
    kamer.add(mesh(box(1.3, 0.02, 0.7), M('#2e7a35'), 3.6, 0.93, 5.6));
    for (let i = 0; i < 4; i++) kamer.add(mesh(cylG(0.015, 0.015, 1.1, 6).rotateX(Math.PI / 2), M('#c9ccd1'), 3.05 + i * 0.36, 1.0, 5.6));
    for (const [x, z] of [[3, 5.3], [4.2, 5.3], [3, 5.9], [4.2, 5.9]]) kamer.add(mesh(box(0.08, 0.8, 0.08), M('#4a3220'), x, 0.4, z));
    use(3.6, 1, 5.6, 0.6, () => 'Potje tafelvoetbal', () => { noise(0.15, 0.2); noteOsso(`⚽ ${pick(['NEC 3 - 0 Vitesse', 'NEC 5 - 1 Ajax', 'NEC 2 - 2 PSV, last-minute!', 'NEC 1 - 0 Feyenoord'])}`); });
  }
  if (ossoHas('aquarium')) {
    solid(0.6, 0.7, 1.4, M('#2a2a2a'), 5.5, 0.35, 8.1);
    kamer.add(mesh(box(0.55, 0.6, 1.3), new THREE.MeshLambertMaterial({ color: '#4dc2ff', transparent: true, opacity: 0.55, emissive: '#0a3a5a' }), 5.5, 1.0, 8.1));
    for (let i = 0; i < 3; i++) kamer.add(mesh(box(0.04, 0.05, 0.1), M(pick(['#ff8a00', '#ffd23f', '#e8203a'])), 5.45, 0.9 + i * 0.12, 7.8 + i * 0.25));
    use(5.5, 1, 8.1, 0.6, () => 'Vissen voeren', () => noteOsso('🐠 Blub. De vissen heten Nejašmić, Proper en Ouaissa.'));
  }
  if (ossoHas('discobal')) {
    disco = mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshLambertMaterial({ color: '#d8dce4', emissive: '#555a66', flatShading: true }), 1, WALL_H - 0.5, 6.3);
    kamer.add(mesh(box(0.02, 0.3, 0.02), M('#999'), 1, WALL_H - 0.15, 6.3));
    disco.userData.keep = true; kamer.add(disco);
  }
  if (ossoHas('vlag')) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshLambertMaterial({ map: canvasTex(96, 64, (x) => { ['#c8202b', '#1f7a3a', '#141414'].forEach((c, i) => { x.fillStyle = c; x.fillRect(0, i * 21.4, 96, 22); }); x.fillStyle = '#fff'; x.font = 'bold 22px Impact, Arial'; x.textAlign = 'center'; x.fillText('NEC', 48, 41); }), side: THREE.DoubleSide }));
    v.position.set(-2.3, 2.2, 9.93); v.rotation.y = Math.PI; kamer.add(v);
  }
  if (ossoHas('lavalamp')) {
    kamer.add(mesh(cylG(0.08, 0.12, 0.08, 8), M('#c9a227'), -3.65, 0.74, 5.95));
    kamer.add(mesh(cylG(0.06, 0.09, 0.32, 8), new THREE.MeshBasicMaterial({ color: '#ff4d8a' }), -3.65, 0.94, 5.95));
  }
  if (ossoHas('snoep')) {
    solid(0.8, 1.7, 0.6, M('#c8202b'), 7.2, 0.85, 9.55);
    kamer.add(mesh(box(0.6, 0.8, 0.02), new THREE.MeshLambertMaterial({ color: '#bfe0ff', emissive: '#1a2a3a' }), 7.2, 1.15, 9.24));
    use(7.2, 1.2, 9.3, 0.5, () => 'Snoep uit de automaat', () => { tone(1200, 0.05, 'square', 0.05); noteOsso(`🍬 ${pick(['Mars!', 'Twix!', 'Een zak Haribo!', 'Hij blijft hangen…'])}`); });
  }
  if (ossoHas('kerstboom')) {
    kamer.add(mesh(coneG(0.7, 1.9, 8), M('#2e6b35'), -3.3, 1.15, 3.4)); col(-3.9, 2.8, -2.7, 4.0);
    kamer.add(mesh(cylG(0.15, 0.15, 0.3, 8), M('#6b4a2e'), -3.3, 0.15, 3.4));
    for (let i = 0; i < 9; i++) { const a = i * 2.3, h = 0.4 + (i / 9) * 1.4, r = 0.65 * (1 - (h - 0.2) / 1.9); kamer.add(mesh(sphG(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: pick(['#ffd23f', '#e8203a', '#4dd2ff']) }), -3.3 + Math.cos(a) * r, h + 0.2, 3.4 + Math.sin(a) * r)); }
  }
}
function buildOssoItems2(col, solid, use) {
  const rood = M('#c8202b'), zwart = M('#141416'), wit = M('#f2f2f2');
  const labelTex = (w, h, bg, fg, txt, sz) => canvasTex(w, h, (x) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = `${sz}px Anton, Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, w / 2, h / 2 + 1, w - 4); });
  const jbl = (w, h) => new THREE.MeshBasicMaterial({ map: labelTex(64, 32, '#e8641b', '#fff', 'JBL', 22) });
  const speel = (msg) => { tone(82, 0.2, 'sine', 0.2); tone(110, 0.2, 'sine', 0.18, null, 0.22); tone(82, 0.3, 'sine', 0.2, null, 0.44); noteOsso(msg); };
  if (ossoHas('boombox')) {
    // grote zwarte draagbare speaker met handvat op de vloer
    solid(0.95, 0.42, 0.42, zwart, -3.3, 0.21, 4.75);
    kamer.add(mesh(box(0.8, 0.05, 0.05), M('#333'), -3.3, 0.62, 4.75), mesh(box(0.05, 0.2, 0.05), M('#333'), -3.68, 0.52, 4.75), mesh(box(0.05, 0.2, 0.05), M('#333'), -2.92, 0.52, 4.75));
    for (const sx of [-0.28, 0.28]) { const c = mesh(cylG(0.15, 0.15, 0.03, 10).rotateX(Math.PI / 2), M('#34343a'), -3.3 + sx, 0.21, 4.53); kamer.add(c); }
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1).rotateY(Math.PI), jbl()); b.position.set(-3.3, 0.21, 4.51); kamer.add(b);
    use(-3.3, 0.4, 4.75, 0.7, () => 'JBL Boombox 5 aanzetten', () => speel('📻 De hele straat kan meegenieten.'));
  }
  if (ossoHas('flip')) {
    kamer.add(mesh(cylG(0.05, 0.05, 0.2, 8).rotateZ(Math.PI / 2), M('#1f4fa8'), -1.7, 0.46, 6.0));
    use(-1.7, 0.5, 6.0, 0.5, () => 'JBL Flip 5 aanzetten', () => speel('🔊 Klein, maar hard genoeg voor de buren.'));
  }
  if (ossoHas('ps4')) {
    kamer.add(mesh(box(0.28, 0.05, 0.4), zwart, -3.6, 0.73, 7.05));
    kamer.add(mesh(box(0.3, 0.01, 0.42), M('#26262c'), -3.6, 0.76, 7.05));
    kamer.add(mesh(box(0.02, 0.01, 0.2), new THREE.MeshBasicMaterial({ color: '#4dc2ff' }), -3.44, 0.73, 7.05));
    kamer.add(mesh(box(0.16, 0.03, 0.09), zwart, -1.7, 0.42, 6.9));
    use(-3.6, 0.8, 7.05, 0.6, () => 'PS4 aanzetten', () => { tone(330, 0.5, 'sine', 0.08); tone(495, 0.7, 'sine', 0.07, null, 0.2); noteOsso(`🎮 ${pick(['FIFA, even tegen je broertje.', 'Nog één potje dan.', 'Updaten: nog 47 minuten.'])}`); });
  }
  if (ossoHas('dvd')) {
    // stapel dvd's met het logo op de voorste
    for (let i = 0; i < 7; i++) kamer.add(mesh(box(0.14, 0.02, 0.19), M(i % 2 ? '#20242a' : '#2c2c2c'), -1.42, 0.41 + i * 0.022, 7.0));
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: labelTex(32, 44, '#111', '#ff5a14', 'RAMMSTEIN', 8) })); t.position.set(-1.42, 0.569, 7.0); kamer.add(t);
    use(-1.42, 0.55, 7.0, 0.45, () => 'Rammstein dvd opzetten', () => { fp.tv = true; noise(0.1, 0.1); noteOsso('📀 Jens kijkt Live aus Berlin. Voor de negende keer.'); });
  }
  if (ossoHas('jensfiets')) {
    const f = mergeStatic(makeBike('#c8202b'));
    f.position.set(2.2, 0, 4.45); f.rotation.y = Math.PI / 2; kamer.add(f);
    use(2.2, 0.7, 4.45, 0.9, () => 'Jens zijn fiets', () => { sfx.bel(); noteOsso('🚲 Op deze fiets zijn de beste filmpjes gemaakt.'); });
  }
  if (ossoHas('vouwfiets')) {
    // ingeklapt: twee kleine wielen naast elkaar, wit frame ertussen
    for (const z of [-0.1, 0.1]) { const w = wheel(0.2, 0.04, zwart); w.position.set(5.6, 0.2, 5.2 + z); kamer.add(w); }
    kamer.add(mesh(box(0.42, 0.06, 0.05), wit, 5.6, 0.3, 5.2), mesh(box(0.05, 0.62, 0.05), wit, 5.72, 0.42, 5.2), mesh(box(0.05, 0.42, 0.05), wit, 5.46, 0.42, 5.28), mesh(box(0.2, 0.05, 0.1), wit, 5.46, 0.64, 5.28), mesh(box(0.24, 0.04, 0.04), wit, 5.72, 0.74, 5.2));
    use(5.6, 0.5, 5.2, 0.6, () => 'Witte vouwfiets', () => { noise(0.1, 0.1); noteOsso('🚲 Inklappen duurt langer dan ernaartoe lopen.'); });
  }
  if (ossoHas('vwdoos')) {
    const t = new THREE.MeshLambertMaterial({ map: labelTex(64, 40, '#b8863f', '#c8202b', 'VUURWERK', 12) });
    solid(0.6, 0.42, 0.45, t, 0.5, 0.21, 9.45);
    use(0.5, 0.4, 9.45, 0.6, () => 'Vuurwerkdoos bekijken', () => { noise(0.08, 0.08); noteOsso('📦 Alles nog in de doos. Tot het 31 december is.'); });
  }
  if (ossoHas('cakes')) {
    const t = new THREE.MeshLambertMaterial({ map: labelTex(48, 48, '#23345e', '#ffd23f', 'CAKE', 15) });
    const t2 = new THREE.MeshLambertMaterial({ map: labelTex(48, 48, '#7a1c24', '#ffffff', '100 SH', 12) });
    solid(0.5, 0.4, 0.5, t, 1.5, 0.2, 9.45); kamer.add(mesh(box(0.42, 0.36, 0.42), t2, 1.5, 0.58, 9.45), mesh(box(0.42, 0.36, 0.42), t, 1.5, 0.94, 9.45));
    use(1.5, 0.7, 9.45, 0.6, () => 'Cakeboxen tellen', () => noteOsso('🎆 Drie cakes. Dat is niet genoeg.'));
  }
  if (ossoHas('lawine')) {
    // bundel pijlen in een emmer
    kamer.add(mesh(cylG(0.16, 0.13, 0.3, 8), M('#5a5e64'), -3.5, 0.15, 3.0 + (ossoHas('kerstboom') ? -4.2 : 0)));
    const z0 = 3.0 + (ossoHas('kerstboom') ? -4.2 : 0);
    for (let i = 0; i < 6; i++) { const a = i * 1.05, st = mesh(box(0.012, 0.95, 0.012), M('#c9a874'), -3.5 + Math.cos(a) * 0.06, 0.62, z0 + Math.sin(a) * 0.06); st.rotation.set(Math.sin(a) * 0.1, 0, Math.cos(a) * 0.1); kamer.add(st); kamer.add(mesh(coneG(0.03, 0.12, 5), M(i % 2 ? '#c8202b' : '#1f4fa8'), -3.5 + Math.cos(a) * 0.1, 1.12, z0 + Math.sin(a) * 0.1)); }
    use(-3.5, 0.7, z0, 0.6, () => 'Lawinepijlen', () => { tone(1400, 0.4, 'sine', 0.05, 2400); noteOsso('🚀 Er zit "lawine" in de naam. Dat is geen grapje.'); });
  }
  if (ossoHas('munitie')) {
    // legergroene kist, open, met rode en bruine rotjes
    solid(0.7, 0.32, 0.42, M('#3f4a2a'), -0.6, 0.16, 9.45);
    kamer.add(mesh(box(0.62, 0.02, 0.34), M('#22281a'), -0.6, 0.325, 9.45));
    for (let i = 0; i < 18; i++) kamer.add(mesh(box(0.03, 0.015, 0.09), M(i % 2 ? '#c8202b' : '#6b4226'), -0.86 + (i % 6) * 0.1, 0.34, 9.33 + Math.floor(i / 6) * 0.11));
    kamer.add(mesh(box(0.72, 0.03, 0.44), M('#4a5632'), -0.6, 0.55, 9.65));
    use(-0.6, 0.4, 9.45, 0.6, () => 'Munitiekist', () => { noise(0.05, 0.25); noise(0.05, 0.25, 0.09); noteOsso('🧨 Rode voor buiten, bruine voor de echte liefhebber.'); });
  }
}
function renderOssoShop() {
  $('#osShopList').innerHTML = OSSO_ITEMS.map((it) => `<button class="item ${ossoHas(it.id) ? 'owned' : ''} ${!ossoHas(it.id) && save.bekers < it.price ? 'cant' : ''}" data-oi="${it.id}"><b>${it.icon} ${it.name}</b><small>${ossoHas(it.id) ? '✓ Staat in je osso' : `🏆 ${it.price.toLocaleString('nl-NL')}`}</small></button>`).join('');
  $('#osShopBekers').textContent = `🏆 ${save.bekers.toLocaleString('nl-NL')}`;
}
$('#kmShop').addEventListener('click', () => { if (document.pointerLockElement) document.exitPointerLock(); renderOssoShop(); $('#osShop').classList.remove('hidden'); });
$('#osShopClose').addEventListener('click', () => $('#osShop').classList.add('hidden'));
$('#osShopList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-oi]');
  if (!b) return;
  const it = OSSO_ITEMS.find((i) => i.id === b.dataset.oi);
  if (ossoHas(it.id)) return;
  if (save.bekers < it.price) { note(`Je mist nog ${it.price - save.bekers} bekers`); return; }
  save.bekers -= it.price; save.ossoItems = { ...(save.ossoItems || {}), [it.id]: 1 }; persist();
  sfx.beker(); noteOsso(`${it.icon} ${it.name} staat in je osso!`);
  fp.sub = true; openKamer(); // opnieuw opbouwen, zelfde plek
  renderOssoShop();
});

function openKamer() {
  audioInit();
  buildKamer();
  if (!fp.sub) { fp.x = 0; fp.z = 1.4; fp.yaw = 0; fp.pitch = -0.05; noteOsso('🏠 Welkom in De Hub'); }
  fp.sub = false; fp.keys = {}; fp.joy = null; fp.look = null;
  state = 'kamer';
  kamer.visible = true;
  jens.root.visible = false;
  showScreen('#kamer');
  renderKamer();
}
function renderKamer() {
  const ach = Object.keys(save.ach || {}).length, plak = PLAK.filter((p) => save.plak[p.id]).length;
  $('#kmStats').innerHTML = `<span>🏆 ${save.bekers.toLocaleString('nl-NL')}</span><span>🎖️ ${ach}/${ACH.length}</span><span>📒 ${plak}/${PLAK.length}</span><span>${STATIONS.find((s) => s.id === save.radio)?.name.replace('📻 ', '') || ''}</span>`;
}
function closeKamer() {
  if (document.pointerLockElement) document.exitPointerLock();
  klasTalk = null; renderTalk(); clearBubbles();
  fp.sub = false; fp.tv = false;
  kamer.visible = false; jens.root.visible = true; state = 'menu'; applyLook(phaseT); showScreen('#menu');
}
$('#kamerBtn').addEventListener('click', openKamer);
$('#kmBack').addEventListener('click', closeKamer);
$('#kmUse').addEventListener('click', () => ossoUseTarget());
function ossoUseTarget() {
  if (state !== 'kamer') return;
  if (klasTalk) { klasTalk.i++; klasTalk.t = 0; renderTalk(); if (!klasTalk.lines[klasTalk.i]) klasTalk = null; return; } // gesprek doorklikken
  if (fp.target && fp.sleepT <= 0) fp.target.fn();
}
// toetsen in de osso: WASD/pijltjes lopen, shift rennen, E gebruiken
window.addEventListener('keydown', (e) => {
  if (state !== 'kamer' || e.target.closest?.('input')) return;
  fp.keys[e.code] = true;
  if (e.code === 'KeyE' && !e.repeat) ossoUseTarget();
  if (e.code === 'Escape' && !document.pointerLockElement) closeKamer();
});
window.addEventListener('keyup', (e) => { fp.keys[e.code] = false; });
window.addEventListener('blur', () => { fp.keys = {}; });
// muis: klik = muis vangen (rondkijken zonder slepen); touch: links joystick, rechts kijken, tik = gebruiken
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'kamer') return;
  if (e.pointerType === 'mouse') {
    if (!document.pointerLockElement) { try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch (ex) { /* niet ondersteund */ } }
    else { ossoUseTarget(); return; }
    fp.look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    return;
  }
  if (e.clientX < innerWidth * 0.45 && !fp.joy) {
    fp.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
    const j = $('#ossoJoy'); j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; j.classList.remove('hidden');
  } else if (!fp.look) fp.look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
});
window.addEventListener('pointermove', (e) => {
  if (state !== 'kamer') return;
  if (document.pointerLockElement === canvas) { fp.yaw -= e.movementX * 0.0025; fp.pitch = clamp(fp.pitch - e.movementY * 0.0025, -1.2, 1.2); return; }
  if (fp.joy && e.pointerId === fp.joy.id) {
    const dx = e.clientX - fp.joy.x0, dy = e.clientY - fp.joy.y0, l = Math.hypot(dx, dy), m = Math.min(1, l / 50) / (l || 1);
    fp.joy.dx = dx * m; fp.joy.dy = dy * m;
    $('#ossoJoy i').style.transform = `translate(${fp.joy.dx * 34}px, ${fp.joy.dy * 34}px)`;
  } else if (fp.look && e.pointerId === fp.look.id) {
    const dx = e.clientX - fp.look.x, dy = e.clientY - fp.look.y;
    fp.look.x = e.clientX; fp.look.y = e.clientY; fp.look.moved += Math.abs(dx) + Math.abs(dy);
    fp.yaw -= dx * 0.006; fp.pitch = clamp(fp.pitch - dy * 0.005, -1.2, 1.2);
  }
});
const ossoUp = (e) => {
  if (fp.joy && e.pointerId === fp.joy.id) { fp.joy = null; $('#ossoJoy').classList.add('hidden'); $('#ossoJoy i').style.transform = ''; }
  if (fp.look && e.pointerId === fp.look.id) { if (state === 'kamer' && e.pointerType !== 'mouse' && fp.look.moved < 10) ossoUseTarget(); fp.look = null; }
};
window.addEventListener('pointerup', ossoUp);
window.addEventListener('pointercancel', ossoUp);
// lopen + botsen tegen muren en meubels
const ossoDir = new THREE.Vector3(), ossoTo3 = new THREE.Vector3();
function hitsOsso(x, z) {
  const r = 0.28;
  for (const [x1, z1, x2, z2] of ossoCols) if (x > x1 - r && x < x2 + r && z > z1 - r && z < z2 + r) return true;
  return false;
}
function updateOsso(dt) {
  const k = fp.keys;
  let f = 0, s = 0;
  if (k.KeyW || k.ArrowUp) f += 1;
  if (k.KeyS || k.ArrowDown) f -= 1;
  if (k.KeyD) s += 1;
  if (k.KeyA) s -= 1;
  if (k.ArrowLeft) fp.yaw += dt * 2.2;
  if (k.ArrowRight) fp.yaw -= dt * 2.2;
  if (fp.joy) { f -= fp.joy.dy; s += fp.joy.dx; }
  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    const dz = (v) => Math.abs(v) < 0.18 ? 0 : v;
    s += dz(pad.axes[0]); f -= dz(pad.axes[1]);
    fp.yaw -= dz(pad.axes[2] || 0) * dt * 2.6; fp.pitch = clamp(fp.pitch - dz(pad.axes[3] || 0) * dt * 2, -1.2, 1.2);
    if (pad.buttons[0]?.pressed && !fp.padA) ossoUseTarget();
    fp.padA = !!pad.buttons[0]?.pressed;
    if (pad.buttons[1]?.pressed) closeKamer();
  }
  const l = Math.hypot(f, s);
  if (l > 1) { f /= l; s /= l; }
  if (fp.sleepT > 0 || fp.sit > 0) { if (l > 0.1) fp.sit = 0; else { f = 0; s = 0; } }
  if (fp.sit > 0) fp.sit -= dt * 0.01;
  if (fp.sleepT > 0) { fp.sleepT -= dt; f = 0; s = 0; }
  const sp = (k.ShiftLeft || k.ShiftRight ? 5 : 3) * dt;
  const sy = Math.sin(fp.yaw), cy = Math.cos(fp.yaw);
  const mx = (-sy * f + cy * s) * sp, mz = (-cy * f - sy * s) * sp;
  if (!hitsOsso(fp.x + mx, fp.z)) fp.x += mx;
  if (!hitsOsso(fp.x, fp.z + mz)) fp.z += mz;
  fp.bob += Math.hypot(mx, mz) * 7;
  // waar kijk je naar?
  camera.getWorldDirection(ossoDir);
  let best = null, bestD = 2.4;
  for (const u of ossoUse) {
    ossoTo3.set(KAMER_X + u.p.x, u.p.y, u.p.z).sub(camera.position);
    const d = ossoTo3.dot(ossoDir);
    if (d < 0.2 || d > bestD) continue;
    const off = ossoTo3.addScaledVector(ossoDir, -d).length();
    if (off < u.r) { best = u; bestD = d; }
  }
  if (best !== fp.target) { fp.target = best; }
  const p = $('#ossoPrompt'), lbl = best ? best.label() : '';
  if (p.dataset.l !== lbl) { p.dataset.l = lbl; p.innerHTML = best ? `<b>${matchMedia('(pointer: coarse)').matches ? 'Tik' : 'E'}</b> ${escHtml(lbl)}` : ''; p.classList.toggle('hidden', !best); $('#kmUse').classList.toggle('hidden', !best); }
  $('#ossoSleep').style.opacity = fp.sleepT > 0 ? Math.min(1, Math.min(fp.sleepT, 2.2 - fp.sleepT) * 2.5) : 0;
  if (fp.tv) drawTv(performance.now() / 1000);
  if (disco) disco.rotation.y += dt * 1.2;
  updateKlas(dt);
}
function kamerCamera() {
  const sitting = fp.sit > 0;
  camera.position.set(KAMER_X + fp.x, (sitting ? 1.15 : 1.62) + Math.sin(fp.bob) * 0.04, fp.z);
  camera.rotation.set(fp.pitch, fp.yaw, 0, 'YXZ');
  // binnen in de osso: warm lamplicht, wat het buiten ook is
  hemi.color.set('#fff1d6'); hemi.groundColor.set('#8a6a4a'); hemi.intensity = 2.6;
  sun.intensity = 0.6; scene.fog.near = 30; scene.fog.far = 110;
}
// slepen om rond te kijken in de fotomodus
{
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (state === 'photo') drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
    if (state === 'photo') { photo.yaw -= dx * 0.008; photo.pitch = clamp(photo.pitch + dy * 0.006, -0.2, 1.2); }
  });
  window.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { if (state === 'photo') photo.dist = clamp(photo.dist + e.deltaY * 0.004, 1.2, 9); }, { passive: true });
}

// =====================================================================
//  FOTOMODUS
// =====================================================================
const photo = { yaw: 0.6, pitch: 0.25, dist: 3.2, from: 'run', take: false };
function openPhoto() {
  photo.from = state; photo.yaw = 2.6; photo.pitch = 0.25; photo.dist = 3.4;
  state = 'photo';
  showScreen(null);
  $('#hud').classList.add('hidden');
  $('#photoUi').classList.remove('hidden');
  $('#snap').classList.add('hidden');
}
function closePhoto() {
  $('#photoUi').classList.add('hidden');
  state = 'paused';
  $('#hud').classList.remove('hidden');
  showScreen('#pause');
}
function photoCamera() {
  const t = new THREE.Vector3(); jens.root.getWorldPosition(t); t.y += 1.1;
  camera.position.set(t.x + Math.sin(photo.yaw) * Math.cos(photo.pitch) * photo.dist, t.y + Math.sin(photo.pitch) * photo.dist, t.z + Math.cos(photo.yaw) * Math.cos(photo.pitch) * photo.dist);
  camera.lookAt(t);
}
function takePhotoNow() {
  // direct na het tekenen: canvas groot maken met scherpe pixels en een watermerk
  const W = canvas.width * 3, H = canvas.height * 3;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(canvas, 0, 0, W, H);
  x.font = `${Math.round(H * 0.045)}px Anton, Impact, sans-serif`; x.fillStyle = '#ffe14a'; x.textAlign = 'right';
  x.strokeStyle = '#000'; x.lineWidth = 8; x.strokeText('JENS RUN', W - 24, H - 24); x.fillText('JENS RUN', W - 24, H - 24);
  c.toBlob(async (blob) => {
    if (!blob) return;
    flashWhite();
    sfx.beker();
    const name = 'jensrun-foto.png';
    try {
      if (window.JensRunNative?.shareFile) { window.JensRunNative.shareFile(await blobToB64(blob), 'image/png', name); return; }
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Jens Run' }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    note('💾 Foto opgeslagen');
  }, 'image/png');
}
function flashWhite() { const f = $('#photoFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
$('#photoBtn').addEventListener('click', openPhoto);
$('#photoShoot').addEventListener('click', () => { photo.take = true; });
$('#photoBack').addEventListener('click', closePhoto);

// =====================================================================
//  REPLAY: de laatste seconden in slow-motion terugkijken
// =====================================================================
const REPLAY_SECS = 9;
let replayBuf = [], replayLen = 0, replay = null;
const replayPool = [];
const LIMBS = ['legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elL', 'elR'];
function personSnap(p, out = new Float32Array(19)) {
  out[0] = p.root.position.x; out[1] = p.root.position.y; out[2] = p.root.position.z; out[3] = p.root.rotation.x; out[4] = p.root.rotation.z;
  out[5] = p.body.position.y; out[6] = p.body.position.z; out[7] = p.body.rotation.x;
  for (let i = 0; i < LIMBS.length; i++) out[8 + i] = p[LIMBS[i]].rotation.x;
  out[16] = p.armL.rotation.z; out[17] = p.armR.rotation.z; out[18] = p.root.visible ? 1 : 0;
  return out;
}
function personApply(p, s) {
  p.root.position.set(s[0], s[1], s[2]); p.root.rotation.x = s[3]; p.root.rotation.z = s[4];
  p.body.position.y = s[5]; p.body.position.z = s[6]; p.body.rotation.x = s[7];
  LIMBS.forEach((k, i) => { p[k].rotation.x = s[8 + i]; });
  p.armL.rotation.z = s[16]; p.armR.rotation.z = s[17]; p.root.visible = !!s[18];
}
let replayAcc = 0;
function recordReplay(dt) {
  if (curLevel || (state !== 'run' && state !== 'dying')) return;
  replayAcc += dt;
  if (replayAcc < 1 / 30) return;
  dt = replayAcc; replayAcc = 0;
  // beelden worden hergebruikt (geen afval = geen haperende opruimbeurten)
  const f = replayPool.pop() || { jens: new Float32Array(19), chaser: new Float32Array(19), cam: new Float32Array(6), objs: [], od: new Float32Array(384), n: 0 };
  f.dt = dt; f.w = worldTravel; f.dead = state === 'dying';
  personSnap(jens, f.jens); personSnap(chaser(), f.chaser);
  f.cam[0] = camera.position.x; f.cam[1] = camera.position.y; f.cam[2] = camera.position.z; f.cam[3] = camLook.x; f.cam[4] = camLook.y; f.cam[5] = camLook.z;
  let n = 0;
  for (const o of objs) {
    if (o.z <= -45 || o.dead) continue;
    if ((n + 1) * 6 > f.od.length) { const g = new Float32Array(f.od.length * 2); g.set(f.od); f.od = g; }
    const m = o.mesh, b = n * 6;
    f.objs[n] = m; f.od[b] = m.position.x; f.od[b + 1] = m.position.y; f.od[b + 2] = m.position.z; f.od[b + 3] = m.rotation.x; f.od[b + 4] = m.rotation.y; f.od[b + 5] = m.rotation.z;
    n++;
  }
  f.n = n; f.objs.length = n;
  replayBuf.push(f);
  replayLen += dt;
  while (replayLen > REPLAY_SECS && replayBuf.length) { const old = replayBuf.shift(); replayLen -= old.dt; replayPool.push(old); }
}
function startReplay() {
  if (replayBuf.length < 30) return;
  replay = { i: 0, t: 0, added: [], hidden: objs.map((o) => o.mesh).filter((m) => m.visible) };
  for (const m of replay.hidden) m.visible = false;
  state = 'replay';
  showScreen(null);
  $('#replayUi').classList.remove('hidden');
}
function updateReplay(dt) {
  const r = replay;
  r.t += dt;
  while (r.i < replayBuf.length - 1 && r.t > replayBuf[r.i].dt) { r.t -= replayBuf[r.i].dt; r.i++; }
  const f = replayBuf[r.i];
  if (r.prev) for (const m of r.prev) m.visible = false;
  r.prev = [];
  for (let i = 0; i < f.n; i++) {
    const m = f.objs[i], b = i * 6;
    if (!m.parent) { scene.add(m); r.added.push(m); }
    m.visible = true; m.position.set(f.od[b], f.od[b + 1], f.od[b + 2]); m.rotation.set(f.od[b + 3], f.od[b + 4], f.od[b + 5]);
    r.prev.push(m);
  }
  personApply(jens, f.jens);
  personApply(chaser(), f.chaser);
  // langzaam meedraaiende camera
  const ang = 0.5 + (r.i / replayBuf.length) * 1.2;
  camera.position.set(f.jens[0] + Math.sin(ang) * 4.2, 2.4, f.jens[2] + Math.cos(ang) * 4.2);
  camera.lookAt(f.jens[0], 1.1, f.jens[2]);
  $('#replayBar').style.width = `${(r.i / (replayBuf.length - 1)) * 100}%`;
  if (r.i >= replayBuf.length - 1) endReplay();
}
function endReplay() {
  const r = replay;
  if (!r) return;
  for (const m of r.added) if (!objs.some((o) => o.mesh === m)) scene.remove(m);
  if (r.prev) for (const m of r.prev) m.visible = false;
  for (const m of r.hidden) m.visible = true;
  const last = replayBuf[replayBuf.length - 1];
  personApply(jens, last.jens);
  replay = null;
  $('#replayUi').classList.add('hidden');
  state = 'over';
  showScreen('#over');
}
$('#replayBtn').addEventListener('click', openNews);
$('#newsClose').addEventListener('click', closeNews);
$('#newsSave').addEventListener('click', shareSnap);
$('#replayStop').addEventListener('click', endReplay);

// alles per frame (in de run)
function updateExtras3(dt, m) {
  updateMagnet(dt);
  updateDayNight(m);
  updateHills();
  updatePath();
  updateEbos(dt);
  recordReplay(dt);
  updateThema(dt);
  updateSeg(dt);
  updateGoffert();
}
function updateLiveLoop(dt) { updateLive(dt); updateJacht(dt); }

// =====================================================================
//  SAMEN: vrienden, clan, live samen rennen, meldingen
// =====================================================================
let socialTab = 'vrienden';
function needName() {
  if (save.name) return false;
  $('#soBody').innerHTML = '<p>Kies eerst een naam: speel een potje en zet je score op de ranglijst.</p>';
  return true;
}
function openSocial(tab) {
  if (tab) socialTab = tab;
  showScreen('#social');
  renderSocial();
}
const socialTabs = () => [['live', '⚡', 'Samen rennen'], ['vrienden', '👥', 'Vrienden'], ['clan', '🛡️', 'Clan'], ['meldingen', '🔔', `Meldingen${unread ? ` (${unread})` : ''}`]];
function renderSocialTabs() {
  $('#soTabs').innerHTML = socialTabs()
    .map(([k, i, t]) => `<button class="tab ${k === socialTab ? 'sel' : ''}" data-so="${k}">${i} ${t}</button>`).join('');
  const nu = socialTabs().find(([k]) => k === socialTab);
  $('#soPick').innerHTML = `<span>${nu[1]} ${nu[2]}</span>`;
  $('#soPick').classList.toggle('stip', !!unread && socialTab !== 'meldingen');
}
$('#soPick').addEventListener('click', (e) => {
  glasMenu(e.currentTarget, socialTabs().map(([k, i, t]) => ({
    title: t, icon: i, checked: k === socialTab, run: () => { socialTab = k; renderSocial(); },
  })));
});
async function renderSocial() {
  renderSocialTabs();
  const body = $('#soBody');
  if (socialTab === 'live') { renderLive(); return; }
  if (needName()) return;
  body.innerHTML = '<p>Laden…</p>';
  try {
    if (socialTab === 'vrienden') {
      const r = await apiCall('/api/friends?id=' + save.playerId);
      const modes = Object.entries(MODES).filter(([, m]) => !m.hidden);
      const rows = (r.rows || []).map((f) => ({ ...f, best: Math.max(...modes.map(([k]) => f[k] || 0)) })).sort((a, b) => b.best - a.best);
      body.innerHTML = `
        <form id="frForm" class="namebox"><div class="row"><input id="frInput" maxlength="16" placeholder="Naam van je vriend"><button class="btn">+ Toevoegen</button></div><div class="err"></div></form>
        <ol class="board">${rows.map((f, i) => `<li data-name="${escHtml(f.name)}" class="click ${f.name === save.name ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="nm">${escHtml(f.name)}</span>
          <span class="sc">${f.best.toLocaleString('nl-NL')}</span>${f.name !== save.name ? `<button class="mini" data-unfriend="${escHtml(f.name)}">✕</button>` : ''}</li>`).join('')}</ol>
        ${rows.length <= 1 ? '<p class="hint">Voeg vrienden toe op hun naam uit de ranglijst. Je krijgt een melding als iemand jouw record verbreekt.</p>' : ''}`;
    } else if (socialTab === 'clan') {
      const r = await apiCall('/api/clan?id=' + save.playerId);
      const top = await apiCall('/api/clans');
      const topList = `<div class="label">Beste clans</div><ol class="board">${(top.rows || []).map((c, i) => `<li><span class="pos">${i + 1}</span><span class="nm">${escHtml(c.name)} <small>${c.members}👤</small></span><span class="sc">${c.total.toLocaleString('nl-NL')}</span></li>`).join('') || '<li class="empty">Nog geen clans</li>'}</ol>`;
      if (r.clan) {
        body.innerHTML = `<div class="clanhead"><b>🛡️ ${escHtml(r.clan.name)}</b><span>Code: <code>${r.clan.code}</code> · deel hem met je vrienden</span></div>
          <ol class="board">${r.members.map((m, i) => `<li data-name="${escHtml(m.name)}" class="click ${m.name === save.name ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="nm">${escHtml(m.name)}</span><span class="sc">${m.total.toLocaleString('nl-NL')}</span></li>`).join('')}</ol>
          <p class="hint">Clanscore = alle beste scores van de leden bij elkaar (endless).</p>
          <button class="btn alt" id="clanLeave">Clan verlaten</button>${topList}`;
      } else {
        body.innerHTML = `
          <form id="clanJoin" class="namebox"><label>Doe mee met een clan</label><div class="row"><input id="clanCode" maxlength="6" placeholder="Clancode" style="text-transform:uppercase"><button class="btn">Meedoen</button></div><div class="err"></div></form>
          <form id="clanMake" class="namebox"><label>Of start een eigen clan</label><div class="row"><input id="clanName" maxlength="16" placeholder="Clannaam"><button class="btn">Maken</button></div><div class="err"></div></form>${topList}`;
      }
    } else {
      const r = await apiCall(`/api/notifs?id=${save.playerId}&seen=1`);
      unread = 0; updateBell();
      body.innerHTML = (r.rows || []).length
        ? `<ol class="board notifs">${r.rows.map((n) => `<li><span class="nm">${escHtml(n.text)}</span><span class="sc"><small>${timeAgo(n.created)}</small></span></li>`).join('')}</ol>`
        : '<p>Nog geen meldingen.</p>';
    }
  } catch (e) { body.innerHTML = '<p>Kan dit niet laden. Ben je online?</p>'; }
  renderSocialTabs();
}
function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? 'net' : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} u` : `${Math.floor(s / 86400)} d`;
}
$('#soTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-so]'); if (b) { socialTab = b.dataset.so; renderSocial(); } });
$('#soBody').addEventListener('click', async (e) => {
  const un = e.target.closest('[data-unfriend]');
  if (un) { e.stopPropagation(); await apiCall('/api/friends', { id: save.playerId, name: un.dataset.unfriend, remove: true }); renderSocial(); return; }
  const li = e.target.closest('[data-name]');
  if (li && socialTab !== 'live') openProfile(li.dataset.name, '#social');
  if (e.target.id === 'clanLeave' && confirm('Clan verlaten?')) { await apiCall('/api/clan', { id: save.playerId, leave: true }); renderSocial(); }
  if (e.target.id === 'lvMake') liveConnect(Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''));
  if (e.target.id === 'lvStart') liveSend({ t: 'start', mode });
  if (e.target.id === 'lvJShane' || e.target.id === 'lvJJens') jachtStartKamer(e.target.id === 'lvJShane');
  if (e.target.id === 'lvLeave') liveClose();
});
$('#soBody').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = f.querySelector('.err');
  if (err) err.textContent = '';
  let r;
  if (f.id === 'frForm') r = await apiCall('/api/friends', { id: save.playerId, name: $('#frInput').value });
  if (f.id === 'clanJoin') r = await apiCall('/api/clan', { id: save.playerId, code: $('#clanCode').value });
  if (f.id === 'clanMake') r = await apiCall('/api/clan', { id: save.playerId, create: $('#clanName').value });
  if (f.id === 'lvJoin') { liveConnect($('#lvCode').value.toUpperCase().trim()); return; }
  if (r && !r.ok) { if (err) err.textContent = r.error || 'Dat lukte niet.'; return; }
  renderSocial();
});
$('#soBack').addEventListener('click', () => showScreen('#menu'));
$('#socialBtn').addEventListener('click', () => openSocial());

// meldingen: elke minuut kijken (ook de Android-app laat ze als telefoonmelding zien)
let unread = 0;
function updateBell() { $('#socialBtn').dataset.n = $('#fmBell').dataset.n = $('#mBell').dataset.n = $('#samenBtn').dataset.n = $('#mSamen').dataset.n = unread || ''; }
async function pollNotifs() {
  if (!save.name) return;
  try {
    const r = await apiCall(`/api/notifs?id=${save.playerId}`);
    const fresh = (r.rows || []).filter((n) => !n.seen);
    unread = fresh.length;
    updateBell();
    const newest = r.rows?.[0]?.id || 0;
    if (save.lastNotif && newest > save.lastNotif && state !== 'run') note(`🔔 ${r.rows[0].text}`);
    save.lastNotif = Math.max(save.lastNotif || 0, newest);
    persist();
  } catch (e) { /* offline */ }
}
setTimeout(pollNotifs, 3000);
setInterval(pollNotifs, 60000);
if (window.JensRunNative?.setPlayer) try { window.JensRunNative.setPlayer(save.playerId); } catch (e) { /* oude app */ }

// =====================================================================
//  LIVE SAMEN RENNEN
// =====================================================================
let live = null; // { ws, code, players, ghosts, results, host }
const liveName = () => save.name || (save.guest ||= `Speler ${100 + Math.floor(Math.random() * 900)}`);
function liveConnect(code, quick) {
  if (!quick && needName()) return;
  if (!/^[A-Z0-9]{4}$/.test(code)) { note('Een kamercode heeft 4 tekens'); return; }
  liveClose();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/live/${code}`);
  live = { ws, code, quick, players: [], ghosts: new Map(), results: new Map(), started: false };
  let verbonden = false;
  ws.onopen = () => { verbonden = true; jachtPogingen = 0; liveSend({ t: 'hello', name: liveName(), pid: save.playerId }); };
  ws.onmessage = (e) => liveMsg(JSON.parse(e.data));
  ws.onclose = () => {
    // de jachtkamer was net vol: dan de volgende proberen
    if (live?.ws === ws && !verbonden && /^JP0/.test(code) && jachtPogingen++ < 3) { live = null; quickPlay(null, true); return; }
    if (live?.ws === ws) { if (!quick || live.started) note('⚡ Live-verbinding verbroken'); clearGhosts(); live = null; if (curScreen === '#social' && socialTab === 'live') renderLive(); renderFlive('Geen verbinding. Tegen bots kan altijd.'); } };
  renderLive();
}
// ---------- MULTIPLAYER: één druk op de knop en je zoekt een race ----------
let fliveT = null, jachtPogingen = 0;
async function quickPlay(code, jachtZoek) {
  audioInit();
  clearInterval(fliveT);
  liveClose();
  $('#fmLive').classList.remove('hidden');
  renderFlive('Verbinden…');
  try {
    if (!code) code = (await fetch(`/api/live-quick${jachtZoek ? '?mode=jacht' : ''}`).then((x) => x.json())).code;
    if (!$('#fmLive').classList.contains('hidden')) liveConnect(code, true);
  } catch (e) { renderFlive('Geen verbinding. Tegen bots kan altijd.'); }
}
function renderFlive(msg) {
  const el = $('#fmLive');
  if (el.classList.contains('hidden')) return;
  const list = live?.players || [], jachtPub = !!live && /^JP0/.test(live.code), pub = !!live && (jachtPub || /^QP0/.test(live.code));
  const me = list.find((p) => p.pid === save.playerId);
  let tekst = msg;
  if (!tekst) {
    const rest = live?.soon ? Math.ceil((live.soon - Date.now()) / 1000) : 0;
    if (jachtPub) tekst = list.length >= 2 ? 'Tegenstander gevonden! Het lot kiest wie Shane is…' : 'Zoeken naar een tegenstander…';
    else tekst = rest > 0 ? `De race start over ${rest} …` : list.length >= 2 ? (pub ? 'Bijna…' : me?.host ? 'Klaar om te starten: kies een race of Shane jaagt' : `Wachten tot ${list.find((p) => p.host)?.name || 'de host'} start…`) : 'Zoeken naar spelers… deel de link of wacht even.';
  }
  $('#flStatus').textContent = tekst;
  $('#flList').innerHTML = list.map((p) => `<li class="${p.pid === save.playerId ? 'me' : ''}"><span class="pos">🏃</span><span class="nm">${escHtml(p.name)}</span></li>`).join('');
  $('#flStart').classList.toggle('hidden', !(live && !pub && me?.host && list.length >= 2));
  $('#flShare').classList.toggle('hidden', !live || jachtPub);
  $('#flJachtHost').classList.toggle('hidden', !(live && !pub && me?.host && list.length === 2));
  $('#flJZoek').classList.toggle('hidden', jachtPub || !!(live && !pub));
  $('#flJPrive').classList.toggle('hidden', !!(live && !pub));
  if (!msg && live && !pub && list.length < 2) $('#flStatus').textContent = `Kamercode ${live.code}: deel de link of geef de code door`;
}
$('#fmMp').addEventListener('click', () => quickPlay());
function fliveCancel() { clearInterval(fliveT); $('#fmLive').classList.add('hidden'); liveClose(); }
$('#flCancel').addEventListener('click', fliveCancel);
$('#flStart').addEventListener('click', () => liveSend({ t: 'start', mode: 'telefoon' }));
$('#flShare').addEventListener('click', async () => {
  const url = `${location.origin}/?kamer=${live?.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Jens Run', text: 'Ren tegen me in Jens Run', url });
    else { await navigator.clipboard.writeText(url); note('📋 Link gekopieerd, plak hem in de groepsapp!'); }
  } catch (e) { /* niet gedeeld */ }
});
$('#flBots').addEventListener('click', () => startBots());
// bots: voor als er niemand online is. Ze rennen als geest mee en vallen op een willekeurig moment af
const BOT_NAMEN = ['Bot Hatert', 'Bot Goffert', 'Bot Lent', 'Bot Dukenburg', 'Bot Waalkade'];
function startBots() {
  liveClose();
  live = { ws: { readyState: 3, close() {} }, code: 'BOTS', quick: true, bots: true, players: [], ghosts: new Map(), results: new Map(), started: false };
  const namen = BOT_NAMEN.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  namen.forEach((n, i) => { const g = makeGhost('bot' + i, n); Object.assign(g, { bot: true, k: rand(0.94, 1.06), life: rand(18, 90), wis: rand(1, 3), x: LANES[i] }); });
  $('#fmLive').classList.add('hidden');
  liveGo('telefoon', Date.now() + 3000);
}
function updateBots(dt) {
  for (const g of live.ghosts.values()) {
    if (!g.bot || !g.alive) continue;
    const moving = state === 'run';
    g.d += (moving ? speed : 13) * g.k * dt;
    g.life -= dt * (state === 'over' ? 8 : 1);
    if ((g.wis -= dt) <= 0) { g.wis = rand(1.2, 3.5); g.x = pick(LANES); }
    g.y = Math.max(0, Math.sin(now() * 3 + g.k * 20) - 0.86) * 8;
    if (g.life <= 0) {
      g.alive = false; g.person.root.visible = false;
      live.results.set('b' + g.name, { name: g.name, score: Math.floor(g.d * 2), dist: Math.floor(g.d) });
      feed(`💀 <b>${escHtml(g.name)}</b> is af (${Math.floor(g.d)} m)`);
      renderLiveResult();
    }
  }
}
function liveGo(m, at, shane, seed) {
  clearInterval(fliveT);
  live.results = new Map(); live.started = true; live.chat = [];
  mapSeed = seed || 0;
  renderChat();
  $('#fmLive').classList.add('hidden');
  if (m === 'jacht') jachtStart(shane === save.playerId ? 'shane' : 'jens', !!live.bots); else jachtStop();
  setMode(MODES[m] && !MODES[m].hidden && !MODES[m].mini ? m : 'telefoon', true);
  weekly = null; feest = null; applyFeest();
  const wait = Math.max(0, at - Date.now());
  const ikShane = jacht?.rol === 'shane';
  toast(jacht ? `📱 SHANE JAAGT<small>${ikShane ? 'Jij bent Shane: pak Jens!' : `Jij bent Jens: blijf ${JACHT_TIJD} seconden weg!`}</small>` : '⚡ LIVE RACE<small>Start in 3…</small>', jacht ? 1.8 : 1);
  setTimeout(() => toast('2…', 0.8), Math.max(0, wait - 2000));
  setTimeout(() => toast('1…', 0.8), Math.max(0, wait - 1000));
  setTimeout(() => {
    if (!live) return;
    seeded('start', startRun);
    if (!jacht) toast('⚡ REN!<small>Wie houdt het langst vol?</small>', 1.4);
    else if (ikShane) toast('📱 PAK HEM!<small>1 ⚡ sprint · 2 🚀 Kwaliteit Troeki · 3 💣 obstakels</small>', 2.4);
    else toast(`🏃 REN, JENS!<small>Shane zit ${JACHT_VOORSPRONG} meter achter je</small>`, 2);
  }, wait);
}
function liveSend(m) { if (live?.ws.readyState === 1) live.ws.send(JSON.stringify(m)); }
function liveClose() { jachtStop(); mapSeed = 0; if (live) { const ws = live.ws; live = null; clearGhosts(); try { ws.close(); } catch (e) { /* al dicht */ } } if (curScreen === '#social') renderLive(); }
function liveMsg(m) {
  if (!live) return;
  if (m.t === 'players') {
    live.players = m.list; if (curScreen === '#social') renderLive(); renderFlive();
    if (jacht && !jacht.bot && state === 'run' && m.list.length < 2) jachtEinde(true, 'Gewonnen!', 'Je tegenstander is weggegaan.');
    if (jacht?.klaar && state === 'over') renderLiveResult();
  }
  if (m.t === 'soon') {
    live.soon = m.at || 0;
    clearInterval(fliveT);
    if (m.at) fliveT = setInterval(() => renderFlive(), 400);
    renderFlive();
  }
  if (m.t === 'go') liveGo(m.mode, m.at, m.shane, m.seed);
  if (m.t === 'chat') liveChat(m.name, m.txt);
  if (m.t === 'ev') { const t = evText(m); if (t) feed(t); }
  if (jacht && !jacht.bot) { if (m.t === 's' || m.t === 'dead' || m.t === 'j') jachtMsg(m); return; }
  if (m.t === 's') {
    let g = live.ghosts.get(m.pid);
    if (!g) g = makeGhost(m.pid, m.name);
    Object.assign(g, { d: m.d, x: m.x, y: m.y, slide: m.sl, sc: m.sc, alive: true, at: now() });
  }
  if (m.t === 'dead') {
    live.results.set(m.pid, { name: m.name, score: m.score, dist: m.dist });
    const g = live.ghosts.get(m.pid);
    if (g) { g.alive = false; g.person.root.visible = false; }
    feed(`💀 <b>${escHtml(m.name)}</b> is af (${m.dist} m)`);
    renderLiveResult();
  }
}
function renderLive() {
  if (curScreen !== '#social' || socialTab !== 'live') return;
  const body = $('#soBody');
  if (!live) {
    body.innerHTML = `<p>Ren tegelijk met je vrienden, ieder op zijn eigen telefoon. Je ziet elkaar als geest naast je. Wie het langst overleeft wint.</p>
      <button class="btn big" id="lvMake">KAMER MAKEN</button>
      <form id="lvJoin" class="namebox"><label>Of doe mee met een code</label><div class="row"><input id="lvCode" maxlength="4" placeholder="ABCD" style="text-transform:uppercase"><button class="btn">Meedoen</button></div></form>`;
    return;
  }
  const me = live.players.find((p) => p.pid === save.playerId);
  body.innerHTML = `<div class="clanhead"><b>⚡ Kamer <code>${live.code}</code></b><span>Geef deze code aan je vrienden (max 4 spelers)</span></div>
    <ol class="board">${live.players.map((p) => `<li><span class="pos">${p.host ? '👑' : '🏃'}</span><span class="nm">${escHtml(p.name)}</span></li>`).join('') || '<li class="empty">Verbinden…</li>'}</ol>
    ${me?.host ? `<button class="btn big" id="lvStart" ${live.players.length < 2 ? 'disabled' : ''}>START (${MODES[mode].icon} ${MODES[mode].label})</button><p class="hint">De modus die je in het menu gekozen hebt, geldt voor iedereen.</p>
      ${live.players.length === 2 ? '<div class="label">📱 Shane jaagt (1 tegen 1)</div><div class="row"><button class="btn" id="lvJShane">Ik ben Shane</button><button class="btn" id="lvJJens">Ik ben Jens</button></div>' : ''}` : '<p>Wachten tot de host start…</p>'}
    <button class="btn alt" id="lvLeave">Kamer verlaten</button>`;
}
function makeGhost(pid, name) {
  const p = makePerson({ key: 'ghost', skin: '#f2d0b8', hair: '#3a2a1e', hairStyle: 'normaal', shirt: { base: '#4dd2ff', paint() {} }, pants: '#2a4a6a', shoes: '#fff', face: { skin: '#f2d0b8' } });
  p.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.45; o.material.depthWrite = false; } });
  p.shadow.visible = false;
  const lab = makeLabel(name, '#1f6bc8'); lab.position.y = 2.4; p.root.add(lab);
  scene.add(p.root);
  const g = { person: p, name, d: 0, x: 0, y: 0, alive: true, at: now() };
  live.ghosts.set(pid, g);
  return g;
}
function clearGhosts() { if (!live) return; for (const g of live.ghosts.values()) scene.remove(g.person.root); live.ghosts.clear(); }
let liveSendT = 0;
function updateLive(dt) {
  if (!live || !live.started) return;
  if (live.bots) updateBots(dt);
  if (state === 'run') {
    liveSendT -= dt;
    if (liveSendT <= 0) {
      liveSendT = 0.1;
      const d = jacht ? jachtMijnD() : dist, jx = jacht ? { tr: jacht.pw.troeki.t > 0 ? 1 : 0, bk: fietsT > 0 || indoor ? 1 : 0 } : {};
      liveSend({ t: 's', d: Math.round(d * 10) / 10, x: Math.round(player.x * 100) / 100, y: Math.round(player.y * 100) / 100, sl: player.slideT > 0 ? 1 : 0, sc: Math.floor(score), ...jx });
    }
  }
  for (const g of live.ghosts.values()) {
    if (!g.alive) continue;
    const z = dist - g.d; // positief = achter mij
    // inhalen en ingehaald worden
    const voor = z < 0;
    if (state === 'run' && g.voor !== undefined && voor !== g.voor && now() - (g.inhaalT || 0) > 3) {
      g.inhaalT = now();
      feed(voor ? `🏃 <b>${escHtml(g.name)}</b> haalt je in!` : `💨 Je haalt <b>${escHtml(g.name)}</b> in!`);
    }
    g.voor = voor;
    g.person.root.visible = (state === 'run' || state === 'dying') && Math.abs(z) < 70;
    g.person.root.position.set(damp(g.person.root.position.x, g.x, 10, dt), g.y, clamp(z, -70, 30));
    pose(g.person, g.slide ? 'slide' : g.y > 0.1 ? 'jump' : 'run', dt, 1.3);
  }
}
function liveOnDeath() {
  if (!live?.started) return;
  liveSend({ t: 'dead', score: Math.floor(score), dist: Math.floor(dist) });
  live.results.set(save.playerId, { name: liveName(), score: Math.floor(score), dist: Math.floor(dist) });
}
function renderLiveResult() {
  const el = $('#overLive');
  if (!live?.started || state !== 'over') { el.classList.add('hidden'); return; }
  $('#olChat').classList.toggle('hidden', !!live.bots);
  if (jacht?.klaar) {
    const ikShane = jacht.rol === 'shane', shaneWint = jacht.win === ikShane;
    const host = live.players.find((p) => p.pid === save.playerId)?.host;
    el.classList.remove('hidden');
    $('#olRes').innerHTML = `<b>📱 Shane jaagt · ${shaneWint ? '🏆 Shane wint!' : '🏆 Jens ontsnapt!'}</b>
      <p>${jacht.win ? 'Jij wint' : 'Jij verliest'} als ${ikShane ? 'Shane' : 'Jens'}.</p>
      ${jacht.bot ? `<div class="row"><button class="btn alt" data-jbot="${jacht.rol}">🔁 Nog een keer</button><button class="btn alt" data-jbot="${ikShane ? 'jens' : 'shane'}">Wissel van rol</button></div>`
        : live.players.length < 2 ? '<p class="hint">Je tegenstander is weg.</p><button class="btn alt" id="lvJNieuw">🔎 Nieuwe tegenstander</button>'
        : host ? `<button class="btn alt" id="lvJWissel">🔁 Nog een keer (rollen wisselen)</button>${/^JP0/.test(live.code) ? '<button class="btn alt" id="lvJNieuw">🔎 Nieuwe tegenstander</button>' : ''}`
        : `<p class="hint">Wachten tot je tegenstander een nieuwe jacht start…</p>${/^JP0/.test(live.code) ? '<button class="btn alt" id="lvJNieuw">🔎 Nieuwe tegenstander</button>' : ''}`}`;
    return;
  }
  const others = [...live.ghosts.entries()].filter(([pid, g]) => g.alive && !live.results.has(pid));
  const rows = [...live.results.values()].sort((a, b) => b.dist - a.dist);
  const done = others.length === 0;
  el.classList.remove('hidden');
  $('#olRes').innerHTML = `<b>⚡ Live race · ${done ? `🏆 ${escHtml(rows[0]?.name || '?')} wint!` : 'nog bezig…'}</b>
    <ol class="board">${others.map(([, g]) => `<li><span class="pos">🏃</span><span class="nm">${escHtml(g.name)}</span><span class="sc">${Math.floor(g.d)} m</span></li>`).join('')}
    ${rows.map((r, i) => `<li class="${r.name === liveName() ? 'me' : ''}"><span class="pos">${done ? i + 1 : '💀'}</span><span class="nm">${escHtml(r.name)}</span><span class="sc">${r.dist} m</span></li>`).join('')}</ol>
    ${done && live.quick ? '<button class="btn alt" id="lvQuick">⚡ Nog een race</button>' : done && live.players.find((p) => p.pid === save.playerId)?.host ? '<button class="btn alt" id="lvAgain">⚡ Nog een race</button>' : ''}`;
}
$('#overLive').addEventListener('click', (e) => {
  const jb = e.target.closest('[data-jbot]');
  if (jb) { startJachtBot(jb.dataset.jbot); return; }
  if (e.target.id === 'lvJWissel' && jacht) { jachtStartKamer(jacht.rol !== 'shane'); return; }
  if (e.target.id === 'lvJNieuw') { toMenu(); quickPlay(null, true); return; }
  if (e.target.id === 'lvAgain') liveSend({ t: 'start', mode }); if (e.target.id === 'lvQuick') { toMenu(); quickPlay(); } });
setInterval(() => { if (state === 'over' && live?.started && !jacht) renderLiveResult(); }, 1000);

// ---------- meldingen van de andere spelers, in beeld ----------
function feed(html) {
  const el = $('#mpFeed');
  const d = document.createElement('div');
  d.className = 'mpf';
  d.innerHTML = html;
  el.appendChild(d);
  while (el.children.length > 4) el.firstChild.remove();
  setTimeout(() => d.classList.add('weg'), 4200);
  setTimeout(() => d.remove(), 4700);
}
let evStruikelT = 0;
function liveEv(k, n) {
  if (!live?.started || live.bots || jacht || state !== 'run') return;
  if (k === 'struikel') { if (now() - evStruikelT < 2) return; evStruikelT = now(); }
  liveSend({ t: 'ev', k, n });
}
const EV_POWER = { brommer: 'pakt de brommer 🛵', 'beker-van-ons': 'heeft DE BEKER 🏆', fiets: 'springt op de fiets 🚲', sjaal: 'pakt de sjaal 🧣', kist: 'opent een mystery kist 📦', nitraat: 'heeft nitraat 🧨', nitraat2: 'heeft nitraat 🧨' };
function evText(m) {
  const n = `<b>${escHtml(m.name)}</b>`;
  if (m.k === 'power') return `${n} ${EV_POWER[m.n] || 'pakt een power-up ⚡'}`;
  if (m.k === 'struikel') return `😂 ${n} struikelt`;
  if (m.k === 'meter') return `📏 ${n} haalt ${Number(m.n).toLocaleString('nl-NL')} m`;
  if (m.k === 'school') return `🏫 ${n} gaat het Montessori in`;
  if (m.k === 'record') return `🏅 ${n} heeft een nieuw record`;
  return '';
}
// ---------- chat: wie af is kan berichten sturen, wie nog rent ziet ze in beeld ----------
function liveChat(name, txt, mine) {
  if (!live) return;
  (live.chat ||= []).push({ name, txt, mine });
  if (live.chat.length > 30) live.chat.shift();
  renderChat();
  if (!mine && state === 'run') feed(`💬 <b>${escHtml(name)}</b>: ${escHtml(txt)}`);
}
function renderChat() {
  const log = $('#chatLog');
  log.innerHTML = (live?.chat || []).map((c) => `<li class="${c.mine ? 'me' : ''}"><b>${escHtml(c.name)}</b> ${escHtml(c.txt)}</li>`).join('') || '<li class="leeg">Nog geen berichten. Wie nog rent, ziet jouw bericht in beeld.</li>';
  log.scrollTop = log.scrollHeight;
}
function sendChat(txt) {
  txt = String(txt || '').trim().slice(0, 80);
  if (!txt || !live?.started || live.bots || state === 'run') return;
  liveSend({ t: 'chat', txt });
  liveChat(liveName(), txt, true);
}
$('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('#chatIn').value); $('#chatIn').value = ''; });
$('#chatQuick').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) sendChat(b.dataset.q); });

// =====================================================================
//  SHANE JAAGT: 1 tegen 1. Eén speler is Shane en moet Jens pakken,
//  Jens moet JACHT_TIJD seconden uit zijn handen blijven.
//  Afstanden gaan in 'Jens-meters': Shane begint JACHT_VOORSPRONG achter.
// =====================================================================
const JACHT_TIJD = 90, JACHT_VOORSPRONG = 80;
const JACHT_POWERS = {
  sprint: { icon: '⚡', naam: 'SPRINT', duur: 3, cd: 15, mul: 1.3, start: 3 },
  troeki: { icon: '🚀', naam: 'TROEKI', duur: 4, cd: 45, mul: 1.6, start: 25 },
  trap: { icon: '💣', naam: 'OBSTAKELS', duur: 0, cd: 16, start: 8 },
};
// Kwaliteit Troeki: Shane z'n opgevoerde cabrio
function makeTroeki() {
  const g = new THREE.Group();
  const lak = M('#e8e8ec'), zwart = M('#151515'), goud = M('#e0b030');
  g.add(mesh(box(1.7, 0.5, 3.6), lak, 0, 0.42, 0));
  g.add(mesh(box(1.72, 0.08, 3.62), M('#c8202b'), 0, 0.56, 0)); // racestreep
  g.add(mesh(box(1.5, 0.35, 0.06), M('#26313d'), 0, 0.85, -0.55)); // voorruit
  g.add(mesh(box(1.6, 0.06, 0.4), zwart, 0, 1.0, 1.7)); // spoiler
  for (const x of [-0.6, 0.6]) g.add(mesh(box(0.06, 0.32, 0.06), zwart, x, 0.82, 1.7));
  g.add(mesh(box(1.4, 0.12, 0.05), M('#fff6c0', { emissive: '#b09020' }), 0, 0.5, -1.82)); // koplampen
  for (const [x, z] of [[-0.85, -1.15], [0.85, -1.15], [-0.85, 1.15], [0.85, 1.15]]) {
    const w = wheel(0.3, 0.26, zwart); w.position.set(x, 0.3, z); g.add(w);
    g.add(mesh(cylG(0.17, 0.17, 0.27, 8).rotateZ(Math.PI / 2), goud, x, 0.3, z));
  }
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#30e0ff', transparent: true, opacity: 0.55, depthWrite: false }));
  neon.position.y = 0.03; g.add(neon);
  const plaat = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2).rotateY(Math.PI), new THREE.MeshBasicMaterial({ map: canvasTex(128, 32, (x) => {
    x.fillStyle = '#ffd23f'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#111'; x.font = '22px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('TROEKI', 64, 17);
  }) }));
  plaat.position.set(0, 0.45, 1.81); g.add(plaat);
  g.add(makeShadow(2.2, 4.2));
  return g;
}
const jensLabel = makeLabel('JENS', '#c8202b');
jensLabel.position.y = 2.4; jensLabel.visible = false;
jens.root.add(jensLabel);
const troeki = makeTroeki();
troeki.position.y = -0.42;
troeki.visible = false;
chasers.telefoon.root.add(troeki);

function jachtStart(rol, bot) {
  jachtStop();
  const pw = {};
  for (const [k, p] of Object.entries(JACHT_POWERS)) pw[k] = { t: 0, cd: p.start };
  jacht = { rol, bot, t: 0, o: { d: rol === 'shane' ? 0 : -JACHT_VOORSPRONG, v: 0, x: 0, y: 0, at: now() }, pw, slowT: 0, trapQ: 0, klaar: false, vastT: 0, hudT: 0,
    b: { struikel: rand(7, 12), slow: 0, power: rand(12, 20), boost: 0, wis: 1, denk: rand(0.5, 2) } };
  $('#jachtKnop').classList.toggle('hidden', rol !== 'shane');
  jensLabel.visible = rol === 'shane';
}
function jachtStop() {
  if (!jacht) return;
  jacht = null;
  troeki.visible = false;
  chasers.telefoon.root.position.y = 0;
  jens.root.visible = true;
  jensBike.visible = false;
  jensLabel.visible = false;
  $('#jachtHud').classList.add('hidden');
  $('#jachtKnop').classList.add('hidden');
}
// waar de ander nu ongeveer is (berichten komen elke 0,1 s)
const jachtAnder = () => jacht.o.d + (jacht.o.v || 0) * Math.min(0.35, now() - jacht.o.at);
const jachtMijnD = () => (jacht.rol === 'shane' ? dist - JACHT_VOORSPRONG : dist);
function jachtMul() {
  if (!jacht) return 1;
  if (jacht.rol === 'jens') return jacht.slowT > 0 ? 0.45 : 1;
  return jacht.pw.troeki.t > 0 ? JACHT_POWERS.troeki.mul : jacht.pw.sprint.t > 0 ? JACHT_POWERS.sprint.mul : 1;
}
// Jens struikelt of knalt ergens op: niet dood, wel even traag (en Shane komt dichterbij)
function jachtVal(t) {
  jacht.slowT = Math.max(jacht.slowT, t);
  invulnT = Math.max(invulnT, t + 0.4);
  shakeT = 0.35;
  if (t > 1.5) bubble(jens.head, pick(['AUW!', 'Mijn knie!', 'Nee nee nee']), 'shout', 1.2, 0.5);
}
function jachtPower(k) {
  if (!jacht || jacht.rol !== 'shane' || state !== 'run' || jacht.klaar) return;
  const p = jacht.pw[k], def = JACHT_POWERS[k];
  if (!p || p.cd > 0) return;
  p.cd = def.cd; p.t = def.duur;
  buzz([30, 40, 30]); sfx.power();
  if (k === 'sprint') { toast('⚡ SPRINT!', 1); fxFlash('#5ad1ff', 0.2); }
  if (k === 'troeki') { hype('🚀 KWALITEIT TROEKI!'); fxFlash('#30e0ff', 0.3); jacht.pw.sprint.t = 0; }
  if (k === 'trap') {
    toast('💣 OBSTAKELS!<small>Jens z\'n weg ligt vol</small>', 1.4);
    if (jacht.bot) jacht.b.struikel = Math.min(jacht.b.struikel, rand(0.8, 2.5));
    else liveSend({ t: 'j', e: 'trap' });
  }
}
// Shane z'n bekers laden de power-ups sneller op
function jachtBeker() { for (const p of Object.values(jacht.pw)) if (p.cd > 0) p.cd = Math.max(0, p.cd - 0.25); }
// Shane gooit de weg vol: drie lastige rijen achter elkaar
function jachtTrap() {
  for (const o of objs) if (o.z < -40 && o.z > -100 && !['landmark', 'deco', 'sign', 'ingang'].includes(o.kind)) o.dead = true;
  const rijen = ['muur', 'bukken', 'gat'].sort(() => Math.random() - 0.5);
  rijen.forEach((r, i) => {
    const z = -52 - i * 16;
    if (r === 'muur') {
      const vrij = Math.floor(Math.random() * 3);
      for (let l = 0; l < 3; l++) if (l === vrij) addObj('kliko', prefab('kliko', makeKliko), LANES[l], z, 0.8, 0.8, 1.12);
      else addObj('auto', prefab('auto', makeCar, 5), LANES[l], z - 1.2, 1.85, 3.9, 1.5);
    } else if (r === 'bukken') addObj('afzetting', makeAfzetting(), 0, z, ROAD_W, 0.3, 1.5);
    else addObj('gat', makeHole(ROAD_W - 0.4, 2.8), 0, z, ROAD_W, 2.8, 0);
  });
  toast('💣 SHANE GOOIT DE WEG VOL!<small>Springen, bukken, uitwijken!</small>', 1.8);
  bubble(chasers.telefoon.head, 'Succes, Jens!', 'shout', 1.4);
  buzz([40, 30, 40]);
}
function jachtEinde(win, titel, tekst) {
  if (!jacht || jacht.klaar || state !== 'run') return;
  Object.assign(jacht, { klaar: true, win, titel, tekst });
  state = 'dying'; deathReason = 'jacht'; deathT = 0;
  engineStop();
  if (fietsT > 0) stopFiets();
  brommerT = 0; moped.visible = false;
  $('#hud').classList.add('hidden');
  $('#jachtHud').classList.add('hidden'); $('#jachtKnop').classList.add('hidden');
  if (win) { hype(`🏆 ${titel}`, 'mega'); fxFlash('#ffd23f', 0.4); buzz(TRIL.record); } else { playGameover(); flash(true); }
  setTimeout(renderLiveResult, 2000);
}
// berichten van de ander
function jachtMsg(m) {
  if (m.t === 's') {
    const o = jacht.o, t = now();
    if (o.at && t > o.at) o.v = clamp((m.d - o.d) / (t - o.at), 0, 60);
    Object.assign(o, { d: m.d, x: m.x, y: m.y, sl: m.sl, tr: m.tr, bk: m.bk, at: t });
  }
  if (m.t === 'dead' && jacht.rol === 'shane') jachtEinde(true, 'GEPAKT!', `Shane heeft Jens na ${Math.floor(jacht.t)} seconden te pakken. Telefoon inleveren, om half 4 mag hij hem ophalen.`);
  if (m.t === 'j' && m.e === 'trap' && jacht.rol === 'jens') jacht.trapQ++;
  if (m.t === 'j' && m.e === 'ontsnapt' && jacht.rol === 'shane') jachtEinde(false, 'Ontsnapt…', `Jens is ${JACHT_TIJD} seconden uit je handen gebleven. Geen telefoon vandaag.`);
}
// de bot speelt de andere rol
function jachtBot(dt) {
  const b = jacht.b, o = jacht.o;
  let mul = 1;
  if (jacht.rol === 'shane') {
    if (b.slow > 0) b.slow -= dt;
    if (b.boost > 0) b.boost -= dt;
    if ((b.struikel -= dt) <= 0) { b.struikel = rand(7, 13); b.slow = rand(0.8, 1.5); }
    if ((b.power -= dt) <= 0) { b.power = rand(14, 24); b.boost = 5; }
    mul = b.slow > 0 ? 0.45 : b.boost > 0 ? 1.45 : 1;
    o.y = Math.max(0, Math.sin(now() * 3) - 0.86) * 8;
  } else {
    for (const [k, p] of Object.entries(jacht.pw)) { if (p.t > 0) p.t -= dt; if (p.cd > 0) p.cd -= dt; }
    if ((b.denk -= dt) <= 0) {
      b.denk = rand(1, 3);
      const p = jacht.pw;
      if (p.troeki.cd <= 0 && p.sprint.t <= 0) { p.troeki.cd = JACHT_POWERS.troeki.cd; p.troeki.t = JACHT_POWERS.troeki.duur; }
      else if (p.sprint.cd <= 0 && p.troeki.t <= 0) { p.sprint.cd = JACHT_POWERS.sprint.cd; p.sprint.t = JACHT_POWERS.sprint.duur; }
      if (p.trap.cd <= 0) { p.trap.cd = JACHT_POWERS.trap.cd; jacht.trapQ++; }
    }
    mul = jacht.pw.troeki.t > 0 ? JACHT_POWERS.troeki.mul : jacht.pw.sprint.t > 0 ? JACHT_POWERS.sprint.mul : 1;
    o.tr = jacht.pw.troeki.t > 0 ? 1 : 0;
  }
  if ((b.wis -= dt) <= 0) { b.wis = rand(1, 3); o.x = pick(LANES); }
  o.v = baseSpeed * mul;
  o.d += o.v * dt; o.at = now();
}
function updateJacht(dt) {
  if (!jacht) return;
  const run = state === 'run';
  if (run && !jacht.klaar) {
    jacht.t += dt;
    if (jacht.slowT > 0) jacht.slowT -= dt;
    if (jacht.bot) jachtBot(dt);
    else if (!live) { jachtEinde(false, 'Verbinding weg', 'De live-verbinding is verbroken.'); return; }
    if (jacht.rol === 'shane') for (const p of Object.values(jacht.pw)) { if (p.t > 0) p.t -= dt; if (p.cd > 0) p.cd -= dt; }
    const gap = jacht.rol === 'jens' ? dist - jachtAnder() : jachtAnder() - jachtMijnD();
    if (jacht.rol === 'jens') {
      if (jacht.trapQ > 0 && !indoor && !seg?.active && !schoolPhase) { jacht.trapQ--; jachtTrap(); }
      if (gap <= 0.7 && jacht.t > 2) {
        Object.assign(jacht, { klaar: true, win: false, titel: 'Gepakt!', tekst: `Shane heeft je na ${Math.floor(jacht.t)} seconden te pakken. Telefoon inleveren!` });
        die('gepakt');
        return;
      }
      if (jacht.t >= JACHT_TIJD) { liveSend({ t: 'j', e: 'ontsnapt' }); jachtEinde(true, 'ONTSNAPT!', `Jens is ${JACHT_TIJD} seconden uit Shane z'n handen gebleven. De telefoon blijft in zijn zak.`); return; }
    } else {
      // de echte Jens meldt zelf dat hij gepakt is; dit is alleen voor bots en haperende verbindingen
      jacht.vastT = gap <= (jacht.bot ? 0.7 : -2) ? jacht.vastT + dt : 0;
      if (jacht.vastT > (jacht.bot ? 0 : 1.5)) { jachtEinde(true, 'GEPAKT!', `Shane heeft Jens na ${Math.floor(jacht.t)} seconden te pakken. Telefoon inleveren!`); return; }
      if (jacht.t >= JACHT_TIJD + (jacht.bot ? 0 : 3)) { jachtEinde(false, 'Ontsnapt…', `Jens is ${JACHT_TIJD} seconden uit je handen gebleven. Geen telefoon vandaag.`); return; }
    }
    if ((jacht.hudT -= dt) <= 0) { jacht.hudT = 0.1; jachtHud(gap); }
  }
  // Shane-kant: de echte Jens rent voor je uit
  if (jacht.rol === 'shane' && (run || state === 'dying')) {
    const o = jacht.o, z = Math.min(-0.9, jachtMijnD() - jachtAnder());
    const r = jens.root;
    r.position.set(damp(r.position.x, o.x, 8, dt), o.y || 0, z);
    r.rotation.set(0, 0, 0);
    r.visible = z > -75;
    jensBike.visible = !!o.bk && !jacht.klaar;
    pose(jens, jacht.klaar ? 'grabbed' : o.bk ? 'bike' : o.sl ? 'slide' : o.y > 0.1 ? 'jump' : 'phone', dt, clamp(speed / 12, 0.9, 1.7));
  }
}
function jachtHud(gap) {
  const el = $('#jachtHud');
  el.classList.remove('hidden');
  const rest = Math.max(0, Math.ceil(JACHT_TIJD - jacht.t)), m = Math.max(0, Math.round(gap));
  $('#jhRol').textContent = jacht.rol === 'shane' ? '🎯 JENS' : '📱 SHANE';
  $('#jhGap').textContent = `${m} m`;
  $('#jhBar').style.width = `${clamp(gap / (JACHT_VOORSPRONG * 1.5), 0, 1) * 100}%`;
  $('#jhTijd').textContent = `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`;
  el.classList.toggle('dichtbij', gap < 15);
  if (jacht.rol !== 'shane') return;
  for (const b of document.querySelectorAll('#jachtKnop [data-jp]')) {
    const p = jacht.pw[b.dataset.jp], def = JACHT_POWERS[b.dataset.jp];
    b.classList.toggle('klaar', p.cd <= 0);
    b.classList.toggle('aan', p.t > 0);
    b.querySelector('i').style.height = p.cd > 0 ? `${(p.cd / def.cd) * 100}%` : '0';
  }
}
// Shane-achtervolger: op Jens z'n scherm volgt hij de echte Shane, op Shane z'n scherm ben jij het
function jachtChaser(c, dt, moving) {
  const tr = jacht.rol === 'shane' ? jacht.pw.troeki.t > 0 && !jacht.klaar : !!jacht.o.tr;
  troeki.visible = tr;
  if (c.label) c.label.visible = false;
  if (jacht.rol === 'jens') {
    if (state === 'run' || state === 'dying') chaseDist = damp(chaseDist, state === 'dying' && !jacht.win ? 0.9 : clamp(dist - jachtAnder(), 0.6, 90), 6, dt);
    chaseX = damp(chaseX, state === 'dying' ? player.x : jacht.o.x || 0, 5, dt);
    c.root.position.set(chaseX, tr ? 0.42 : 0, chaseDist);
    c.root.visible = !indoor && !seg?.active && chaseDist < 70;
    pose(c, tr ? 'sit' : moving ? 'grab' : 'reach', dt, moving ? clamp(speed / 12, 0.8, 1.6) : 1);
  } else {
    c.root.position.set(player.x, player.y + (tr ? 0.42 : 0), 0);
    c.root.visible = true;
    pose(c, tr ? 'sit' : player.slideT > 0 ? 'slide' : !player.grounded ? 'jump' : moving ? 'grab' : 'idle', dt, clamp(speed / 12, 0.8, 1.6));
  }
  if (tr) for (const o of troeki.children) if (o.isMesh && o.geometry.type === 'CylinderGeometry') o.rotation.x -= speed * dt / 0.3;
}
function startJachtBot(rol) {
  liveClose();
  live = { ws: { readyState: 3, close() {} }, code: 'BOTS', quick: true, bots: true, players: [], ghosts: new Map(), results: new Map(), started: false };
  $('#fmLive').classList.add('hidden');
  liveGo('jacht', Date.now() + 3000, rol === 'shane' ? save.playerId : 'bot');
}
function jachtStartKamer(ikShane) {
  const ander = live?.players.find((p) => p.pid !== save.playerId);
  if (!ander) return;
  liveSend({ t: 'start', mode: 'jacht', shane: ikShane ? save.playerId : ander.pid });
}
for (const b of document.querySelectorAll('#jachtKnop [data-jp]')) {
  b.addEventListener('click', () => jachtPower(b.dataset.jp));
  b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); jachtPower(b.dataset.jp); }, { passive: false });
}
$('#flJShane').addEventListener('click', () => jachtStartKamer(true));
$('#flJJens').addEventListener('click', () => jachtStartKamer(false));
$('#flJKamer').addEventListener('click', () => liveConnect(Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''), true));
$('#flJZoek').addEventListener('click', () => quickPlay(null, true));
$('#flCode').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#flCodeIn').value.toUpperCase().trim();
  $('#flCodeIn').value = '';
  $('#flCodeIn').blur();
  liveConnect(code, true);
});
$('#flJBotShane').addEventListener('click', () => { audioInit(); startJachtBot('shane'); });
$('#flJBotJens').addEventListener('click', () => { audioInit(); startJachtBot('jens'); });

// =====================================================================
//  ACCOUNT: inloggen met naam/e-mail + wachtwoord, voortgang synct tussen apparaten
// =====================================================================
// velden die per apparaat horen en niet mee gaan
const LOCAL_ONLY = ['token', 'account', 'syncedAt', 'set', 'lastNotif', 'newsBag', 'newsLast'];
function syncable() {
  const o = {};
  for (const [k, v] of Object.entries(save)) if (!LOCAL_ONLY.includes(k)) o[k] = v;
  o.updatedAt = save.updatedAt || Date.now();
  return o;
}
// samenvoegen: niets wat je ergens gehaald of gekocht hebt mag verdwijnen
function mergeSave(remote, login) {
  if (!remote) return;
  const local = save, newer = (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  const maxMap = (a = {}, b = {}) => { const r = { ...a }; for (const [k, v] of Object.entries(b)) r[k] = typeof v === 'number' ? Math.max(r[k] || 0, v) : r[k] ?? v; return r; };
  const out = { ...local, ...newer };
  out.owned = { ...(local.owned || {}), ...(remote.owned || {}) };
  out.best = maxMap(local.best, remote.best);
  out.plak = maxMap(local.plak, remote.plak);
  out.stats = maxMap(local.stats, remote.stats);
  out.ach = { ...(remote.ach || {}), ...(local.ach || {}) };
  out.feestPlayed = { ...(local.feestPlayed || {}), ...(remote.feestPlayed || {}) };
  out.mult = Math.max(local.mult || 1, remote.mult || 1);
  out.bestRun = Math.max(local.bestRun || 0, remote.bestRun || 0);
  out.story = { ...(local.story || {}) };
  for (const [k, v] of Object.entries(remote.story || {})) {
    const l = out.story[k] || {};
    out.story[k] = { cleared: !!(l.cleared || v.cleared), stars: Math.max(l.stars || 0, v.stars || 0), best: Math.max(l.best || 0, v.best || 0) };
  }
  // bij inloggen op een ander apparaat raak je geen bekers kwijt; daarna telt de laatste stand
  out.bekers = login ? Math.max(local.bekers || 0, remote.bekers || 0) : newer.bekers;
  for (const k of LOCAL_ONLY) out[k] = local[k];
  Object.assign(save, out);
}
var syncTimer = 0, syncing = false; // var: persist() kan al vóór deze regel draaien
function scheduleSync() {
  if (!save.token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushSync, 4000);
}
async function pushSync() {
  if (!save.token || syncing) return;
  syncing = true;
  try {
    const r = await apiCall('/api/account/sync', { token: save.token, save: syncable() });
    if (r.status === 401) logoutLocal('Je bent uitgelogd. Log opnieuw in om te syncen.');
    else if (r.ok) save.syncedAt = r.updated;
  } catch (e) { /* offline: later opnieuw */ }
  syncing = false;
}
async function pullSync() {
  if (!save.token) return;
  try {
    const r = await apiCall('/api/account/sync', { token: save.token });
    if (r.status === 401) { logoutLocal('Je bent uitgelogd op dit apparaat.'); return; }
    if (!r.ok) return;
    if (r.save) { mergeSave(r.save); persistLocal(); applyOutfit(); if (curScreen === '#menu') showScreen('#menu'); }
    pushSync();
  } catch (e) { /* offline */ }
}
function persistLocal() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* geen opslag */ } }
function logoutLocal(msg) {
  save.token = null; save.account = null; persistLocal();
  if (msg) note(msg);
  renderAccount();
}
function renderAccount() {
  const el = $('#accountBox');
  if (!el) return;
  if (save.token && save.account) {
    el.innerHTML = `<div class="acc-on"><b>👤 ${escHtml(save.account.name)}</b><small>${escHtml(save.account.email)} · voortgang wordt gesynct</small></div>
      <div class="row"><button class="btn alt" id="accSync">🔄 Nu syncen</button><button class="btn alt" id="accOut">Uitloggen</button></div>
      <button class="btn alt" id="accPw">🔑 Wachtwoord wijzigen</button>`;
  } else {
    el.innerHTML = `<p class="hint">Maak een account om je voortgang op al je apparaten te hebben (telefoon, laptop, app).</p>
      <div class="row"><button class="btn alt" id="accNew">✨ Account maken</button><button class="btn alt" id="accIn">Inloggen</button></div>`;
  }
}
let accMode = 'in';
function openAccount(m) {
  accMode = m;
  showScreen('#account');
  $('#acTitle').textContent = m === 'new' ? '✨ Account maken' : m === 'pw' ? '🔑 Wachtwoord wijzigen' : '👤 Inloggen';
  $('#acName').closest('label').classList.toggle('hidden', m !== 'new' || !!save.name);
  $('#acEmail').closest('label').classList.toggle('hidden', m === 'pw');
  $('#acLogin').closest('label').classList.toggle('hidden', m !== 'in');
  $('#acOld').closest('label').classList.toggle('hidden', m !== 'pw');
  $('#acEmail').closest('label').classList.toggle('hidden', m !== 'new');
  $('#acPass').placeholder = m === 'pw' ? 'Nieuw wachtwoord (min. 8 tekens)' : m === 'new' ? 'Wachtwoord (min. 8 tekens)' : 'Wachtwoord';
  $('#acPass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
  $('#acInfo').textContent = m === 'new' && save.name ? `Je account krijgt je ranglijstnaam: ${save.name}` : m === 'in' ? 'Je voortgang op dit apparaat wordt samengevoegd met die van je account.' : '';
  $('#acForm .err').textContent = '';
  $('#acGo').textContent = m === 'new' ? 'ACCOUNT MAKEN' : m === 'pw' ? 'OPSLAAN' : 'INLOGGEN';
}
$('#acForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#acForm .err'), btn = $('#acGo');
  err.textContent = ''; btn.disabled = true;
  try {
    let r;
    if (accMode === 'new') r = await apiCall('/api/account/register', { id: save.playerId, name: $('#acName').value || save.name, email: $('#acEmail').value, password: $('#acPass').value });
    else if (accMode === 'pw') r = await apiCall('/api/account/password', { token: save.token, old: $('#acOld').value, password: $('#acPass').value });
    else r = await apiCall('/api/account/login', { login: $('#acLogin').value, password: $('#acPass').value });
    if (!r.ok) throw new Error(r.error || 'Dat lukte niet.');
    if (accMode === 'pw') { note('🔑 Wachtwoord gewijzigd'); openSettings('#menu'); return; }
    if (accMode === 'in' && r.playerId !== save.playerId) {
      // op een ander apparaat: dit apparaat wordt dezelfde speler
      save.playerId = r.playerId;
      mergeSave(r.save, true);
    }
    save.name = r.name;
    save.token = r.token;
    save.account = { name: r.name, email: r.email };
    save.updatedAt = Date.now();
    persistLocal();
    await pushSync();
    if (window.JensRunNative?.setPlayer) try { window.JensRunNative.setPlayer(save.playerId); } catch (ex) { /* oude app */ }
    note(accMode === 'new' ? '✨ Account gemaakt, je voortgang is opgeslagen' : '👤 Ingelogd, voortgang gesynct');
    location.reload(); // alles opnieuw opbouwen met de samengevoegde voortgang
  } catch (ex) { err.textContent = ex.message; }
  btn.disabled = false;
});
$('#acBack').addEventListener('click', () => openSettings('#menu'));
$('#accountBox').addEventListener('click', async (e) => {
  const id = e.target.id;
  if (id === 'accNew') openAccount('new');
  if (id === 'accIn') openAccount('in');
  if (id === 'accPw') openAccount('pw');
  if (id === 'accSync') { await pullSync(); note('🔄 Gesynct'); }
  if (id === 'accOut' && confirm('Uitloggen? Je voortgang blijft op je account en op dit apparaat.')) {
    apiCall('/api/account/logout', { token: save.token }).catch(() => {});
    logoutLocal('Uitgelogd');
  }
});
// bij het openen en wanneer je terugkomt in de app: ophalen
pullSync();
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullSync(); else if (save.token) pushSync(); });

// muziek start bij de eerste aanraking/klik
for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, () => audioInit());

// ---------- app: service worker + installeren ----------
const inApp = /JensRunApp\//.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if ('serviceWorker' in navigator && !inApp) navigator.serviceWorker.register('sw.js').catch(() => {});
if (inApp || standalone) $('#appBtn').classList.add('hidden');
$('#appBtn').addEventListener('click', () => {
  $('#instIos').classList.toggle('hidden', !isIos && /Android/.test(navigator.userAgent));
  $('#instAndroid').classList.toggle('hidden', isIos);
  showScreen('#install');
});
$('#instBack').addEventListener('click', () => showScreen('#menu'));
// terug-knop van de Android-app
window.__jrBack = () => {
  if (glasSluit()) return true;
  if (state === 'run') { pauseGame(); return true; }
  if (state === 'mini') { if (mini.over) miniQuit(); else miniPause(!mini.paused); return true; }
  if (curScreen && curScreen !== '#menu' && curScreen !== '#start') { if (curLevel || state !== 'menu') toMenu(); else showScreen('#menu'); return true; }
  return false;
};

// shaders van tevoren klaarzetten
setTimeout(() => { try { renderer.compile(scene, camera); } catch (e) { /* niet erg */ } }, 500);

// ---------- start ----------
function isEvening() { const h = new Date().getHours(); return h >= 18 || h < 7; }
{ const h = new Date().getHours(); applyLook(h >= 17 && h < 19 ? 1 : isEvening() ? 2 : 0); }
setMode(mode);
// startscherm: pas na een klik/toets mag de browser geluid afspelen
// ---------- opwarmen: alle shaders en textures vooraf klaarzetten ----------
// Anders compileert de GPU een shader op het moment dat iets voor het eerst verschijnt (kort haperen).
function warmUp() {
  const warm = new THREE.Group();
  const add = (fn) => { try { const o = fn(); const r = o?.root || o?.g || o; if (r?.isObject3D) warm.add(r); } catch (e) { /* overslaan */ } };
  const makers = [
    makeAfzetting, makeBakfiets, makeBank, makeBoomstam, makeBooster, makeBotsauto, makeCar, makeCone, makeContainer, makeDeelscooter,
    () => makeDoekBord(1), makeDog, makeDranghek, () => makeDrerrie(false), () => makeDrerrie(true), makeDuif, makeSaar, () => makeFatbike(false), () => makeFatbike(true),
    makeFietswrak, makeForkSign, () => makeHole(2, 2), makeHooibaal, makeHooligan, () => makeIngang(false), () => makeIngang(true), makeKar, makeKerstboom, makeKliko, makeKoe,
    () => makeKraam('#ff5fb8', 'SUIKERSPIN'), makeKroon, () => makeLabel('x', '#c8202b'), makeLeidinggevende, makeMarktkraam, makeNitraat, makePoort, makeReporter,
    makeRugzak, makeSchaap, makeSchip, makeScootmobiel, () => makeSign('Javastraat'), makeSjaalPower, makeSmallNitraat, makeSteward, makeStoel, makeTegenligger, makeTerras,
    makeTrekker, makeTrofee, makeTrolleybus, makeTruck, makeUitgang, makeViskrat, () => makeVriend('tim'), () => makeVriend('jesse'), () => makeVriend('patrick'), makeVrouw,
    () => makeWandelaars(3), makeWinkelwagen, makeJos, () => makeClubFan(CLUBS[0]), () => makeCup(1.15), makeSteve,
    ...['brommer', 'beker-van-ons', 'nitraat', 'sjaal', 'fiets'].map((t) => () => makePower(t)),
    ...Object.keys(LANDMARKS).filter((k) => typeof LANDMARKS[k] === 'function').map((k) => () => LANDMARKS[k](k === 'stadion' ? ['X', '#c8202b', '#f4f4f4'] : 'WINKELCENTRUM')),
  ];
  makers.forEach(add);
  add(() => mesh(box(1, 1, 1), outlineMat));
  add(() => mesh(box(1, 1, 1), holeRimMat));
  for (const m of fireMats) add(() => mesh(sparkGeo, m));
  // dezelfde onderdelen ook als instances (zo tekent de batch ze)
  const inst = new THREE.Group(), seen = new Set();
  warm.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const k = o.geometry.id + ':' + o.material.id;
    if (seen.has(k)) return; seen.add(k);
    inst.add(new THREE.InstancedMesh(o.geometry, o.material, 1));
    if (o.material.map) renderer.initTexture(o.material.map);
  });
  warm.traverse((o) => { if (o.isMesh) o.layers.set(0); });
  const done = () => { resBase = { g: new THREE.BufferGeometry().id, t: new THREE.Texture().id }; batchPeople.forEach((r) => { if (!r.userData.inScene && warm.getObjectById(r.id)) batchPeople.delete(r); }); };
  try {
    const p = renderer.compileAsync ? renderer.compileAsync(warm, camera, scene) : (renderer.compile(warm, camera, scene), Promise.resolve());
    p.then(() => (renderer.compileAsync ? renderer.compileAsync(inst, camera, scene) : renderer.compile(inst, camera, scene))).catch(() => {}).finally(done);
  } catch (e) { done(); }
}
setTimeout(warmUp, 400); // tijdens het startscherm
// gezichten/shirts van figuranten alvast tekenen, één per keer als de browser niks te doen heeft
function prewarmPeople() {
  const jobs = [];
  for (const skin of ['#f0cbb0', '#e2b896', '#c98f6a']) for (const angry of [true]) jobs.push(() => makePerson({ key: 'hool' + skin, skin, hair: '#2a2018', hairStyle: 'kort', shirt: { base: '#c8202b', paint(x, side) { x.fillStyle = '#1f7a3a'; x.fillRect(0, 44, 128, 18); x.fillStyle = '#141414'; x.fillRect(0, 62, 128, 18); if (side === 'front') text(x, 'NEC', '#fff', 26, 34); } }, pants: '#222', shoes: '#222', face: { skin, angry, brow: '#2a2018' } }));
  for (const skin of ['#f0cfb6', '#e6c2a4', '#b97a55']) for (const hair of ['#9a9a9a', '#3a2a1a', '#c9a866']) for (const angry of [true, false]) jobs.push(() => makePerson({ key: 'buur' + skin, skin, hair, hairStyle: 'kort', shirt: { base: '#7a8a9a', paint() {} }, pants: '#333', shoes: '#333', face: { skin, angry, brow: '#3a2a1a' } }));
  for (let i = 0; i < 4; i++) jobs.push(() => makeWandelaars(3));
  // de echte spawn-functies (dan klopt het precies), een paar keer i.v.m. willekeurige huid/haar; meteen weer weggehaald
  const viaSpawn = (fn) => () => { const n0 = objs.length; try { fn(); } catch (e) { /* overslaan */ } for (const o of objs.splice(n0)) { scene.remove(o.mesh); o.mesh.traverse((c) => batchPeople.delete(c)); } };
  for (let k = 0; k < 5; k++) for (const t of ['supporter', 'feestganger', 'wandelaars', 'bierbekers', 'steward', 'drerrie', 'tegenligger', 'scootmobiel'])
    if (SPECIAL_EXTRA[t] || t === 'drerrie' || t === 'tegenligger' || t === 'scootmobiel') jobs.push(viaSpawn(() => spawnObstacle(t, 1, -9999)));
  for (let k = 0; k < 4; k++) jobs.push(viaSpawn(() => { const p = makeHooligan(); addObj('deco', p.root, 0, -9999, 0, 0, 0); }));
  const ric = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 60));
  const step = (dl) => { while (jobs.length && dl.timeRemaining() > 4) { const p = jobs.shift()(); batchPeople.delete(p?.root || p); } if (jobs.length) ric(step); };
  ric(step);
}
setTimeout(prewarmPeople, 1500);
let started = false, startedAt = 0;
function leaveStart(e) {
  if (started) return;
  started = true;
  startedPerf = performance.now();
  startedAt = e ? e.timeStamp : 0;
  if (e) e.preventDefault();
  audioInit();
  sfx.power();
  showScreen('#menu');
  checkDaily();
  // uitnodigingslink: meteen de kamer in
  const kamerLink = new URLSearchParams(location.search).get('kamer');
  if (kamerLink) setTimeout(() => quickPlay(kamerLink.toUpperCase()), 300);
}
$('#start').addEventListener('pointerdown', leaveStart);
// de klik die na de tik komt mag niet op een knop in het menu belanden
let startedPerf = 0;
document.addEventListener('click', (e) => { if (started && performance.now() - startedPerf < 600) { e.stopPropagation(); e.preventDefault(); } }, true);
window.addEventListener('keydown', (e) => { if (!started) leaveStart(e); });
showScreen('#start');
if (location.hash === '#autostart') setTimeout(() => { leaveStart(); startRun(); }, 300);
updateCamera(1);
// debug hook voor tests
// =====================================================================
//  MINIGAMES: Asbest, Vuurwerk en Mijn Osso. Elk een eigen scène en camera,
//  de straat van het rennen blijft gewoon staan voor het menu.
// =====================================================================
const MINI_MODES = ['glijden', 'vuurwerk', 'osso'];
const mini = { kind: null, scene: null, cam: null, t: 0, score: 0, paused: false, over: false, keys: {}, parts: [], ptr: null, s: null };
// figuranten worden in de straat als instances getekend (laag 1); hier gewoon los
function miniLoose(root) {
  root.traverse((o) => { o.layers.set(0); if (o.userData?.isPerson) batchPeople.delete(o); });
  return root;
}
function miniWorld(sky, near, far, night) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(sky);
  s.fog = new THREE.Fog(sky, near, far);
  s.add(new THREE.HemisphereLight(night ? '#9aa8e0' : '#e6f2ff', night ? '#2a2438' : '#7a6a58', night ? 1.5 : 2.2));
  const d = new THREE.DirectionalLight(night ? '#c8d0ff' : '#fff3dc', night ? 1.1 : 2.4);
  d.position.set(-6, 12, 6); s.add(d);
  // getekende lucht: verloop met blokkerige wolken, één tekenopdracht die met de camera meereist
  if (!night) {
    const c = new THREE.Color(sky), top = c.clone().multiplyScalar(0.62), hex = (k) => '#' + c.clone().lerp(top, k).getHexString();
    const t = canvasTex(64, 64, (x) => {
      const n = 8;
      for (let i = 0; i < n; i++) { x.fillStyle = hex(1 - i / (n - 1)); x.fillRect(0, (i * 44) / n, 64, 44 / n + 1); }
      x.fillStyle = hex(0); x.fillRect(0, 44, 64, 20);
      x.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 12; i++) x.fillRect(Math.floor(rand(0, 56)), Math.floor(rand(10, 38)), Math.floor(rand(6, 18)), Math.floor(rand(1, 4)));
    }, 64);
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1);
    const m = new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false });
    m.defines = { PSX_PERSP: '' };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(120, 12, 6), m);
    dome.renderOrder = -10;
    s.add(dome);
    s.onBeforeRender = (r, sc, cam) => { dome.position.copy(cam.position); };
  }
  return s;
}
// geluidjes uit een bestand; mogen over elkaar heen spelen (anders dan playClip)
function miniSnd(name, vol = 1, rate = 1) {
  if (!ac || !save.sound || !clips[name]) return false;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = clips[name]; s.playbackRate.value = rate; g.gain.value = vol * 1.6 * (FW_CLIPS.has(name) ? FW_VOL : 1);
  s.connect(g).connect(master); s.start();
  return true;
}
const miniSparkMats = ['#ff3b3b', '#ffd23f', '#4dd2ff', '#7dff6a', '#ff7af0', '#ffffff', '#ff9a1f'].map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
const miniDustMats = ['#8a6a4a', '#a8865a', '#6b4a2e', '#9a9a9a'].map((c) => new THREE.MeshLambertMaterial({ color: c }));
function miniBurst(pos, n, speed, mats, life, grav = 9) {
  if (lowFx) n = Math.ceil(n / 2);
  if (mini.parts.length > 420) n = Math.min(n, 4);
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Mesh(sparkGeo, Array.isArray(mats) ? pick(mats) : mats);
    sp.position.copy(pos); mini.scene.add(sp);
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.35, speed));
    mini.parts.push({ sp, v, life: life * rand(0.6, 1), max: life, g: grav });
  }
}
function updateMiniParts(dt) {
  for (let i = mini.parts.length - 1; i >= 0; i--) {
    const p = mini.parts[i];
    p.life -= dt;
    p.v.y -= p.g * dt;
    p.v.multiplyScalar(1 - 0.8 * dt);
    p.sp.position.addScaledVector(p.v, dt);
    p.sp.scale.setScalar(Math.max(0.01, (p.life / p.max) * 1.3));
    if (p.life <= 0) { mini.scene.remove(p.sp); mini.parts.splice(i, 1); }
  }
}
function miniMsg(t, dur = 1.6) {
  const el = $('#miniMsg');
  el.innerHTML = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(miniMsg.tm); miniMsg.tm = setTimeout(() => el.classList.remove('on'), dur * 1000);
}
// ---------- effectjes (hele game): zwevende punten, grote meldingen, flitsen, oplopende tonen ----------
function popAt(text, x, y, cls = '') {
  const box = $('#fx');
  if (!box || box.childElementCount > 24) return;
  const el = document.createElement('div');
  el.className = 'fx-pop ' + cls; el.textContent = text;
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
  box.appendChild(el);
  setTimeout(() => el.remove(), 950);
}
const _pv = new THREE.Vector3();
function popWorld(text, pos, cam, cls) {
  _pv.copy(pos).project(cam);
  if (_pv.z > 1 || Math.abs(_pv.x) > 1.2 || Math.abs(_pv.y) > 1.2) return;
  popAt(text, (_pv.x + 1) / 2 * innerWidth + rand(-12, 12), (1 - _pv.y) / 2 * innerHeight, cls);
}
// ---------- geluidjes voor de beloningen ----------
const jingle = {
  fanfare(up = 1) { [523, 659, 784, 1047].forEach((f, i) => tone(f * up, 0.12, 'square', 0.055, null, i * 0.06)); },
  level() { // opgewekt loopje met glinstering erachteraan
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, 0.1, 'square', 0.05, null, i * 0.05); tone(f / 2, 0.14, 'triangle', 0.06, null, i * 0.05); });
    for (let i = 0; i < 6; i++) tone(rand(2400, 3600), 0.06, 'sine', 0.03, null, 0.32 + i * 0.05);
  },
  kaching() { tone(1568, 0.08, 'square', 0.06); tone(2093, 0.25, 'square', 0.06, null, 0.07); noise(0.05, 0.08, 0.02); },
  riser() { tone(220, 0.35, 'sawtooth', 0.04, 880); tone(330, 0.35, 'square', 0.025, 1320, 0.02); },
  drum() { tone(110, 0.18, 'sine', 0.25, 45); noise(0.06, 0.12); },
};
// zoef: lucht die langs je oren gaat bij rakelings ontwijken
function whoosh(vol = 0.1) {
  if (!ac || !save.sound) return;
  const t = ac.currentTime, dur = 0.22, sr = ac.sampleRate;
  if (!fwNoise) { fwNoise = ac.createBuffer(1, sr * 2, sr); const d = fwNoise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = fwNoise; f.type = 'bandpass'; f.Q.value = 1.4;
  f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur);
  g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
// grote meldingen: nooit twee tegelijk; een 'mega' gaat voor, de rest wacht even
let hypeUntil = 0, hypeNext = null;
function hype(html, cls = '', snd = cls === 'mega' ? 'fanfareUp' : 'fanfare') {
  const t = performance.now();
  if (t < hypeUntil) {
    if (!hypeNext || cls === 'mega') { hypeNext = [html, cls, snd]; setTimeout(() => { const n = hypeNext; hypeNext = null; if (n) hype(...n); }, hypeUntil - t + 30); }
    return;
  }
  hypeUntil = t + 900;
  const el = $('#fxHype');
  el.className = 'fx-hype ' + cls; el.innerHTML = html;
  void el.offsetWidth; el.classList.add('on');
  if (snd === 'fanfareUp') jingle.fanfare(1.26); else jingle[snd]?.();
}
// flits: alleen een gloed langs de randen, het midden (waar je naar kijkt) blijft vrij
function fxFlash(color = '#fff', a = 0.4) {
  const el = $('#fxFlash');
  el.style.background = `radial-gradient(ellipse at 50% 55%, transparent 45%, ${color} 120%)`;
  el.style.transition = 'none'; el.style.opacity = Math.min(1, a * (isPhone() ? 0.9 : 2.2));
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'opacity .45s'; el.style.opacity = 0; }));
}
// bekertje vliegt van Jens naar je teller rechtsboven
let coinFlying = 0;
const glinsterMats = ['#fff3b0', '#ffd23f', '#ffffff'].map((c) => new THREE.MeshBasicMaterial({ color: c }));
function coinFly(pos, cam) {
  if (isPhone() || coinFlying > 3) return; // de teller telt toch wel op
  const tgt = $('#bekerCount')?.getBoundingClientRect();
  if (!tgt) return;
  _pv.copy(pos).project(cam);
  const el = document.createElement('div');
  el.className = 'fx-coin'; el.textContent = '🏆';
  el.style.left = (_pv.x + 1) / 2 * innerWidth + 'px'; el.style.top = (1 - _pv.y) / 2 * innerHeight + 'px';
  $('#fx').appendChild(el); coinFlying++;
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = tgt.left + tgt.width * 0.3 + 'px'; el.style.top = tgt.top + tgt.height / 2 + 'px'; el.style.transform = 'translate(-50%, -50%) scale(.5)'; el.style.opacity = '.4'; }));
  setTimeout(() => { el.remove(); coinFlying--; }, 520);
}
// bekers en munten: elke volgende binnen een seconde klinkt een toon hoger
let dingN = 0, dingT = 0;
function fxDing() {
  const t = performance.now();
  dingN = t - dingT < 900 ? Math.min(dingN + 1, 14) : 0; dingT = t;
  const f = 880 * Math.pow(2, dingN / 12);
  tone(f, 0.07, 'square', 0.07); tone(f * 1.5, 0.11, 'square', 0.06, null, 0.05);
  return dingN;
}
function startMini(kind) {
  audioInit();
  stopGameover();
  resetRun();
  miniClear();
  Object.assign(mini, { kind, t: 0, score: 0, paused: false, over: false, keys: {}, parts: [], ptr: null, s: null });
  mini.cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 260);
  state = 'mini';
  $('#hud').classList.add('hidden');
  showScreen('#mini');
  $('#mini').className = 'mini mini-' + kind;
  $('#miniPauseBox').classList.add('hidden');
  $('#miniCtl').innerHTML = ''; $('#miniCtl').dataset.sig = ''; $('#miniCtl').className = 'mini-ctl';
  $('#miniInfo').innerHTML = '';
  missionEvent('games');
  MINI[kind].start();
}
function miniClear() {
  if (!mini.scene) return;
  freeObject(mini.scene);
  mini.scene = null;
}
function updateMini(dt) {
  if (!mini.scene) return;
  const c = mini.cam, asp = innerWidth / innerHeight;
  if (c.aspect !== asp) { c.aspect = asp; c.updateProjectionMatrix(); }
  if (!mini.paused) {
    if (!mini.over) mini.t += dt;
    MINI[mini.kind].update(dt);
    updateMiniParts(dt);
  }
  $('#miniScore').textContent = Math.floor(mini.score).toLocaleString('nl-NL');
}
const miniUnlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
function miniPause(on) {
  if (state !== 'mini' || mini.over) return;
  if (on) miniUnlock();
  mini.paused = on;
  $('#miniPauseBox').classList.toggle('hidden', !on);
}
function miniEnd(title, text) {
  if (mini.over) return;
  mini.over = true;
  miniUnlock();
  const kind = mini.kind, score = Math.floor(mini.score), secs = Math.max(1, Math.round(mini.t));
  const best = save.best[kind] || 0;
  if (score > best) save.best[kind] = score;
  const bek = Math.floor(score / 40);
  save.bekers += bek;
  save.stats.games = (save.stats.games || 0) + 1;
  persist();
  buzz([60, 40, 60]);
  setTimeout(() => {
    if (state !== 'mini' || mini.kind !== kind) return;
    playGameover();
    $('#moTitle').textContent = title;
    $('#moText').textContent = text;
    $('#moScore').textContent = score.toLocaleString('nl-NL');
    $('#moBest').textContent = Math.max(best, score).toLocaleString('nl-NL');
    $('#moBekers').textContent = '+' + bek;
    $('#moNew').classList.toggle('hidden', score <= best || best === 0);
    $('#moRank').textContent = save.name ? '' : 'Kies een naam bij de ranglijst om mee te doen.';
    showScreen('#miniOver');
    $('#mini').classList.remove('hidden');
    $('#miniCtl').innerHTML = '';
  }, 1400);
  if (save.name && score > 0) apiCall('/api/score', { id: save.playerId, mode: kind, score, dist: 0, secs, bekers: 0, mult: 1 }).then((r) => {
    if (r.ok && r.rank) $('#moRank').textContent = `#${r.rank} op de ranglijst als ${save.name}`;
  }).catch(() => {});
}
function miniQuit() {
  miniUnlock();
  stopGameover();
  miniClear();
  mini.kind = null;
  $('#mini').classList.add('hidden');
  state = 'menu';
  showScreen('#menu');
}
$('#miniPause').addEventListener('click', () => miniPause(true));
$('#mpResume').addEventListener('click', () => miniPause(false));
$('#mpQuit').addEventListener('click', () => { mini.paused = false; miniQuit(); });
$('#moAgain').addEventListener('click', () => startMini(mini.kind));
$('#moMenu').addEventListener('click', miniQuit);
// toetsen en aanwijzen (muis en vinger) gaan naar de actieve minigame
window.addEventListener('keydown', (e) => {
  if (state !== 'mini' || (e.target.closest && e.target.closest('input'))) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
  if (k === 'Escape' || k === 'p') { miniPause(!mini.paused); return; }
  if (e.repeat) return;
  mini.keys[k] = true;
  if (!mini.paused && !mini.over) MINI[mini.kind].key?.(k);
});
window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; mini.keys[k] = false; });
const miniPtrPos = (e) => ({ x: e.clientX, y: e.clientY, nx: (e.clientX / innerWidth) * 2 - 1, ny: -(e.clientY / innerHeight) * 2 + 1 });
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'mini' || mini.paused || mini.over) return;
  const p = miniPtrPos(e);
  mini.ptr = { id: e.pointerId, x0: p.x, y0: p.y, ...p, type: e.pointerType, btn: e.button };
  MINI[mini.kind].down?.(mini.ptr);
});
canvas.addEventListener('pointermove', (e) => {
  if (state !== 'mini') return;
  const p = miniPtrPos(e);
  mini.hover = p;
  if (mini.ptr && mini.ptr.id === e.pointerId) { Object.assign(mini.ptr, p); MINI[mini.kind].move?.(mini.ptr); }
});
const miniUp = (e) => {
  if (state !== 'mini' || !mini.ptr || mini.ptr.id !== e.pointerId) return;
  const p = mini.ptr; mini.ptr = null;
  if (!mini.paused && !mini.over) MINI[mini.kind].up?.(p);
};
canvas.addEventListener('pointerup', miniUp);
canvas.addEventListener('pointercancel', miniUp);
canvas.addEventListener('contextmenu', (e) => { if (state === 'mini') e.preventDefault(); });
// knoppen onderin (vuren, wapen wisselen): vasthouden telt
function miniButtons(html) {
  const el = $('#miniCtl');
  el.innerHTML = html;
  el.querySelectorAll('[data-hold]').forEach((b) => {
    const k = b.dataset.hold;
    const on = (e) => { e.preventDefault(); mini.keys[k] = true; MINI[mini.kind].key?.(k); };
    const off = () => { mini.keys[k] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  });
}
const MINI = {};
// muis vastgezet (Mijn Osso): bewegen = kijken; loslaten met Esc = pauze
document.addEventListener('mousemove', (e) => {
  if (state !== 'mini' || mini.kind !== 'osso' || document.pointerLockElement !== canvas || mini.paused || mini.over) return;
  mini.s.yaw -= e.movementX * 0.0025;
  mini.s.pitch = clamp(mini.s.pitch - e.movementY * 0.0022, -0.9, 0.6);
});
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && state === 'mini' && mini.kind === 'osso' && !mini.over) miniPause(true); });

// =====================================================================
//  ASBEST: op een asbestplaat van een gigantische berg af, steeds harder
// =====================================================================
const GL_CHUNK = 18, GL_ROW = 4; // rijen per stuk berg, meter per rij
const glCx = (s) => Math.sin(s * 0.0035) * 16 + Math.sin(s * 0.0091 + 1.3) * 7;
const glY = (s) => -s * 0.42 + Math.sin(s * 0.018) * 2.2;
const glW = () => 46; // veel breder dan de oude glijbaan
// dwarsdoorsnede: brede vlakte, aan de randen rijst de berg steil op (u = -1 … 1 over de breedte)
const GL_FLAT = 0.84, GL_RIM = 13;
const glH = (u) => { const a = Math.min(1, Math.abs(u)); return a <= GL_FLAT ? 0 : GL_RIM * ((a - GL_FLAT) / (1 - GL_FLAT)) ** 2; };
const glDH = (u) => { const a = Math.abs(u); return a <= GL_FLAT || a > 1 ? 0 : Math.sign(u) * 2 * GL_RIM * (a - GL_FLAT) / (1 - GL_FLAT) ** 2; };
const GL_US = [-1, -0.96, -0.92, -0.88, -GL_FLAT, -0.64, -0.42, -0.21, 0, 0.21, 0.42, 0.64, GL_FLAT, 0.88, 0.92, 0.96, 1];
// kleine hobbels voor de vorm (Jens glijdt er gewoon overheen), zodat het licht per hoekpunt mooi verloopt
const glBump = (u, s) => (Math.sin(u * 19 + s * 0.13) + Math.sin(u * 7 - s * 0.07)) * (Math.abs(u) > GL_FLAT ? 0.9 : 0.16);
let glPlaatTex = null, glBergTex = null;
function glMats() {
  glBergTex ||= markShared(canvasTex(64, 64, (x) => {
    // verweerde grijze golfplaten en stof
    x.fillStyle = '#b9b3a4'; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i += 4) { x.fillStyle = i % 8 ? 'rgba(255,250,235,.16)' : 'rgba(40,36,28,.22)'; x.fillRect(i, 0, 2, 64); }
    for (let i = 0; i < 26; i++) { x.fillStyle = pick(['rgba(70,60,45,.3)', 'rgba(255,255,240,.22)', 'rgba(120,70,40,.22)']); x.fillRect(rand(0, 60), rand(0, 60), rand(2, 10), rand(1, 5)); }
    x.fillStyle = 'rgba(30,26,20,.5)'; x.fillRect(0, 0, 64, 1); x.fillRect(0, 32, 64, 1);
    grain(x, 64, 64, 14);
  }));
  glBergTex.wrapS = glBergTex.wrapT = THREE.RepeatWrapping;
  glPlaatTex ||= canvasTex(64, 64, (x) => {
    for (let i = 0; i < 64; i++) { const l = 150 + Math.round(Math.sin(i / 64 * Math.PI * 8) * 22); x.fillStyle = `rgb(${l},${l},${l - 6})`; x.fillRect(i, 0, 1, 64); }
    grain(x, 64, 64, 18);
    x.fillStyle = 'rgba(90,80,60,.25)'; for (let i = 0; i < 6; i++) x.fillRect(rand(0, 60), rand(0, 60), rand(3, 9), rand(3, 9));
  });
  glPlaatTex.wrapS = glPlaatTex.wrapT = THREE.RepeatWrapping;
  markShared(glPlaatTex);
}
function glChunk(k) {
  const pos = [], uv = [];
  const row = (r) => { const s = (k * GL_CHUNK + r) * GL_ROW; return { s, z: -s, cx: glCx(s), y: glY(s), w: glW(s) }; };
  const pt = (o, u) => [o.cx + u * o.w / 2, o.y + glH(u) + glBump(u, o.s), o.z];
  const quad = (arr, A, B, C, D) => arr.push(...A, ...B, ...C, ...A, ...C, ...D);
  for (let r = 0; r < GL_CHUNK; r++) {
    const a = row(r), b = row(r + 1), va = a.s / 9, vb = b.s / 9;
    for (let i = 0; i < GL_US.length - 1; i++) {
      const u0 = GL_US[i], u1 = GL_US[i + 1], t0 = u0 * 5, t1 = u1 * 5;
      quad(pos, pt(a, u0), pt(a, u1), pt(b, u1), pt(b, u0));
      uv.push(t0, va, t1, va, t1, vb, t0, va, t1, vb, t0, vb);
    }
  }
  const g = new THREE.Group();
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); top.computeVertexNormals();
  g.add(new THREE.Mesh(top, cached('glBergMat', () => new THREE.MeshLambertMaterial({ map: glBergTex, side: THREE.DoubleSide }))));
  g.userData.k = k;
  return g;
}
// waarschuwingsbord langs de baan
function glBord() {
  const g = new THREE.Group();
  g.add(mesh(box(0.14, 2.4, 0.14), M('#5a5e64'), 0, 1.2, 0));
  const t = cached('glBordMat', () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: canvasTex(96, 64, (x) => {
    x.fillStyle = '#ffd23f'; x.fillRect(0, 0, 96, 64); x.fillStyle = '#111'; x.fillRect(2, 2, 92, 3); x.fillRect(2, 59, 92, 3); x.fillRect(2, 2, 3, 60); x.fillRect(91, 2, 3, 60);
    x.font = '24px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.fillText('GEVAAR', 48, 28); x.font = '20px Anton, Impact, sans-serif'; x.fillText('ASBEST', 48, 52);
  }) }));
  const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.45), t); b.position.y = 2.9; g.add(b);
  return g;
}
// brok asbest: een hoekige steen
function glBrok() {
  const m = mesh(new THREE.IcosahedronGeometry(1, 0), cached('glBrokMat', () => new THREE.MeshLambertMaterial({ map: glBergTex, flatShading: true, color: '#a8a294' })), 0, 0.55, 0);
  m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); m.scale.set(rand(0.8, 1.2), rand(0.55, 0.9), rand(0.8, 1.2));
  const g = new THREE.Group(); g.add(m);
  return g;
}
// loods met een kapot golfplaten dak
function glLoods() {
  const g = new THREE.Group();
  g.add(mesh(box(6, 3.2, 4.4), M('#6f6a60'), 0, 1.6, 0));
  const dak = mesh(box(6.8, 0.2, 5.2), cached('glDakMat', () => new THREE.MeshLambertMaterial({ map: glBergTex })), 0, 3.5, 0);
  dak.rotation.z = 0.16; g.add(dak);
  g.add(mesh(box(1.4, 2.2, 0.1), M('#2a2622'), -1.2, 1.1, -2.22));
  return g;
}
const GL_OBS = {
  brok: { r: 1.1, make: glBrok, pts: 0 },
  loods: { r: 3.2, make: glLoods, pts: 0, tall: true },
  kliko: { r: 0.45, make: makeKliko, pts: 0 },
  kegel: { r: 0.3, make: makeCone, pts: 0 },
  hek: { r: 1.1, flat: true, make: makeDranghek, pts: 0 },
  drerrie: { r: 0.55, make: () => miniLoose(makeDrerrie(false)), pts: 0, move: 7 },
  gat: { r: 2.1, hole: true, pts: 0 },
  schans: { r: 1.3, ramp: true, pts: 0 },
  container: { r: 1.5, make: () => makeContainer(), pts: 0, tall: true },
  beker: { r: 0.7, pickup: true, make: () => makeCup(1.15), pts: 50 },
  boost: { r: 1.3, boost: true, pts: 0 },
  // mensen op de glijbaan: je hoort ze al van ver
  docent: { r: 0.5, person: 'docent', pose: 'point', line: '🧑‍🏫 JENS! NAAR DE CONRECTOR!', snd: () => sfx.schoolbel() },
  fietser: { r: 0.6, person: 'fietser', pose: 'bike', move: 6, line: '🚲 JENS, WACHT NOU! *tring tring*', snd: () => { sfx.bel(); setTimeout(() => sfx.bel(), 350); } },
  shane: { r: 0.5, person: 'shane', pose: 'grab', line: '📱 Jens, je telefoon!', snd: () => playClip('shane' + (1 + Math.floor(Math.random() * 6)), true) || sfx.ring() },
  boa: { r: 0.55, person: 'boa', pose: 'point', line: '👮 HANDHAVING! STAAN BLIJVEN!', snd: () => sfx.fluit() },
};
function glSpawn(s) {
  const st = mini.s, w = glW(s), cx = glCx(s);
  const diff = clamp(s / 3000, 0, 1);
  const lane = () => cx + rand(-1, 1) * (w / 2) * (GL_FLAT - 0.06);
  // ook dicht bij de speler iets neerzetten: de berg is breed, zonder dit stuur je er overal omheen
  const buurt = () => clamp(st.x + st.vx * 0.4 + rand(-11, 11), cx - (w / 2) * (GL_FLAT - 0.06), cx + (w / 2) * (GL_FLAT - 0.06));
  const add = (type, x, sOff = 0) => {
    const d = GL_OBS[type], ss = s + sOff;
    let m;
    if (d.hole) { m = mesh(box(4.4, 0.04, 3.4), M('#141414'), 0, 0.03, 0); m.add(mesh(box(5, 0.03, 4), M('#3a2a1a'), 0, 0, 0)); }
    else if (d.boost) { m = new THREE.Group(); m.add(mesh(box(2.4, 0.03, 3.4), M('#1f9a4a', { emissive: '#0a5a20' }), 0, 0.03, 0)); for (let i = 0; i < 3; i++) { const a = mesh(coneG(0.6, 0.8, 3), M('#7dff6a', { emissive: '#2a8a20' }), 0, 0.06, 0.8 - i * 0.8); a.rotation.x = -Math.PI / 2; a.scale.y = 0.2; m.add(a); } }
    else if (d.person) { const pm = osModel(d.person); m = pm.root; m.userData.p = pm.p; m.rotation.y = Math.PI; }
    else if (d.ramp) { m = new THREE.Group(); const sch = mesh(box(2.6, 0.12, 2.8), M('#c8202b'), 0, 0.3, 0); sch.rotation.x = 0.35; m.add(sch); m.add(mesh(box(2.6, 0.04, 0.3), M('#ffd23f'), 0, 0.6, -1.3)); }
    else m = d.make();
    if (d.make) miniLoose(m);
    m.position.set(x, glY(ss), -ss);
    if (d.hole || d.ramp || d.boost) m.rotation.x = -Math.atan(0.42); // plat op de helling
    st.world.add(m);
    st.obs.push({ type, d, m, x, s: ss, hit: false, vx: 0, vy: 0, fly: 0 });
  };
  // elke rij een paar dingen tegelijk verspreid over de breedte
  const n = 2 + Math.floor(rand(0, 2 + diff * 3));
  for (let i = 0; i < n; i++) {
    const roll = Math.random(), off = rand(-3, 3);
    if (roll < 0.36) add('brok', lane(), off);
    else if (roll < 0.46 && s > 200) add('loods', lane(), off);
    else if (roll < 0.56) add(pick(['kliko', 'kegel', 'container']), lane(), off);
    else if (roll < 0.66) add('hek', lane(), off);
    else if (roll < 0.74 && s > 150) add('gat', lane(), off);
    else if (roll < 0.8 && s > 250) add('drerrie', lane(), off);
    else if (roll < 0.86 && s > 120) add(pick(['docent', 'fietser', 'shane', 'boa', 'fietser']), lane(), off);
    else add('brok', lane(), off);
  }
  // recht op je pad: hier moet je echt voor sturen
  if (Math.random() < 0.55 + diff * 0.35) add(pick(['brok', 'brok', 'hek', 'kliko', 'kegel']), buurt());
  const r2 = Math.random();
  if (r2 < 0.12) add('schans', buurt());
  else if (r2 < 0.22) add('boost', buurt());
  else if (r2 < 0.62) { const x = buurt(); for (let i = 0; i < 5; i++) add('beker', x + Math.sin(i * 0.8 + s) * 1.2, 3 + i * 2.6); }
}
MINI.glijden = {
  start() {
    glMats();
    // grijze stoflucht, korte mist: je ziet de berg pas laat
    const sc = mini.scene = miniWorld('#b7a896', 34, 150);
    sc.children.forEach((l) => { if (l.isHemisphereLight) { l.color.set('#dfe4ea'); l.groundColor.set('#3a3a3c'); l.intensity = 1.5; } if (l.isDirectionalLight) { l.color.set('#fff0dc'); l.intensity = 2.6; l.position.set(-8, 10, 4); } });
    const world = new THREE.Group(); sc.add(world);
    // de plaat met Jens erop
    const plaat = new THREE.Group();
    plaat.add(mesh(box(1.15, 0.06, 1.75), new THREE.MeshLambertMaterial({ map: glPlaatTex }), 0, 0.04, 0));
    const jp = cutJens(); miniLoose(jp.root);
    plaat.add(jp.root);
    jp.root.position.set(0, -0.82, 0.25);
    sc.add(plaat);
    mini.s = { world, plaat, jens: jp, chunks: new Map(), obs: [], decor: [], nextSpawn: 50, nextDecor: 0,
      x: glCx(0), s: 0, y: glY(0), vx: 0, speed: 15, vy: 0, air: false, fall: false, fallT: 0, hits: 0, inv: 0, dist: 0, bekers: 0, schans: 0, near: 0, spin: 0 };
    miniButtons('<button class="mini-btn left" data-hold="ArrowLeft">◀</button><button class="mini-btn jump" data-hold=" ">⤒</button><button class="mini-btn right" data-hold="ArrowRight">▶</button>');
    this.hud();
    miniMsg('⛰️ ASBEST!<small>Stuur met ◀ ▶ of A/D · spring met spatie · je gaat steeds harder!</small>', 2.6);
    this.update(0);
  },
  hud() {
    const st = mini.s;
    $('#miniInfo').innerHTML = `<span>${'❤️'.repeat(Math.max(0, 3 - st.hits))}${'🖤'.repeat(Math.min(3, st.hits))}</span><span>${Math.floor(st.dist)} m</span><span>${Math.round((st.speed + (st.boost || 0) * 8) * 3.6)} km/u</span><span>🏆 ${st.bekers}</span>`;
  },
  key(k) {
    if (k === ' ' || k === 'ArrowUp' || k === 'w') this.jump();
  },
  jump() {
    const st = mini.s;
    if (st.air || st.fall) return;
    st.air = true; st.vy = 6.2; sfx.jump();
  },
  down(p) { p.steer0 = p.x; p.moved = false; },
  move(p) { if (Math.abs(p.x - p.x0) > 14 || Math.abs(p.y - p.y0) > 14) p.moved = true; },
  up(p) { if (p.y0 - p.y > 40) this.jump(); }, // omhoog vegen = springen
  update(dt) {
    const st = mini.s, sc = mini.scene;
    // sturen: toetsen, knoppen of slepen over het scherm
    let steer = (mini.keys.ArrowRight || mini.keys.d ? 1 : 0) - (mini.keys.ArrowLeft || mini.keys.a ? 1 : 0);
    if (mini.ptr && !steer) steer = clamp((mini.ptr.x - mini.ptr.x0) / (innerWidth * 0.12), -1, 1);
    if (!mini.over && !st.fall) {
      // steeds meer vaart: dit is het hele idee van de modus
      st.speed = Math.min(92, st.speed + dt * (1.15 + st.s / 2600));
      const vNu = st.speed + (st.boost || 0) * 8;
      const stuur = 13 + st.speed * 0.42;
      st.vx += steer * stuur * 6 * dt;
      st.vx *= 1 - 3.4 * dt; // je glijdt een beetje door: bij hoge snelheid moet je vooruit sturen
      st.vx = clamp(st.vx, -stuur, stuur);
      st.boost = Math.max(0, (st.boost || 0) - dt);
      st.x += st.vx * dt;
      st.s += vNu * dt;
      st.dist = st.s;
      $('#mini').classList.toggle('fast', vNu > 42);
      mini.score = st.s + st.bekers * 50 + st.schans * 100 + st.near * 25 + (st.bonus || 0);
      // in de bak: hoe verder naar de rand, hoe harder hij je terugduwt; te hard = eroverheen
      const u = (st.x - glCx(st.s)) / (glW(st.s) / 2), au = Math.abs(u);
      if (!st.air && au > GL_FLAT) st.vx -= Math.sign(u) * 150 * ((Math.min(1, au) - GL_FLAT) / (1 - GL_FLAT)) * dt;
      if (au > 0.99) { st.x = glCx(st.s) + Math.sign(u) * 0.99 * glW(st.s) / 2; st.vx *= -0.3; }
      st.u = u;
      const ground = glY(st.s) + glH(u);
      if (st.air) {
        st.vy -= 18 * dt; st.y += st.vy * dt;
        if (st.y <= ground && au <= 1.02) { st.y = ground; st.air = false; st.vy = 0; noise(0.12, 0.15); }
      } else st.y = ground;
      st.inv = Math.max(0, st.inv - dt);
      // obstakels
      for (const o of st.obs) {
        if (o.hit) continue;
        const dz = o.s - st.s, dx = o.x - st.x;
        if (o.d.move) { o.s -= o.d.move * dt; o.m.position.z = -o.s; o.m.position.y = glY(o.s); }
        const raak = Math.max(1.1, vNu * dt * 0.6 + 0.6);
        if (o.d.person || o.type === 'drerrie') pose(o.m.userData.p || o.m.userData.person, o.d.pose || 'bike', dt);
        if (o.d.snd && !o.said && dz < 48) { o.said = true; o.d.snd(); miniMsg(o.d.line, 1.4); }
        if (o.d.person && st.air && !o.jumped && Math.abs(dz) < 0.8 && Math.abs(dx) < 1.2 && st.y - glY(st.s) > 0.9) { o.jumped = true; st.bonus = (st.bonus || 0) + 250; popWorld('+250 EROVERHEEN!', _pv.set(o.x, glY(o.s) + 2.4, -o.s), mini.cam, 'good'); sfx.power(); }
        if (Math.abs(dz) > raak) { if (!o.passed && dz < -raak && !o.d.pickup && !o.d.ramp && Math.abs(dx) < o.d.r + 1.1) { o.passed = true; st.near++; } continue; }
        if (Math.abs(dx) > o.d.r + 0.45) continue;
        if (o.d.pickup) { o.hit = true; o.m.visible = false; st.bekers++; const dn = fxDing(); popWorld('+50', _pv.set(o.x, st.y + 1.6, -o.s), mini.cam, dn > 3 ? 'good' : ''); continue; }
        if (o.d.boost) { if (!st.air) { o.hit = true; st.boost = 2.2; sfx.power(); hype('⚡ BOOST!'); fxFlash('#7dff6a', 0.25); } continue; }
        if (o.d.ramp) { if (!st.air) { o.hit = true; st.air = true; st.vy = 9; st.schans++; sfx.power(); popWorld('🚀 +100', _pv.set(st.x, st.y + 2.2, -st.s - 2), mini.cam, 'blue'); } continue; }
        if (o.d.hole) { if (!st.air) { o.hit = true; this.fall('gat'); } continue; }
        if (st.air && !o.d.tall && st.y - glY(st.s) > (o.d.flat ? 0.9 : 1.2)) continue;
        if (st.inv > 0) continue;
        o.hit = true; o.fly = 1; o.vx = Math.sign(dx || 1) * 4; o.vy = 6;
        st.hits++; st.inv = 1.3; st.speed *= 0.72; st.vx += Math.sign(-dx || 1) * 5; st.spin = 1;
        sfx.stumble(); buzz(60);
        miniBurst(new THREE.Vector3(o.x, st.y + 0.6, -o.s), 14, 5, miniDustMats, 0.7);
        if (st.hits >= 3) { this.fall('kapot'); break; }
        miniMsg(o.d.person ? pick(['💥 SORRY!', '💥 OEPS!', '💥 AAAH!']) : ['💥 AU!', '💥 BOEM!', '💥 Kijk uit, Jens!'][st.hits - 1] || '💥', 0.9);
        fxFlash('#ff3b3b', 0.3); st.shake = 0.4;
      }
      this.hud();
    } else if (st.fall) {
      st.fallT += dt;
      st.vy -= 20 * dt; st.y += st.vy * dt;
      st.x += st.vx * dt; st.s += st.speed * 0.5 * dt;
      st.plaat.rotation.x += dt * 2.5; st.plaat.rotation.z += dt * st.vx * 0.3;
      if (!st.plons && st.fallT > 1.1) {
        st.plons = true;
        miniBurst(new THREE.Vector3(st.x, st.y + 0.3, -st.s), 40, 9, [M('#d8d0bf'), M('#a8a294'), M('#ffffff')], 1.2, 12);
        noise(0.9, 0.5); tone(120, 0.6, 'sine', 0.3, 40); buzz([80, 40, 120]);
        st.plaat.visible = false;
        miniEnd(st.why === 'kapot' ? 'Van de plaat gevallen!' : 'EEN SCHEUR!', st.why === 'gat' ? `Jens gleed in een scheur in de berg. ${Math.floor(st.dist)} meter, op ${Math.round(st.speed * 3.6)} km/u.`
          : `Na drie klappen vloog Jens van z'n asbestplaat. ${Math.floor(st.dist)} meter, op ${Math.round(st.speed * 3.6)} km/u.`);
      }
    }
    for (const o of st.obs) if (o.fly) { o.fly += dt; o.vy -= 18 * dt; o.m.position.x += o.vx * dt; o.m.position.y += o.vy * dt; o.m.rotation.x += dt * 6; if (o.fly > 2) o.m.visible = false; }
    st.shake = Math.max(0, (st.shake || 0) - dt);
    // baan aanleggen en opruimen
    const k0 = Math.floor((st.s - 40) / (GL_CHUNK * GL_ROW)), k1 = Math.floor((st.s + 170) / (GL_CHUNK * GL_ROW));
    for (let k = Math.max(0, k0); k <= k1; k++) if (!st.chunks.has(k)) { const c = glChunk(k); st.world.add(c); st.chunks.set(k, c); }
    for (const [k, c] of st.chunks) if (k < k0) { st.world.remove(c); freeObject(c); for (const ch of c.children) ch.geometry.dispose(); st.chunks.delete(k); }
    while (st.nextSpawn < st.s + 150) { if (st.nextSpawn > 40) glSpawn(st.nextSpawn); st.nextSpawn += rand(13, 20) + st.speed * 0.12; }
    for (let i = st.obs.length - 1; i >= 0; i--) { const o = st.obs[i]; if (o.s < st.s - 15) { st.world.remove(o.m); st.obs.splice(i, 1); } }
    // decor: borden en brokken op de bergwand
    while (st.nextDecor < st.s + 170) {
      const side = Math.random() < 0.5 ? -1 : 1, ds = st.nextDecor, u = side * rand(0.86, 0.93);
      const b = Math.random() < 0.55 ? miniLoose(glBord()) : miniLoose(glBrok());
      if (!b.children[1]) b.scale.setScalar(rand(1.5, 3.2));
      b.position.set(glCx(ds) + u * glW(ds) / 2, glY(ds) + glH(u) - 0.2, -ds);
      st.world.add(b); st.decor.push({ m: b, s: ds });
      st.nextDecor += rand(8, 18);
    }
    for (let i = st.decor.length - 1; i >= 0; i--) if (st.decor[i].s < st.s - 40) { st.world.remove(st.decor[i].m); st.decor.splice(i, 1); }
    // plaat, Jens en camera
    const ahead = st.s + 1, slope = Math.atan2(glY(st.s) - glY(ahead), 1), yaw = Math.atan2(glCx(ahead) - glCx(st.s), 1);
    st.plaat.position.set(st.x, st.y + 0.02, -st.s);
    if (!st.fall) {
      st.spin = Math.max(0, st.spin - dt * 1.5);
      const roll = st.air ? 0 : Math.atan(glDH(st.u || 0) / (glW(st.s) / 2));
      st.plaat.rotation.set(-slope * 0.9, -yaw - st.vx * 0.04 + Math.sin(st.spin * 12) * st.spin * 0.6, roll - st.vx * 0.02);
    }
    st.plaat.visible = st.plons ? false : st.inv <= 0 || Math.floor(mini.t * 14) % 2 === 0;
    const jp = st.jens;
    pose(jp, 'sit', dt);
    jp.legL.rotation.x = jp.legR.rotation.x = 1.45; jp.kneeL.rotation.x = jp.kneeR.rotation.x = -0.12;
    jp.armL.rotation.x = jp.armR.rotation.x = st.air ? 2.4 : 0.35; jp.armL.rotation.z = 0.5; jp.armR.rotation.z = -0.5;
    jp.body.rotation.z = -steer * 0.2;
    const cam = mini.cam, camS = st.fall ? st.s - 8 : st.s - (6.5 + clamp((st.speed - 15) * 0.03, 0, 2));
    const cx = st.fall ? st.x : damp(cam.position.x, st.x * 0.75 + glCx(camS) * 0.25, 6, dt || 1);
    const sk = st.shake * 0.4;
    const lucht = st.fall ? glY(st.s) : st.y;
    cam.position.set(cx + rand(-sk, sk), lucht + 3.6 + (camS - st.s) * -0.42 * 0 + 3.0 + rand(-sk, sk), -camS);
    cam.lookAt(st.x, (st.fall ? st.y : st.y) + 0.4, -(st.s + 7));
    cam.fov = damp(cam.fov, 62 + clamp((st.speed - 15) * 0.32, 0, 28) + (st.boost > 0 ? 8 : 0), 5, dt || 1); cam.updateProjectionMatrix();
  },
  fall(why) {
    const st = mini.s;
    if (st.fall) return;
    st.fall = true; st.why = why; st.vy = why === 'gat' ? -2 : 2.5;
    sfx.die(); buzz([40, 30, 80]);
    miniMsg(why === 'gat' ? '🕳️ EEN SCHEUR!' : '💥 DAAR GAAT JENS!', 1.4);
  },
};

// =====================================================================
//  VUURWERK: Jens schiet vanaf de dijk op drerries die een brug bouwen
//  tussen twee eilandjes in de Waal. Trek terug en laat los (zoals een katapult).
// =====================================================================
const VW_ISL = [{ x0: -4, x1: 8, top: 1.4 }, { x0: 20, x1: 32, top: 1.4 }];
const VW_DIJK = { x1: -17, top: 3 }, VW_JENS = { x: -20, y: 3 };
const VW_PLANK = 1.5, VW_GAP = VW_ISL[1].x0 - VW_ISL[0].x1, VW_PLANKS = Math.round(VW_GAP / VW_PLANK);
const VW_AMMO = {
  nitraat: { icon: '🧨', name: 'Nitraat', g: 14, r: 2.3, dmg: 2, push: 9, snd: 'nitraat' },
  lawine: { icon: '🚀', name: 'Lawinepijl', g: 6, r: 1.8, dmg: 1.6, push: 7, snd: 'groot', tip: 'Tik in de lucht: hij splitst in drie' },
  cake: { icon: '🎆', name: 'Cakebox', g: 13, r: 1.4, dmg: 1.1, push: 5, snd: 'cake', tip: 'Tien schoten achter elkaar' },
  mortier: { icon: '💣', name: 'Mortierbom', g: 15, r: 3.6, dmg: 4, push: 14, snd: 'groot' },
};
const VW_BLOCK = {
  krat: { w: 0.9, h: 0.9, hp: 2, c: '#9a6a3a', pts: 50 },
  pallet: { w: 3.4, h: 0.22, hp: 1.5, c: '#c79a5a', pts: 50 },
  beton: { w: 0.6, h: 2.2, hp: 6, c: '#8a8f94', pts: 100 },
  kliko: { w: 0.8, h: 1.1, hp: 3, c: '#2e7a35', pts: 60 },
  plank: { w: VW_PLANK, h: 0.24, hp: 1.2, c: '#7a5232', pts: 80 },
  kist: { w: 0.9, h: 0.9, hp: 1, c: '#c8202b', pts: 100 }, // vuurwerkkist: ontploft mee
};
let vwKratTex = null;
function vwBlockMesh(type) {
  const d = VW_BLOCK[type];
  if (type === 'krat') {
    vwKratTex ||= markShared(canvasTex(32, 32, (x) => { x.fillStyle = '#9a6a3a'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#6b4626'; x.fillRect(0, 0, 32, 3); x.fillRect(0, 29, 32, 3); x.fillRect(0, 0, 3, 32); x.fillRect(29, 0, 3, 32); x.fillRect(4, 14, 24, 4); grain(x, 32, 32, 18); }));
    return new THREE.Mesh(box(d.w, d.h, 0.9), new THREE.MeshLambertMaterial({ map: vwKratTex }));
  }
  const m = mesh(box(d.w, d.h, type === 'pallet' || type === 'plank' ? 1.2 : 0.8), M(d.c));
  if (type === 'kist') { m.add(mesh(box(0.92, 0.2, 0.82), M('#ffd23f', { emissive: '#6a5000' }), 0, 0.15, 0)); m.add(mesh(box(0.05, 0.35, 0.05), M('#2a2a2a'), 0.2, 0.6, 0)); }
  if (type === 'kliko') m.add(mesh(box(0.86, 0.1, 0.86), M('#1f5a26'), 0, 0.58, 0));
  return m;
}
function vwDrerrie(builder) {
  const p = makePerson({ key: 'drerrie', skin: pick(['#e8c0a0', '#c99468', '#a8714a', '#f0cbb0']), hair: '#1a1410', hairStyle: 'guccipet',
    shirt: { base: '#151515', paint(x) { x.fillStyle = '#f4f4f4'; x.fillRect(4, 0, 6, 128); x.fillRect(118, 0, 6, 128); } },
    pants: '#151515', shoes: '#f4f4f4', face: { skin: '#e8c0a0', angry: true, brow: '#1a1410' } });
  miniLoose(p.root);
  if (builder) { const pl = mesh(box(1.1, 0.12, 0.3), M('#7a5232'), 0, 1.25, -0.35); pl.visible = false; p.body.add(pl); p.plank = pl; }
  return p;
}
function vwAddBody(kind, type, x, y, extra = {}) {
  const st = mini.s;
  let b;
  if (kind === 'drerrie') {
    const p = vwDrerrie(extra.role === 'builder');
    p.root.rotation.y = Math.PI / 2; // kijkt naar Jens
    b = { kind, type: 'drerrie', w: 0.7, h: 1.85, hp: extra.role === 'builder' ? 1 : 2, p, m: p.root, pts: 500, ...extra };
  } else {
    if (type === 'krat' && Math.random() < 0.24) type = 'kist';
    const d = VW_BLOCK[type];
    b = { kind, type, w: d.w, h: d.h, hp: d.hp, m: vwBlockMesh(type), pts: d.pts, ...extra };
  }
  Object.assign(b, { x, y, vx: 0, vy: 0, dead: false, fly: 0 });
  b.m.position.set(x, kind === 'drerrie' ? y - b.h / 2 : y, 0);
  st.world.add(b.m);
  st.bodies.push(b);
  return b;
}
const vwIsland = (x) => VW_ISL.find((i) => x >= i.x0 && x <= i.x1);
function vwLevel(n) {
  const st = mini.s;
  for (const b of st.bodies) st.world.remove(b.m);
  for (const s of st.shells) st.world.remove(s.m);
  for (const c of st.cakes) st.world.remove(c.m);
  st.bodies = []; st.planks = [[], []];
  st.level = n; st.shells = []; st.cakes = []; st.cleared = false; st.lostT = 0; st.nitroT = 0;
  st.ammo = { nitraat: 3 + Math.min(3, Math.floor(n / 2)), lawine: 1 + Math.floor(n / 3), cake: 1, mortier: n >= 2 ? 1 + Math.floor(n / 4) : 0 };
  st.sel = 'nitraat';
  // bouwsels met drerries erin of erop
  const prefabs = {
    hut(x, top) { vwAddBody('block', 'krat', x - 1.2, top + 0.45); vwAddBody('block', 'krat', x - 1.2, top + 1.35); vwAddBody('block', 'krat', x + 1.2, top + 0.45); vwAddBody('block', 'krat', x + 1.2, top + 1.35); vwAddBody('block', 'pallet', x, top + 1.91); vwAddBody('drerrie', null, x, top + 0.925, { role: 'guard' }); },
    toren(x, top) { for (let i = 0; i < 3; i++) vwAddBody('block', 'krat', x, top + 0.45 + i * 0.9); vwAddBody('drerrie', null, x, top + 2.7 + 0.925, { role: 'guard' }); },
    muur(x, top) { vwAddBody('block', 'beton', x - 0.9, top + 1.1); vwAddBody('drerrie', null, x + 0.2, top + 0.925, { role: 'guard' }); vwAddBody('block', 'krat', x + 1.2, top + 0.45); },
    kliko(x, top) { vwAddBody('block', 'kliko', x - 0.5, top + 0.55); vwAddBody('block', 'kliko', x + 0.5, top + 0.55); vwAddBody('block', 'pallet', x, top + 1.21); vwAddBody('drerrie', null, x, top + 1.32 + 0.925, { role: 'guard' }); },
  };
  const guards = Math.min(6, 1 + n);
  const slots = [[VW_ISL[0], 0.5], [VW_ISL[1], 9.5], [VW_ISL[0], 3.8], [VW_ISL[1], 6], [VW_ISL[0], 7], [VW_ISL[1], 2.6]];
  for (let i = 0; i < guards; i++) {
    const [isl, off] = slots[i];
    const kinds = n === 1 ? ['hut', 'toren'] : Object.keys(prefabs);
    prefabs[kinds[(i + n) % kinds.length]](isl.x0 + off, isl.top);
  }
  // vanaf level 2: één bewaker is de Koning van Hatert (kroon, sterker, veel punten)
  if (n >= 2) {
    const g = pick(st.bodies.filter((b) => b.role === 'guard'));
    if (g) { g.gold = true; g.hp = 3.5; g.pts = 1500; const kr = makeKroon(); kr.scale.setScalar(2.2); kr.position.y = 0.32; g.p.head.add(kr); }
  }
  // bouwers: één per eiland, ze lopen met planken naar het eind van de brug
  for (const side of [0, 1]) {
    const isl = VW_ISL[side], home = side ? isl.x0 + 4.5 : isl.x1 - 4.5;
    const b = vwAddBody('drerrie', null, home, isl.top + 0.925, { role: 'builder', side, home, task: 'pak', wait: rand(0.5, 2) });
    b.carry = false;
  }
  vwHud();
  miniMsg(`🎆 LEVEL ${n}<small>Blaas alle drerries op voordat de brug af is!</small>`, 2.4);
}
function vwTip(side) {
  const n = mini.s.planks[side].length;
  return side ? VW_ISL[1].x0 - n * VW_PLANK : VW_ISL[0].x1 + n * VW_PLANK;
}
function vwPlacePlank(side) {
  const st = mini.s, n = st.planks[side].length;
  if (n + st.planks[1 - side].length >= VW_PLANKS) return;
  const x = side ? VW_ISL[1].x0 - (n + 0.5) * VW_PLANK : VW_ISL[0].x1 + (n + 0.5) * VW_PLANK;
  const b = vwAddBody('block', 'plank', x, VW_ISL[0].top - 0.12, { anchor: true, side, idx: n });
  st.planks[side].push(b);
  tone(300, 0.08, 'square', 0.06); noise(0.06, 0.12, 0.04);
  vwHud();
  if (st.planks[0].length + st.planks[1].length >= VW_PLANKS) vwLose();
}
function vwHud() {
  const st = mini.s, left = st.bodies.filter((b) => b.kind === 'drerrie' && !b.dead).length;
  const pct = Math.round(((st.planks[0].length + st.planks[1].length) / VW_PLANKS) * 100);
  $('#miniInfo').innerHTML = `<span>Level ${st.level}</span><span>🧢 ${left}</span><span class="mini-bar" title="Brug"><b>Brug</b><em><i style="width:${pct}%"></i></em></span>`;
  const btns = Object.entries(VW_AMMO).map(([k, a]) => `<button class="mini-ammo ${st.sel === k ? 'sel' : ''} ${st.ammo[k] ? '' : 'leeg'}" data-ammo="${k}"><span>${a.icon}</span><b>${a.name}</b><small>×${st.ammo[k]}</small></button>`).join('');
  const el = $('#miniCtl');
  if (el.dataset.sig !== btns) { el.dataset.sig = btns; el.innerHTML = `<div class="mini-ammos">${btns}</div>`; }
}
$('#miniCtl').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ammo]');
  if (!b || mini.kind !== 'vuurwerk') return;
  const st = mini.s;
  if (!st.ammo[b.dataset.ammo]) { tone(180, 0.12, 'square', 0.05); return; }
  st.sel = b.dataset.ammo; tone(700, 0.05, 'square', 0.05);
  if (VW_AMMO[st.sel].tip) miniMsg(`${VW_AMMO[st.sel].icon} ${VW_AMMO[st.sel].tip}`, 1.4);
  vwHud();
});
function vwLaunchVel(p) {
  const s = Math.min(innerWidth, innerHeight) * 0.35;
  const dx = (p.x0 - p.x) / s, dy = (p.y - p.y0) / s;
  const len = Math.min(1, Math.hypot(dx, dy));
  if (len < 0.08) return null;
  const a = Math.atan2(dy, dx);
  return new THREE.Vector3(Math.cos(a) * len * 27, Math.sin(a) * len * 27, 0);
}
function vwFire(v) {
  const st = mini.s, type = st.sel;
  if (!st.ammo[type] || st.lostT || st.cleared) return;
  st.ammo[type]--;
  st.jensT = 0.5;
  const pos = new THREE.Vector3(VW_JENS.x + 0.4, VW_JENS.y + 1.5, 0);
  if (type === 'cake') {
    // de cakebox staat naast Jens en schiet tien keer
    const m = mesh(box(0.6, 0.45, 0.6), M('#c8202b'), VW_JENS.x + 1.1, VW_JENS.y + 0.22, 0.6);
    m.add(mesh(box(0.62, 0.08, 0.62), M('#ffd23f'), 0, 0.2, 0));
    st.world.add(m);
    st.cakes.push({ m, v: v.clone(), n: 10, t: 0.3 });
    miniSnd('cake', 0.9);
  } else {
    let m;
    if (type === 'nitraat') m = makeNitraat();
    else if (type === 'lawine') { m = new THREE.Group(); m.add(mesh(cylG(0.07, 0.07, 0.5, 6), M('#2e5aa8'))); m.add(mesh(coneG(0.09, 0.2, 6), M('#ffd23f'), 0, 0.35, 0)); }
    else m = mesh(sphG(0.26, 8, 6), M('#2a2a2a'));
    m.position.copy(pos); st.world.add(m);
    st.shells.push({ type, m, pos, v: v.clone(), t: 0, split: false });
    sfx.sis();
  }
  if (!st.ammo[type]) st.sel = Object.keys(st.ammo).find((k) => st.ammo[k]);
  vwHud();
}
function vwBoom(x, y, a, scale = 1) {
  const st = mini.s, r = a.r * scale, voor = st.bodies.filter((b) => b.kind === 'drerrie' && b.dead).length;
  st.light.position.set(x, y + 1, 3); st.light.intensity = 70 * scale;
  miniBurst(new THREE.Vector3(x, y, 0), Math.round(26 * scale) + 8, 9 * scale, miniSparkMats, 1.1, 4);
  miniBurst(new THREE.Vector3(x, y, 0), 8, 4, miniDustMats, 0.8);
  st.shake = Math.max(st.shake, 0.25 * scale);
  buzz(30);
  for (const b of st.bodies) {
    if (b.dead) continue;
    const cx = clamp(x, b.x - b.w / 2, b.x + b.w / 2), cy = clamp(y, b.y - b.h / 2, b.y + b.h / 2);
    const d = Math.hypot(cx - x, cy - y);
    if (d > r) continue;
    const k = 1 - d / r * 0.6;
    b.hp -= a.dmg * k * scale;
    if (!b.anchor) {
      const dir = new THREE.Vector2(b.x - x, b.y - y).normalize();
      b.vx += dir.x * a.push * k; b.vy += Math.max(2, dir.y * a.push * k + 3);
      if (b.task) b.task = 'val';
    }
    if (b.hp <= 0) vwKill(b, x, y);
  }
  // meerdere drerries in één klap: bonus en even slow-motion
  const n = st.bodies.filter((b) => b.kind === 'drerrie' && b.dead).length - voor;
  if (n >= 2) {
    const bonus = n * 300;
    mini.score += bonus;
    hype(`${n === 2 ? 'DUBBEL!' : n === 3 ? 'TRIPLE!' : 'MEGA-KNAL!'}<small>+${bonus}</small>`, n >= 3 ? 'mega' : '');
    st.slow = 0.9; fxFlash('#ffd23f', 0.25);
  }
}
function vwKill(b, fx, fy) {
  const st = mini.s;
  if (b.dead) return;
  b.dead = true;
  mini.score += b.pts;
  if (b.kind === 'drerrie') {
    b.fly = 0.01; b.vx = Math.sign(b.x - fx || 1) * rand(4, 8); b.vy = rand(7, 11);
    tone(520, 0.25, 'sawtooth', 0.08, 140);
    popWorld(`+${b.pts}`, _pv.set(b.x, b.y + 1.4, 0), mini.cam, b.gold ? 'big' : '');
    if (b.gold) { hype('👑 KONING WEG!<small>+1500</small>', 'mega'); fxFlash('#ffd23f', 0.35); }
    else miniMsg(pick(['🧢 Drerrie weggeblazen!', '💥 BOEM! Weg drerrie', '🧢 Petje kwijt!', '🧢 Daar vliegt ie!', '😂 Dag drerrie!']), 1);
  } else {
    st.world.remove(b.m);
    miniBurst(new THREE.Vector3(b.x, b.y, 0), 10, 5, b.type === 'beton' ? [M('#8a8f94'), M('#6a6f74')] : miniDustMats, 0.9);
    noise(0.12, 0.2);
    if (b.type === 'kist') setTimeout(() => {
      if (mini.kind !== 'vuurwerk' || mini.s !== st) return;
      miniSnd('nitraat', 0.9);
      popWorld('KETTINGREACTIE!', _pv.set(b.x, b.y + 1.5, 0), mini.cam, 'big');
      vwBoom(b.x, b.y, { r: 3.2, dmg: 3, push: 13 }, 1);
    }, 140);
  }
  if (b.anchor) {
    // alles verder op de brug valt mee in de Waal
    const row = st.planks[b.side], i = row.indexOf(b);
    for (const rest of row.splice(i)) { if (rest !== b) { rest.anchor = false; rest.vy = 1; } }
  }
  vwHud();
}
function vwLose() {
  const st = mini.s;
  if (st.lostT || st.cleared) return;
  st.lostT = 0.01;
  miniMsg('🌉 DE BRUG IS AF!<small>De drerries lopen zo naar de overkant…</small>', 2.4);
  setTimeout(() => miniEnd('De brug is af!', `De drerries hebben de twee eilanden verbonden. Je haalde level ${st.level}.`), 1800);
}
function vwSettle(dt) {
  const st = mini.s, live = st.bodies.filter((b) => !b.dead || b.fly);
  live.sort((a, b) => a.y - a.h / 2 - (b.y - b.h / 2));
  for (const b of live) {
    if (b.fly) {
      b.fly += dt; b.vy -= 20 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      b.m.position.set(b.x, b.kind === 'drerrie' ? b.y - b.h / 2 : b.y, 0); b.m.rotation.z += dt * 7 * Math.sign(b.vx);
      if (b.y < -0.3 && !b.splash) { b.splash = true; miniBurst(new THREE.Vector3(b.x, 0.1, 0), 12, 5, [M('#dfefff'), M('#9fc4d6')], 0.8, 12); noise(0.3, 0.2); }
      if (b.fly > 3) { st.world.remove(b.m); b.fly = 0; }
      continue;
    }
    if (b.anchor) continue;
    // bouwers lopen zelf (alleen als ze stevig staan)
    if (b.task && b.task !== 'val' && b.grounded) vwBuilder(b, dt);
    b.vy -= 22 * dt;
    let nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    let floor = -Infinity;
    const isl = vwIsland(nx); if (isl) floor = isl.top;
    for (const o of live) {
      if (o === b || o.fly) continue;
      const top = o.y + o.h / 2;
      if (top > b.y - b.h / 2 + 0.25) continue;
      if (Math.min(nx + b.w / 2, o.x + o.w / 2) - Math.max(nx - b.w / 2, o.x - o.w / 2) < Math.min(b.w, o.w) * 0.25) continue;
      floor = Math.max(floor, top);
    }
    b.grounded = ny - b.h / 2 <= floor;
    if (b.grounded) { ny = floor + b.h / 2; if (b.vy < -6) noise(0.05, 0.08); b.vy = 0; b.vx *= Math.max(0, 1 - 8 * dt); if (b.task === 'val' && Math.abs(b.vx) < 0.3) b.task = 'pak'; }
    b.x = nx; b.y = ny;
    b.m.position.set(b.x, b.kind === 'drerrie' ? b.y - b.h / 2 : b.y, 0);
    b.m.rotation.z = damp(b.m.rotation.z, b.grounded ? 0 : clamp(b.vx * 0.15, -0.6, 0.6), 6, dt);
    if (b.y < -1) {
      // in de Waal
      if (!b.splash) { b.splash = true; miniBurst(new THREE.Vector3(b.x, 0.1, 0), 14, 5, [M('#dfefff'), M('#9fc4d6')], 0.8, 12); noise(0.3, 0.25); }
      if (!b.dead) { vwKill(b, b.x, 0); if (b.kind === 'drerrie') { b.fly = 0; st.world.remove(b.m); } }
    }
    if (b.kind === 'drerrie' && !b.dead) pose(b.p, b.task === 'loop' || b.task === 'terug' ? 'run' : b.grounded ? 'idle' : 'grabbed', dt);
  }
}
function vwBuilder(b, dt) {
  const st = mini.s, lvlK = 1 + (st.level - 1) * 0.15, rush = 1;
  const sp = 2.3 * lvlK, dir = b.side ? -1 : 1;
  if (b.task === 'pak') { b.wait -= dt * rush; b.p.plank.visible = false; b.p.root.rotation.y = Math.PI / 2; if (b.wait <= 0) { b.task = 'loop'; b.p.plank.visible = true; } return; }
  if (b.task === 'loop') {
    const target = vwTip(b.side) - dir * 0.5;
    b.p.root.rotation.y = -dir * Math.PI / 2;
    b.x += Math.sign(target - b.x) * Math.min(Math.abs(target - b.x), sp * dt);
    if (Math.abs(target - b.x) < 0.05) { b.task = 'leg'; b.wait = 1.1 / lvlK; }
    return;
  }
  if (b.task === 'leg') { b.wait -= dt * rush; if (b.wait <= 0) { vwPlacePlank(b.side); b.p.plank.visible = false; b.task = 'terug'; } return; }
  if (b.task === 'terug') {
    b.p.root.rotation.y = dir * Math.PI / 2;
    b.x += Math.sign(b.home - b.x) * Math.min(Math.abs(b.home - b.x), sp * dt);
    if (Math.abs(b.home - b.x) < 0.05) { b.task = 'pak'; b.wait = 0.8 / lvlK; }
  }
}
function vwHits(pos) {
  if (pos.y <= 0) return 'water';
  if (pos.x < VW_DIJK.x1 && pos.y < VW_DIJK.top) return 'grond';
  const isl = vwIsland(pos.x); if (isl && pos.y < isl.top) return 'grond';
  for (const b of mini.s.bodies) if (!b.dead && Math.abs(pos.x - b.x) < b.w / 2 + 0.12 && Math.abs(pos.y - b.y) < b.h / 2 + 0.12) return 'raak';
  return null;
}
MINI.vuurwerk = {
  start() {
    const sc = mini.scene = miniWorld('#0d1233', 60, 140, true);
    sc.add(new THREE.AmbientLight('#8090c0', 1.4)); // maanlicht: drerries moeten wel te zien zijn
    const light = new THREE.PointLight('#ffb050', 0, 28, 1.6); sc.add(light);
    const world = new THREE.Group(); sc.add(world);
    // Waal, dijk, eilandjes en de skyline van Nijmegen in de verte
    const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 90), new THREE.MeshLambertMaterial({ color: '#1d3346' }));
    water.rotation.x = -Math.PI / 2; water.position.set(10, -0.05, -20); world.add(water);
    world.add(mesh(box(40, 6, 14), M('#3d6a2e'), VW_DIJK.x1 - 20, VW_DIJK.top - 3, -2));
    world.add(mesh(box(40, 0.3, 14.1), M('#4f8a3a'), VW_DIJK.x1 - 20, VW_DIJK.top - 0.1, -2));
    for (const i of VW_ISL) {
      world.add(mesh(box(i.x1 - i.x0, i.top + 3, 6), M('#6b5a3a'), (i.x0 + i.x1) / 2, (i.top - 3) / 2, -1));
      world.add(mesh(box(i.x1 - i.x0 + 0.1, 0.25, 6.1), M('#4f8a3a'), (i.x0 + i.x1) / 2, i.top - 0.1, -1));
      const tr = makeTree(); miniLoose(tr); tr.position.set((i.x0 + i.x1) / 2 + (i === VW_ISL[0] ? -4 : 4), i.top, -2.6); world.add(tr);
      world.add(mesh(box(1.2, 1.1, 1), M('#7a5232'), i === VW_ISL[0] ? i.x1 - 4.5 : i.x0 + 4.5, i.top + 0.55, -1.4)); // stapel planken
    }
    const sky = new THREE.Group();
    for (let i = 0; i < 26; i++) { const h = rand(4, 14); sky.add(mesh(box(rand(3, 7), h, 3), M('#141a30'), -50 + i * 5.2, h / 2 - 1, -60)); }
    sky.add(mesh(box(3, 26, 3), M('#141a30'), 14, 12, -62)); sky.add(mesh(coneG(2.4, 8, 4), M('#141a30'), 14, 29, -62)); // Stevenskerk
    for (let i = 0; i < 40; i++) { const w = mesh(box(0.5, 0.6, 0.1), new THREE.MeshBasicMaterial({ color: Math.random() < 0.7 ? '#ffd27a' : '#8ab4ff' }), rand(-50, 85), rand(1, 11), -58.4); sky.add(w); }
    const maan = mesh(sphG(3, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false }), 52, 30, -70); sky.add(maan);
    const sterren = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 160; i++) sp.push(rand(-90, 110), rand(14, 60), -75);
    sterren.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sky.add(new THREE.Points(sterren, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, fog: false })));
    world.add(sky);
    const jp = cutJens(); miniLoose(jp.root);
    jp.root.position.set(VW_JENS.x, VW_JENS.y, 0); jp.root.rotation.y = -Math.PI / 2; world.add(jp.root);
    const dots = [];
    for (let i = 0; i < 16; i++) { const d = mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffd23f' : '#ffffff', fog: false })); d.visible = false; d.scale.setScalar(1.6 - i * 0.05); world.add(d); dots.push(d); }
    mini.s = { light, slow: 0, world, jens: jp, dots, bodies: [], planks: [[], []], shells: [], cakes: [], level: 1, ammo: {}, sel: 'nitraat', aim: null, shake: 0, camX: 6, jensT: 0, kbA: 0.7, kbP: 0.75 };
    vwLevel(1);
    this.update(0);
  },
  down(p) {
    const st = mini.s;
    const lw = st.shells.find((s) => s.type === 'lawine' && !s.split);
    if (lw) { this.split(lw); p.used = true; return; }
    st.aim = p;
  },
  up(p) {
    const st = mini.s;
    if (p.used) return;
    st.aim = null;
    const v = vwLaunchVel(p);
    if (v) vwFire(v);
  },
  key(k) {
    const st = mini.s;
    const lw = st.shells.find((s) => s.type === 'lawine' && !s.split);
    if (k === ' ' || k === 'Enter') { if (lw) this.split(lw); else vwFire(new THREE.Vector3(Math.cos(st.kbA) * st.kbP * 27, Math.sin(st.kbA) * st.kbP * 27, 0)); }
    const ks = Object.keys(VW_AMMO), n = +k;
    if (n >= 1 && n <= ks.length && st.ammo[ks[n - 1]]) { st.sel = ks[n - 1]; vwHud(); }
  },
  split(s) {
    s.split = true;
    for (const da of [-0.28, 0.28]) {
      const v = s.v.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), da);
      const m = s.m.clone(); mini.s.world.add(m);
      mini.s.shells.push({ type: 'lawine', m, pos: s.pos.clone(), v, t: s.t, split: true, child: true });
    }
    tone(1400, 0.2, 'square', 0.05, 2400);
    miniBurst(s.pos, 8, 4, miniSparkMats, 0.5, 2);
  },
  update(dt) {
    const st = mini.s, rdt = dt;
    // elke 30 seconden (echte tijd) een nitraat erbij
    if (!st.cleared && !st.lostT && !mini.over) {
      st.nitroT = (st.nitroT || 0) + rdt;
      if (st.nitroT >= 30) { st.nitroT -= 30; st.ammo.nitraat++; if (!st.ammo[st.sel]) st.sel = 'nitraat'; sfx.beker(); miniMsg('🧨 +1 NITRAAT', 1.2); vwHud(); }
    }
    // alles op en niks meer in de lucht: doorspoelen tot de brug af is (of er weer een nitraat is)
    const leeg = !st.cleared && !st.lostT && Object.values(st.ammo).every((a) => !a) && !st.shells.length && !st.cakes.length;
    if (leeg !== !!st.ff) { st.ff = leeg; $('#mini').classList.toggle('ff', leeg); if (leeg) miniMsg('⏩ OP! DOORSPOELEN…<small>Over een paar seconden krijg je weer een nitraat</small>', 2); }
    dt *= leeg ? 6 : 1.55; // het spel loopt sowieso een stuk sneller
    if (st.slow > 0) { st.slow -= rdt; dt *= 0.35; }
    st.light.intensity = Math.max(0, st.light.intensity - rdt * 160);
    // toetsenbord: hoek en kracht
    if (mini.keys.ArrowUp) st.kbA = Math.min(1.45, st.kbA + dt * 0.9);
    if (mini.keys.ArrowDown) st.kbA = Math.max(-0.3, st.kbA - dt * 0.9);
    if (mini.keys.ArrowRight) st.kbP = Math.min(1, st.kbP + dt * 0.6);
    if (mini.keys.ArrowLeft) st.kbP = Math.max(0.15, st.kbP - dt * 0.6);
    // richtlijn
    const kbAim = !st.aim && !mini.ptr && (mini.keys.ArrowUp || mini.keys.ArrowDown || mini.keys.ArrowLeft || mini.keys.ArrowRight || st.kbShow > 0);
    if (mini.keys.ArrowUp || mini.keys.ArrowDown || mini.keys.ArrowLeft || mini.keys.ArrowRight) st.kbShow = 1.5; else st.kbShow = Math.max(0, (st.kbShow || 0) - dt);
    const v = st.aim ? vwLaunchVel(st.aim) : kbAim ? new THREE.Vector3(Math.cos(st.kbA) * st.kbP * 27, Math.sin(st.kbA) * st.kbP * 27, 0) : null;
    const g = VW_AMMO[st.sel]?.g || 14;
    st.dots.forEach((d, i) => {
      if (!v || !st.ammo[st.sel]) { d.visible = false; return; }
      const t = (i + 1) * 0.09;
      d.position.set(VW_JENS.x + 0.4 + v.x * t, VW_JENS.y + 1.5 + v.y * t - 0.5 * g * t * t, 0.3);
      d.visible = d.position.y > -0.5;
    });
    // Jens
    st.jensT = Math.max(0, st.jensT - dt);
    pose(st.jens, v || st.jensT > 0 ? 'reach' : 'idle', dt);
    if (v) st.jens.root.rotation.y = -Math.PI / 2 + 0.0001;
    // vuurwerk in de lucht
    for (let i = st.shells.length - 1; i >= 0; i--) {
      const s = st.shells[i], a = VW_AMMO[s.type];
      s.t += dt; s.v.y -= a.g * dt; s.pos.addScaledVector(s.v, dt);
      s.m.position.copy(s.pos);
      s.m.rotation.z = Math.atan2(s.v.y, s.v.x) - Math.PI / 2;
      if (Math.random() < 0.7) miniBurst(s.pos, 1, 0.6, s.type === 'lawine' ? miniSparkMats[1] : miniSparkMats[6], 0.35, 0);
      const hit = vwHits(s.pos);
      if (hit || s.pos.x > 70 || s.t > 6) {
        st.world.remove(s.m); st.shells.splice(i, 1);
        if (hit === 'water') { miniBurst(s.pos, 10, 4, [M('#dfefff'), M('#9fc4d6')], 0.7, 10); noise(0.25, 0.2); continue; }
        if (!hit) continue;
        if (!(s.type === 'lawine' && s.child && st.lawineSnd > mini.t - 1)) { miniSnd(a.snd, s.type === 'lawine' ? 0.8 : 1); if (s.type === 'lawine') st.lawineSnd = mini.t; }
        vwBoom(s.pos.x, s.pos.y, a, s.type === 'mortier' ? 1.15 : 1);
      }
    }
    for (let i = st.cakes.length - 1; i >= 0; i--) {
      const c = st.cakes[i];
      c.t -= dt;
      if (c.t > 0) continue;
      c.n--; c.t = 0.2;
      const m = mesh(sphG(0.12, 6, 4), pick(miniSparkMats));
      const pos = new THREE.Vector3(VW_JENS.x + 1.1, VW_JENS.y + 0.6, 0);
      m.position.copy(pos); st.world.add(m);
      st.shells.push({ type: 'cake', m, pos, v: c.v.clone().multiplyScalar(rand(0.9, 1.08)).applyAxisAngle(new THREE.Vector3(0, 0, 1), rand(-0.06, 0.06)), t: 0, split: true });
      if (c.n <= 0) { setTimeout(() => st.world.remove(c.m), 1500); st.cakes.splice(i, 1); }
    }
    vwSettle(dt);
    // level gehaald?
    if (!st.cleared && !st.lostT && st.bodies.every((b) => b.kind !== 'drerrie' || b.dead)) {
      st.cleared = true;
      const left = Object.values(st.ammo).reduce((a, b) => a + b, 0), bonus = st.level * 1000 + left * 150;
      mini.score += bonus;
      sfx.power();
      miniMsg(`✅ LEVEL ${st.level} GEHAALD!<small>+${bonus.toLocaleString('nl-NL')} bonus</small>`, 2.2);
      setTimeout(() => { if (mini.kind === 'vuurwerk' && !mini.over) vwLevel(st.level + 1); }, 1600);
    }
    // camera: alles in beeld; op een smal scherm volgt hij het vuurwerk
    const cam = mini.cam, asp = cam.aspect, fovT = Math.tan(THREE.MathUtils.degToRad(25));
    cam.fov = 50;
    const span = asp < 1 ? 30 : 56;
    const fly = st.shells[0]?.pos;
    const wantX = asp < 1 ? (fly ? clamp(fly.x, -10, 24) : st.aim || v ? -8 : -5) : 6;
    st.camX = damp(st.camX, wantX, 3, rdt || 1);
    const dist = Math.max((span / 2) / (fovT * asp), 8 / fovT);
    st.shake = Math.max(0, st.shake - dt);
    const sh = st.shake * 0.6;
    cam.position.set(st.camX + rand(-sh, sh), 5 + rand(-sh, sh), dist);
    cam.lookAt(st.camX, 3.6, 0);
    cam.updateProjectionMatrix();
  },
};

// =====================================================================
//  MIJN OSSO: iedereen die achter Jens aan zat komt tegelijk z'n osso
//  binnenvallen. Jens verdedigt met een AK-47, romeinse kaarsen en nitraat.
// =====================================================================
const OS_DOOR = new THREE.Vector3(0, 0, -13.4);
const OS_TYPES = {
  shane: { hp: 3, sp: 2.4, pts: 150, line: 'Jens! Je telefoon!' },
  docent: { hp: 3, sp: 2.2, pts: 150, line: 'Naar de conrector!' },
  leiding: { hp: 4, sp: 2.0, pts: 200, line: 'Je dienst is nog niet klaar!' },
  fietser: { hp: 3, sp: 4.6, pts: 200, bike: true, line: 'JENS, WACHT NOU!' },
  boa: { hp: 6, sp: 1.9, pts: 300, line: 'HANDHAVING!' },
  drerrie: { hp: 5, sp: 5.0, pts: 300, bike: true, line: 'Wat kijk je nou?' },
  hooligan: { hp: 5, sp: 2.9, pts: 300, chase: true, line: 'VITESSE!' },
  koning: { hp: 70, sp: 1.7, pts: 3000, bike: true, boss: true, line: 'IK BEN DE KONING VAN HATERT!' },
};
function osModel(type) {
  let p, root;
  if (type === 'shane') {
    p = makePerson({ key: 'shane', skin: '#f0cbb2', hair: '#7a4a2c', hairStyle: 'knot', shirt: { base: '#151515', paint(x, side) {
      if (side === 'front') { x.fillStyle = '#c9cfd8'; x.fillRect(58, 0, 2, 50); x.fillRect(68, 0, 2, 50); text(x, 'WINTERSUN', '#7f9fe0', 16, 92); } else { x.fillStyle = '#222'; x.fillRect(30, 0, 68, 26); }
    } }, pants: '#2a2f3a', shoes: '#1a1a1a', face: { skin: '#f0cbb2', brow: '#6a4428', stubble: '#7a4a2c' } });
    longSleeves(p, fabricMat('#151515'));
  } else if (type === 'docent') {
    p = makePerson({ key: 'docent', skin: '#e6c2a4', hair: '#4a3a2c', hairStyle: 'kort', shirt: { base: '#2f3a4e', paint(x, side) { if (side === 'front') { x.fillStyle = '#e4e4e4'; x.fillRect(52, 0, 24, 60); } } },
      pants: '#3b3f4a', shoes: '#2a2a2a', face: { skin: '#e6c2a4', angry: true, brow: '#4a3a2c' }, scale: [1.02, 1.02, 1.02] });
  } else if (type === 'leiding') p = makeLeidinggevende();
  else if (type === 'fietser') {
    p = makePerson({ key: 'fietser', skin: '#eccab0', hair: '#1a1410', hairStyle: 'lossekrul', shirt: { base: '#c62f2f', paint() {} }, pants: '#2b3140', shoes: '#d8d8d8', face: { skin: '#eccab0', brow: '#141010' }, scale: [0.92, 0.97, 0.92] });
    p.root.add(makeBike('#2667c9'));
  } else if (type === 'boa') {
    p = makePerson({ key: 'boa', skin: '#e8c3a6', hair: '#3a2a1e', hairStyle: 'boapet', shirt: { base: '#1c2433', paint(x, side) { if (side === 'back') text(x, 'HANDHAVING', '#ffd23f', 18, 40); else { x.fillStyle = '#ffd23f'; x.fillRect(80, 30, 18, 12); } } },
      pants: '#141a26', shoes: '#111', face: { skin: '#e8c3a6', angry: true, brow: '#3a2a1e', stubble: '#3a2a1e' }, scale: [1.08, 1.05, 1.08] });
  } else if (type === 'hooligan') p = makeHooligan();
  else {
    root = makeDrerrie(type === 'koning');
    p = root.userData.person;
  }
  root ||= p.root;
  miniLoose(root);
  return { root, p, base: root.scale.x };
}
function osAk() {
  const g = new THREE.Group(), zwart = M('#1a1a1a'), hout = M('#7a4a22');
  g.add(mesh(box(0.07, 0.09, 0.62), zwart, 0, 0, -0.12));
  g.add(mesh(box(0.06, 0.07, 0.24), hout, 0, -0.02, 0.28)); // kolf
  g.add(mesh(box(0.05, 0.05, 0.22), hout, 0, -0.03, -0.25)); // handbeschermer
  const mag = mesh(box(0.05, 0.18, 0.08), zwart, 0, -0.12, -0.05); mag.rotation.x = 0.35; g.add(mag);
  g.add(mesh(box(0.025, 0.025, 0.25), zwart, 0, 0.01, -0.54)); // loop
  const flash = mesh(box(0.16, 0.16, 0.2), new THREE.MeshBasicMaterial({ color: '#ffd23f', fog: false }), 0, 0.01, -0.74);
  flash.visible = false; g.add(flash);
  g.userData.flash = flash;
  return g;
}
let osGrasTex = null, osStraatTex = null;
MINI.osso = {
  start() {
    const sc = mini.scene = miniWorld('#9fcfee', 40, 90);
    const world = new THREE.Group(); sc.add(world);
    osGrasTex ||= markShared(canvasTex(64, 64, (x) => { x.fillStyle = '#4f8a3a'; x.fillRect(0, 0, 64, 64); grain(x, 64, 64, 30); for (let i = 0; i < 60; i++) { x.fillStyle = Math.random() < 0.5 ? '#5f9a44' : '#3f7a2e'; x.fillRect(rand(0, 63), rand(0, 63), 1, 3); } }));
    osGrasTex.wrapS = osGrasTex.wrapT = THREE.RepeatWrapping; osGrasTex.repeat.set(12, 12);
    osStraatTex ||= markShared(canvasTex(64, 64, (x) => { x.fillStyle = '#4a4a4e'; x.fillRect(0, 0, 64, 64); grain(x, 64, 64, 22); x.fillStyle = '#e8e8e8'; x.fillRect(0, 30, 24, 3); }));
    osStraatTex.wrapS = osStraatTex.wrapT = THREE.RepeatWrapping; osStraatTex.repeat.set(8, 1);
    const gras = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 30, 30), new THREE.MeshLambertMaterial({ map: osGrasTex }));
    gras.rotation.x = -Math.PI / 2; world.add(gras);
    const straat = new THREE.Mesh(new THREE.PlaneGeometry(90, 8, 30, 2), new THREE.MeshLambertMaterial({ map: osStraatTex }));
    straat.rotation.x = -Math.PI / 2; straat.position.set(0, 0.02, 18); world.add(straat);
    world.add(mesh(box(90, 0.12, 1.4), M('#a8a29a'), 0, 0.06, 13.5)); // stoep
    // tegelpad naar de voordeur
    for (let z = -12.5; z < 13; z += 1.1) world.add(mesh(box(1.6, 0.05, 1), M(z % 2.2 < 1.1 ? '#b8a890' : '#a89880'), 0, 0.03, z));
    // de osso
    const huis = new THREE.Group();
    huis.add(mesh(box(16, 6.5, 7), M('#8a4a32'), 0, 3.25, -17.5));
    for (let i = 0; i < 16; i++) huis.add(mesh(box(16.05, 0.06, 7.05), M('#6f3a26'), 0, 0.4 + i * 0.4, -17.5));
    for (const k of [-1, 1]) { const dak = mesh(box(17, 0.3, 4.5), M('#3a2a26'), 0, 7.75, -17.5 - k * 1.75); dak.rotation.x = k * 0.62; huis.add(dak); }
    huis.add(mesh(box(0.2, 2.5, 7), M('#8a4a32'), -8, 7.6, -17.5)); huis.add(mesh(box(0.2, 2.5, 7), M('#8a4a32'), 8, 7.6, -17.5));
    huis.add(mesh(box(1.5, 2.4, 0.2), M('#5a2a12'), 0, 1.2, -13.95));
    for (const x of [-5, 5]) { huis.add(mesh(box(2.2, 1.6, 0.15), M('#bfe0ff', { emissive: '#203040' }), x, 2.2, -13.95)); huis.add(mesh(box(2.4, 0.15, 0.3), M('#e8e0d0'), x, 1.35, -13.9)); }
    for (const x of [-5, 0, 5]) huis.add(mesh(box(1.8, 1.3, 0.15), M('#bfe0ff', { emissive: '#203040' }), x, 4.9, -13.95));
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (x) => { x.fillStyle = '#c8202b'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#fff'; x.font = 'bold 40px Impact, Arial'; x.textAlign = 'center'; x.fillText("JENS Z'N OSSO", 128, 48); }) }));
    bord.position.set(0, 3.0, -13.84); huis.add(bord);
    const vlag = mesh(box(0.08, 3, 0.08), M('#ddd'), 6.5, 8, -14.5); huis.add(vlag);
    ['#c8202b', '#1f7a3a', '#141414'].forEach((c, i) => huis.add(mesh(box(1.4, 0.3, 0.04), M(c), 7.25, 9.2 - i * 0.3, -14.5)));
    world.add(huis);
    // heg met gaten, lantaarnpalen, bomen
    for (const [x0, x1] of [[-16, -3], [3, 16]]) world.add(mesh(box(x1 - x0, 0.9, 0.8), M('#2f6a2a'), (x0 + x1) / 2, 0.45, 11.8));
    for (const x of [-17, 17]) { const t = makeTree(); miniLoose(t); t.position.set(x, 0, -6); world.add(t); }
    for (const x of [-12, 12]) { const l = makeLamp(x < 0 ? -1 : 1); miniLoose(l); l.position.set(x, 0, 13); world.add(l); }
    // Jens met z'n AK
    const jp = cutJens(); miniLoose(jp.root);
    const ak = osAk(); ak.position.set(0.12, 1.28, -0.32); jp.body.add(ak);
    jp.root.position.set(0, 0, -9); world.add(jp.root);
    const tracer = mesh(box(0.04, 0.04, 1), new THREE.MeshBasicMaterial({ color: '#fff3a0', fog: false })); tracer.visible = false; world.add(tracer);
    // first person: een eigen AK vast aan de camera
    const fpAk = osAk(); fpAk.position.set(0.22, -0.24, -0.48); fpAk.rotation.y = 0.05; fpAk.userData.flash.scale.setScalar(0.35); fpAk.userData.flash.position.z = -0.8;
    mini.cam.add(fpAk); sc.add(mini.cam);
    mini.s = { drops: [], kist: [], streakN: 0, streakT: 0, rapid: 0, boem: 0, world, jens: jp, ak, fpAk, tracer, view: save.ossoView || 'third', yaw: Math.PI, pitch: -0.06, look: null, x: 0, z: -9, hp: 100, huis: 100, wave: 0, toSpawn: 0, spawnT: 0, pauseT: 2.5, foes: [], balls: [], nades: [], pool: {},
      mag: 30, reload: 0, fireT: 0, kaars: 3, nitraat: 2, kaarsQ: 0, kaarsT: 0, aim: new THREE.Vector3(0, 0, 0), aimDir: new THREE.Vector3(0, 0, 1), joy: null, kills: 0, hitT: 0, doorT: 0 };
    const touch = matchMedia('(pointer: coarse)').matches;
    miniButtons(`<button class="mini-btn view" data-hold="g">👁️<small>G</small></button><button class="mini-btn fire" data-hold="vuur">🔫<small>VUUR</small></button><button class="mini-btn kaars" data-hold="q">🕯️<small>KAARS</small></button><button class="mini-btn nade" data-hold="e">🧨<small>NITRAAT</small></button>`);
    $('#miniCtl').classList.add(touch ? 'touch' : 'desk');
    this.hud();
    miniMsg(touch ? '🏠 MIJN OSSO<small>Links slepen = lopen · rechts slepen = kijken · VUUR = schieten · 👁️ = first/third person</small>' : '🏠 MIJN OSSO<small>Klik om te richten met de muis · WASD lopen · klik schieten · Q kaars · E nitraat · R herladen · G first/third person</small>', 3.4);
    this.update(0);
  },
  hud() {
    const st = mini.s;
    $('#miniInfo').innerHTML = `<span>Golf ${Math.max(1, st.wave)}</span><span class="mini-bar huis" title="Osso"><b>🏠</b><em><i style="width:${Math.max(0, st.huis)}%"></i></em></span><span class="mini-bar jens" title="Jens"><b>❤️</b><em><i style="width:${Math.max(0, st.hp)}%"></i></em></span><span>🔫 ${st.rapid > 0 ? '∞' : st.reload > 0 ? '…' : st.mag} · 🕯️${st.kaars} · 🧨${st.nitraat}</span>${st.rapid > 0 ? `<span class="mini-pwr">⚡${Math.ceil(st.rapid)}</span>` : ''}${st.boem > 0 ? `<span class="mini-pwr">💥${Math.ceil(st.boem)}</span>` : ''}${st.streakN > 1 && st.streakT > 0 ? `<span class="mini-pwr">×${Math.min(6, st.streakN)}</span>` : ''}`;
  },
  key(k) {
    const st = mini.s;
    if (k === 'q') this.kaars();
    else if (k === 'e') this.nade();
    else if (k === 'r' && st.mag < 30 && !st.reload) { st.reload = 1.5; tone(300, 0.08, 'square', 0.05); }
    else if (k === 'g') { st.view = st.view === 'first' ? 'third' : 'first'; save.ossoView = st.view; persist(); miniMsg(st.view === 'first' ? '👁️ FIRST PERSON' : '👁️ THIRD PERSON', 0.9); }
  },
  down(p) {
    const st = mini.s;
    if (p.type !== 'mouse') { if (p.x < innerWidth * 0.45) st.joy = p; else { st.look = p; p.lx = p.x; p.ly = p.y; } return; }
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    if (p.btn === 2) { this.kaars(); return; }
    p.fire = true;
  },
  move(p) {
    const st = mini.s;
    if (st.look !== p) return;
    st.yaw -= (p.x - p.lx) * 0.006; st.pitch = clamp(st.pitch - (p.y - p.ly) * 0.0045, -0.9, 0.6);
    p.lx = p.x; p.ly = p.y;
  },
  up(p) { const st = mini.s; if (st.joy === p) st.joy = null; if (st.look === p) st.look = null; },
  wave() {
    const st = mini.s;
    st.wave++;
    st.toSpawn = Math.min(44, 5 + st.wave * 3);
    this.kisten();
    st.spawnT = 0.5;
    if (st.wave > 1) { st.kaars++; st.nitraat++; st.huis = Math.min(100, st.huis + 10); st.hp = Math.min(100, st.hp + 25); }
    if (st.wave % 5 === 0) { st.boss = true; miniMsg(`👑 GOLF ${st.wave}<small>De Koning van Hatert komt zelf!</small>`, 2.6); }
    else miniMsg(`🚨 GOLF ${st.wave}<small>${['Ze komen eraan!', 'Hou de deur dicht!', 'Iedereen wil je osso in!', 'Nog meer indringers!'][st.wave % 4]}</small>`, 2);
    tone(440, 0.2, 'square', 0.08); tone(330, 0.3, 'square', 0.08, null, 0.22);
  },
  spawn() {
    const st = mini.s, w = st.wave;
    const pool = ['shane', 'docent'];
    if (w >= 2) pool.push('leiding', 'fietser');
    if (w >= 3) pool.push('boa', 'drerrie');
    if (w >= 4) pool.push('hooligan', 'hooligan');
    let type = pick(pool);
    if (st.boss) { type = 'koning'; st.boss = false; }
    const d = OS_TYPES[type];
    const reuse = (st.pool[type] ||= []).pop();
    const m = reuse || osModel(type);
    const side = Math.random();
    const x = side < 0.6 ? rand(-20, 20) : (side < 0.8 ? -24 : 24), z = side < 0.6 ? 24 : rand(0, 14);
    m.root.position.set(x, 0, z); m.root.rotation.set(0, 0, 0); m.root.visible = true;
    st.world.add(m.root);
    const f = { type, d, ...m, x, z, hp: d.hp * (1 + (w - 1) * 0.08), max: d.hp, dead: 0, vx: 0, vz: 0, flash: 0, atk: 0 };
    st.foes.push(f);
    if (Math.random() < 0.35 || d.boss) miniMsg(`${d.boss ? '👑' : '🗯️'} ${d.line}`, 1.2);
  },
  hurt(f, dmg, from) {
    const st = mini.s;
    if (f.dead) return;
    f.hp -= dmg; f.flash = 0.08;
    const dx = f.x - from.x, dz = f.z - from.z, l = Math.hypot(dx, dz) || 1;
    f.vx += (dx / l) * (f.d.boss ? 0.3 : 1.8) * dmg; f.vz += (dz / l) * (f.d.boss ? 0.3 : 1.8) * dmg;
    if (f.hp > 0) return;
    f.dead = 0.01; f.vy = rand(7, 11); f.vx = (dx / l) * rand(7, 11); f.vz = (dz / l) * rand(7, 11); f.spin = rand(-12, 12);
    st.kills++;
    // killstreak: binnen 2,5 s weer raak = hogere vermenigvuldiger
    st.streakN = st.streakT > 0 ? st.streakN + 1 : 1; st.streakT = 2.5;
    const mult = Math.min(6, st.streakN), pts = (f.d.pts + st.wave * 10) * mult;
    mini.score += pts;
    popWorld(`+${pts}${mult > 1 ? ' ×' + mult : ''}`, _pv.set(f.x, 2.2, f.z), mini.cam, mult > 2 ? 'big' : '');
    const naam = { 2: 'DUBBEL!', 3: 'TRIPLE!', 5: 'MULTI-KILL!', 8: 'RAMPAGE!', 12: 'ONSTOPBAAR!', 18: 'GODLIKE JENS!' }[st.streakN];
    if (naam) { hype(naam, st.streakN >= 8 ? 'mega' : ''); buzz(TRIL.streak); if (st.streakN >= 5) fxFlash('#ff8a3d', 0.2); }
    miniBurst(new THREE.Vector3(f.x, 1.2, f.z), 18, 7, miniSparkMats, 0.8);
    if (Math.random() < (f.d.boss ? 1 : 0.2)) this.drop(f.x, f.z, f.d.boss ? 'hp' : null);
    tone(f.d.boss ? 160 : 420, 0.3, 'sawtooth', 0.08, 90);
    if (f.d.boss) { miniMsg('👑 DE KONING IS VERSLAGEN! +3000', 2); miniSnd('groot', 0.8); }
  },
  drop(x, z, type) {
    const st = mini.s;
    type ||= pick(['hp', 'hp', 'rapid', 'boem', 'kaars', 'nitraat']);
    const kl = { hp: '#ff4d6a', rapid: '#ffd23f', boem: '#ff8a00', kaars: '#b18cff', nitraat: '#c8202b' }[type];
    const m = new THREE.Group();
    m.add(mesh(box(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: kl, fog: false })));
    m.add(mesh(box(0.62, 0.12, 0.62), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false })));
    m.position.set(x, 0.8, z); st.world.add(m);
    st.drops.push({ m, x, z, type, t: 0 });
  },
  pak(d) {
    const st = mini.s;
    const txt = { hp: '❤️ +40 LEVEN', rapid: '⚡ SNELVUUR!', boem: '💥 EXPLOSIEVE KOGELS!', kaars: '🕯️ +2 KAARSEN', nitraat: '🧨 +2 NITRAAT' }[d.type];
    if (d.type === 'hp') { st.hp = Math.min(100, st.hp + 40); st.huis = Math.min(100, st.huis + 8); }
    if (d.type === 'rapid') st.rapid = 8;
    if (d.type === 'boem') st.boem = 8;
    if (d.type === 'kaars') st.kaars += 2;
    if (d.type === 'nitraat') st.nitraat += 2;
    sfx.power(); fxFlash('#ffffff', 0.18);
    if (d.type === 'rapid' || d.type === 'boem') hype(txt); else popWorld(txt, _pv.set(d.x, 2, d.z), mini.cam, 'good');
    this.hud();
  },
  // rode vuurwerkkisten in de tuin: schiet ze kapot voor een flinke knal
  kisten() {
    const st = mini.s;
    for (const k of st.kist) st.world.remove(k.m);
    st.kist = [[-9, 3], [9, 3], [-5, 9], [6, 8.5]].map(([x, z]) => {
      const m = new THREE.Group();
      m.add(mesh(box(0.9, 0.8, 0.9), M('#c8202b'), 0, 0.4, 0));
      m.add(mesh(box(0.92, 0.18, 0.92), M('#ffd23f'), 0, 0.62, 0));
      m.add(mesh(box(0.06, 0.4, 0.06), M('#2a2a2a'), 0.2, 1.0, 0.2));
      m.position.set(x + rand(-1, 1), 0, z + rand(-1, 1)); st.world.add(m);
      return { m, x: m.position.x, z: m.position.z, hp: 3 };
    });
  },
  kistBoem(k) {
    const st = mini.s;
    k.hp = 0; st.world.remove(k.m);
    miniSnd('nitraat', 1);
    this.boom(k.x, k.z, 4, 9);
    miniBurst(new THREE.Vector3(k.x, 1.5, k.z), 40, 12, miniSparkMats, 1.4, 4);
    fxFlash('#ffb050', 0.35); st.shake = 0.6;
    popWorld('💥 KABOEM!', _pv.set(k.x, 2.5, k.z), mini.cam, 'big');
  },
  shoot() {
    const st = mini.s, dir = st.aimDir;
    if (st.rapid <= 0) st.mag--;
    st.fireT = st.rapid > 0 ? 0.05 : 0.085;
    miniSnd('schot', 0.42, rand(0.94, 1.1)) || tone(160, 0.06, 'square', 0.12, 60);
    (st.view === 'first' ? st.fpAk : st.ak).userData.flash.visible = true; st.flashT = 0.04;
    // de kogel gaat van de camera door het vizier (in third person staat die achter Jens' schouder)
    const cam = mini.cam.position, sx = cam.x, sz = cam.z;
    const spread = rand(-0.03, 0.03), dx = dir.x * Math.cos(spread) - dir.z * Math.sin(spread), dz = dir.x * Math.sin(spread) + dir.z * Math.cos(spread);
    const tol = mini.ptr?.type === 'touch' || mini.keys.vuur ? 0.95 : 0.6; // op een touchscreen iets vergevingsgezinder
    let best = null, bt = 34;
    for (const f of st.foes) {
      if (f.dead) continue;
      const rx = f.x - sx, rz = f.z - sz, t = rx * dx + rz * dz;
      if (t < 0.5 || t > bt) continue;
      const px = rx - dx * t, pz = rz - dz * t;
      if (px * px + pz * pz < (f.d.boss ? tol * 2 : tol) ** 2) { best = f; bt = t; }
    }
    const gx = st.x + dir.x * 0.8, gz = st.z + dir.z * 0.8, hx = sx + dx * bt, hz = sz + dz * bt, tl = Math.hypot(hx - gx, hz - gz);
    st.tracer.visible = st.view !== 'first'; st.tracerT = 0.04;
    st.tracer.position.set((gx + hx) / 2, 1.3, (gz + hz) / 2); st.tracer.scale.z = tl; st.tracer.rotation.y = Math.atan2(hx - gx, hz - gz);
    if (st.view === 'first') st.fpAk.position.z = -0.42; // terugslag
    // vuurwerkkist dichterbij dan de indringer?
    let kist = null;
    for (const k of st.kist) {
      if (k.hp <= 0) continue;
      const rx = k.x - sx, rz = k.z - sz, t = rx * dx + rz * dz;
      if (t < 0.5 || t > bt) continue;
      if ((rx - dx * t) ** 2 + (rz - dz * t) ** 2 < 0.55 ** 2) { kist = k; bt = t; best = null; }
    }
    if (kist && --kist.hp <= 0) this.kistBoem(kist);
    if (best) {
      this.hurt(best, 1, st);
      miniBurst(new THREE.Vector3(best.x, 1.3, best.z), 4, 3, miniSparkMats[1], 0.25);
      tone(1900, 0.03, 'square', 0.04);
      $('.mini-cross').classList.add('hit'); clearTimeout(st.hitTm); st.hitTm = setTimeout(() => $('.mini-cross').classList.remove('hit'), 90);
      if (st.boem > 0) this.boom(best.x, best.z, 1.7, 1.2);
    }
    if (st.mag <= 0) { st.reload = 1.5; tone(300, 0.08, 'square', 0.05, null, 0.2); }
    buzz(6);
  },
  kaars() {
    const st = mini.s;
    if (!st.kaars || st.kaarsQ > 0) return;
    st.kaars--; st.kaarsQ = 8; st.kaarsT = 0;
    miniSnd('groot', 0.55);
    miniMsg('🕯️ ROMEINSE KAARS!', 1);
    this.hud();
  },
  nade() {
    const st = mini.s;
    if (!st.nitraat) return;
    st.nitraat--;
    const m = makeNitraat(); st.world.add(m);
    const tx = st.aim.x, tz = st.aim.z;
    st.nades.push({ m, x0: st.x, z0: st.z, tx, tz, t: 0, dur: 0.8 });
    sfx.sis();
    this.hud();
  },
  boom(x, z, r, dmg) {
    const st = mini.s;
    miniBurst(new THREE.Vector3(x, 0.8, z), 26, 8, miniSparkMats, 1, 6);
    miniBurst(new THREE.Vector3(x, 0.4, z), 10, 4, miniDustMats, 0.8);
    st.shake = 0.35;
    for (const f of st.foes) if (!f.dead && Math.hypot(f.x - x, f.z - z) < r) this.hurt(f, dmg, { x, z });
  },
  update(dt) {
    const st = mini.s, jp = st.jens;
    // lopen: W/S vooruit/achteruit, A/D opzij, pijltjes links/rechts draaien
    let mx = (mini.keys.d ? 1 : 0) - (mini.keys.a ? 1 : 0);
    let mf = (mini.keys.w || mini.keys.ArrowUp ? 1 : 0) - (mini.keys.s || mini.keys.ArrowDown ? 1 : 0);
    if (mini.keys.ArrowLeft) st.yaw += 2.4 * dt;
    if (mini.keys.ArrowRight) st.yaw -= 2.4 * dt;
    if (st.joy) { const jx = (st.joy.x - st.joy.x0) / 50, jy = (st.joy.y - st.joy.y0) / 50, l = Math.hypot(jx, jy); if (l > 0.15) { mx = jx / Math.max(1, l); mf = -jy / Math.max(1, l); } }
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
    let dx = rx * mx + fx * mf, dz = rz * mx + fz * mf;
    const ml = Math.hypot(dx, dz);
    if (ml > 1) { dx /= ml; dz /= ml; }
    if (!mini.over) {
      st.x = clamp(st.x + dx * 5.5 * dt, -16, 16);
      st.z = clamp(st.z + dz * 5.5 * dt, -12.6, 16);
    }
    // richten = kijken: het vizier zit midden in beeld
    st.aimDir.set(fx, 0, fz);
    const ver = clamp(9 + st.pitch * 14, 3, 16);
    st.aim.set(st.x + fx * ver, 1, st.z + fz * ver);
    jp.root.position.set(st.x, 0, st.z);
    jp.root.rotation.y = st.yaw;
    const fp1 = st.view === 'first';
    jp.root.visible = !fp1; st.fpAk.visible = fp1 && !mini.over;
    pose(jp, ml > 0.1 ? 'run' : 'idle', dt);
    jp.armL.rotation.x = jp.armR.rotation.x = 1.5; jp.elL.rotation.x = 0.5; jp.elR.rotation.x = 0.1; jp.armL.rotation.z = -0.35;
    if (ml > 0.1) { // benen lopen in de looprichting, het lijf blijft richten
      const rel = Math.atan2(-dx, -dz) - jp.root.rotation.y;
      jp.legL.rotation.x *= Math.cos(rel); jp.legR.rotation.x *= Math.cos(rel);
    }
    // schieten
    st.fireT -= dt;
    if (st.reload > 0) { st.reload -= dt; if (st.reload <= 0) { st.reload = 0; st.mag = 30; tone(700, 0.06, 'square', 0.05); } }
    const firing = mini.keys.vuur || (mini.ptr?.fire && !mini.over);
    if (firing && st.fireT <= 0 && st.reload <= 0 && st.mag > 0 && !mini.over) this.shoot();
    if ((st.flashT -= dt) <= 0) st.ak.userData.flash.visible = st.fpAk.userData.flash.visible = false;
    if ((st.tracerT -= dt) <= 0) st.tracer.visible = false;
    // romeinse kaars: acht ballen achter elkaar
    if (st.kaarsQ > 0 && (st.kaarsT -= dt) <= 0) {
      st.kaarsQ--; st.kaarsT = 0.22;
      const m = mesh(sphG(0.2, 6, 4), pick(miniSparkMats)); st.world.add(m);
      st.balls.push({ m, x: st.x + st.aimDir.x * 0.8, z: st.z + st.aimDir.z * 0.8, vx: st.aimDir.x * 17, vz: st.aimDir.z * 17, t: 0 });
      tone(rand(900, 1300), 0.12, 'square', 0.04, 2400);
    }
    for (let i = st.balls.length - 1; i >= 0; i--) {
      const b = st.balls[i];
      b.t += dt; b.x += b.vx * dt; b.z += b.vz * dt;
      b.m.position.set(b.x, 1.2 + Math.sin(b.t * 6) * 0.1, b.z);
      if (Math.random() < 0.6) miniBurst(b.m.position, 1, 0.5, b.m.material, 0.3, 0);
      const hit = st.foes.find((f) => !f.dead && Math.hypot(f.x - b.x, f.z - b.z) < (f.d.boss ? 1.3 : 0.7));
      if (hit || b.t > 1.1) { st.world.remove(b.m); st.balls.splice(i, 1); this.boom(b.x, b.z, 1.9, 2.2); tone(rand(200, 300), 0.15, 'square', 0.06, 80); }
    }
    for (let i = st.nades.length - 1; i >= 0; i--) {
      const n = st.nades[i];
      n.t += dt; const k = Math.min(1, n.t / n.dur);
      n.m.position.set(n.x0 + (n.tx - n.x0) * k, 1.3 + Math.sin(k * Math.PI) * 3, n.z0 + (n.tz - n.z0) * k);
      n.m.rotation.x += dt * 12;
      if (k >= 1) { st.world.remove(n.m); st.nades.splice(i, 1); miniSnd('nitraat', 1) || sfx.boem(); this.boom(n.tx, n.tz, 3.2, 7); buzz(80); }
    }
    // drops oppakken, krachten aflopen
    st.streakT -= dt; st.rapid = Math.max(0, st.rapid - dt); st.boem = Math.max(0, st.boem - dt);
    for (let i = st.drops.length - 1; i >= 0; i--) {
      const d = st.drops[i];
      d.t += dt; d.m.rotation.y += dt * 3; d.m.position.y = 0.8 + Math.sin(d.t * 4) * 0.15;
      if (Math.hypot(d.x - st.x, d.z - st.z) < 1.3) { this.pak(d); st.world.remove(d.m); st.drops.splice(i, 1); }
      else if (d.t > 14) { st.world.remove(d.m); st.drops.splice(i, 1); }
    }
    // golven
    if (!mini.over) {
      if (st.pauseT > 0) { st.pauseT -= dt; if (st.pauseT <= 0) this.wave(); }
      else if (st.toSpawn > 0) {
        st.spawnT -= dt;
        const alive = st.foes.filter((f) => !f.dead).length;
        if (st.spawnT <= 0 && alive < (isIPod ? 8 : 15)) { this.spawn(); st.toSpawn--; st.spawnT = Math.max(0.28, 1.4 - st.wave * 0.12); }
      } else if (!st.foes.some((f) => !f.dead)) {
        const bonus = st.wave * 500;
        mini.score += bonus;
        sfx.power();
        miniMsg(`✅ GOLF ${st.wave} AFGESLAGEN!<small>+${bonus.toLocaleString('nl-NL')} · osso een beetje opgeknapt</small>`, 2);
        st.pauseT = 2.2;
      }
    }
    // indringers
    st.doorT -= dt;
    for (let i = st.foes.length - 1; i >= 0; i--) {
      const f = st.foes[i];
      if (f.dead) {
        f.dead += dt; f.vy -= 18 * dt;
        f.x += f.vx * dt; f.z += f.vz * dt;
        f.root.position.set(f.x, Math.max(0, f.root.position.y + f.vy * dt), f.z);
        f.root.rotation.x += dt * 6; f.root.rotation.y += dt * (f.spin || 0);
        if (f.dead > 1.8) { st.world.remove(f.root); (st.pool[f.type] ||= []).push({ root: f.root, p: f.p, base: f.base }); f.root.rotation.x = 0; st.foes.splice(i, 1); }
        continue;
      }
      const chaseJens = f.d.chase || (f.d.bike && f.type === 'drerrie' && Math.hypot(st.x - f.x, st.z - f.z) < 5);
      const tx = chaseJens ? st.x : OS_DOOR.x + (f.d.boss ? 0 : Math.sin(i * 2.3) * 1.2), tz = chaseJens ? st.z : OS_DOOR.z + 0.6;
      const dx = tx - f.x, dz = tz - f.z, l = Math.hypot(dx, dz);
      const reach = chaseJens ? 1.1 : f.d.boss ? 1.6 : 1.0;
      f.vx *= 1 - 6 * dt; f.vz *= 1 - 6 * dt;
      if (l > reach) {
        const sp = f.d.sp * (1.25 + st.wave * 0.04) * (mini.over ? 0.3 : 1);
        f.x += (dx / l) * sp * dt + f.vx * dt; f.z += (dz / l) * sp * dt + f.vz * dt;
        pose(f.p, f.d.bike ? 'bike' : 'run', dt, f.d.sp / 3);
        f.atk = 0;
      } else if (!mini.over) {
        f.atk += dt;
        pose(f.p, 'angry', dt);
        if (chaseJens) { st.hp -= (f.d.boss ? 16 : 9) * dt; st.hitT = 0.2; }
        else { st.huis -= (f.d.boss ? 7 : 2.2) * dt; if (st.doorT <= 0) { st.doorT = 0.6; noise(0.08, 0.25); tone(110, 0.1, 'square', 0.1, 70); } }
      }
      f.root.position.set(f.x, 0, f.z);
      f.root.rotation.y = Math.atan2(-dx, -dz) + (f.root !== f.p.root ? Math.PI : 0);
      f.flash = Math.max(0, f.flash - dt);
      f.root.scale.setScalar(f.base * (f.flash > 0 ? 1.08 : 1));
    }
    if (!mini.over && st.huis <= 0) { st.huis = 0; miniMsg('🏠 DE DEUR IS INGETRAPT!', 2); miniEnd('De osso is gevallen!', `De indringers zijn je osso binnengedrongen. Je hield ${st.wave} ${st.wave === 1 ? 'golf' : 'golven'} vol en schakelde ${st.kills} indringers uit.`); }
    if (!mini.over && st.hp <= 0) { st.hp = 0; miniMsg('😵 JENS IS OVERMEESTERD!', 2); miniEnd('Jens is overmeesterd!', `Ze hebben Jens te pakken gekregen voor z'n eigen deur. ${st.wave} ${st.wave === 1 ? 'golf' : 'golven'}, ${st.kills} indringers uitgeschakeld.`); }
    if (Math.floor(mini.t * 10) !== st.hudF) { st.hudF = Math.floor(mini.t * 10); this.hud(); }
    // camera: door Jens' ogen of over z'n schouder
    const cam = mini.cam, port = cam.aspect < 1;
    st.shake = Math.max(0, (st.shake || 0) - dt);
    const sh = st.shake * 0.25;
    cam.fov = port ? 80 : 70;
    if (fp1) cam.position.set(st.x, 1.62 + (ml > 0.1 ? Math.abs(Math.sin(mini.t * 11)) * 0.05 : 0), st.z);
    else cam.position.set(st.x - fx * 3.3 + rx * 0.75, 2.3 - st.pitch * 1.6, Math.max(-13.5, st.z - fz * 3.3 + rz * 0.75));
    cam.position.x += rand(-sh, sh); cam.position.y += rand(-sh, sh);
    const cp = Math.cos(st.pitch);
    cam.lookAt(cam.position.x + fx * cp * 10, cam.position.y + Math.sin(st.pitch) * 10, cam.position.z + fz * cp * 10);
    cam.updateProjectionMatrix();
    st.fpAk.position.z = damp(st.fpAk.position.z, -0.48, 20, dt);
    $('#mini').classList.toggle('hurt', st.hitT > 0);
    st.hitT = Math.max(0, st.hitT - dt);
  },
};

// =====================================================================
//  JENS ARCADE: de kast in De Hub met drie kleine spelletjes (2D)
// =====================================================================
const ARC_GAMES = {
  penalty: { icon: '⚽', name: "Penalty's in de Goffert", desc: 'Klik twee keer: eerst links/rechts, dan hoog/laag. Vijf pogingen.' },
  flip: { icon: '🥤', name: 'Fanta-flip', desc: 'Houd ingedrukt, laat los in het groene vak. Het vak wordt steeds kleiner.' },
  nitraat: { icon: '🧨', name: 'Wie durft?', desc: 'Houd de nitraat zo lang mogelijk vast. Laat los voor hij ontploft. Drie levens.' },
};
const arc = { game: null, raf: 0, cv: null, x: null, down: false, s: null, last: 0 };
function openArcade() {
  showScreen('#arcade');
  arc.game = null;
  renderArcadeMenu();
}
function renderArcadeMenu() {
  cancelAnimationFrame(arc.raf);
  $('#arcStage').classList.add('hidden');
  $('#arcMenu').classList.remove('hidden');
  $('#arcMenu').innerHTML = Object.entries(ARC_GAMES).map(([k, g]) => `<button class="arc-game" data-arc="${k}"><span>${g.icon}</span><b>${g.name}</b><small>${g.desc}</small><i>🏅 ${(save.arcade?.[k] || 0).toLocaleString('nl-NL')}</i></button>`).join('');
}
$('#arcMenu').addEventListener('click', (e) => { const b = e.target.closest('[data-arc]'); if (b) startArcade(b.dataset.arc); });
$('#arcBack').addEventListener('click', () => { if (arc.game) { arc.game = null; renderArcadeMenu(); } else { cancelAnimationFrame(arc.raf); openKamer(); } });
function startArcade(k) {
  audioInit();
  arc.game = k;
  $('#arcMenu').classList.add('hidden');
  $('#arcStage').classList.remove('hidden');
  arc.cv = $('#arcCv'); arc.x = arc.cv.getContext('2d');
  arc.cv.width = 320; arc.cv.height = 240;
  arc.down = false;
  arc.s = ARC[k].init();
  arc.last = performance.now();
  cancelAnimationFrame(arc.raf);
  const loop = (t) => {
    const dt = Math.min(0.05, (t - arc.last) / 1000); arc.last = t;
    if (!arc.game) return;
    ARC[arc.game].step(arc.s, dt);
    ARC[arc.game].draw(arc.x, arc.s);
    arc.raf = requestAnimationFrame(loop);
  };
  arc.raf = requestAnimationFrame(loop);
}
function arcScore(k, score) {
  save.arcade ||= {};
  const best = save.arcade[k] || 0, nieuw = score > best;
  if (nieuw) save.arcade[k] = score;
  const bek = Math.round(score * (k === 'nitraat' ? 0.05 : 3));
  save.bekers += bek;
  persist();
  return { nieuw, bek };
}
const arcPress = (on) => { if (!arc.game) return; arc.down = on; ARC[arc.game][on ? 'press' : 'release']?.(arc.s); };
$('#arcCv').addEventListener('pointerdown', (e) => { e.preventDefault(); arcPress(true); });
window.addEventListener('pointerup', () => { if (arc.down) arcPress(false); });
window.addEventListener('keydown', (e) => { if (curScreen === '#arcade' && arc.game && (e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); arcPress(true); } });
window.addEventListener('keyup', (e) => { if (curScreen === '#arcade' && arc.game && (e.key === ' ' || e.key === 'Enter')) arcPress(false); });
// pixeltekst
function arcText(x, str, px, py, size = 10, color = '#fff', align = 'center') {
  x.font = `${size}px Anton, Impact, sans-serif`; x.textAlign = align; x.textBaseline = 'middle';
  x.fillStyle = '#000'; x.fillText(str, px + 2, py + 2);
  x.fillStyle = color; x.fillText(str, px, py);
}
function arcEnd(s, k, score, line) {
  s.end = { score, line, ...arcScore(k, score), t: 0 };
}
function arcEndScreen(x, s) {
  if (!s.end) return;
  x.fillStyle = 'rgba(0,0,0,.72)'; x.fillRect(0, 0, 320, 240);
  arcText(x, s.end.line, 160, 70, 10, '#ffd23f');
  arcText(x, `SCORE ${s.end.score}`, 160, 105, 14);
  if (s.end.nieuw) arcText(x, 'NIEUW RECORD!', 160, 135, 9, '#7dff6a');
  arcText(x, `+${s.end.bek} BEKERS`, 160, 160, 9, '#ffd23f');
  if (Math.floor(performance.now() / 500) % 2) arcText(x, 'TIK = OPNIEUW', 160, 200, 8);
}
const ARC = {
  // ---------- penalty's ----------
  penalty: {
    init: () => ({ shot: 0, goals: 0, phase: 'x', ax: 0, ay: 0, t: 0, ball: null, keeper: 160, kdir: 0, msg: '', msgT: 0 }),
    press(s) {
      if (s.end) { if (s.end.t > 0.6) arc.s = ARC.penalty.init(); return; }
      if (s.phase === 'x') { s.phase = 'y'; tone(600, 0.05, 'square', 0.05); }
      else if (s.phase === 'y') {
        s.phase = 'shoot'; s.ball = { t: 0, x: 160, y: 205, tx: 160 + s.ax * 92, ty: 92 + s.ay * 34 };
        // keeper gokt: vaak de goede kant
        s.kdir = Math.random() < 0.45 ? Math.sign(s.ax) * (Math.abs(s.ax) > 0.35 ? 1 : 0) : pick([-1, 0, 1]);
        noise(0.08, 0.2);
      }
    },
    step(s, dt) {
      s.t += dt;
      if (s.end) { s.end.t += dt; return; }
      if (s.phase === 'x') s.ax = Math.sin(s.t * 3.2);
      if (s.phase === 'y') s.ay = Math.sin(s.t * 4.1);
      s.msgT -= dt;
      if (s.phase === 'shoot') {
        const b = s.ball; b.t += dt * 2.2;
        const k = Math.min(1, b.t);
        b.x = 160 + (b.tx - 160) * k; b.y = 205 + (b.ty - 205) * k;
        s.keeper = damp(s.keeper, 160 + s.kdir * 62, 7, dt);
        if (k >= 1) {
          const saved = Math.abs(b.tx - s.keeper) < 30 && b.ty > 70;
          const paal = Math.abs(b.tx - 160) > 88;
          if (saved) { s.msg = 'GEHOUDEN!'; tone(200, 0.3, 'sawtooth', 0.08, 90); }
          else if (paal) { s.msg = 'PAAL!'; tone(900, 0.15, 'square', 0.06); }
          else { s.goals++; s.msg = 'GOAL!!'; sfx.power(); buzz(40); }
          s.msgT = 1.1; s.shot++; s.phase = 'wacht'; s.wait = 1.1;
        }
      }
      if (s.phase === 'wacht' && (s.wait -= dt) <= 0) {
        if (s.shot >= 5) arcEnd(s, 'penalty', s.goals, s.goals >= 4 ? 'DIE BEKER IS VAN ONS!' : s.goals >= 2 ? 'NETJES, JENS' : 'NAAR DE TRAINING!');
        else { s.phase = 'x'; s.ball = null; s.keeper = 160; s.kdir = 0; s.t = rand(0, 3); }
      }
    },
    draw(x, s) {
      x.fillStyle = '#2f8a3a'; x.fillRect(0, 0, 320, 240);
      for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#2f8a3a' : '#35963f'; x.fillRect(0, 120 + i * 15, 320, 15); }
      x.fillStyle = '#c8202b'; x.fillRect(0, 0, 320, 52); // tribune
      for (let i = 0; i < 60; i++) { x.fillStyle = ['#c8202b', '#1f7a3a', '#141414', '#ffd23f'][i % 4]; x.fillRect((i * 37) % 320, 6 + ((i * 13) % 40), 4, 4); }
      x.fillStyle = '#fff'; x.fillRect(62, 56, 196, 4); x.fillRect(62, 56, 4, 76); x.fillRect(254, 56, 4, 76);
      x.strokeStyle = 'rgba(255,255,255,.35)'; for (let i = 70; i < 254; i += 12) { x.beginPath(); x.moveTo(i, 60); x.lineTo(i, 130); x.stroke(); }
      // keeper
      x.fillStyle = '#ffd23f'; x.fillRect(s.keeper - 10, 92, 20, 30); x.fillStyle = '#f2cfbf'; x.fillRect(s.keeper - 6, 80, 12, 12);
      x.fillStyle = '#ffd23f'; x.fillRect(s.keeper - 22 + (s.kdir < 0 ? -6 : 0), 96, 12, 6); x.fillRect(s.keeper + 10 + (s.kdir > 0 ? 6 : 0), 96, 12, 6);
      // richten
      if (s.phase === 'x' || s.phase === 'y') {
        const ax = 160 + s.ax * 92, ay = s.phase === 'y' ? 92 + s.ay * 34 : 92;
        x.strokeStyle = '#ffd23f'; x.lineWidth = 2;
        if (s.phase === 'x') { x.beginPath(); x.moveTo(ax, 60); x.lineTo(ax, 130); x.stroke(); }
        else { x.beginPath(); x.moveTo(ax - 10, ay); x.lineTo(ax + 10, ay); x.moveTo(ax, ay - 10); x.lineTo(ax, ay + 10); x.stroke(); }
      }
      // bal
      const b = s.ball || { x: 160, y: 205, t: 0 };
      const r = 7 - Math.min(1, b.t) * 3;
      x.fillStyle = '#fff'; x.beginPath(); x.arc(b.x, b.y, r, 0, 7); x.fill(); x.fillStyle = '#000'; x.fillRect(b.x - 1, b.y - 1, 3, 3);
      arcText(x, `${s.goals}/${s.shot}`, 300, 228, 9, '#fff', 'right');
      arcText(x, s.phase === 'x' ? 'TIK: KANT' : s.phase === 'y' ? 'TIK: HOOGTE' : '', 12, 228, 8, '#ffd23f', 'left');
      if (s.msgT > 0) arcText(x, s.msg, 160, 160, 18, s.msg.startsWith('GOAL') ? '#7dff6a' : '#ff5a5a');
      arcEndScreen(x, s);
    },
  },
  // ---------- fanta-flip ----------
  flip: {
    init: () => ({ streak: 0, zone: 0.34, zoneAt: rand(0.35, 0.7), p: 0, dir: 1, held: false, anim: 0, ok: null, t: 0 }),
    press(s) {
      if (s.end) { if (s.end.t > 0.6) arc.s = ARC.flip.init(); return; }
      if (s.anim > 0) return;
      s.held = true; s.p = 0; s.dir = 1;
    },
    release(s) {
      if (!s.held || s.end) return;
      s.held = false;
      s.ok = Math.abs(s.p - s.zoneAt) < s.zone / 2;
      s.anim = 1.2;
      tone(500, 0.08, 'square', 0.05);
    },
    step(s, dt) {
      s.t += dt;
      if (s.end) { s.end.t += dt; return; }
      if (s.held) { s.p += s.dir * dt * (0.9 + s.streak * 0.08); if (s.p > 1) { s.p = 1; s.dir = -1; } if (s.p < 0) { s.p = 0; s.dir = 1; } }
      if (s.anim > 0) {
        s.anim -= dt;
        if (s.anim <= 0) {
          if (s.ok) { s.streak++; s.zone = Math.max(0.08, s.zone * 0.88); s.zoneAt = rand(0.15 + s.zone / 2, 0.95 - s.zone / 2); sfx.beker(); }
          else { noise(0.25, 0.25); arcEnd(s, 'flip', s.streak, s.streak >= 8 ? 'FLIP-KONING!' : s.streak >= 3 ? 'NIET SLECHT' : 'FANTA OP DE VLOER'); }
        }
      }
    },
    draw(x, s) {
      x.fillStyle = '#e8dcc4'; x.fillRect(0, 0, 320, 240);
      x.fillStyle = 'rgba(200,32,43,.25)'; for (let i = 0; i < 320; i += 40) x.fillRect(i, 0, 12, 150);
      x.fillStyle = '#6b4a2e'; x.fillRect(30, 150, 260, 14); x.fillRect(40, 164, 10, 76); x.fillRect(270, 164, 10, 76);
      // fles
      const k = s.anim > 0 ? 1 - s.anim / 1.2 : 0;
      const fy = 150 - Math.sin(k * Math.PI) * 90, rot = s.anim > 0 ? k * Math.PI * 2 * (s.ok ? 1 : 1.25) : 0;
      x.save(); x.translate(160, fy - 22); x.rotate(rot);
      x.fillStyle = '#ff8a00'; x.fillRect(-9, -22, 18, 44); x.fillStyle = '#1f5fa8'; x.fillRect(-9, -6, 18, 12); x.fillStyle = '#fff'; x.fillRect(-5, -30, 10, 8);
      x.restore();
      // krachtbalk
      x.fillStyle = '#222'; x.fillRect(40, 196, 240, 16);
      x.fillStyle = '#2bb673'; x.fillRect(40 + (s.zoneAt - s.zone / 2) * 240, 196, s.zone * 240, 16);
      x.fillStyle = '#ffd23f'; x.fillRect(40 + s.p * 240 - 2, 192, 4, 24);
      arcText(x, `STREAK ${s.streak}`, 160, 20, 10, '#c8202b');
      if (!s.held && s.anim <= 0 && !s.end) arcText(x, 'HOUD VAST, LAAT LOS', 160, 228, 8, '#000');
      arcEndScreen(x, s);
    },
  },
  // ---------- nitraat vasthouden ----------
  nitraat: {
    init: () => ({ lives: 3, score: 0, held: false, t: 0, fuse: rand(1.5, 5), boom: 0, gooi: 0, round: 1, pts: 0 }),
    press(s) {
      if (s.end) { if (s.end.t > 0.6) arc.s = ARC.nitraat.init(); return; }
      if (s.boom > 0 || s.gooi > 0) return;
      s.held = true; s.t = 0; s.fuse = rand(1.2, 4.5 + s.round * 0.2);
      sfx.sis();
    },
    release(s) {
      if (!s.held || s.end) return;
      s.held = false;
      s.pts = Math.round(s.t * s.t * 40 + s.t * 60);
      s.score += s.pts; s.round++;
      s.gooi = 1.3;
      tone(400, 0.1, 'square', 0.05, 900);
    },
    step(s, dt) {
      if (s.end) { s.end.t += dt; return; }
      if (s.held) { s.t += dt; if (s.t >= s.fuse) { s.held = false; s.boom = 1.4; s.lives--; miniSnd('nitraat', 1) || sfx.boem(); buzz([60, 40, 90]); } }
      if (s.gooi > 0) { s.gooi -= dt; if (s.gooi <= 0.5 && s.gooi + dt > 0.5) miniSnd('nitraat', 0.6) || sfx.knal(); }
      if (s.boom > 0) { s.boom -= dt; if (s.boom <= 0 && s.lives <= 0) arcEnd(s, 'nitraat', s.score, s.score > 3000 ? 'GESTOORD. RESPECT.' : s.score > 1200 ? 'LEKKER BEZIG' : 'BANG HOOR'); }
    },
    draw(x, s) {
      x.fillStyle = '#141a30'; x.fillRect(0, 0, 320, 240);
      for (let i = 0; i < 30; i++) { x.fillStyle = '#fff'; x.fillRect((i * 53) % 320, (i * 29) % 110, 1, 1); }
      x.fillStyle = '#2a3a2a'; x.fillRect(0, 180, 320, 60);
      // Jens' hand met nitraat
      const shake = s.held ? Math.sin(performance.now() / 30) * Math.min(4, s.t * 1.2) : 0;
      if (s.boom > 0) {
        const r = (1.4 - s.boom) * 160;
        for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28; x.fillStyle = ['#ffd23f', '#ff8a00', '#ff3b1a', '#fff'][i % 4]; x.fillRect(160 + Math.cos(a) * r, 130 + Math.sin(a) * r, 6, 6); }
        arcText(x, 'BOEM! IN JE HAND', 160, 60, 11, '#ff5a5a');
      } else if (s.gooi > 0) {
        const k = 1 - s.gooi / 1.3, gx = 160 + k * 120, gy = 130 - Math.sin(k * Math.PI) * 90;
        if (s.gooi > 0.5) { x.fillStyle = '#c8202b'; x.fillRect(gx - 5, gy - 10, 10, 20); }
        else { const r = (0.5 - s.gooi) * 140; for (let i = 0; i < 20; i++) { const a = i / 20 * 6.28; x.fillStyle = ['#ffd23f', '#7dff6a', '#4dd2ff', '#ff7af0'][i % 4]; x.fillRect(280 + Math.cos(a) * r, 60 + Math.sin(a) * r, 5, 5); } }
        arcText(x, `+${s.pts}`, 160, 60, 14, '#7dff6a');
      } else {
        x.fillStyle = '#f2cfbf'; x.fillRect(140 + shake, 150, 40, 40);
        x.fillStyle = '#c8202b'; x.fillRect(152 + shake, 118, 16, 36); x.fillStyle = '#fff'; x.fillRect(152 + shake, 130, 16, 6);
        if (s.held) { const lont = Math.max(0, 1 - s.t / 6) * 18; x.fillStyle = '#ddd'; x.fillRect(159 + shake, 118 - lont, 2, lont); x.fillStyle = pick(['#ffd23f', '#ff8a00', '#fff']); x.fillRect(157 + shake, 114 - lont, 6, 6); }
        arcText(x, s.held ? `${s.t.toFixed(1)}s` : 'HOUD VAST', 160, 60, 14, s.held ? '#ffd23f' : '#fff');
      }
      arcText(x, '❤'.repeat(Math.max(0, s.lives)), 12, 20, 12, '#ff5a5a', 'left');
      arcText(x, `${s.score}`, 308, 20, 10, '#ffd23f', 'right');
      arcEndScreen(x, s);
    },
  },
};

window.__jr = { get jacht() { return jacht; }, get live() { return live; }, jachtPower, camera, jens, player, spawnCoinsLine, renderer, scene, instPools, lkTest() { lkKans = true; }, lkEnter: enterLk, exitSchool, startMini, comboHit, slomo, set scoreTest(v) { score = v; }, get mini() { return mini; }, openArcade, startArcade, get arc() { return arc; }, breakdown() { const c = {}; for (const top of scene.children) { if (!top.visible) continue; let n = 0; top.traverseVisible((o) => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) n++; }); const k = top.userData.kind || (objs.find((o) => o.mesh === top)?.kind) || (houses['-1'].concat(houses['1']).some((h) => h.g === top) ? 'huis' : decor.some((d) => d.items.includes(top)) ? 'decor:' + decor.find((d) => d.items.includes(top)).kind : top === jens.root ? 'jens' : feestDecor.some((d) => d.items.includes(top)) ? 'feest' : top.type + (top.children.length ? '' : ':' + (top.geometry?.type || ''))); c[k] = (c[k] || 0) + n; } return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 18); }, get calls() { return renderer.info.render.calls; }, set themaT(v) { themaT = v; }, get feest() { return feest; }, get snapInfo() { return JSON.stringify({ snapOn, snapDeath, fly: !!deathFly, cls: document.querySelector('#snap').className }); }, startEbos, get ebos() { return ebos; }, verslaggever, spawnTruck, spawnRaam, spawnReporter, splatScreen, openKamer, newsTexts, KOP_TOTAAL, mem: () => ({ ...renderer.info.memory, heap: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6) }), progs: () => renderer.info.programs.length, introTest: (i, t) => { NEWS_INTROS[i](newsCtx, t, { head: "BOEM: JENS OPNIEUW GESIGNALEERD OP DE JAVASTRAAT", street: "Javastraat" }); return [NEWS_INTROS.length, newsCanvas.toDataURL()]; }, startSeg, get seg() { return seg; }, openPass, openKrant, playCut, spawnVrienden, fp, klasPeople, kamer, applyLook, applyOutfit, get calls2() { return renderer.info.render.calls; }, openPhoto, startReplay, get replayN() { return replayBuf.length; }, spawnFork, spawnSchat, spawnKaart, get hill() { return hill; }, set nextHill(v) { nextHill = v; }, get dayMix() { return dayMix; }, set sunsetFrom(v) { sunsetFrom = v; }, startBos, get bos() { return bos; }, startWeekly, thisWeek, get lastSnap() { return lastSnap; }, get pet() { return pet; }, setWeather: (w) => { weather = w; seedPrecip(w === 'regen' ? 'regen' : w === 'sneeuw' ? 'sneeuw' : curFeest()?.confetti ? 'confetti' : null); applyLook(phaseT); }, setFeest: (f) => { feest = f; applyFeest(); applyLook(phaseT); }, get combo() { return combo; }, get nearT() { return nearT; }, get speed() { return speed; }, get baseSpeed() { return baseSpeed; }, die: (r) => die(r), kings: () => scene.children.filter((c) => c.userData.isKing).length, setCampaign: (c) => { campaign = c; }, get mult() { return save.mult; }, decor, get score() { return score; }, enterSchool, spawnMontessori, get indoor() { return indoor; }, get fietsT() { return fietsT; }, moveWorld, spawnLandmark, pauseGame, startLevel, openLevels, warp: (n) => { dist += n; }, get tasks() { return tasks; }, get boss() { return boss; }, get takedowns() { return takedowns; }, music, musicGain, get gameover() { return !!gameoverSrc; }, die: (r) => die(r), startShow, setNight, objs, shots, get score() { return score; }, vrouw: () => addObj('vrouw', makeVrouw(), 0, -28, 0.8, 0.6, 1.8), act, startRun, activatePower, openShop, get state() { return state; }, save, set god(v) { invulnT = v ? 1e9 : 0; } };
