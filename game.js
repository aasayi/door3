const app = document.getElementById('app');
const COLORS = [{n:'Merah',l:'M',c:'#d4202c',t:'#fff'},{n:'Biru',l:'B',c:'#2548c8',t:'#fff'},{n:'Kuning',l:'K',c:'#f4c20d',t:'#3a2a00'}];
let token = null, st = null, timer = null, raf = 0, busy = false, order = [0,1,2];

const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const mmss = s => `${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;
const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const scene = s => document.body.dataset.s = s;
const stop = () => { clearInterval(timer); cancelAnimationFrame(raf); };
const SUITS = '<div class="suits">♠ ♥ ♦ ♣</div>';

async function rpc(fn, args) {
  const h = {apikey: SB_KEY, 'Content-Type': 'application/json'};
  if (!SB_KEY.startsWith('sb_')) h.Authorization = 'Bearer ' + SB_KEY;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {method:'POST', headers:h, body:JSON.stringify(args)});
  if (!r.ok) throw new Error('Koneksi gagal. Coba lagi.');
  const d = await r.json();
  if (d.state) { st = d.state; st.t0 = Date.now(); }
  return d;
}

function loginScreen(msg = '') {
  stop(); scene('closed');
  app.innerHTML = `<div class="card">${SUITS}<h1>DOOR//3</h1><p>Selamat datang di taman hiburan.</p>
    <form id="f">
      <label>Username<input name="u" autocomplete="username" required></label>
      <label>Password (tanggal lahir, ddmmyyyy)<input name="c" type="password" inputmode="numeric" autocomplete="current-password" required></label>
      <div class="err" id="e">${esc(msg)}</div>
      <button class="btn">Masuk</button>
    </form></div>`;
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, b = f.querySelector('button'); b.disabled = true;
    try {
      const d = await rpc('login', {p_username: f.u.value, p_code: f.c.value});
      if (d.error) throw new Error(d.error);
      token = d.token; route();
    } catch (x) { document.getElementById('e').textContent = x.message; b.disabled = false; }
  };
}

function route() {
  if (st.status === 'ready') intro(0);
  else if (st.status === 'playing') game();
  else result();
}

function intro(i) {
  stop(); scene('closed');
  const S = [
    ['Welcome', 'Selamat datang di taman hiburan. Nikmati kunjungan Anda.', 'Jalan-jalan', ''],
    ['Staff Only', 'Pintu itu seharusnya terkunci.', 'Masuk', 'warn'],
    ['Backrooms', `Ada ${st.total} ronde. Tiap ronde punya 3 pintu: merah, biru, kuning. Satu benar, dua salah. Tidak ada petunjuk, temukan urutannya sendiri. Posisi dan bentuk pintu terus berubah, jadi ingat warnanya. Salah satu pintu saja, kamu kembali ke awal. Waktu terus berjalan (${mmss(st.limit)}).`, 'Mulai', '']
  ][i];
  app.innerHTML = `<div class="card ${S[3]}">${SUITS}<h1>${S[0]}</h1><p>${S[1]}</p><button class="btn" id="n">${S[2]}</button></div>`;
  document.getElementById('n').onclick = async () => {
    if (i < 2) return intro(i + 1);
    try { await rpc('start_game', {p_token: token}); route(); } catch (x) { alert(x.message); }
  };
}

function game() {
  stop(); scene('game');
  const pips = Array.from({length: st.total}, (_, i) => `<i class="${i < st.round ? 'on' : ''}"></i>`).join('');
  app.innerHTML = `
    <div class="hud"><div class="watch" id="w"><b id="t"></b></div>
      <div class="meta">Percobaan ${st.attempts}<br>Pintu ke-${st.round+1} dari ${st.total}<br>Terlewati ${st.cleared}</div></div>
    <div class="pips">${pips}</div>
    <div class="stage" id="s"></div>
    <div class="err" id="m"></div>`;
  order = shuffle([0,1,2]);
  const tick = async () => {
    const left = st.limit - (st.elapsed + (Date.now() - st.t0) / 1000);
    const t = document.getElementById('t'); if (!t) return;
    t.textContent = mmss(left);
    document.getElementById('w').classList.toggle('low', left < 60);
    if (left <= 0) { stop(); await rpc('get_state', {p_token: token}); route(); }
  };
  tick(); timer = setInterval(tick, 1000);
  setTimeout(drawDoors, 60);   // tunggu tirai membuka / layout siap
}

// Tingkat kesulitan per ronde: 1-5 rapi, 6-10 acak posisi, 11-15 acak posisi + ukuran, 16-20 bergerak
function drawDoors() {
  cancelAnimationFrame(raf);
  const s = document.getElementById('s'); if (!s) return;
  const W = s.clientWidth, H = s.clientHeight, r = st.round + 1, R = Math.random;
  const tier = r <= 5 ? 0 : r <= 10 ? 1 : r <= 15 ? 2 : 3;
  const b = Math.min(W * .27, H * .34, 112);
  let d = order.map(() => ({w: b, h: b * 1.85}));
  if (tier >= 2) d = d.map(() => {
    let w = b * (.62 + R() * .68), h = w * 1.85; const m = tier === 3 ? H / 3 - 14 : H * .42;
    if (h > m) { h = m; w = h / 1.85; }
    return {w, h};
  });
  let p;
  if (tier === 0) { const g = (W - 3 * b) / 4; p = d.map((q, i) => ({...q, x: g + i * (b + g), y: (H - q.h) / 2})); }
  else if (tier === 3) p = d.map((q, i) => ({...q, x: R() * (W - q.w), y: i * H / 3 + (H / 3 - q.h) / 2, v: (40 + (r - 16) * 16) * (.8 + R() * .6) * (R() < .5 ? -1 : 1)}));
  else p = scatter(W, H, d);
  s.innerHTML = '';
  const els = p.map((q, i) => {
    const c = COLORS[order[i]], e = document.createElement('button');
    e.className = 'door'; e.style.cssText = `width:${q.w}px;height:${q.h}px;--c:${c.c};--t:${c.t}`;
    e.setAttribute('aria-label', 'Pintu ' + c.n); e.innerHTML = `<span>${c.l}</span>`;
    e.onpointerdown = ev => { ev.preventDefault(); pick(order[i]); };
    s.appendChild(e); return e;
  });
  const put = () => els.forEach((e, i) => e.style.transform = `translate(${p[i].x}px,${p[i].y}px)`);
  put();
  if (tier === 3) {
    let t0 = performance.now();
    const loop = n => {
      const dt = Math.min(.05, (n - t0) / 1000); t0 = n;
      p.forEach(q => { q.x += q.v * dt; if (q.x < 0) { q.x = 0; q.v = Math.abs(q.v); } else if (q.x > W - q.w) { q.x = W - q.w; q.v = -Math.abs(q.v); } });
      put(); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
}

function scatter(W, H, sizes) {
  const g = 10;
  for (let t = 0; t < 200; t++) {
    const r = sizes.map(s => ({...s, x: Math.random() * (W - s.w), y: Math.random() * (H - s.h)}));
    if (r.every((a, i) => r.every((c, j) => i >= j || a.x + a.w + g < c.x || c.x + c.w + g < a.x || a.y + a.h + g < c.y || c.y + c.h + g < a.y))) return r;
  }
  return sizes.map((s, i) => ({...s, x: i * (W - s.w) / 2, y: i * (H - s.h) / 2}));
}

async function pick(c) {
  if (busy) return; busy = true;
  try {
    const d = await rpc('choose', {p_token: token, p_color: c});
    if (d.error) throw new Error(d.error);
    busy = false;
    if (st.status !== 'playing') return route();
    if (d.correct) return game();
    cancelAnimationFrame(raf); busy = true;
    document.getElementById('m').textContent = 'Salah. Kembali ke pintu pertama.';
    document.getElementById('s').classList.add('flash');
    setTimeout(() => { busy = false; game(); }, 1100);
  } catch (x) { busy = false; const m = document.getElementById('m'); if (m) m.textContent = x.message; }
}

function result() {
  stop(); scene('closed');
  const w = st.status === 'escaped';
  app.innerHTML = `<div class="card">${SUITS}
    <h1>${w ? 'Congratulations,' : 'Waktu habis,'}<br>${esc(st.name)}.</h1>
    <p>${w ? 'Kamu berhasil keluar dari taman.' : 'Kamu masih terjebak di Backrooms.'}</p>
    <div class="stats">
      <div><span>Waktu</span><b>${mmss(st.elapsed)}</b></div>
      <div><span>Percobaan</span><b>${st.attempts}</b></div>
      <div><span>Pintu terlewati</span><b>${st.cleared}</b></div>
      <div><span>Session ID</span><b>DR-${esc(st.code)}</b></div>
    </div>
    <p class="mute">Screenshot halaman ini dan kirim ke admin.</p></div>`;
}

loginScreen();