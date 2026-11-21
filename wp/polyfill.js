// Polyfills voor EdgeHTML 13–15 (Windows 10 Mobile). Wordt vóór de game in dezelfde bundel gezet.
import 'core-js/stable';
import 'whatwg-fetch';
import 'regenerator-runtime/runtime';

const E = Element.prototype, D = window.document;
if (!E.matches) E.matches = E.msMatchesSelector || E.webkitMatchesSelector;
if (!E.closest) E.closest = function (s) { let el = this; while (el && el.nodeType === 1) { if (el.matches(s)) return el; el = el.parentElement || el.parentNode; } return null; };
const node = (n) => (n instanceof Node ? n : D.createTextNode(String(n)));
const frag = (list) => { const f = D.createDocumentFragment(); list.forEach((n) => f.appendChild(node(n))); return f; };
for (const P of [E, DocumentFragment.prototype, Document.prototype]) {
  if (!P.append) P.append = function (...n) { this.appendChild(frag(n)); };
  if (!P.prepend) P.prepend = function (...n) { this.insertBefore(frag(n), this.firstChild); };
}
for (const P of [E, CharacterData.prototype, DocumentType.prototype]) {
  if (!P.remove) P.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
  if (!P.before) P.before = function (...n) { if (this.parentNode) this.parentNode.insertBefore(frag(n), this); };
  if (!P.after) P.after = function (...n) { if (this.parentNode) this.parentNode.insertBefore(frag(n), this.nextSibling); };
  if (!P.replaceWith) P.replaceWith = function (...n) { if (this.parentNode) this.parentNode.replaceChild(frag(n), this); };
}
if (!E.toggleAttribute) E.toggleAttribute = function (a, f) { const on = f === undefined ? !this.hasAttribute(a) : !!f; if (on) this.setAttribute(a, ''); else this.removeAttribute(a); return on; };
if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
if (window.HTMLCollection && !HTMLCollection.prototype[Symbol.iterator]) HTMLCollection.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
if (window.NodeList && !NodeList.prototype[Symbol.iterator]) NodeList.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
if (!('isConnected' in Node.prototype)) Object.defineProperty(Node.prototype, 'isConnected', { get() { return D.documentElement.contains(this.nodeType === 1 ? this : this.parentNode); } });

// classList.toggle(naam, force) en meerdere namen in add/remove
(() => {
  const t = D.createElement('i');
  t.classList.add('a', 'b');
  const C = DOMTokenList.prototype;
  if (!t.classList.contains('b')) {
    const add = C.add, rem = C.remove;
    C.add = function (...n) { n.forEach((k) => add.call(this, k)); };
    C.remove = function (...n) { n.forEach((k) => rem.call(this, k)); };
  }
  t.classList.toggle('c', false);
  if (t.classList.contains('c')) {
    const tog = C.toggle;
    C.toggle = function (k, f) { if (f === undefined) return tog.call(this, k); f ? this.add(k) : this.remove(k); return !!f; };
  }
})();

// lettertypen: EdgeHTML <17 heeft geen document.fonts
if (!D.fonts) D.fonts = { load: () => Promise.resolve([]), ready: Promise.resolve(), check: () => true, addEventListener() {}, add() {} };
// afbeelding.decode()
if (window.HTMLImageElement && !HTMLImageElement.prototype.decode) {
  HTMLImageElement.prototype.decode = function () {
    const img = this;
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise((ok, nee) => { img.addEventListener('load', () => ok(), { once: true }); img.addEventListener('error', nee, { once: true }); });
  };
}
// Web Animations bestaat niet in EdgeHTML: meteen naar het eindbeeld (of het begin bij fill: backwards)
if (!E.animate) {
  E.animate = function (frames, opt) {
    const o = typeof opt === 'number' ? { duration: opt } : opt || {};
    const eind = {};
    if (Array.isArray(frames)) Object.assign(eind, frames[frames.length - 1] || {});
    else for (const k in frames) eind[k] = Array.isArray(frames[k]) ? frames[k][frames[k].length - 1] : frames[k];
    const el = this;
    if (o.fill === 'forwards' || o.fill === 'both') for (const k in eind) if (k !== 'offset' && k !== 'easing') el.style[k] = eind[k];
    const duur = (o.duration || 0) + (o.delay || 0);
    let klaar;
    const a = { finished: new Promise((r) => (klaar = r)), onfinish: null, cancel() {}, finish() {}, pause() {}, play() {}, reverse() {}, playState: 'running', addEventListener(t, f) { if (t === 'finish') a.finished.then(f); } };
    setTimeout(() => { a.playState = 'finished'; klaar(a); if (a.onfinish) a.onfinish(); }, duur);
    return a;
  };
}
if (!window.requestIdleCallback) {
  window.requestIdleCallback = (f) => setTimeout(() => f({ didTimeout: false, timeRemaining: () => 8 }), 60);
  window.cancelIdleCallback = clearTimeout;
}
if (window.crypto && !crypto.randomUUID) crypto.randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
if (!window.crypto && window.msCrypto) window.crypto = window.msCrypto;

