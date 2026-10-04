// ====== ISI DUA BARIS INI (Supabase > Project Settings > API) ======
const SB_URL = 'https://rnmcnpclkpjpsqcjnwsq.supabase.co';
const SB_KEY = 'sb_publishable_3NU0T5iJbQTwkXq-Ej_3Qw_XkJhTNgz';   // JANGAN pernah isi service_role key
// ===================================================================

const app = document.getElementById('app');
const COLORS = [{n:'Merah',l:'M',c:'#d62828'},{n:'Biru',l:'B',c:'#1d4ed8'},{n:'Kuning',l:'K',c:'#f2c500'}];
let token = null, st = null, timer = null, busy = false;

const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const mmss = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.max(0,Math.floor(s%60))).padStart(2,'0')}`;
const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };

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
  clearInterval(timer);
  app.innerHTML = `
    <div class="sign">WELCOME<br>AMUSEMENT PARK</div>
    <form id="f" style="display:grid;gap:14px">
      <label>Username<input name="u" autocomplete="username" required></label>
      <label>Password (tanggal lahir, ddmmyy)<input name="c" type="password" inputmode="numeric" autocomplete="current-password" required></label>
      <div class="err" id="e">${esc(msg)}</div>
      <button class="btn">Masuk</button>
    </form>`;
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

const INTRO = [
  {sign:'WELCOME', text:'Selamat datang di taman hiburan. Nikmati kunjungan Anda.', btn:'Jalan-jalan'},
  {sign:'STAFF ONLY', text:'Pintu ini seharusnya terkunci.', btn:'Masuk'},
  {sign:'BACKROOMS', text:`Ada 3 pintu: merah, biru, kuning. Satu benar, dua salah. Tidak ada petunjuk, temukan urutannya sendiri. Posisi pintu selalu berubah, jadi ingat warnanya. Salah pintu = kembali ke pintu pertama. Waktu terus berjalan (15 menit).`, btn:'Mulai'}
];
function intro(i) {
  const s = INTRO[i];
  app.innerHTML = `<div class="sign">${s.sign}</div><p>${s.text}</p><button class="btn" id="n">${s.btn}</button>`;
  document.getElementById('n').onclick = async () => {
    if (i < 2) return intro(i + 1);
    try { await rpc('start_game', {p_token: token}); route(); } catch (x) { alert(x.message); }
  };
}

function game() {
  const doors = shuffle([0,1,2]).map(i => `<button class="door" data-c="${i}" style="background:${COLORS[i].c}" aria-label="Pintu ${COLORS[i].n}"><span>${COLORS[i].l}</span></button>`).join('');
  app.innerHTML = `
    <div class="bar"><div class="time" id="t"></div><div class="mute" style="text-align:right">Percobaan ${st.attempts}<br>Pintu ke-${st.round+1} dari ${st.total}</div></div>
    <div class="doors" id="d">${doors}</div>
    <div class="err" id="m" style="text-align:center"></div>
    <p class="mute" style="text-align:center">Terlewati: ${st.cleared}</p>`;
  clearInterval(timer);
  const tick = async () => {
    const left = st.limit - (st.elapsed + (Date.now() - st.t0) / 1000);
    const t = document.getElementById('t'); if (!t) return;
    t.textContent = mmss(left); t.classList.toggle('low', left < 60);
    if (left <= 0) { clearInterval(timer); await rpc('get_state', {p_token: token}); route(); }
  };
  tick(); timer = setInterval(tick, 1000);
  document.querySelectorAll('.door').forEach(b => b.onclick = () => pick(+b.dataset.c));
}

async function pick(c) {
  if (busy) return; busy = true;
  try {
    const d = await rpc('choose', {p_token: token, p_color: c});
    if (d.error) throw new Error(d.error);
    if (st.status !== 'playing') { busy = false; return route(); }
    if (d.correct) { busy = false; return game(); }
    const m = document.getElementById('m'), ds = document.getElementById('d');
    m.textContent = 'Salah. Kembali ke pintu pertama.'; ds.classList.add('flash');
    setTimeout(() => { busy = false; game(); }, 1100);
  } catch (x) { busy = false; document.getElementById('m').textContent = x.message; }
}

function result() {
  clearInterval(timer);
  const win = st.status === 'escaped';
  app.innerHTML = `
    <h1>${win ? 'CONGRATULATIONS,<br>' + esc(st.name.toUpperCase()) + '.' : 'TIME&rsquo;S UP,<br>' + esc(st.name.toUpperCase()) + '.'}</h1>
    <p>${win ? 'Kamu berhasil keluar dari taman.' : 'Waktu habis. Kamu masih terjebak di Backrooms.'}</p>
    <div class="stats">
      <div><span>Waktu</span><b>${mmss(st.elapsed)}</b></div>
      <div><span>Percobaan</span><b>${st.attempts}</b></div>
      <div><span>Pintu terlewati</span><b>${st.cleared}</b></div>
      <div><span>Session ID</span><b>DR-${esc(st.code)}</b></div>
    </div>
    <p class="mute">Screenshot halaman ini dan kirim ke admin.</p>`;
}

loginScreen();
