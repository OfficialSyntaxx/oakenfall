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
  var vit = document.getElementById('vitals');
  if(vit){
    var now = new Date();
    var m = now.getMonth();
    var season = ['Winter','Winter','Spring','Spring','Spring','Summer','Summer','Summer','Autumn','Autumn','Autumn','Winter'][m];
    var doy = Math.floor((now - new Date(now.getFullYear(),0,0)) / 864e5);
    var moods = ['thriving','content','weathering the season','singing in the tavern','minding the walls'];
    var weathers = { Winter:['Snow on the roofs','Iron-cold and clear','Hearths burning low'],
      Spring:['Rain over the fields','Mild winds','Mud on the roads'],
      Summer:['Warm and dry','Long golden evenings','Bees in the orchard'],
      Autumn:['Mist off the river','Leaves on the wind','Harvest carts rolling'] };
    var w = weathers[season][doy % 3];
    vit.innerHTML = 'Season: <b>'+season+'</b> · Day <b>'+((doy % 28)+1)+'</b> · '+w+' · Villagers <b>'+moods[doy % moods.length]+'</b>';
  }

  /* ----- Play page: loader + header tuck ----- */
  var frame = document.getElementById('gameFrame');
  if(frame){
    var loader = document.getElementById('playLoading');
    frame.addEventListener('load', function(){
      if(loader) setTimeout(function(){ loader.classList.add('done'); }, 400);
    });
    // Tuck the header after a few seconds so the game gets the full screen;
    // tap the very top edge to bring it back.
    var header = document.getElementById('siteHeader');
    var tuckTimer = setTimeout(function(){ header.classList.add('tucked'); }, 4000);
    document.addEventListener('pointerdown', function(e){
      if(e.clientY < 24 && header.classList.contains('tucked')){
        header.classList.remove('tucked');
        clearTimeout(tuckTimer);
        tuckTimer = setTimeout(function(){ header.classList.add('tucked'); }, 5000);
      }
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
})();