// Web Audio: decodeAudioData geeft in oude Edge geen promise terug
const AC = window.AudioContext || window.webkitAudioContext;
if (AC) {
  window.AudioContext = AC;
  const dec = AC.prototype.decodeAudioData;
  // Geheugen: decoderen in een OfflineAudioContext op 22,05 kHz (de geluiden in wp/audio zijn mono 22,05 kHz). Anders maakt
  // Web Audio er 48 kHz-floats van: ruim 2× zo veel RAM voor niets. Een AudioBuffer mag in elke context spelen.
  const OACl = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let laag = null;
  const decodeer = (ctx, buf) => new Promise((res, rej) => {
    const r = dec.call(ctx, buf, res, rej);
    if (r && r.then) r.then(res, rej);
  });
  AC.prototype.decodeAudioData = function (buf, ok, nee) {
    const kopie = buf && buf.slice ? buf.slice(0) : buf; // decodeAudioData mag de buffer leeg maken
    let p;
    try { if (!laag && OACl) laag = new OACl(1, 1, 22050); } catch (e) { laag = false; }
    if (laag) p = decodeer(laag, buf).catch(() => decodeer(this, kopie));
    else p = decodeer(this, buf);
    return p.then((b) => { if (ok) ok(b); return b; }, (e) => { if (nee) nee(e); throw e; });
  };
  // connect() geeft in oude Edge niets terug, de game ketent a.connect(b).connect(c)
  const AN = window.AudioNode && AudioNode.prototype, con = AN && AN.connect;
  if (con) AN.connect = function (doel) { const r = con.apply(this, arguments); return r === undefined ? doel : r; };
  if (window.AudioBuffer && !AudioBuffer.prototype.copyToChannel) AudioBuffer.prototype.copyToChannel = function (bron, kanaal, start) { this.getChannelData(kanaal).set(bron, start || 0); };
  if (window.AudioBuffer && !AudioBuffer.prototype.copyFromChannel) AudioBuffer.prototype.copyFromChannel = function (doel, kanaal, start) { const d = this.getChannelData(kanaal); doel.set(d.subarray(start || 0, (start || 0) + doel.length)); };
  for (const k of ['resume', 'suspend', 'close']) if (!AC.prototype[k]) AC.prototype[k] = function () { return Promise.resolve(); };
  // new AudioContext({ latencyHint }) kent oude Edge niet: dan zonder opties
  const ACecht = AC;
  window.AudioContext = function AudioContext(o) { try { return o === undefined ? new ACecht() : new ACecht(o); } catch (e) { return new ACecht(); } };
  window.AudioContext.prototype = ACecht.prototype;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (OAC) { window.OfflineAudioContext = OAC; if (OAC.prototype.decodeAudioData === dec) OAC.prototype.decodeAudioData = AC.prototype.decodeAudioData; }
  // startRendering() geeft in oude Edge geen promise maar een complete-event
  if (OAC) {
    const sr = OAC.prototype.startRendering;
    OAC.prototype.startRendering = function () {
      const oc = this;
      return new Promise((ok, nee) => {
        const vorige = oc.oncomplete;
        oc.oncomplete = (e) => { if (vorige) vorige.call(oc, e); ok(e.renderedBuffer); };
        try { const r = sr.call(oc); if (r && r.then) r.then(ok, nee); } catch (e) { nee(e); }
      });
    };
  }
}
// EventTarget-opties ({ once, passive }) ondersteunt EdgeHTML 13–15 maar half: once zelf regelen
(() => {
  let onceOk = false;
  try { const o = { get once() { onceOk = true; return true; } }; window.addEventListener('x', null, o); window.removeEventListener('x', null, o); } catch (e) {}
  if (onceOk) return;
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const kaart = new WeakMap();
  EventTarget.prototype.addEventListener = function (t, f, o) {
    if (!f) return;
    const cap = typeof o === 'object' ? !!(o && o.capture) : !!o;
    if (o && typeof o === 'object' && o.once) {
      const self = this, w = function (e) { rem.call(self, t, w, cap); return typeof f === 'function' ? f.call(this, e) : f.handleEvent(e); };
      kaart.set(f, w);
      return add.call(this, t, w, cap);
    }
    return add.call(this, t, f, cap);
  };
  EventTarget.prototype.removeEventListener = function (t, f, o) {
    const cap = typeof o === 'object' ? !!(o && o.capture) : !!o;
    rem.call(this, t, (f && kaart.get(f)) || f, cap);
  };
})();
if (!window.globalThis) window.globalThis = window;

