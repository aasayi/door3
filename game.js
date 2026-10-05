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
// Warna penutup di dalam pintu saat zoom: 'glow' (cahaya hangat, sama dengan isi ambang pintu) atau 'dark' (hitam).
const VEIL = 'glow';
// Cara masuk pintu (ganti lewat URL): ?z=portal (cahaya tumbuh bertahap dari ambang pintu, ruangan lama diam, DEFAULT) | ?z=fade (tanpa zoom, hanya cahaya berkedip)
const ZQ = new URLSearchParams(location.search).get('z');
let ZM = ['portal', 'fade'].includes(ZQ) ? ZQ : 'portal', slow = 0;
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
const metaHTML = (rd = st.round) => `Percobaan <b>${st.attempts}</b><br>Pintu ke-<b>${rd+1}</b> dari ${st.total}<br>Terlewati <b>${st.cleared}</b>`;
const pipsHTML = (rd = st.round) => Array.from({length: st.total}, (_, i) => `<i class="${i < rd ? 'on' : ''}"></i>`).join('');
const updateHud = rd => { const m = document.querySelector('.meta'), p = document.querySelector('.pips'); if (m) m.innerHTML = metaHTML(rd); if (p) p.innerHTML = pipsHTML(rd); };
const frames = n => new Promise(r => { const f = () => --n > 0 ? requestAnimationFrame(f) : r(); requestAnimationFrame(f); });

// Pindah ronde TANPA membangun ulang layar: jam, panel, dinding, dan lantai tetap elemen yang sama (tidak ada kedipan). Hanya isi pintu diganti.
function enter(pl) {
  busy = false;
  const s = $('s'); if (s) s.classList.remove('flash');
  msg(''); drawDoors(pl);
}

function game() {
  stop(); scene('game'); busy = false;
  app.innerHTML = `
    <div class="sw"><div class="stage" id="s"></div><div class="msg" id="m"></div></div>
    <div class="deck">
      <div class="hud"><div class="watch" id="w"><b id="t"></b></div>
        <div class="meta">${metaHTML()}</div></div>
      <div class="pips">${pipsHTML()}</div>
    </div>`;
  const tick = async () => {
    const left = st.limit - (st.elapsed + (Date.now() - st.t0) / 1000);
    const t = $('t'); if (!t) return;
    t.textContent = mmss(left);
    $('w').classList.toggle('low', left < 60);
    if (left <= 0) { stop(); await rpc('get_state', {p_token: token}); route(); }
  };
  tick(); timer = setInterval(tick, 1000);
  requestAnimationFrame(() => drawDoors());
}

/* Tingkat kesulitan per ronde (dalam satu percobaan):
   1-5 rapi, berdiri di lantai | 6-10 bebas di dinding: posisi acak, ada yang tegak / rebah / miring |
   11-15 sama, plus ukuran acak dan sudut bebas | 16-20 bergerak, beda gaya tiap ronde:
   16 pantul ala DVD | 17 mengorbit | 18 pantul + berputar | 19 terbang & jatuh (melambung) | 20 kacau (zig-zag, putar, denyut, kedip) */
const ASP = 1.8;   // tinggi / lebar pintu

const M = 22;                                    // jarak aman dari tepi layar (supaya cahaya pintu tidak terpotong)

