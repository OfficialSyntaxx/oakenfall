/* Oakenfall site JS — vanilla, small, mobile-first. */
(function(){
  'use strict';
  var doc = document.documentElement;

  /* ----- Day/night keyed to visitor's local clock, manual override ----- */
  function autoTod(){
    var h = new Date().getHours();
    return (h >= 7 && h < 19) ? 'day' : 'night';
  }
  var stored = null;
  try{ stored = sessionStorage.getItem('oakenfall-tod'); }catch(e){}
  doc.setAttribute('data-tod', stored || autoTod());
  var todBtn = document.getElementById('todToggle');
  if(todBtn) todBtn.addEventListener('click', function(){
    var next = doc.getAttribute('data-tod') === 'night' ? 'day' : 'night';
    doc.setAttribute('data-tod', next);
    try{ sessionStorage.setItem('oakenfall-tod', next); }catch(e){}
  });

  /* ----- Active nav plank ----- */
  var slug = (document.body.className.match(/page-([a-z]+)/)||[])[1] || 'home';
  document.querySelectorAll('[data-nav="'+slug+'"]').forEach(function(a){
    a.setAttribute('aria-current','page');
  });

  /* ----- Mobile bottom sheet ----- */
  var sheet = document.getElementById('mobileSheet');
  var scrim = document.getElementById('sheetScrim');
  var menuBtn = document.getElementById('menuToggle');
  function setSheet(open){
    if(!sheet) return;
    if(open){ sheet.hidden = false; scrim.hidden = false;
      requestAnimationFrame(function(){ sheet.classList.add('open'); scrim.classList.add('open'); });
    } else {
      sheet.classList.remove('open'); scrim.classList.remove('open');
      setTimeout(function(){ sheet.hidden = true; scrim.hidden = true; }, 300);
    }
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  if(menuBtn) menuBtn.addEventListener('click', function(){ setSheet(!sheet.classList.contains('open')); });
  if(scrim) scrim.addEventListener('click', function(){ setSheet(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') setSheet(false); });

  /* ----- Scroll-assembly (tiles rise & settle) ----- */
  var toAssemble = document.querySelectorAll('.assemble');
  if('IntersectionObserver' in window && toAssemble.length){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ en.target.classList.add('settled'); io.unobserve(en.target); }
      });
    }, { rootMargin:'0px 0px -8% 0px' });
    toAssemble.forEach(function(el){ io.observe(el); });
  } else {
    toAssemble.forEach(function(el){ el.classList.add('settled'); });
  }

  /* ----- Vitals strip (flavor, seeded from the real date) ----- */
  var now = new Date();
  var seasonIdx = now.getMonth();
  var season = ['Winter','Winter','Spring','Spring','Spring','Summer','Summer','Summer','Autumn','Autumn','Autumn','Winter'][seasonIdx];
  var doy = Math.floor((now - new Date(now.getFullYear(),0,0)) / 864e5);
  var weathers = { Winter:['Snow on the roofs','Iron-cold and clear','Hearths burning low'],
    Spring:['Rain over the fields','Mild winds','Mud on the roads'],
    Summer:['Warm and dry','Long golden evenings','Bees in the orchard'],
    Autumn:['Mist off the river','Leaves on the wind','Harvest carts rolling'] };
  var vitalsWeather = weathers[season][doy % 3];
  var vit = document.getElementById('vitals');
  var heldSave = null;
  try{ heldSave = JSON.parse(localStorage.getItem('oakenfall-save')); }catch(e){}
  if(vit){
    if(heldSave && heldSave.dayCount){
      // The visitor has a real hold — show ITS state, not flavor text
      vit.innerHTML = 'Your hold stands at Day <b>'+heldSave.dayCount+'</b> · <b>'+
        ((heldSave.villagers&&heldSave.villagers.length)||0)+'</b> settlers · '+vitalsWeather;
      var gateBtn = document.querySelector('.btn-gate');
      if(gateBtn) gateBtn.innerHTML = '⚔ &nbsp;Return to your village';
    } else {
      var moods = ['thriving','content','weathering the season','singing in the tavern','minding the walls'];
      vit.innerHTML = 'Season: <b>'+season+'</b> · Day <b>'+((doy % 28)+1)+'</b> · '+vitalsWeather+' · Villagers <b>'+moods[doy % moods.length]+'</b>';
    }
  }

  /* ----- "New since your last visit" banner ----- */
  try{
    var latest = window.OAKENFALL_LATEST;
    var lastSeen = localStorage.getItem('oakenfall-last-ver');
    if(latest && lastSeen && lastSeen !== latest.ver && document.querySelector('.hero')){
      var nb = document.createElement('div');
      nb.className = 'newsince';
      nb.innerHTML = '<b>📜 New since your last visit — v'+latest.ver+'</b><span>'+latest.notes+'</span>'+
        '<a href="/chronicle/">Read the Chronicle →</a><button aria-label="Dismiss">✕</button>';
      document.body.appendChild(nb);
      nb.querySelector('button').addEventListener('click', function(){ nb.remove(); });
    }
    if(latest) localStorage.setItem('oakenfall-last-ver', latest.ver);
  }catch(e){}

  /* ----- Seasonal foliage on the hero scene ----- */
  doc.setAttribute('data-season', season);

  /* ----- Play page: loader + header tuck ----- */
  var frame = document.getElementById('gameFrame');
  if(frame){
    var loader = document.getElementById('playLoading');
    frame.addEventListener('load', function(){
      if(loader) setTimeout(function(){ loader.classList.add('done'); }, 400);
    });
    // Tuck the header after a few seconds so the game gets the full screen.
    // A small floating tab brings it back (a top-edge tap zone fought the
    // iOS Safari URL-bar gesture).
    var header = document.getElementById('siteHeader');
    var tab = document.createElement('button');
    tab.className = 'header-tab'; tab.textContent = '⌄'; tab.setAttribute('aria-label','Show site header');
    document.body.appendChild(tab);
    var tuckTimer = setTimeout(function(){ header.classList.add('tucked'); tab.classList.add('show'); }, 4000);
    tab.addEventListener('click', function(){
      header.classList.remove('tucked'); tab.classList.remove('show');
      clearTimeout(tuckTimer);
      tuckTimer = setTimeout(function(){ header.classList.add('tucked'); tab.classList.add('show'); }, 5000);
    });
  }

  /* ----- Tavern forms → existing Netlify feedback function ----- */
  document.querySelectorAll('form[data-kind]').forEach(function(form){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var status = form.querySelector('.form-status');
      var title = form.querySelector('[name="title"]').value.trim();
      var body = form.querySelector('[name="body"]').value.trim();
      if(!title || !body){ status.textContent = 'Both fields are needed, traveler.'; status.className = 'form-status err'; return; }
      btn.disabled = true; status.textContent = 'Sending the courier…'; status.className = 'form-status';
      fetch('/.netlify/functions/submit-feedback', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ kind: form.dataset.kind, title: title, body: body + '\n\n---\nFiled from the Oakenfall website tavern.' })
      }).then(function(r){ return r.ok ? r.json() : Promise.reject(r); })
      .then(function(){
        status.textContent = 'Nailed to the board. The masons will read it — thank you!';
        status.className = 'form-status ok'; form.reset();
      }).catch(function(){
        status.innerHTML = 'The courier was waylaid. You can post it yourself at the <a href="https://github.com/OfficialSyntaxx/oakenfall/issues" rel="noopener">Mason’s Ledger</a>.';
        status.className = 'form-status err';
      }).finally(function(){ btn.disabled = false; });
    });
  });
  /* ----- Almanac mini-diorama: tappable canvas hold ----- */
  var dio = document.getElementById('diorama');
  if(dio){
    var cap = document.getElementById('dioramaCaption');
    var TW = 64, TH = 32, N = 8;
    var night = function(){ return doc.getAttribute('data-tod') === 'night'; };
    // grid coords (gx,gy), building entries
    var BUILDINGS = [
      { gx:3, gy:3, kind:'townhall', name:'Town Center', text:'The heart of the hold. Villagers gather here, and every hold tier is proclaimed from its steps.' },
      { gx:5, gy:2, kind:'house', name:'House', text:'Shelter for a family. Warm villagers are happy villagers — and happy villagers stay.' },
      { gx:2, gy:5, kind:'house', name:'House', text:'Shelter for a family. Warm villagers are happy villagers — and happy villagers stay.' },
      { gx:5, gy:5, kind:'tavern', name:'Tavern', text:'Ale, song, and courtship. The single best cure for a hold with sagging morale.' },
      { gx:1, gy:2, kind:'tower', name:'Watchtower', text:'Eyes on the treeline. Guards posted here blunt bandit raids before they reach the granary.' },
      { gx:6, gy:6, kind:'granary', name:'Granary', text:'Raises your storage caps. A full granary in autumn is the whole game, honestly.' },
      { gx:2, gy:1, kind:'oak', name:'The Ancient Oak', text:'Older than the hold, older than the road. Research grows along its nine great branches.' },
      { gx:6, gy:4, kind:'farm', name:'Farm', text:'Sown in spring, tended all summer, raced against the first frost at harvest.' },
      { gx:0, gy:4, kind:'bridge', name:'Bridge', text:'A plank span over the river. Opens the far bank — but every bridge is a door raiders can use. Post a guard to watch it.' }
    ];
    var isRiver = function(gx, gy){ return gx === 0; };
    var iso = function(gx, gy){ return { x:(gx - gy) * TW/2, y:(gx + gy) * TH/2 }; };
    var ctx2, W, H, OX, OY, DPR;

    function sizeDio(){
      var cssW = dio.parentElement.clientWidth;
      var cssH = Math.round(cssW * 0.62);
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(cssW * DPR); H = Math.round(cssH * DPR);
      if(dio.width === W && dio.height === H) return; // resize-loop guard, as in the game
      dio.width = W; dio.height = H;
      dio.style.height = cssH + 'px';
      TW = Math.max(40, Math.floor(cssW / 9)) ; TH = TW/2;
      OX = cssW/2; OY = (cssH - N*TH)/2 + TH/2;
      drawDio();
    }
    function tilePath(c, x, y){
      c.beginPath(); c.moveTo(x, y - TH/2); c.lineTo(x + TW/2, y); c.lineTo(x, y + TH/2); c.lineTo(x - TW/2, y); c.closePath();
    }
    function shade(c, col, x, y, h, amt){
      var g = c.createLinearGradient(x, y - h, x, y + TH/2);
      g.addColorStop(0, col); g.addColorStop(1, darken(col, amt));
      return g;
    }
    function darken(hex, f){
      var n = parseInt(hex.slice(1), 16);
      var r = Math.round(((n>>16)&255)*f), g2 = Math.round(((n>>8)&255)*f), b2 = Math.round((n&255)*f);
      return 'rgb(' + r + ',' + g2 + ',' + b2 + ')';
    }
    function box(c, x, y, h, top, left, right){
      c.fillStyle = 'rgba(8,6,3,.45)';
      c.beginPath(); c.ellipse(x, y + TH*0.22, TW*0.52, TH*0.4, 0, 0, 7); c.fill();
      c.fillStyle = shade(c, left, x, y, h, 0.55); c.beginPath(); c.moveTo(x - TW/2, y); c.lineTo(x, y + TH/2); c.lineTo(x, y + TH/2 - h); c.lineTo(x - TW/2, y - h); c.closePath(); c.fill();
      c.fillStyle = shade(c, right, x, y, h, 0.5); c.beginPath(); c.moveTo(x + TW/2, y); c.lineTo(x, y + TH/2); c.lineTo(x, y + TH/2 - h); c.lineTo(x + TW/2, y - h); c.closePath(); c.fill();
      c.save(); c.translate(0, -h); c.fillStyle = top; tilePath(c, x, y); c.fill();
      c.strokeStyle = 'rgba(255,240,200,.12)'; c.lineWidth = 1; c.stroke(); c.restore();
    }
    function roof(c, x, y, h, colL, colR){
      var peak = y - h - TH * 0.9;
      var gl = c.createLinearGradient(x, peak, x, y + TH/2 - h);
      gl.addColorStop(0, colL); gl.addColorStop(1, darken(colL, 0.55));
      var gr = c.createLinearGradient(x, peak, x, y + TH/2 - h);
      gr.addColorStop(0, colR); gr.addColorStop(1, darken(colR, 0.5));
      c.fillStyle = gl; c.beginPath(); c.moveTo(x - TW/2, y - h); c.lineTo(x, peak); c.lineTo(x, y + TH/2 - h); c.closePath(); c.fill();
      c.fillStyle = gr; c.beginPath(); c.moveTo(x + TW/2, y - h); c.lineTo(x, peak); c.lineTo(x, y + TH/2 - h); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,240,200,.14)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x - TW/2, y - h); c.lineTo(x, peak); c.lineTo(x + TW/2, y - h); c.stroke();
    }
    function windowGlow(c, x, y){
      if(!night()) return;
      c.fillStyle = '#e8a13c'; c.fillRect(x - 3, y, 6, 8);
    }
    function drawDio(){
      ctx2 = dio.getContext('2d');
      var c = ctx2;
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.clearRect(0, 0, W, H);
      var nt = night();
      // ground tiles
      for(var gy=0; gy<N; gy++) for(var gx=0; gx<N; gx++){
        var p = iso(gx, gy), x = OX + p.x, y = OY + p.y;
        var road = (gy === 4 && gx < 6 && gx > 0) || (gx === 3 && gy <= 4);
        var nt2 = night();
        c.fillStyle = isRiver(gx, gy) ? (nt2 ? '#1e2c3a' : '#31506a')
          : road ? (nt2 ? '#3a342a' : '#4a4234')
          : ((gx + gy) % 2 ? (nt2 ? '#232a18' : '#33401f') : (nt2 ? '#1f2515' : '#2e3a1c'));
        tilePath(c, x, y); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; c.stroke();
      }
      // buildings back-to-front
      BUILDINGS.slice().sort(function(a,b){ return (a.gx + a.gy) - (b.gx + b.gy); }).forEach(function(b){
        var p = iso(b.gx, b.gy), x = OX + p.x, y = OY + p.y;
        var sel = b === dioSelected;
        if(sel){ c.save(); c.shadowColor = '#e8a13c'; c.shadowBlur = 18; }
        if(b.kind === 'oak'){
          c.strokeStyle = '#3a2f1d'; c.lineWidth = TW*0.09; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x-2, y-TH*1.2, x, y-TH*1.6); c.stroke();
          c.fillStyle = nt ? '#33422a' : '#42552f';
          c.beginPath(); c.ellipse(x, y - TH*1.9, TW*0.44, TH*0.7, 0, 0, 7); c.fill();
          c.fillStyle = nt ? '#2a3722' : '#374827';
          c.beginPath(); c.ellipse(x - TW*0.22, y - TH*1.6, TW*0.26, TH*0.44, 0, 0, 7); c.fill();
        } else if(b.kind === 'bridge'){
          c.fillStyle = '#5a4429'; tilePath(c, x, y - 2); c.fill();
          c.strokeStyle = 'rgba(30,20,10,.55)'; c.lineWidth = 1;
          for(var pi = -2; pi <= 2; pi++){
            c.beginPath(); c.moveTo(x - TW*0.4, y - 2 + pi*TH*0.14); c.lineTo(x + TW*0.4, y - 2 + pi*TH*0.14); c.stroke();
          }
          c.strokeStyle = '#46351e'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(x - TW*0.36, y - TH*0.36); c.lineTo(x + TW*0.36, y - TH*0.36); c.stroke();
        } else if(b.kind === 'farm'){
          c.save(); c.translate(0, -2); c.fillStyle = nt ? '#4a3d20' : '#6b5827'; tilePath(c, x, y); c.fill(); c.restore();
          c.strokeStyle = nt ? '#5d4c26' : '#8a7233'; c.lineWidth = 1.4;
          for(var i=-2;i<=2;i++){ c.beginPath(); c.moveTo(x + i*TW*0.09 - TW*0.18, y - 4 - i*TH*0.09); c.lineTo(x + i*TW*0.09 + TW*0.18, y - 4 - i*TH*0.09 + TH*0.36*0); c.stroke(); }
        } else if(b.kind === 'tower'){
          box(c, x, y, TH*1.9, '#57503f', '#3a3428', '#2c271e');
          c.fillStyle = '#57503f';
          c.fillRect(x - TW*0.28, y - TH*2.35, TW*0.12, TH*0.35);
          c.fillRect(x - TW*0.06, y - TH*2.35, TW*0.12, TH*0.35);
          c.fillRect(x + TW*0.16, y - TH*2.35, TW*0.12, TH*0.35);
          windowGlow(c, x, y - TH*1.4);
        } else {
          var h = b.kind === 'townhall' ? TH*1.5 : TH*1.05;
          var wood = b.kind === 'tavern';
          box(c, x, y, h, wood ? '#4a3c26' : '#4d4536', wood ? '#382d1c' : '#38322a', wood ? '#2b2216' : '#2a2620');
          roof(c, x, y, h, b.kind === 'townhall' ? '#6a4a2a' : '#553b22', b.kind === 'townhall' ? '#4d3520' : '#3d2a18');
          windowGlow(c, x, y - h*0.45);
          if(b.kind === 'townhall' && nt){ c.fillStyle = '#e8a13c'; c.fillRect(x + TW*0.2 - 3, y - h*0.45, 6, 8); }
        }
        if(sel) c.restore();
      });
    }
    var dioSelected = null;
    function pickBuilding(px, py){
      var best = null, bd = 1e9;
      BUILDINGS.forEach(function(b){
        var p = iso(b.gx, b.gy);
        var dx = px - (OX + p.x), dy = py - (OY + p.y - TH*0.8);
        var d = dx*dx + dy*dy*3;
        if(d < bd){ bd = d; best = b; }
      });
      return bd < (TW*1.1)*(TW*1.1) ? best : null;
    }
    dio.addEventListener('pointerdown', function(e){
      var r = dio.getBoundingClientRect();
      var b = pickBuilding(e.clientX - r.left, e.clientY - r.top);
      dioSelected = b || dioSelected;
      if(b){ cap.innerHTML = '<b>' + b.name + '</b><span>' + b.text + '</span>'; drawDio(); }
    });
    window.addEventListener('resize', sizeDio);
    if(todBtn) todBtn.addEventListener('click', function(){ drawDio(); });
    sizeDio();
  }

  /* ----- Weather overlay, synced to what the vitals strip claims -----
     Snowy vitals line → snow, rainy/misty line → rain, otherwise clear. */
  var hero = document.querySelector('.hero');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var snow = /Snow/.test(vitalsWeather);
  var rainy = /Rain|Mist/.test(vitalsWeather);
  if(hero && !reduced && (snow || rainy)){
    var wc = document.createElement('canvas');
    wc.id = 'weather'; wc.setAttribute('aria-hidden','true');
    document.body.appendChild(wc);
    var wcx = wc.getContext('2d');
    var drops = [];
    for(var i=0;i<(snow?70:110);i++) drops.push({ x:Math.random(), y:Math.random(), s:.4+Math.random()*.6 });
    function wsize(){ wc.width = innerWidth; wc.height = innerHeight; }
    wsize(); window.addEventListener('resize', wsize);
    (function wtick(){
      if(document.hidden){ requestAnimationFrame(wtick); return; }
      wcx.clearRect(0,0,wc.width,wc.height);
      drops.forEach(function(d){
        var x = d.x*wc.width, y = d.y*wc.height;
        if(snow){
          wcx.fillStyle = 'rgba(216,220,228,'+(0.25+d.s*0.3)+')';
          wcx.beginPath(); wcx.arc(x, y, 1.2+d.s*1.6, 0, 7); wcx.fill();
          d.y += 0.0009*d.s; d.x += Math.sin(y*0.01)*0.0002;
        } else {
          wcx.strokeStyle = 'rgba(143,165,196,'+(0.12+d.s*0.18)+')';
          wcx.lineWidth = 1;
          wcx.beginPath(); wcx.moveTo(x, y); wcx.lineTo(x-3*d.s, y+12*d.s); wcx.stroke();
          d.y += 0.012*d.s; d.x -= 0.0004*d.s;
        }
        if(d.y > 1){ d.y = -0.02; d.x = Math.random(); }
        if(d.x < 0) d.x = 1;
      });
      requestAnimationFrame(wtick);
    })();
  }

  /* ----- Hero scene: parallax, celestial position, shooting stars ----- */
  if(hero && !reduced){
    // Parallax: layers drift at different rates against scroll (and tilt on
    // mobile). data-par is the layer's rate; transform is set directly.
    var parEls = [].slice.call(hero.querySelectorAll('.par'));
    var tiltX = 0;
    function applyPar(){
      var sy = window.scrollY || 0;
      if(sy > window.innerHeight) return;
      parEls.forEach(function(el){
        var f = parseFloat(el.dataset.par) || 0.1;
        el.style.transform = 'translate(' + (tiltX * f * 40).toFixed(1) + 'px,' + (sy * f).toFixed(1) + 'px)';
      });
    }
    window.addEventListener('scroll', applyPar, { passive:true });
    window.addEventListener('deviceorientation', function(e){
      if(e.gamma == null) return;
      tiltX = Math.max(-1, Math.min(1, e.gamma / 30));
      applyPar();
    }, { passive:true });
    applyPar();

    // Sun and moon ride an arc across the sky based on the local clock:
    // sun 7:00→19:00, moon 19:00→7:00, low at the edges, high at midpoint.
    function placeCelestials(){
      var h = new Date().getHours() + new Date().getMinutes()/60;
      var isNight = doc.getAttribute('data-tod') === 'night';
      var t = isNight ? ((h >= 19 ? h - 19 : h + 5) / 12) : Math.max(0, Math.min(1, (h - 7) / 12));
      hero.querySelectorAll('.celest').forEach(function(g){
        var base = parseFloat(g.dataset.base), w = parseFloat(g.dataset.width);
        var want = w * (0.16 + 0.68 * t);
        var dy = (1 - Math.sin(Math.PI * t)) * 60;
        g.style.transform = 'translate(' + (want - base).toFixed(0) + 'px,' + dy.toFixed(0) + 'px)';
      });
    }
    placeCelestials();
    setInterval(placeCelestials, 60000);
    if(todBtn) todBtn.addEventListener('click', placeCelestials);

    // Shooting star: a rare streak across the night sky (every 25–55s).
    function shoot(){
      if(doc.getAttribute('data-tod') === 'night' && !document.hidden){
        var s = document.createElement('div');
        s.className = 'star-streak';
        s.style.top = (5 + Math.random() * 25) + '%';
        s.style.left = (10 + Math.random() * 55) + '%';
        hero.appendChild(s);
        setTimeout(function(){ s.remove(); }, 1200);
      }
      setTimeout(shoot, 25000 + Math.random() * 30000);
    }
    setTimeout(shoot, 8000 + Math.random() * 15000);
  }

  /* ----- Lantern cursor (desktop, night only) ----- */
  if(matchMedia('(pointer:fine)').matches && !reduced){
    var lant = document.createElement('div');
    lant.className = 'lantern'; lant.setAttribute('aria-hidden','true');
    document.body.appendChild(lant);
    var lx = 0, ly = 0, shown = false;
    document.addEventListener('pointermove', function(e){
      lx = e.clientX; ly = e.clientY;
      if(!shown){ shown = true; lant.classList.add('lit'); }
      lant.style.transform = 'translate(' + lx + 'px,' + ly + 'px)';
    }, { passive:true });
  }
})();
