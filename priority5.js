/* Priority 5 — Quản gia hướng nội 🐧
   Add to index.html with:
   <script src="priority5.js" defer></script>
*/
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(function () {
    /* Scroll reveal */
    var revealTargets = document.querySelectorAll('section, .card, .live-card, .schedule-card, .highlight-card, .social, .section-head');
    revealTargets.forEach(function (el, index) {
      if (el.classList.contains('p5-reveal')) return;
      el.classList.add('p5-reveal');
      el.style.transitionDelay = Math.min((index % 5) * 55, 220) + 'ms';
    });

    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var observer = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('p5-visible');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
      revealTargets.forEach(function (el) { observer.observe(el); });
    } else {
      revealTargets.forEach(function (el) { el.classList.add('p5-visible'); });
    }

    /* Mascot */
    var mascot = document.createElement('button');
    mascot.type = 'button';
    mascot.className = 'p5-mascot';
    mascot.setAttribute('aria-label', 'Quản gia hướng nội');
    mascot.textContent = '🐧';
    document.body.appendChild(mascot);

    var toast = document.createElement('div');
    toast.className = 'p5-toast';
    document.body.appendChild(toast);

    var toastTimer;
    function showToast(message) {
      toast.textContent = message;
      toast.classList.add('p5-show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove('p5-show'); }, 2600);
    }

    mascot.addEventListener('click', function () {
      mascot.classList.remove('p5-pop');
      void mascot.offsetWidth;
      mascot.classList.add('p5-pop');
      showToast('🐧 Quản gia hướng nội đang ở đây.');

      for (var i = 0; i < 5; i++) {
        var particle = document.createElement('span');
        particle.className = 'p5-particle';
        particle.textContent = i % 2 ? '✦' : '🐧';
        particle.style.left = (mascot.getBoundingClientRect().left + 18) + 'px';
        particle.style.top = (mascot.getBoundingClientRect().top + 18) + 'px';
        particle.style.setProperty('--dx', ((Math.random() - .5) * 150) + 'px');
        particle.style.setProperty('--dy', (-45 - Math.random() * 100) + 'px');
        document.body.appendChild(particle);
        setTimeout(function (node) { return function () { node.remove(); }; }(particle), 950);
      }
    });

    /* Live visual enhancement: detect common live indicators */
    var liveText = Array.prototype.slice.call(document.querySelectorAll('body *')).find(function (el) {
      var text = (el.textContent || '').trim().toLowerCase();
      return text === 'đang live' || text === 'live now';
    });
    if (liveText) {
      liveText.classList.add('p5-live-dot');
      var liveContainer = liveText.closest('.live-card, .card, section');
      if (liveContainer) liveContainer.classList.add('p5-live-active');
    }

    /* Easter egg: click the main hero name five times */
    var heroName = document.querySelector('h1');
    var clicks = 0;
    var clickTimer;
    if (heroName) {
      heroName.style.cursor = 'pointer';
      heroName.setAttribute('title', '🐧');
      heroName.addEventListener('click', function () {
        clicks++;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(function () { clicks = 0; }, 1600);
        if (clicks >= 5) {
          clicks = 0;
          showEasterEgg();
        }
      });
    }

    function showEasterEgg() {
      var overlay = document.createElement('div');
      overlay.className = 'p5-easter p5-show';
      overlay.innerHTML = '<div class="p5-easter-box"><span class="p5-easter-penguin">🐧</span><strong>Bạn đã tìm thấy Quản gia!</strong><small>Chúc bạn một ngày thật chill ✦</small></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function () { overlay.classList.remove('p5-show'); setTimeout(function () { overlay.remove(); }, 220); });
      setTimeout(function () { if (overlay.isConnected) overlay.classList.remove('p5-show'); setTimeout(function () { if (overlay.isConnected) overlay.remove(); }, 220); }, 4200);
    }
  });
})();
