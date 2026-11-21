// Start van de Windows 10 Mobile-versie, gewone ES5 in wp.html (werkt ook als game.js niet wil).
// Fouten komen op het scherm, en elke opstartstap gaat naar localStorage: crasht de app hard, dan
// staat bij de volgende start waar hij bleef steken.
(function () {
  var stappen = [], vorige = null;
  try { vorige = localStorage.getItem('wpBoot'); } catch (e) {}
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
  window.__wpStap = function (s) {
    stappen.push(s);
    try { localStorage.setItem('wpBoot', s); } catch (e) {}
  };
  window.__wpFout = function (e) {
    var m = e && (e.stack || e.message) || String(e);
    toon('Fout (' + stappen[stappen.length - 1] + '): ' + m);
  };
  window.onerror = function (msg, bron, regel, kol, e) {
    toon('Fout (' + stappen[stappen.length - 1] + '): ' + ((e && e.stack) || msg) + (bron ? '\n  ' + bron + ':' + regel + ':' + kol : ''));
  };
  window.addEventListener('unhandledrejection', function (ev) { window.__wpFout(ev.reason); });
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
      requestAnimationFrame(function () { requestAnimationFrame(function () { window.__wpStap('klaar'); }); });
    }, 30);
  }
  var t = setTimeout(function () { img.onload = img.onerror = null; start(); }, 2500);
  img.onload = img.onerror = function () { clearTimeout(t); start(); };
  img.src = 'img/iconen.png';
  document.addEventListener('DOMContentLoaded', function () {
    window.__wpStap('script geladen');
    if (vorige && vorige !== 'klaar') toon('Vorige keer gestopt bij: ' + vorige + ' (tik om te sluiten)');
    start();
  });
})();
