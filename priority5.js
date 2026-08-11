/* Priority 5 — Quản gia hướng nội 🐧 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(function () {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Remove the older inline mascot elements. Music player is untouched. */
    ['qghn-mascot', 'qghn-toast'].forEach(function (id) {
      var old = document.getElementById(id);
      if (old) old.remove();
    });
    document.querySelectorAll('.qghn-spark').forEach(function (el) { el.remove(); });

    /* ② Scroll reveal */
    var revealTargets = document.querySelectorAll(
      'main section, section, .card, .live-card, .schedule-card, .highlight-card, .social, .section-head'
    );
    revealTargets.forEach(function (el, index) {
      if (!el.classList.contains('p5-reveal')) el.classList.add('p5-reveal');
      el.style.transitionDelay = Math.min((index % 5) * 55, 220) + 'ms';
    });

    if ('IntersectionObserver' in window && !reduced) {
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

    /* ① Mascot system — one mascot only, bottom-left. */
    var mascot = document.createElement('button');
    mascot.type = 'button';
    mascot.className = 'p5-mascot';
    mascot.setAttribute('aria-label', 'Quản gia hướng nội — mở lời chào');
    mascot.setAttribute('title', 'Quản gia hướng nội 🐧');
    mascot.textContent = '🐧';
    document.body.appendChild(mascot);

    var toast = document.createElement('div');
    toast.className = 'p5-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
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
      showToast(document.body.classList.contains('p5-is-live')
        ? '🔴 Quản gia đang live — vào xem thôi!'
        : '🐧 Quản gia hướng nội đang ở đây.');

      if (reduced) return;
      var rect = mascot.getBoundingClientRect();
      for (var i = 0; i < 5; i++) {
        var particle = document.createElement('span');
        particle.className = 'p5-particle';
        particle.textContent = i % 2 ? '✦' : '🐧';
        particle.style.left = (rect.left + rect.width / 2) + 'px';
        particle.style.top = (rect.top + rect.height / 2) + 'px';
        particle.style.setProperty('--dx', ((Math.random() - .5) * 150) + 'px');
        particle.style.setProperty('--dy', (-45 - Math.random() * 100) + 'px');
        document.body.appendChild(particle);
        setTimeout(function (node) {
          return function () { if (node.isConnected) node.remove(); };
        }(particle), 950);
      }
    });

    /* ③ Live animation — works with current and dynamically rendered live state. */
    function detectLive() {
      var statusNodes = document.querySelectorAll('.live-status, [data-live-status], .live-badge, .live-label');
      var active = false;

      statusNodes.forEach(function (node) {
        var text = (node.textContent || '').trim().toLowerCase();
        var isOffline = node.classList.contains('offline') || text.indexOf('offline') !== -1 || text.indexOf('ngoại tuyến') !== -1;
        var isLive = !isOffline && (
          text.indexOf('đang live') !== -1 ||
          text.indexOf('live now') !== -1 ||
          text === 'live' ||
          text.indexOf('đang phát') !== -1
        );
        if (isLive) {
          active = true;
          node.classList.add('p5-live-dot');
          var container = node.closest('.live-card, .card, section');
          if (container) container.classList.add('p5-live-active');
        } else {
          node.classList.remove('p5-live-dot');
        }
      });

      var liveCards = document.querySelectorAll('.live-card');
      liveCards.forEach(function (card) {
        var text = (card.textContent || '').toLowerCase();
        var isLive = !card.querySelector('.offline') && (
          text.indexOf('đang live') !== -1 || text.indexOf('live now') !== -1
        );
        card.classList.toggle('p5-live-active', isLive);
        if (isLive) active = true;
      });

      document.body.classList.toggle('p5-is-live', active);
      mascot.classList.toggle('p5-live', active);
    }

    detectLive();
    if ('MutationObserver' in window) {
      var mutationTimer;
      var liveObserver = new MutationObserver(function () {
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(detectLive, 120);
      });
      liveObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    }

    /* ④ Easter egg — five clicks on the main name within 1.6 seconds. */
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
      overlay.innerHTML = '<div class="p5-easter-box" role="dialog" aria-modal="true" aria-label="Easter egg"><span class="p5-easter-penguin">🐧</span><strong>Bạn đã tìm thấy Quản gia!</strong><small>Chúc bạn một ngày thật chill ✦</small><button class="p5-easter-close" type="button">Đóng</button></div>';
      document.body.appendChild(overlay);

      var close = function () {
        overlay.classList.remove('p5-show');
        setTimeout(function () { if (overlay.isConnected) overlay.remove(); }, 220);
      };
      overlay.addEventListener('click', function (event) {
        if (event.target === overlay || event.target.closest('.p5-easter-close')) close();
      });
      document.addEventListener('keydown', function onKey(event) {
        if (event.key === 'Escape') {
          close();
          document.removeEventListener('keydown', onKey);
        }
      }, { once: true });

      setTimeout(function () {
        if (overlay.isConnected) close();
      }, 4200);
    }
  });
})();