// Rencana satu ronde: urutan warna, ukuran, posisi. Dipisah dari penggambaran supaya ruangan berikutnya bisa dipratinjau saat transisi.
function plan() {
  const s = $('s'), W = s.clientWidth - 2 * M, H = s.clientHeight, r = st.round + 1, R = Math.random;   // H = tinggi dinding; dasarnya = lantai
  const tier = r <= 5 ? 0 : r <= 10 ? 1 : r <= 15 ? 2 : 3, ord = shuffle([0,1,2]);
  const b = Math.min(W * .29, 130, H * .5 / ASP);
  let d;
  if (tier === 3) {                                // ukuran tiap pintu acak, rata-rata mengecil tiap ronde
    const k = 1 - (r - 16) * .045, base = Math.min(W * .22, H * .22, 88) * k;
    d = ord.map(() => { const w = Math.min(Math.max(42, base * (.7 + R() * .7)), H * .5 / ASP); return {w, h: w * ASP}; });
  } else if (tier === 2) {
    d = ord.map(() => { let w = b * (.62 + R() * .68), h = w * ASP; const m = H * .5; if (h > m) { h = m; w = h / ASP; } return {w, h}; });
  } else if (tier === 1) {
    d = ord.map(() => ({w: b * .92, h: b * .92 * ASP}));
  } else d = ord.map(() => ({w: b, h: b * ASP}));
  let p;
  if (tier === 3) p = d.map(q => ({...q, x: R() * (W - q.w), y: R() * (H - q.h), rot: 0, sc: 1, op: 1}));
  else if (tier > 0) p = scatter(W, H, d, tier);
  else { const xs = lineup(W, d); p = d.map((q, i) => ({...q, x: xs[i], y: H - q.h, rot: 0})); }   // berdiri di dasar dinding
  return {ord, p, tier, W, H};
}

function doorEl(ci, q, nf) {                     // nf = tanpa animasi muncul (pintu hasil pratinjau sudah terlihat)
  const c = COLORS[ci], e = document.createElement('button');
  e.className = 'dr door' + (nf ? ' nf' : ''); e.style.cssText = `width:${q.w}px;height:${q.h}px;${doorVars(c, q.w)}`;
  e.setAttribute('aria-label', 'Pintu ' + c.n); e.innerHTML = doorInner(); return e;
}
const place = (e, q, tier) => {
  e.style.transform = `translate3d(${q.x + M}px,${q.y}px,0)` + (tier > 0 ? ` rotate(${q.rot}deg)` + (tier === 3 ? ` scale(${q.sc})` : '') : '');
  if (tier === 3) e.style.opacity = q.op;
};