// canvas.toBlob ontbreekt in EdgeHTML (alleen msToBlob, en dan alleen PNG)
if (window.HTMLCanvasElement && !HTMLCanvasElement.prototype.toBlob) {
  HTMLCanvasElement.prototype.toBlob = function (klaar, type, kwaliteit) {
    const c = this;
    setTimeout(() => {
      const url = c.toDataURL(type, kwaliteit), bin = atob(url.split(',')[1]), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      klaar(new Blob([u], { type: url.slice(5, url.indexOf(';')) }));
    });
  };
}
// createImageBitmap: een geladen <img> werkt overal waar een bitmap gebruikt wordt (drawImage, width/height)
if (!window.createImageBitmap) {
  window.createImageBitmap = (bron) => new Promise((ok, nee) => {
    if (!(bron instanceof Blob)) return ok(bron);
    const url = URL.createObjectURL(bron), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); img.close = () => {}; ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); nee(new Error('afbeelding kon niet geladen worden')); };
    img.src = url;
  });
}

// Tijdzones: oude Chakra kent alleen UTC en heeft geen formatToParts. Europe/Amsterdam rekenen we zelf uit
// (zomertijd volgens de EU-regel: laatste zondag van maart t/m laatste zondag van oktober, 01:00 UTC).
(() => {
  let zoneOk = true;
  try { new Date().toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam' }); } catch (e) { zoneOk = false; }
  if (!window.Intl) return;
  const DTF = Intl.DateTimeFormat;
  if (zoneOk && DTF.prototype.formatToParts) return;
  const laatsteZondag = (j, m) => { const d = new Date(Date.UTC(j, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
  const naarAms = (t) => { const j = new Date(t).getUTCFullYear(); return t + (t >= laatsteZondag(j, 2) && t < laatsteZondag(j, 9) ? 2 : 1) * 3600e3; };
  const isAms = (o) => !zoneOk && !!o && typeof o.timeZone === 'string' && /^europe\/amsterdam$/i.test(o.timeZone);
  const alsUtc = (o) => Object.assign({}, o, { timeZone: 'UTC' });
  if (!zoneOk) {
    for (const k of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
      const orig = Date.prototype[k];
      Date.prototype[k] = function (loc, o) { return isAms(o) ? orig.call(new Date(naarAms(this.getTime())), loc, alsUtc(o)) : orig.call(this, loc, o); };
    }
  }
  const DAG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], twee = (n) => (n < 10 ? '0' : '') + n;
  function DateTimeFormat(loc, o) {
    if (!(this instanceof DateTimeFormat)) return new DateTimeFormat(loc, o);
    this.ams = isAms(o);
    this.o = Object.assign({}, o);
    this.f = new DTF(loc, this.ams ? alsUtc(o) : o);
  }
  const tijd = (self, d) => { const t = d == null ? Date.now() : +d; return self.ams ? naarAms(t) : t; };
  DateTimeFormat.prototype.format = function (d) { return this.f.format(tijd(this, d)); };
  DateTimeFormat.prototype.resolvedOptions = function () { return this.f.resolvedOptions(); };
  DateTimeFormat.prototype.formatToParts = function (d) {
    const t = tijd(this, d);
    if (this.f.formatToParts) return this.f.formatToParts(t);
    // zelf opbouwen (en-GB-achtig): genoeg voor weekdag, datum en tijd als getallen
    const x = new Date(t), utc = this.ams || /^utc$/i.test(this.o.timeZone || ''), o = this.o, p = [];
    const g = (n) => x[(utc ? 'getUTC' : 'get') + n]();
    const bij = (type, value) => { if (p.length) p.push({ type: 'literal', value: type === 'hour' || type === 'weekday' ? ' ' : type === 'minute' || type === 'second' ? ':' : '/' }); p.push({ type, value: String(value) }); };
    if (o.weekday) bij('weekday', DAG[g('Day')]);
    if (o.day) bij('day', o.day === '2-digit' ? twee(g('Date')) : g('Date'));
    if (o.month) bij('month', o.month === '2-digit' ? twee(g('Month') + 1) : g('Month') + 1);
    if (o.year) bij('year', g('FullYear'));
    if (o.hour) bij('hour', twee(g('Hours')));
    if (o.minute) bij('minute', twee(g('Minutes')));
    if (o.second) bij('second', twee(g('Seconds')));
    return p;
  };
  DateTimeFormat.supportedLocalesOf = DTF.supportedLocalesOf;
  Intl.DateTimeFormat = DateTimeFormat;
})();

// play() geeft in EdgeHTML 13/14 geen promise terug: .play().catch(...) gooide dan een TypeError
if (window.HTMLMediaElement) {
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try { const r = play.call(this); return r && r.then ? r : Promise.resolve(); } catch (e) { return Promise.reject(e); }
  };
}
// ellipse() op een canvas: met een geschaalde cirkel
if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.ellipse) {
  CanvasRenderingContext2D.prototype.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
    this.save(); this.translate(x, y); this.rotate(rot); this.scale(rx, ry); this.arc(0, 0, 1, a0, a1, !!ccw); this.restore();
  };
}
