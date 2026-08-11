/* Priority 8 — Discord Live Control
 * Uses the same Cloudflare Worker URL + admin session already used by admin.html.
 * The Worker must expose POST /api/live and proxy the request to the Discord bot
 * with its own WEBHOOK_SECRET. Never put the Discord bot token in this file.
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function boot() {
    if (!$('app') || document.getElementById('discord')) return;

    const nav = document.querySelector('.nav');
    const saveBar = document.querySelector('.save');
    if (!nav) return;

    const navButton = document.createElement('button');
    navButton.dataset.tab = 'discord';
    navButton.textContent = '🤖 Discord';
    nav.appendChild(navButton);

    const tab = document.createElement('div');
    tab.id = 'discord';
    tab.className = 'tab';
    tab.hidden = true;
    tab.innerHTML = `
      <section class="card section">
        <div class="section-title">
          <div><h2>🤖 Discord Live Control</h2><p class="muted">Điều khiển thông báo livestream từ Admin mà không đưa Discord Bot Token lên trình duyệt.</p></div>
          <span id="discordStatusPill" class="pill">UNKNOWN</span>
        </div>
        <div class="grid">
          <label class="switch wide"><input id="discordNotifyEnabled" type="checkbox" checked><span><b>Bật thông báo Discord</b><br><small class="muted">Khi bật, thao tác LIVE bên dưới sẽ gửi/cập nhật notification Discord.</small></span></label>
          <div class="field"><label>Game</label><input id="discordGame" placeholder="Wuthering Waves"></div>
          <div class="field"><label>Tiêu đề Live</label><input id="discordTitle" placeholder="Farm echo cùng mọi người 🐧"></div>
          <div class="field wide"><label>Link livestream</label><input id="discordUrl" type="url" placeholder="https://www.tiktok.com/@quangiahuongnoi/live"></div>
          <div class="field"><label>Nền tảng</label><input id="discordPlatform" value="TikTok"></div>
        </div>
        <div class="actions" style="margin-top:14px">
          <button class="btn" id="discordStart">🔴 Bắt đầu Live</button>
          <button class="btn danger" id="discordStop">⚫ Kết thúc Live</button>
          <button class="btn secondary" id="discordHealth">↻ Kiểm tra Bot</button>
        </div>
        <div id="discordStatus" class="status"></div>
      </section>
      <section class="card section">
        <div class="section-title"><h2>Luồng hoạt động</h2></div>
        <div class="item">
          <div class="item-head"><b>Admin</b><span>→</span><b>Cloudflare Worker</b><span>→</span><b>Discord Bot</b></div>
          <small class="muted">Admin chỉ gửi session token. Worker giữ secret và chuyển tiếp tới bot.</small>
        </div>
      </section>`;

    const main = document.querySelector('.main');
    const discordTab = document.getElementById('settings');
    if (discordTab) main.insertBefore(tab, discordTab);
    else main.appendChild(tab);

    const titles = window.__qghnAdminTitles || {};
    titles.discord = ['Discord', 'Điều khiển thông báo livestream Discord.'];
    window.__qghnAdminTitles = titles;

    function status(text, type = '') {
      const el = $('discordStatus');
      if (!el) return;
      el.textContent = text;
      el.className = 'status ' + type;
    }

    function workerUrl() {
      return String(localStorage.getItem('adminWorkerUrl') || '').trim().replace(/\/+$/, '');
    }

    function session() {
      return sessionStorage.getItem('adminSession') || '';
    }

    async function callLive(live) {
      const api = workerUrl();
      const token = session();
      if (!api || !token) throw new Error('Phiên Admin chưa sẵn sàng. Hãy đăng nhập lại.');
      const payload = live ? {
        live: true,
        game: $('discordGame').value.trim(),
        title: $('discordTitle').value.trim(),
        url: $('discordUrl').value.trim(),
        platform: $('discordPlatform').value.trim() || 'TikTok'
      } : { live: false };
      if (live && !payload.game) throw new Error('Vui lòng nhập tên game.');
      const response = await fetch(api + '/api/live', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
        body: JSON.stringify(payload)
      });
      let data = {};
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(data.error || `Worker trả về HTTP ${response.status}`);
      return data;
    }

    async function health() {
      const api = workerUrl();
      if (!api) throw new Error('Chưa có Worker URL.');
      const response = await fetch(api + '/health', {headers: session() ? {'Authorization': 'Bearer ' + session()} : {}});
      let data = {};
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    }

    $('discordStart').onclick = async () => {
      if (!$('discordNotifyEnabled').checked) return status('Thông báo Discord đang tắt.', 'err');
      $('discordStart').disabled = true;
      status('Đang gửi thông báo LIVE lên Discord...');
      try {
        const data = await callLive(true);
        status(data.changed === false ? 'Discord đã ở trạng thái LIVE.' : '🔴 Đã gửi thông báo LIVE lên Discord.', 'ok');
        $('discordStatusPill').textContent = 'LIVE';
        $('discordStatusPill').className = 'pill live';
      } catch (error) {
        status(error.message, 'err');
      } finally { $('discordStart').disabled = false; }
    };

    $('discordStop').onclick = async () => {
      if (!$('discordNotifyEnabled').checked) return status('Thông báo Discord đang tắt.', 'err');
      $('discordStop').disabled = true;
      status('Đang cập nhật Discord thành OFFLINE...');
      try {
        await callLive(false);
        status('⚫ Đã cập nhật livestream thành OFFLINE trên Discord.', 'ok');
        $('discordStatusPill').textContent = 'OFFLINE';
        $('discordStatusPill').className = 'pill';
      } catch (error) {
        status(error.message, 'err');
      } finally { $('discordStop').disabled = false; }
    };

    $('discordHealth').onclick = async () => {
      $('discordHealth').disabled = true;
      status('Đang kiểm tra Worker/Bot...');
      try {
        const data = await health();
        const ready = data.discordReady ?? data.botReady;
        status(`Worker OK · Bot ${ready ? 'ONLINE' : 'CHƯA ONLINE'}`, ready ? 'ok' : 'err');
        $('discordStatusPill').textContent = ready ? 'ONLINE' : 'OFFLINE';
        $('discordStatusPill').className = 'pill ' + (ready ? 'live' : '');
      } catch (error) {
        status(error.message, 'err');
      } finally { $('discordHealth').disabled = false; }
    };

    navButton.addEventListener('click', () => {
      document.querySelectorAll('.nav button').forEach((b) => b.classList.remove('active'));
      navButton.classList.add('active');
      document.querySelectorAll('.tab').forEach((x) => x.hidden = true);
      tab.hidden = false;
      const title = $('pageTitle');
      const desc = $('pageDesc');
      if (title) title.textContent = 'Discord';
      if (desc) desc.textContent = 'Điều khiển thông báo livestream Discord.';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})();
