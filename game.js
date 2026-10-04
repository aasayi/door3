const app = document.getElementById('app');
const COLORS = [
  {n:'Merah', l:'M', c:'#d4202c', d:'#82111a'},
  {n:'Biru',  l:'B', c:'#2548c8', d:'#122a82'},
  {n:'Kuning',l:'K', c:'#e9b80c', d:'#8c6a00'}
];
let token = null, st = null, timer = null, raf = 0, busy = false, order = [0,1,2];

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const mmss = s => `${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;
const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const scene = s => document.body.dataset.s = s;
const stop = () => { clearInterval(timer); cancelAnimationFrame(raf); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SUITS = '<div class="suits">♠ <span class="r">♥ ♦</span> ♣</div>';

// Isi satu pintu: bingkai, ambang (cahaya/langit), daun pintu 4 panel + kenop. Warna lewat CSS var.
const doorVars = (c, w) => `--c:${c.c};--cd:${c.d};--w:${w}px`;
const doorInner = () => `<span class="fr"></span><span class="in"></span><span class="lf"><i class="p1"></i><i class="p2"></i><i class="p3"></i><i class="p4"></i><b></b></span>`;

async function rpc(fn, args) {
  const h = {apikey: SB_KEY, 'Content-Type': 'application/json'};
  if (!SB_KEY.startsWith('sb_')) h.Authorization = 'Bearer ' + SB_KEY;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {method:'POST', headers:h, body:JSON.stringify(args)});
  if (!r.ok) throw new Error('Koneksi gagal. Coba lagi.');
  const d = await r.json();
  if (d.state) { st = d.state; st.t0 = Date.now(); }
  return d;
}

/* ---------- LOGIN: pintu merah besar, terbuka setelah login berhasil ---------- */
function loginScreen(msg = '') {
  stop(); scene('closed');
  app.innerHTML = `<div class="login" id="lg">${SUITS}<h1 class="logo">DOOR<span class="sl">//</span>3</h1>
    <div class="hall"><div class="dr big" id="bd" style="${doorVars(COLORS[0], 100)}">${doorInner()}</div></div>
    <form class="plaque" id="f">
      <label>Username<input name="u" autocomplete="username" required></label>
      <label>Password (tanggal lahir, ddmmyyyy)<input name="c" type="password" inputmode="numeric" autocomplete="current-password" required></label>
      <div class="err" id="e">${esc(msg)}</div>
      <button class="btn">Buka pintu</button>
    </form></div>`;
  $('f').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, b = f.querySelector('button'); b.disabled = true;
    try {
      const d = await rpc('login', {p_username: f.u.value, p_code: f.c.value});
      if (d.error) throw new Error(d.error);
      token = d.token;
      $('lg').classList.add('go'); $('bd').classList.add('op');   // pintu terbuka...
      await sleep(RM ? 0 : 800);
      $('bd').classList.add('zoom');                              // ...lalu kita masuk
      await sleep(RM ? 0 : 900);
      route();
    } catch (x) { $('e').textContent = x.message; b.disabled = false; }
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
    ['Welcome', 'Selamat datang di DOOR//3. Nikmati kunjungan Anda.', 'Jalan-jalan', ''],
    ['Staff Only', 'Pintu itu seharusnya terkunci.', 'Masuk', 'warn'],
    ['DOOR<span class="sl">//</span>3', `Ada ${st.total} ronde. Tiap ronde punya 3 pintu: merah, biru, kuning. Satu benar, dua salah. Tidak ada petunjuk, temukan urutannya sendiri. Posisi dan bentuk pintu terus berubah, jadi ingat warnanya. Salah satu pintu saja, kamu kembali ke awal. Waktu mulai dihitung saat kamu menekan Mulai dan terus berjalan (${mmss(st.limit)}), walau halaman ditutup.`, 'Mulai', '']
  ][i];
  app.innerHTML = `<div class="card">${S[3] ? '<div class="tape"></div>' : ''}${SUITS}<h1 class="logo">${S[0]}</h1><p>${S[1]}</p><button class="btn" id="n">${S[2]}</button>${i === 0 && st.admin ? '<button class="btn alt" id="lb">Leaderboard</button>' : ''}</div>`;
  const lb = $('lb'); if (lb) lb.onclick = board;
  $('n').onclick = async () => {
    if (i < 2) return intro(i + 1);
    try { await rpc('start_game', {p_token: token}); route(); } catch (x) { alert(x.message); }
  };
}

/* ---------- GAME ---------- */
function game() {
  stop(); scene('game'); busy = false;
  const pips = Array.from({length: st.total}, (_, i) => `<i class="${i < st.round ? 'on' : ''}"></i>`).join('');
  app.innerHTML = `
    <div class="sw"><div class="stage" id="s"></div><div class="msg" id="m"></div></div>
    <div class="deck">
      <div class="hud"><div class="watch" id="w"><b id="t"></b></div>
        <div class="meta">Percobaan <b>${st.attempts}</b><br>Pintu ke-<b>${st.round+1}</b> dari ${st.total}<br>Terlewati <b>${st.cleared}</b></div></div>
      <div class="pips">${pips}</div>
    </div>`;
  order = shuffle([0,1,2]);
  const tick = async () => {
    const left = st.limit - (st.elapsed + (Date.now() - st.t0) / 1000);
    const t = $('t'); if (!t) return;
    t.textContent = mmss(left);
    $('w').classList.toggle('low', left < 60);
    if (left <= 0) { stop(); await rpc('get_state', {p_token: token}); route(); }
  };
  tick(); timer = setInterval(tick, 1000);
  requestAnimationFrame(drawDoors);
}

/* Tingkat kesulitan per ronde (dalam satu percobaan):
   1-5 rapi | 6-10 posisi acak | 11-15 posisi + ukuran acak | 16-20 bergerak, beda gaya tiap ronde:
   16 pantul ala DVD | 17 mengorbit | 18 pantul + berputar | 19 terbang & jatuh (melambung) | 20 kacau (zig-zag, putar, denyut, kedip) */
const ASP = 1.8;   // tinggi / lebar pintu

function drawDoors() {
  cancelAnimationFrame(raf);
  const s = $('s'); if (!s) return;
  const M = 22;                                   // jarak aman dari tepi layar (supaya cahaya pintu tidak terpotong)
  const W = s.clientWidth - 2 * M, H = s.clientHeight, r = st.round + 1, R = Math.random;   // H = tinggi dinding; dasarnya = lantai
  const tier = r <= 5 ? 0 : r <= 10 ? 1 : r <= 15 ? 2 : 3;
  s.classList.toggle('fly', tier === 3);
  const b = Math.min(W * .29, 130, H * .5 / ASP);
  let d;
  if (tier === 3) {
    const k = 1 - (r - 16) * .045, bw = Math.max(50, Math.min(W * .22, H * .22, 88) * k);
    d = order.map(() => ({w: bw, h: bw * ASP}));
  } else if (tier === 2) {
    d = order.map(() => { let w = b * (.62 + R() * .68), h = w * ASP; const m = H * .62; if (h > m) { h = m; w = h / ASP; } return {w, h}; });
  } else d = order.map(() => ({w: b, h: b * ASP}));

  let p;
  if (tier === 3) p = d.map(q => ({...q, x: R() * (W - q.w), y: R() * (H - q.h), rot: 0, sc: 1, op: 1}));
  else { const xs = lineup(W, d, tier > 0); p = d.map((q, i) => ({...q, x: xs[i], y: H - q.h})); }   // berdiri di dasar dinding

  s.innerHTML = '';
  const els = p.map((q, i) => {
    const c = COLORS[order[i]], e = document.createElement('button');
    e.className = 'dr door'; e.style.cssText = `width:${q.w}px;height:${q.h}px;${doorVars(c, q.w)}`;
    e.setAttribute('aria-label', 'Pintu ' + c.n); e.innerHTML = doorInner();
    e.onpointerdown = ev => { ev.preventDefault(); pick(order[i], e); };
    s.appendChild(e); return e;
  });
  const put = () => els.forEach((e, i) => {
    const q = p[i];
    e.style.transform = `translate3d(${q.x + M}px,${q.y}px,0)` + (tier === 3 ? ` rotate(${q.rot}deg) scale(${q.sc})` : '');
    if (tier === 3) e.style.opacity = q.op;
  });
  put();
  if (tier === 3) {
    const step = motion(r, p, W, H);
    let t0 = performance.now(), t = 0;
    const loop = n => {
      const dt = Math.min(.05, (n - t0) / 1000); t0 = n; t += dt;
      step(dt, t); put(); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
}

// Gerak ronde 16-20. Mengembalikan fungsi step(dt, t) yang memperbarui p[i].{x,y,rot,sc,op}
function motion(r, p, W, H) {
  const R = Math.random, sg = () => R() < .5 ? -1 : 1, TAU = Math.PI * 2;
  const bounce = (q, dt) => {
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.x < 0) { q.x = 0; q.vx = Math.abs(q.vx); } else if (q.x > W - q.w) { q.x = W - q.w; q.vx = -Math.abs(q.vx); }
    if (q.y < 0) { q.y = 0; q.vy = Math.abs(q.vy); } else if (q.y > H - q.h) { q.y = H - q.h; q.vy = -Math.abs(q.vy); }
  };
  const aim = (q, v) => { const a = R() * TAU; q.vx = Math.cos(a) * v * (.85 + R() * .3); q.vy = Math.sin(a) * v * (.85 + R() * .3); };

  if (r === 16) {                       // DVD: pantul di dinding, lurus
    p.forEach(q => aim(q, W * .42));
    return dt => p.forEach(q => bounce(q, dt));
  }
  if (r === 17) {                       // orbit elips, tiga lintasan beda, sambil miring
    p.forEach((q, i) => Object.assign(q, {
      rx: (W - q.w) / 2 * (.42 + .24 * i), ry: (H - q.h) / 2 * (.55 + .2 * ((i + 1) % 3)),
      om: (1.15 + .35 * i) * (i === 1 ? -1 : 1), ph: R() * TAU
    }));
    return (dt, t) => p.forEach(q => {
      const a = q.ph + q.om * t, cx = W / 2 + W * .05 * Math.sin(t * .7), cy = H / 2 + H * .04 * Math.cos(t * .5);
      q.x = cx + q.rx * Math.cos(a) - q.w / 2; q.y = cy + q.ry * Math.sin(a) - q.h / 2; q.rot = 16 * Math.sin(2 * a);
    });
  }
  if (r === 18) {                       // pantul lebih cepat + berputar terus
    p.forEach(q => { aim(q, W * .62); q.vr = sg() * (170 + R() * 130); });
    return dt => p.forEach(q => { bounce(q, dt); q.rot += q.vr * dt; });
  }
  if (r === 19) {                       // terbang & jatuh: gravitasi, melambung tinggi acak, jungkir balik
    const g = H * 1.7, toss = q => {
      const hh = R() < .22 ? .12 : .4 + R() * .55;
      q.vy = -Math.sqrt(2 * g * H * hh); q.vx = sg() * (70 + R() * 190); q.vr = sg() * (120 + R() * 320);
    };
    p.forEach(q => { q.y = -q.h - R() * H * .35; q.vy = 0; q.vx = sg() * (80 + R() * 160); q.vr = sg() * 150; });
    return dt => p.forEach(q => {
      q.vy += g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.x < 0) { q.x = 0; q.vx = Math.abs(q.vx); } else if (q.x > W - q.w) { q.x = W - q.w; q.vx = -Math.abs(q.vx); }
      if (q.y > H - q.h) { q.y = H - q.h; toss(q); }
    });
  }
  // r === 20: kacau total. Lintasan zig-zag (jumlah dua gelombang), waktu sesekali "ngebut", berputar, berdenyut, berkedip
  p.forEach((q, i) => Object.assign(q, {
    f1: 1.2 + R() * .65, f2: 2.5 + R() * 1, g1: 1.05 + R() * .7, g2: 2.2 + R() * 1.2,
    a1: R() * TAU, a2: R() * TAU, b1: R() * TAU, b2: R() * TAU, vr: sg() * (240 + R() * 180), ph: R() * TAU, tau: 0
  }));
  let burst = 0, next = .6 + R();
  return (dt, t) => {
    next -= dt; if (next <= 0) { burst = .35; next = .8 + R() * 1.2; }
    burst = Math.max(0, burst - dt);
    p.forEach(q => {
      q.tau += dt * (1 + (burst > 0 ? 1.1 : 0));
      const mx = (W - q.w) / 2, my = (H - q.h) / 2;
      q.x = mx + mx * (.62 * Math.sin(q.f1 * q.tau + q.a1) + .38 * Math.sin(q.f2 * q.tau + q.a2));
      q.y = my + my * (.62 * Math.sin(q.g1 * q.tau + q.b1) + .38 * Math.sin(q.g2 * q.tau + q.b2));
      q.rot += q.vr * dt; q.sc = 1 + .16 * Math.sin(2.6 * t + q.ph);
      q.op = Math.sin(5 * t + q.ph) > .86 ? .4 : 1;
    });
  };
}

// Posisi x tiga pintu dalam satu baris di dasar dinding. irr=false: jarak rata. irr=true: jarak acak (ada yang rapat, ada yang renggang).
function lineup(W, sizes, irr) {
  const gmin = 12, tot = sizes.reduce((a, q) => a + q.w, 0);
  if (!irr) { const g = (W - tot) / 4; let x = g; return sizes.map(q => { const px = x; x += q.w + g; return px; }); }
  const free = Math.max(0, W - tot - 2 * gmin), wt = [0, 1, 2, 3].map(() => Math.pow(Math.random(), 1.6) + .05), sum = wt.reduce((a, c) => a + c);
  let x = free * wt[0] / sum;
  return sizes.map((q, i) => { const px = x; x += q.w + gmin + (i < 2 ? free * wt[i + 1] / sum : 0); return px; });
}

const msg = t => { const m = $('m'); if (m) m.textContent = t || ''; };

async function pick(c, el) {
  if (busy) return; busy = true;
  cancelAnimationFrame(raf);                 // bekukan pintu begitu disentuh
  el.classList.add('pr'); msg('');
  let d;
  try {
    d = await rpc('choose', {p_token: token, p_color: c});
    if (d.error) throw new Error(d.error);
  } catch (x) {
    el.classList.remove('pr'); msg(x.message); await sleep(900); return game();
  }
  if (st.status === 'escaped' && d.correct) return win(el);
  if (st.status !== 'playing') return route();
  if (d.correct) {                           // benar: pintu terbuka cepat, lanjut ronde berikut
    el.classList.remove('pr'); el.classList.add('op');
    await sleep(RM ? 0 : 440);
    return game();
  }
  el.classList.remove('pr'); el.classList.add('bad');   // salah: terkunci, bergetar, reset
  msg('Salah. Kembali ke pintu pertama.');
  $('s').classList.add('flash');
  await sleep(1100);
  game();
}

// Pintu terakhir: terbuka ke langit, lalu kita melangkah keluar ke awan
async function win(el) {
  stop();
  el.classList.remove('pr'); el.classList.add('sk', 'op');
  await sleep(RM ? 0 : 420);
  const r = el.querySelector('.in').getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'portal skybg';
  p.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  document.body.appendChild(p);
  p.getBoundingClientRect();                 // paksa layout agar transisi jalan
  p.style.cssText = `left:0;top:0;width:${innerWidth}px;height:${innerHeight}px`;
  await sleep(RM ? 0 : 880);
  document.body.classList.add('cut'); result();
  p.style.opacity = 0; setTimeout(() => { p.remove(); document.body.classList.remove('cut'); }, 800);
}

function result() {
  stop();
  const w = st.status === 'escaped';
  scene(w ? 'sky' : 'closed');
  app.innerHTML = `<div class="card">${SUITS}
    <h1>${w ? 'Congratulations,' : 'Waktu habis,'}<br>${esc(st.name)}.</h1>
    <p>${w ? 'Kamu berhasil keluar dari DOOR//3.' : 'Kamu masih terjebak di DOOR//3.'}</p>
    <div class="stats">
      <div><span>Waktu</span><b>${mmss(st.elapsed)}</b></div>
      <div><span>Percobaan</span><b>${st.attempts}</b></div>
      <div><span>Pintu terlewati</span><b>${st.cleared}</b></div>
      <div><span>Session ID</span><b>DR-${esc(st.code)}</b></div>
    </div>
    <p class="mute">Screenshot halaman ini dan kirim ke admin.</p>${st.admin ? '<button class="btn alt" id="lb">Leaderboard</button>' : ''}</div>`;
  const lb = $('lb'); if (lb) lb.onclick = board;
}

// Leaderboard (khusus admin; server menolak akun non-admin)
function board() {
  stop(); scene('closed');
  app.innerHTML = `<div class="card">${SUITS}<h1>Leaderboard</h1><div id="lbl" class="mute">Memuat...</div>
    <button class="btn" id="rf">Segarkan</button><button class="btn alt" id="bk">Kembali</button></div>`;
  const el = $('lbl');
  const draw = async () => {
    try {
      const d = await rpc('leaderboard', {p_token: token});
      if (d.error) throw new Error(d.error);
      el.className = '';
      el.innerHTML = d.rows.map((r, i) => `<div class="lb"><span>${i+1}</span><b>${esc(r.name)}</b>
        <span>${r.result === 'escaped' ? mmss(r.elapsed) : r.result === 'playing' ? 'main' : 'habis'}<small>${r.cleared} pintu, ${r.attempts}x</small></span></div>`).join('') || '<p class="mute">Belum ada yang main.</p>';
    } catch (x) { el.textContent = x.message; }
  };
  draw(); timer = setInterval(draw, 10000);
  $('rf').onclick = draw;
  $('bk').onclick = () => route();
}

loginScreen();