function drawDoors(pl) {
  cancelAnimationFrame(raf);
  const s = $('s'); if (!s) return;
  const nf = !!pl; pl = pl || plan();
  const {ord, p, tier, W, H} = pl; order = ord;
  s.classList.toggle('fly', tier > 0);             // pintu tidak lagi berdiri di lantai: bayangan lantai dimatikan
  s.innerHTML = '';
  const els = p.map((q, i) => {
    const e = doorEl(ord[i], q, nf);
    e.onpointerdown = ev => { ev.preventDefault(); pick(ord[i], e); };
    s.appendChild(e); return e;
  });
  const put = () => els.forEach((e, i) => place(e, p[i], tier));
  put();
  if (tier === 3) {
    const r = st.round + 1, step = motion(r, p, W, H);
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

// Posisi x tiga pintu rapi dalam satu baris di dasar dinding (ronde 1-5), jarak rata.
function lineup(W, sizes) {
  const g = (W - sizes.reduce((a, q) => a + q.w, 0)) / 4; let x = g;
  return sizes.map(q => { const px = x; x += q.w + g; return px; });
}

// Penempatan bebas di dinding (ronde 6-15). Tiap pintu punya sudut sendiri, seluruhnya berada di dalam dinding dan tidak saling menumpuk.
// Ronde 6-10: tegak, rebah (90 derajat) atau miring. Ronde 11-15: sudut bebas 360 derajat (ukuran sudah diacak di pemanggil).
function scatter(W, H, sizes, tier) {
  const R = Math.random, D = Math.PI / 180, pad = 6, gap = 14;
  const ang = () => {
    if (tier === 2) return (R() * 360 - 180) * D;
    const t = R(); return (t < .3 ? 0 : t < .6 ? (R() < .5 ? 90 : -90) : (R() < .5 ? 1 : -1) * (25 + R() * 40)) * D;
  };
  // dua persegi panjang berputar: tidak bertabrakan kalau ada satu sumbu pemisah (SAT)
  const clash = (a, b) => [a.a, a.a + Math.PI / 2, b.a, b.a + Math.PI / 2].every(t => {
    const ra = a.w / 2 * Math.abs(Math.cos(a.a - t)) + a.h / 2 * Math.abs(Math.sin(a.a - t));
    const rb = b.w / 2 * Math.abs(Math.cos(b.a - t)) + b.h / 2 * Math.abs(Math.sin(b.a - t));
    return Math.abs((b.cx - a.cx) * Math.cos(t) + (b.cy - a.cy) * Math.sin(t)) < ra + rb + gap;
  });
  const as = sizes.map(ang);
  if (tier === 1 && as.every(a => a === 0)) as[Math.floor(R() * as.length)] = (R() < .5 ? 1 : -1) * (30 + R() * 30) * D;   // minimal satu yang tidak tegak
  for (let f = 1, n = 0; n < 8; n++, f *= .94) {
    const put = [];
    for (let i = 0; i < sizes.length; i++) {
      const w = sizes[i].w * f, h = sizes[i].h * f, c = Math.abs(Math.cos(as[i])), sn = Math.abs(Math.sin(as[i]));
      const ex = (w * c + h * sn) / 2, ey = (w * sn + h * c) / 2;
      if (W < 2 * (ex + pad) || H < 2 * (ey + pad)) break;
      let ok = null;
      for (let k = 0; k < 150 && !ok; k++) {
        const q = {cx: pad + ex + R() * (W - 2 * (ex + pad)), cy: pad + ey + R() * (H - 2 * (ey + pad)), w, h, a: as[i]};
        if (!put.some(o => clash(o, q))) ok = q;
      }
      if (!ok) break;
      put.push(ok);
    }
    if (put.length === sizes.length) return put.map(q => ({w: q.w, h: q.h, x: q.cx - q.w / 2, y: q.cy - q.h / 2, rot: q.a / D, sc: 1, op: 1}));
  }
  return sizes.map((q, i) => ({...q, x: (W - q.w) * (i + .5) / sizes.length, y: H - q.h, rot: 0, sc: 1, op: 1}));   // cadangan: berjajar rapi
}

const msg = t => { const m = $('m'); if (m) m.textContent = t || ''; };

async function pick(c, el) {
  if (busy) return; busy = true;
  cancelAnimationFrame(raf);                 // bekukan pintu begitu disentuh
  el.classList.add('pr'); msg('');
  const was = st.round;                      // ronde sebelum dijawab (untuk efek rewind kalau salah)
  let d;
  try {
    d = await rpc('choose', {p_token: token, p_color: c});
    if (d.error) throw new Error(d.error);
  } catch (x) {
    el.classList.remove('pr'); msg(x.message); await sleep(900); return game();
  }
  if (st.status === 'escaped' && d.correct) return win(el);
  if (st.status !== 'playing') return route();
  if (d.correct) {                           // benar: pintu terbuka, kamera masuk ke ambang (isinya cahaya/hitam, TANPA ruangan berikutnya)
    el.classList.remove('pr'); el.classList.add('op');
    const pl = plan();                       // rencana ronde berikutnya
    if (RM) { updateHud(); return enter(pl); }
    updateHud();
    await sleep(120);
    const fw = frameWatch(), sw = document.querySelector('.sw');
    if (ZM === 'portal') {
      const v = portalDive(el, 680);         // cahaya + bingkai pintu "melompat" membesar dari ambang sampai memenuhi layar; ruangan lama TIDAK dibesarkan
      await v.done; guard(fw());
      v.hold(); enter(pl);                   // layar tertutup penuh: ruangan baru digambar diam-diam di bawahnya
      await frames(2);
      v.out(); jolt(sw, 320, 6, 7);          // penutup berkedip hilang, ruangan baru "tersentak" sebentar
    } else {
      await glow(true, 380).finished.catch(() => {}); guard(fw());   // mode ringan: cahaya berkedip naik, ganti ruangan, berkedip turun
      enter(pl); await frames(2); glow(false, 380); jolt(sw, 320, 6, 7);
    }
    return;
  }
  el.classList.remove('pr'); el.classList.add('bad');   // salah: terkunci, bergetar, lalu rewind ke ruangan pertama
  msg('Salah. Kembali ke pintu pertama.');
  const s = $('s'); s.classList.add('flash');
  if (RM) { await sleep(1100); return game(); }
  if (was === 0) { await sleep(850); s.classList.remove('flash'); msg(''); updateHud(); busy = false; return drawDoors(); }   // sudah di ronde 1: cukup acak ulang
  await sleep(560);
  await rewind(was);
}

// Pintu terakhir: terbuka ke langit, kamera mendekat dan melewati pintu keluar ke langit
async function win(el) {
  stop();
  el.classList.remove('pr'); el.classList.add('sk', 'op'); el.style.opacity = 1;
  if (RM) { document.body.classList.add('cut'); result(); setTimeout(() => document.body.classList.remove('cut'), 100); return; }
  await sleep(240);
  const dk = document.querySelector('.deck'); if (dk) dk.animate([{opacity: 1}, {opacity: 0}], {duration: 320, fill: 'forwards'});
  const v = portalDive(el, 980, 'sky');
  await v.done; v.hold();
  document.body.classList.add('cut'); result();   // langit asli (awan) terbuka di bawah portal
  v.out(); setTimeout(() => document.body.classList.remove('cut'), 800);
}

/* ---------- ANIMASI & GLITCH ----------
   Prinsip: semua efek hanya transform + opacity pada layer yang sudah ada (tanpa filter, blur, atau gambar ulang), dan dipotong jadi lompatan
   bertahap (steps). Glitch ini disengaja: terasa seperti "kami tidak seharusnya di sini". Kalau HP sempat patah-patah, patahnya menyatu dengan gayanya.
   Ruangan lama tidak pernah dibesarkan/diskalakan (itu yang bikin HP menggambar ulang terus). */
const ZOOM_EASE = 'cubic-bezier(.45,.05,.75,.55)', STEP = 'steps(1, end)';
const roomBox = () => document.querySelector('body > .room').getBoundingClientRect();
const RING = '<i class="rg t"></i><i class="rg l"></i><i class="rg r"></i><i class="rg b"></i>';
const rnd = (a, b) => a + Math.random() * (b - a), sgn = () => Math.random() < .5 ? -1 : 1;

// Opacity berkedip bertahap: tiap nilai ditahan sampai nilai berikutnya (tidak ada transisi halus).
const flick = (el, vals, ms) => el.animate(vals.map((o, i) => ({opacity: o, offset: i / (vals.length - 1), easing: STEP})), {duration: ms, fill: 'forwards'});

// Tersentak: layer digeser/dimiringkan sedikit secara acak, sebagian frame kembali normal, getarannya meluruh. Hanya transform.
function jolt(el, ms, n = 8, amp = 8) {
  if (!el || RM) return;
  const kf = Array.from({length: n}, (_, i) => { const d = 1 - i / n;
    return {offset: i / n, easing: STEP, transform: i % 3 === 2 ? 'none' : `translate(${sgn() * rnd(.4, 1) * amp * d}px,${sgn() * rnd(0, .3) * amp * d}px) skewX(${sgn() * rnd(0, 2.5) * d}deg)`}; });
  kf.push({offset: 1, transform: 'none'});
  return el.animate(kf, {duration: ms});
}

// Pengaman: kalau animasi patah-patah dua kali berturut-turut, pindah ke mode 'fade' (tanpa zoom) untuk sisa permainan (kecuali dipaksa lewat ?z=).
const frameWatch = () => { let last = 0, bad = 0, n = 0, id; const f = t => { if (last) { n++; if (t - last > 34) bad++; } last = t; id = requestAnimationFrame(f); }; id = requestAnimationFrame(f); return () => { cancelAnimationFrame(id); return n > 8 && bad / n > .2; }; };
const guard = jank => { slow = jank ? slow + 1 : 0; if (slow >= 2 && !ZQ) ZM = 'fade'; };

// Masuk pintu: satu lapisan polos seukuran layar (cahaya, atau langit untuk pintu terakhir) tumbuh dari ambang pintu yang dipilih lengkap dengan bingkai pintu.
// Zoom dipotong jadi lompatan (stutter sengaja, sekali mundur sedikit), makin rapat menjelang akhir, dan lapisan sempat berkedip saat muncul.
function portalDive(el, ms, kind = 'glow') {
  const m = new DOMMatrix(getComputedStyle(el).transform), th = Math.atan2(m.b, m.a), sc = Math.hypot(m.a, m.b) || 1;
  const dw = el.offsetWidth * sc, dh = el.offsetHeight * sc, off = dh * .0225;                                         // ukuran pintu + selisih pusat ambang dari pusat pintu
  const b = el.getBoundingClientRect(), rb = roomBox(), sw = document.querySelector('.sw'), sr = sw.getBoundingClientRect();
  const cx = b.left + b.width / 2 - Math.sin(th) * off, cy = b.top + b.height / 2 + Math.cos(th) * off;              // pusat ambang di layar
  const VW = rb.width, VH = rb.height, n0 = Math.min(dw * .86 / VW, dh * .955 / VH);                                   // n0: skala portal supaya pas di dalam ambang
  const tx = cx - rb.left - VW / 2, ty = cy - rb.top - VH / 2, sky = kind === 'sky';
  const nx = document.createElement('div'); nx.id = 'nx'; nx.className = sky ? 'skybg' : 'glowbg' + (VEIL === 'dark' ? ' dark' : ''); nx.setAttribute('aria-hidden', 'true');
  nx.style.cssText = sky ? `position:fixed;z-index:2;left:${rb.left}px;top:${rb.top}px;width:${VW}px;height:${VH}px`   // langit: menempel di body supaya selamat saat layar hasil menggantikan #app
                         : `left:${rb.left - sr.left}px;top:${rb.top - sr.top}px;width:${VW}px;height:${VH}px`;
  const cs = getComputedStyle(el), ns = nx.style;
  ns.setProperty('--rc', cs.getPropertyValue('--c') || '#d4202c'); ns.setProperty('--rd', cs.getPropertyValue('--cd') || '#82111a');   // bingkai = bingkai pintu yang dipilih
  ns.setProperty('--fs', Math.max(0, (dw - VW * n0) / 2 / n0) + 'px');
  ns.setProperty('--ft', Math.max(0, (dh / 2 + off - VH * n0 / 2) / n0) + 'px');
  ns.setProperty('--fb', Math.max(0, (dh / 2 - off - VH * n0 / 2) / n0) + 'px');
  nx.innerHTML = RING; (sky ? document.body : sw).appendChild(nx);
  const ss = x => x * x * (3 - 2 * x), N = 9, bk = 2 + Math.floor(Math.random() * 3);   // bk: lompatan yang mundur sedikit
  const cam = Array.from({length: N + 1}, (_, i) => { let u = i / N; if (i === bk) u -= .07; const r = 1 - u;
    return {offset: i / N, easing: STEP, transform: `translate(${tx * r}px,${ty * r}px) rotate(${th * (1 - ss(Math.min(1, u / .75)))}rad) scale(${Math.pow(n0, r)})`}; });
  const an = [nx.animate(cam, {duration: ms, easing: ZOOM_EASE, fill: 'forwards'}),
              nx.animate([{opacity: .01, offset: 0}, {opacity: .01, offset: .04}, {opacity: 1, offset: .16}, {opacity: .45, offset: .24}, {opacity: 1, offset: .3}, {opacity: 1, offset: 1}], {duration: ms, easing: 'linear', fill: 'forwards'})];
  return {
    done: Promise.all(an.map(a => a.finished)).catch(() => {}),
    hold: () => { ns.opacity = 1; ns.transform = 'none'; an.forEach(a => a.cancel()); },                                      // penuh layar, diam
    out: () => flick(nx, [1, .25, .9, .4, .75, .1, 0], 380).finished.then(() => nx.remove(), () => nx.remove())               // berkedip lalu hilang
  };
}

/* ---------- REWIND (salah pintu) ----------
   Glitch ala pita video rusak, bukan zoom mundur: layar tersentak-sentak (ruangan dan dinding bergeser berlawanan arah), garis scan + pita menyapu,
   bar sobekan (putih / cyan / magenta) loncat-loncat, angka "Pintu ke-N" menghitung mundur dengan bayangan RGB. Di tengah ada kilat putih singkat:
   saat itu ruangan 1 diganti diam-diam (potongan keras tertutup kilat). Semua transform + opacity, tidak ada filter. Total 0,9 detik. */
async function rewind(was) {
  const s = $('s'), sw = document.querySelector('.sw'), room = document.querySelector('body > .room'); if (!s || !sw) return;
  const ms = 900, cut = Math.round(ms * .46), H = innerHeight;
  s.classList.remove('flash'); msg('');
  const rw = document.createElement('div'); rw.id = 'rw'; rw.innerHTML = '<i></i><b></b><b></b><b></b><u></u>';
  document.body.appendChild(rw); document.body.classList.add('gl');
  rw.animate([{opacity: 0}, {opacity: 1, offset: .12}, {opacity: 1, offset: .85}, {opacity: 0}], {duration: ms, easing: 'linear', fill: 'forwards'});
  rw.firstChild.animate([{transform: 'translateY(105vh)'}, {transform: 'translateY(-25vh)'}], {duration: ms / 2, iterations: 2, easing: 'linear'});
  rw.querySelectorAll('b').forEach(bar => {                                          // bar sobekan: tinggi acak, loncat ke posisi acak tiap langkah, sebagian langkah hilang
    bar.style.height = rnd(2.5, 7) + '%';
    bar.animate(Array.from({length: 10}, (_, i) => ({offset: i / 10, easing: STEP, opacity: Math.random() < .35 ? 0 : 1, transform: `translate(${sgn() * rnd(0, 26)}px,${rnd(0, H * .92)}px)`})).concat({offset: 1, opacity: 0}), {duration: ms});
  });
  rw.querySelector('u').animate([{opacity: 0, offset: 0}, {opacity: .9, offset: .4, easing: STEP}, {opacity: 0, offset: .5, easing: STEP}, {opacity: .35, offset: .56, easing: STEP}, {opacity: 0, offset: .6}], {duration: ms});   // kilat putih: menutupi pergantian ruangan di detik ke-cut
  jolt(sw, ms, 16, 12); jolt(room, ms, 14, 9);
  setTimeout(() => drawDoors(plan()), cut);                                           // ruangan 1 (state server sudah di-reset), diganti saat layar tertutup kilat
  let last = -1; const t0 = performance.now();
  const tk = n => { const u = Math.min(1, (n - t0) / cut), rd = Math.round(was * (1 - u)); if (rd !== last) { last = rd; updateHud(rd); } if (u < 1) requestAnimationFrame(tk); };
  requestAnimationFrame(tk);
  await sleep(ms + 40);
  rw.remove(); document.body.classList.remove('gl'); updateHud(); busy = false;
}

// Lapisan cahaya layar penuh (mode ringan ?z=fade): berkedip naik menutup layar, berkedip turun membuka ruangan baru.
function glow(cover, ms) {
  let w = $('wash');
  if (!w) { w = document.createElement('div'); w.id = 'wash'; document.body.appendChild(w); }
  w.classList.toggle('dark', VEIL === 'dark');
  w.getAnimations().forEach(a => a.cancel());
  return flick(w, cover ? [0, .35, .1, .8, .5, 1] : [1, .3, .85, .2, .55, 0], ms);
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