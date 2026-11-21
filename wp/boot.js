// Start van de Windows 10 Mobile-versie, gewone ES5 in wp.html (werkt ook als game.js niet wil).
// Fouten komen op het scherm, en elke opstartstap gaat naar localStorage: crasht de app hard, dan
// staat bij de volgende start waar hij bleef steken.
(function () {
  var stappen = [], vorige = null, log = [], t0 = Date.now();
  try { vorige = localStorage.getItem('wpBoot'); log = JSON.parse(localStorage.getItem('wpLog') || '[]'); } catch (e) {}
  var vorigLog = log.slice();
  log = [];
  function toon(tekst) {
    var d = document.getElementById('wpFout');
    if (!d) {
      if (!document.body) return;
      d = document.createElement('pre');
      d.id = 'wpFout';
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:50%;overflow:auto;margin:0;padding:8px;z-index:99999;background:rgba(160,0,0,.92);color:#fff;font:12px/1.3 monospace;white-space:pre-wrap;word-break:break-all';
      d.onclick = function () { d.parentNode.removeChild(d); };
      document.body.appendChild(d);
    }
    d.textContent += tekst + '\n';
  }
  // stap = waar we nu zijn; de laatste 40 met de tijd erbij gaan naar wpLog
  window.__wpStap = function (s) {
    stappen.push(s);
    if (stappen.length > 50) stappen.shift();
    log.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + s);
    if (log.length > 40) log.shift();
    try { localStorage.setItem('wpBoot', s); localStorage.setItem('wpLog', JSON.stringify(log)); } catch (e) {}
  };
  window.__wpFout = function (e) {
    var m = e && (e.stack || e.message) || String(e);
    toon('Fout (' + stappen[stappen.length - 1] + '): ' + m);
  };
  window.onerror = function (msg, bron, regel, kol, e) {
    toon('Fout (' + stappen[stappen.length - 1] + '): ' + ((e && e.stack) || msg) + (bron ? '\n  ' + bron + ':' + regel + ':' + kol : ''));
  };
  window.addEventListener('unhandledrejection', function (ev) { window.__wpFout(ev.reason); });
  // ook naar de server (alleen in de worker-log te zien), in porties: zo is het log er ook als de app hard crasht
  var sessie = Math.random().toString(36).slice(2, 8), wacht = [], bezig = false;
  function stuur() {
    if (bezig || !wacht.length) return;
    var x = new XMLHttpRequest(), deel = wacht.splice(0, wacht.length);
    bezig = true;
    try {
      x.open('POST', '/api/wplog', true);
      x.setRequestHeader('content-type', 'text/plain');
      x.onloadend = function () { bezig = false; };
      x.send(sessie + ' ' + deel.join(' | '));
    } catch (e) { bezig = false; }
  }
  setInterval(stuur, 700);
  var stap = window.__wpStap;
  window.__wpStap = function (s) { stap(s); if (wacht.length < 200) wacht.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + s); };
  var fout = window.__wpFout;
  window.__wpFout = function (e) { fout(e); wacht.push('FOUT ' + ((e && (e.stack || e.message)) || String(e)).slice(0, 600)); stuur(); };
  var onerr = window.onerror;
  window.onerror = function (msg, bron, regel, kol, e) { onerr(msg, bron, regel, kol, e); wacht.push('FOUT ' + String((e && e.stack) || msg).slice(0, 600) + ' @' + regel + ':' + kol); stuur(); };
  wacht.push('start ' + navigator.userAgent + ' ' + screen.width + 'x' + screen.height + ' dpr ' + window.devicePixelRatio + (vorige && vorige !== 'gesloten' ? ' | VORIGE KEER GESTOPT BIJ: ' + vorige + ' || ' + vorigLog.join(' | ') : ''));
  window.__wpStap('html');

  var img = new Image(), klaar = 0;
  window.__wpIconen = img;
  function start() {
    if (++klaar < 2) return;
    if (!window.__wpGame) { toon('game.js is niet geladen (laatste stap: ' + stappen[stappen.length - 1] + ')'); return; }
    window.__wpStap('game start');
    // eerst het splashscherm laten tekenen, dan pas het zware werk
    setTimeout(function () {
      try { window.__wpGame(); } catch (e) { window.__wpFout(e); return; }
      window.__wpStap('game opgezet');
      // netjes weggezet of afgesloten telt niet als crash
      document.addEventListener('visibilitychange', function () { window.__wpStap(document.hidden ? 'gesloten' : 'terug'); });
    }, 30);
  }
  // lettertypen: EdgeHTML 13 heeft geen document.fonts, dus meten we tot de tekst breder of smaller wordt dan de
  // terugval (anders tekent de game borden en texturen met het verkeerde lettertype); hooguit 3 s
  klaar--;
  function fontsKlaar() {
    var c = document.createElement('canvas').getContext('2d'), fonts = ['40px Anton', '700 16px "Barlow J"'], t1 = Date.now();
    var maat = function (f) { c.font = f; return c.measureText('Jens Run 0123 WMQ').width; };
    var basis = fonts.map(function (f) { return maat(f.replace(/(Anton|"Barlow J")/, 'monospace')); });
    // de lettertypen gaan pas laden als iets op de pagina ze gebruikt
    var s = document.createElement('div');
    s.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
    s.innerHTML = '<span style="font-family:Anton">a</span><span style="font-family:\'Barlow J\';font-weight:700">a</span>';
    document.body.appendChild(s);
    (function kijk() {
      var ok = fonts.every(function (f, i) { return maat(f + ', monospace') !== basis[i]; });
      if (ok || Date.now() - t1 > 3000) { s.parentNode.removeChild(s); window.__wpStap(ok ? 'lettertypen' : 'lettertypen (te laat)'); start(); }
      else setTimeout(kijk, 50);
    })();
  }
  var t = setTimeout(function () { img.onload = img.onerror = null; start(); }, 2500);
  img.onload = img.onerror = function () { clearTimeout(t); start(); };
  img.src = 'img/iconen.png';
  document.addEventListener('DOMContentLoaded', function () {
    window.__wpStap('script geladen');
    if (vorige && vorige !== 'klaar' && vorige !== 'gesloten') toon('Vorige keer gestopt bij: ' + vorige + ' (tik om te sluiten)\n' + vorigLog.join('\n'));
    start();
    fontsKlaar();
  });
})();
