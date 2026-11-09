(() => {
'use strict';

/* ============================================================
   Pendaki Bakteri - platformer kuis memanjat gunung (2D, Canvas)
   Kontrol: A/D (atau panah) jalan, W/Spasi loncat, W di tangga memanjat
   ============================================================ */

const $ = s => document.querySelector(s);
const cfg = Object.assign({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '', FIREBASE_DB_URL: '', SHUFFLE_QUESTIONS: true, SHUFFLE_OPTIONS: true }, window.CONFIG || {});
const ALL_Q = window.QUESTIONS || [];

const PATTERN = ['ladder', 'virus', 'ladder', 'ladder', 'virus', 'ladder', 'virus', 'ladder', 'virus', 'ladder'];
const TOTAL = Math.min(PATTERN.length, ALL_Q.length);
const KELAS = Array.from({ length: 10 }, (_, i) => 'X-' + (i + 1));

const RUN = 235, GRAV = 1900, JUMP = 640, STEP = 24, LEAN = 44, CLIMB = 140;

// Senjata dibuka lewat jawaban benar di soal virus (urut: virus ke-1 .. ke-4)
const WEAPONS = [
  { name: 'Semprotan Disinfektan', dmg: 1, rate: 0.42, speed: 480, r: 6, life: 0.85, col: '#6be3ff' },
  { name: 'Pistol Antibiotik', dmg: 1, rate: 0.2, speed: 620, r: 6, life: 0.8, col: '#ffb703' },
  { name: 'Laser UV', dmg: 2, rate: 0.32, speed: 900, r: 7, life: 0.65, col: '#c07bff' },
  { name: 'Meriam Vaksin', dmg: 4, rate: 0.6, speed: 560, r: 12, life: 1.0, col: '#4ade80' }
];
const VIRUS_HP = [5, 6, 8, 10];

const el = {
  hud: $('#hud'), progText: $('#progText'), progFill: $('#progFill'), hudPlayer: $('#hudPlayer'), hudQ: $('#hudQ'), stopwatch: $('#stopwatch'), hudHp: $('#hudHp'), hudWpn: $('#hudWpn'),
  mute: $('#muteBtn'), toast: $('#toast'), pad: $('#pad'),
  menu: $('#menu'), name: $('#nameInput'), cls: $('#classSelect'), menuErr: $('#menuErr'),
  start: $('#startBtn'), openBoard: $('#openBoardBtn'),
  quiz: $('#quiz'), qTag: $('#qTag'), qText: $('#qText'), opts: $('#opts'), fb: $('#fb'), fbTitle: $('#fbTitle'),
  fbText: $('#fbText'), next: $('#nextBtn'),
  board: $('#board'), result: $('#result'), resTitle: $('#resTitle'), resScore: $('#resScore'), resBenar: $('#resBenar'),
  resTime: $('#resTime'), resSave: $('#resSave'), boardClass: $('#boardClass'), table: $('#boardTable tbody'),
  boardNote: $('#boardNote'), closeBoard: $('#closeBoardBtn')
};

/* ---------------- util ---------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const ma = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a) => a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => css(ma(a, b, t));
const shade = (c, f) => [clamp(c[0] * f, 0, 255), clamp(c[1] * f, 0, 255), clamp(c[2] * f, 0, 255)];
function ramp(stops, t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) { const a = stops[i - 1], b = stops[i]; return ma(a[1], b[1], (t - a[0]) / ((b[0] - a[0]) || 1)); }
  }
  return stops[stops.length - 1][1];
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const NIGHT = [26, 38, 92];
const OUT = '#16213e';

/* ---------------- suara ---------------- */
let audioCtx = null, muted = false;
function tone(f, d, type = 'sine', v = 0.07, delay = 0) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + delay, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + d);
  } catch (e) { /* abaikan */ }
}
const sfx = {
  ok() { tone(660, .12, 'triangle'); tone(880, .2, 'triangle', .07, .1); },
  bad() { tone(220, .35, 'sawtooth', .05); tone(160, .35, 'sawtooth', .05, .12); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, .28, 'triangle', .07, i * .13)); },
  jump() { tone(340, .1, 'square', .025); tone(520, .1, 'square', .025, .05); },
  land() { tone(110, .08, 'sine', .06); },
  shoot(i) { tone([760, 980, 1500, 180][i], .07, i === 3 ? 'sawtooth' : 'square', .03); if (i === 3) tone(110, .22, 'sawtooth', .05, .03); },
  spit() { tone(240, .16, 'sawtooth', .03); tone(180, .16, 'sawtooth', .03, .06); },
  hit() { tone(420, .06, 'square', .04); },
  rumble() { tone(70, .6, 'sawtooth', .07); tone(55, .6, 'square', .04, .1); },
  unlock() { tone(520, .1, 'triangle', .06); tone(780, .1, 'triangle', .06, .08); tone(1040, .18, 'triangle', .06, .16); }
};
el.mute.onclick = () => { muted = !muted; el.mute.textContent = muted ? '🔇' : '🔊'; };

/* ---------------- canvas ---------------- */
const canvas = $('#game'), ctx = canvas.getContext('2d');
let VW = 800, VH = 600, S = 1, DPR = 1;
function resize() {
  DPR = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * DPR);
  canvas.height = Math.floor(innerHeight * DPR);
  S = innerHeight / 600;
  if (innerWidth / S < 640) S = innerWidth / 640;
  VW = innerWidth / S; VH = innerHeight / S;
}
addEventListener('resize', resize); resize();

/* ---------------- dunia ---------------- */
let world = null;
function groundY(x) {
  const p = world.pts;
  if (x <= p[0].x) return p[0].y;
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i].x) {
      const a = p[i - 1], b = p[i], dx = b.x - a.x;
      if (dx < 0.5) return b.y;
      return a.y + (b.y - a.y) * (x - a.x) / dx;
    }
  }
  return p[p.length - 1].y;
}

function buildWorld(n) {
  const pts = [{ x: -600, y: 0 }, { x: 0, y: 0 }, { x: 520, y: 0 }];
  const stages = [], plats = [], spikes = [], pits = [], cps = [{ x: 0 }], obbies = [];
  let x = 520, y = 0, vc = 0;
  const D = 420;

  // --- potongan rintangan ---
  const hurdle = (x0, h, w) => { pts.push({ x: x0, y }, { x: x0 + 0.1, y: y - h }, { x: x0 + w, y: y - h }, { x: x0 + w + 0.1, y }); return x0 + w; };
  const pit = (x0, w, stones, mover) => {
    pts.push({ x: x0, y }, { x: x0 + 0.1, y: y + D, floor: true }, { x: x0 + w, y: y + D, floor: true }, { x: x0 + w + 0.1, y });
    pits.push({ x0, x1: x0 + w, rimY: y, floor: y + D });
    for (const s of (stones || [])) plats.push({ cx: x0 + s[0], cx0: x0 + s[0], w: s[2] || 84, y: y - (s[1] || 0), dx: 0, mv: false });
    if (mover) {
      const ph = x0 * 0.013;
      plats.push({ cx: x0 + mover[0] + Math.sin(ph) * mover[1], cx0: x0 + mover[0], w: mover[3] || 104, y, dx: 0, mv: true, range: mover[1], speed: mover[2], ph });
    }
    return x0 + w;
  };
  const spike = (x0, k) => { spikes.push({ x: x0 + k * 20, w: k * 40, y }); return x0 + k * 40; };

  // satu obby per sesi, makin lama makin sulit
  const obby = (i, a) => {
    switch (i) {
      case 0: { let c = hurdle(a, 40, 56); c = hurdle(c + 170, 52, 56); return c; }
      case 1: return pit(a, 260, [[126, 0]]);
      case 2: { let c = spike(a, 2); c = spike(c + 190, 2); return c; }
      case 3: return pit(a, 380, [], [190, 95, 1.1]);
      case 4: { let c = hurdle(a, 44, 56); c = spike(c + 150, 2); c = hurdle(c + 150, 52, 56); return c; }
      case 5: return pit(a, 330, [[126, 0, 76], [286, 26, 76]]);
      case 6: { let c = pit(a, 440, [], [220, 120, 1.0]); c = spike(c + 180, 2); return c; }
      case 7: return pit(a, 560, [[126, 0, 80], [286, 30, 80], [446, 0, 80]]);
      case 8: { let c = spike(a, 1); c = spike(c + 140, 2); c = hurdle(c + 170, 48, 56); c = pit(c + 150, 270, [[126, 0]]); return c; }
      case 9: return pit(a, 480, [], [240, 130, 1.2, 100]);
      default: { let c = pit(a, 270, [[126, 0]]); c = spike(c + 170, 2); return c; }
    }
  };

  for (let i = 0; i < n; i++) {
    const type = PATTERN[i];
    const ox = x + 260;
    cps.push({ x: ox - 60 });
    const oe = obby(i, ox);
    obbies.push({ x0: ox - 70, x1: oe + 70 });
    const xq = oe + 300;
    if (type === 'ladder') {
      const xc = xq + 400, H = 160, cp = { x: xc, y };
      pts.push({ x: xq, y }, cp, { x: xc + 0.1, y: y - H });
      stages.push({ i, type, xq, xc, H, yLow: y, yTop: y - H, lx: xc - 46, cp, state: 'pending', rampF: 0 });
      x = xc; y -= H;
    } else {
      const xe = xq + 560, rise = 80;
      pts.push({ x: xq, y }, { x: xe, y: y - rise });
      stages.push({ i, type, xq, xe, yLow: y, yTop: y - rise, vx: xq + 190, vi: vc++, state: 'pending' });
      x = xe; y -= rise;
    }
  }
  // rintangan terakhir sebelum bendera puncak
  const gx0 = x + 260;
  cps.push({ x: gx0 - 60 });
  const ge = obby(10, gx0);
  obbies.push({ x0: gx0 - 70, x1: ge + 70 });
  const flagX = ge + 420;
  pts.push({ x: flagX + 400, y });
  world = { pts, stages, plats, spikes, pits, cps, obbies, flagX, endX: flagX + 400, endY: y, trees: [], tufts: [], cracks: [] };

  const inObby = xx => obbies.some(o => xx > o.x0 && xx < o.x1);
  const blocked = xx => inObby(xx) || stages.some(s => s.type === 'ladder' ? (xx > s.xq - 80 && xx < s.xc + 40) : (xx > s.xq - 70 && xx < s.vx + 90))
    || Math.abs(xx - flagX) < 80 || (xx > -50 && xx < 70);
  for (let tx = -520; tx < world.endX; tx += 80 + hash(tx) * 110) {
    if (blocked(tx)) continue;
    const ty = groundY(tx);
    world.trees.push({ x: tx, y: ty, s: 0.8 + hash(tx * 3) * 0.75, kind: ty < -980 ? 'rock' : (hash(tx * 5) > 0.82 ? 'rock' : 'pine'), snowy: ty < -420 });
  }
  for (let tx = -520; tx < world.endX; tx += 14 + hash(tx * 1.3) * 22) {
    if (inObby(tx)) continue;
    world.tufts.push({ x: tx, h: 6 + hash(tx) * 10, k: hash(tx * 7), flower: hash(tx * 11) > 0.93 });
  }
  for (let i = 0; i < 360; i++) {
    const cx = -520 + hash(i * 13.7) * (world.endX + 520);
    world.cracks.push({ x: cx, y: groundY(cx) + 18 + hash(i * 5.3) * 280, a: hash(i * 3.1) * Math.PI, l: 10 + hash(i * 9) * 28 });
  }
}

/* ---------------- status game ---------------- */
const G = { mode: 'menu', clock: 0, time: 0, answered: 0, correct: 0, qs: [], cur: null, player: { name: '', kelas: '' }, locked: false, lastOk: false, ended: false, fight: null, fog: [214, 238, 255] };
let P = null, V = null, bullets = [], spits = [];
const cam = { x: 0, y: 0, look: 0 };
let particles = [], shake = 0, snow = [];
const keys = { l: 0, r: 0, u: 0, d: 0 };
let jumpQ = 0, spaceQ = 0;

function newPlayer() { return { x: 0, y: 0, vx: 0, vy: 0, onGround: true, face: 1, mode: 'move', anim: 0, t: 0, u: 0, cs: null, hurtT: 0, dustT: 0, hp: 3, inv: 0, cd: 0, recoil: 0, weapon: null, wi: -1, plat: null }; }
function prepareScene() {
  buildWorld(TOTAL);
  P = newPlayer(); P.y = groundY(0); V = null; particles = []; shake = 0; bullets = []; spits = [];
  for (const k in keys) keys[k] = 0;
  cam.x = P.x - VW * 0.38; cam.y = P.y - VH * 0.62; cam.look = 0;
  snow = Array.from({ length: 70 }, (_, i) => ({ x: hash(i) * 1000, y: hash(i + 50) * 1000, s: 1 + hash(i + 9) * 2, v: 30 + hash(i + 3) * 50 }));
}

function burst(x, y, n, colors, spread = 260, up = 260) {
  for (let i = 0; i < n; i++) {
    particles.push({ kind: 'sq', x, y, vx: (Math.random() - .5) * spread, vy: -Math.random() * up - 40, life: 0, max: 0.8 + Math.random() * 0.8, c: colors[Math.floor(Math.random() * colors.length)], s: 3 + Math.random() * 4 });
  }
}
function dust(x, y, n, dir = 0) {
  for (let i = 0; i < n; i++) {
    particles.push({ kind: 'dust', x: x + (Math.random() - .5) * 10, y: y - 2, vx: (Math.random() - .5) * 60 - dir * 40, vy: -Math.random() * 40, life: 0, max: 0.35 + Math.random() * 0.3, c: '#d9c8a6', s: 3 + Math.random() * 3 });
  }
}
const GOOD = ['#2ecc71', '#ffd93d', '#6bcbff', '#ff8fa3', '#ffffff'];
const BAD = ['#ff5d5d', '#8e44ad', '#555', '#ffa94d'];

/* ---------------- HUD & toast ---------------- */
let toastT = 0;
function toast(msg, ms = 1900) {
  el.toast.textContent = msg; el.toast.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.add('hidden'), ms);
}
function updateHud() {
  const pct = Math.round(G.answered / TOTAL * 100);
  el.progText.textContent = pct + '%';
  el.progFill.style.width = pct + '%';
  el.hudQ.textContent = `Soal ${G.answered}/${TOTAL}`;
  const hp = P ? P.hp : 3;
  el.hudHp.textContent = '♥'.repeat(hp) + '♡'.repeat(Math.max(0, 3 - hp));
  el.hudWpn.textContent = P && P.weapon ? `🔫 ${P.weapon.name}` : '🔫 belum ada senjata';
}
const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
function syncPad() { el.pad.classList.toggle('hidden', !(isTouch && G.mode === 'playing' && el.quiz.classList.contains('hidden'))); }

/* ---------------- alur permainan ---------------- */
function startGame() {
  const name = el.name.value.trim().replace(/\s+/g, ' ');
  if (!name) { el.menuErr.textContent = 'Isi namamu dulu ya.'; el.name.focus(); return; }
  if (TOTAL < 1) { el.menuErr.textContent = 'Belum ada soal di questions.js.'; return; }
  el.menuErr.textContent = '';
  try { localStorage.setItem('pb_prefs', JSON.stringify({ name, kelas: el.cls.value })); } catch (e) { }
  G.player = { name, kelas: el.cls.value };
  let qs = cfg.SHUFFLE_QUESTIONS ? shuffle(ALL_Q) : ALL_Q.slice();
  qs = qs.slice(0, TOTAL).map(q => {
    let opts = q.options.map((t, i) => ({ t, ok: i === q.answer }));
    if (cfg.SHUFFLE_OPTIONS) opts = shuffle(opts);
    return { q: q.q, opts, explain: q.explain || '' };
  });
  G.qs = qs; G.answered = 0; G.correct = 0; G.time = 0; G.ended = false; G.locked = false; G.cur = null;
  prepareScene();
  el.stopwatch.textContent = '0:00';
  el.hudPlayer.textContent = `${name} • ${G.player.kelas}`;
  updateHud();
  el.menu.classList.add('hidden'); el.board.classList.add('hidden');
  el.hud.classList.remove('hidden');
  G.mode = 'playing'; syncPad();
  tone(440, .1, 'triangle');
  toast(isTouch ? 'Gunakan tombol di layar untuk berjalan dan loncat' : 'A/D jalan • W/Spasi loncat • W di tangga: panjat • J atau klik: tembak', 5000);
}

function openQuestion(s) {
  P.mode = 'ask'; P.vx = 0;
  for (const k in keys) keys[k] = 0;
  const q = G.qs[s.i];
  el.qTag.textContent = (s.type === 'ladder' ? '🪜 Tangga! Jawab benar untuk membukanya' : '🦠 Virus menghadang! Jawab benar untuk membuka senjata: ' + WEAPONS[s.vi].name) + `  •  Soal ${s.i + 1}/${TOTAL}`;
  el.qText.textContent = q.q;
  el.opts.innerHTML = '';
  q.opts.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt';
    const k = document.createElement('span'); k.className = 'k'; k.textContent = 'ABCD'[i];
    const t = document.createElement('span'); t.textContent = o.t;
    b.append(k, t);
    b.tabIndex = -1;
    b.onclick = e => { if (!e || e.detail === 0) return; answer(i); };   // hanya klik/tap asli, bukan keyboard
    el.opts.append(b);
  });
  el.fb.classList.add('hidden');
  el.quiz.classList.remove('hidden');
  G.locked = false; syncPad();
}

function answer(i) {
  if (G.locked || !G.cur || (P.mode !== 'ask')) return;
  G.locked = true;
  const s = G.cur, q = G.qs[s.i], ok = q.opts[i].ok;
  [...el.opts.children].forEach((b, j) => {
    b.disabled = true;
    if (q.opts[j].ok) b.classList.add('right');
    else if (j === i) b.classList.add('wrong');
  });
  G.answered++; if (ok) G.correct++; G.lastOk = ok;
  updateHud();
  ok ? sfx.ok() : sfx.bad();
  const right = q.opts.find(o => o.ok).t;
  el.fbTitle.textContent = ok ? '✅ Benar!' : '❌ Kurang tepat';
  el.fbText.textContent = (ok ? '' : `Jawaban yang benar: ${right}. `) + q.explain + (ok && s.type === 'virus' ? ` 🔓 Senjata terbuka: ${WEAPONS[s.vi].name}.` : '');
  el.next.textContent = s.type === 'ladder' ? (ok ? 'Buka tangga 🪜' : 'Tangga runtuh… ↗') : (ok ? 'Ambil senjata & lawan ⚔️' : (P.weapon ? 'Lawan dengan senjata lama ⚔️' : 'Lanjut ▶'));
  el.fb.classList.remove('hidden');
  el.next.focus();
}

function nextAfterAnswer() {
  if (!G.locked || P.mode !== 'ask') return;
  el.quiz.classList.add('hidden');
  const s = G.cur, ok = G.lastOk;
  P.mode = 'move';
  if (s.type === 'ladder') {
    if (ok) { s.state = 'unlocked'; sfx.unlock(); burst(s.lx + LEAN / 2, s.yLow - s.H / 2, 24, GOOD, 160, 200); toast('Tangga terbuka! Dekati tangga, tekan W untuk memanjat 🪜', 3200); }
    else { s.state = 'ramp'; sfx.rumble(); shake = 0.6; dust(s.xq + 120, s.yLow, 14); toast('Tangga runtuh! Lewati jalan miring ke kanan ↗', 3200); }
  } else if (ok) {
    P.weapon = WEAPONS[s.vi]; P.wi = s.vi; P.hp = 3;
    burst(P.x, P.y - 40, 26, GOOD, 220, 260); sfx.unlock();
    toast(`🔓 Senjata terbuka: ${P.weapon.name}! Tekan J / K untuk menembak`, 4200);
    startFight(s);
  } else if (P.weapon) {
    toast('Salah, tidak ada senjata baru. Lawan dengan senjata lamamu! ⚔️', 3600);
    startFight(s);
  } else {
    s.state = 'done';
    V.mode = 'flee'; V.t = 0; burst(P.x + 40, P.y - 30, 18, BAD); shake = 0.35;
    P.mode = 'hurt'; P.hurtT = 0.55; P.vx = -300; P.vy = -380; P.onGround = false;
    toast('Salah dan belum punya senjata. Virus mendorongmu mundur! 🦠');
  }
  updateHud(); syncPad();
}

function startFight(s) {
  s.state = 'fight'; G.fight = s;
  V.mode = 'fight'; V.hp = V.max = VIRUS_HP[s.vi]; V.bx = V.x; V.hx = s.xq + 400; V.fireT = 1.4; V.hurt = 0; V.t = 0;
  spits = []; bullets = [];
}

function endFight(win) {
  const s = G.fight; G.fight = null; spits = [];
  if (s) s.state = 'done';
  P.hp = 3;
  if (win) { V.mode = 'zap'; burst(V.x, V.cy, 40, GOOD, 320, 300); sfx.win(); toast('Virus kalah! ⚡'); }
  else { V.mode = 'flee'; V.t = 0; toast('Kamu kewalahan… virus kabur 🦠'); }
  updateHud();
}

function damage(n, fromX) {
  if (P.inv > 0 || P.mode === 'celebrate' || P.mode === 'climb' || P.mode === 'ask') return;
  P.hp = Math.max(0, P.hp - n); P.inv = 1.3; shake = 0.25; sfx.bad();
  burst(P.x, P.y - 34, 10, BAD, 200, 180); updateHud();
  if (P.hp <= 0) {
    if (G.fight) endFight(false);
    else { respawn('Kamu pingsan! Kembali ke checkpoint 🚩'); return; }
  }
  P.mode = 'hurt'; P.hurtT = 0.4; P.vx = (P.x < fromX ? -1 : 1) * 260; P.vy = -340; P.onGround = false; P.plat = null;
}

function respawn(msg) {
  let cp = world.cps[0];
  for (const c of world.cps) if (c.x <= P.x + 4) cp = c;
  P.x = cp.x; P.y = groundY(cp.x); P.vx = 0; P.vy = 0; P.onGround = true; P.plat = null;
  P.mode = 'move'; P.inv = 1.6; P.hp = 3; P.hurtT = 0; P.face = 1;
  burst(P.x, P.y - 30, 14, GOOD, 200, 200); sfx.bad(); toast(msg, 2600); updateHud();
}

function hazards() {
  if (P.mode === 'climb' || P.mode === 'celebrate') return;
  for (const t of world.pits) {
    if (P.x > t.x0 - 4 && P.x < t.x1 + 4 && P.y > t.rimY + 110) { respawn('Jatuh ke jurang! Kembali ke checkpoint 🚩'); return; }
  }
  if (P.inv <= 0) {
    for (const sp of world.spikes) {
      if (Math.abs(P.x - sp.x) < sp.w / 2 + 4 && P.y > sp.y - 14) { damage(1, sp.x); break; }
    }
  }
}

function shoot() {
  const w = P.weapon;
  if (!w || P.cd > 0 || P.mode !== 'move') return;
  P.cd = w.rate; P.recoil = 0.13;
  bullets.push({ x: P.x + P.face * 26, y: P.y - 46, vx: P.face * w.speed, life: 0, w, i: P.wi });
  sfx.shoot(P.wi);
}

/* ---------------- input ---------------- */
const KMAP = { a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r', w: 'u', arrowup: 'u', s: 'd', arrowdown: 'd', j: 'f', k: 'f', f: 'f', enter: 'f' };
document.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  const k = (e.key || '').toLowerCase();
  if (!el.quiz.classList.contains('hidden')) {
    // Jawaban wajib diklik. Keyboard hanya boleh untuk tombol Lanjut setelah menjawab.
    if (G.locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nextAfterAnswer(); }
    return;
  }
  if (G.mode !== 'playing') return;
  if (KMAP[k]) { keys[KMAP[k]] = 1; if (KMAP[k] === 'u' && !e.repeat) jumpQ = 0.15; e.preventDefault(); }
  else if (k === ' ' || e.code === 'Space') { if (!e.repeat) { jumpQ = 0.15; spaceQ = 0.15; } e.preventDefault(); }
});
document.addEventListener('keyup', e => { const k = (e.key || '').toLowerCase(); if (KMAP[k]) keys[KMAP[k]] = 0; });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
canvas.addEventListener('pointerdown', () => { if (G.mode === 'playing' && el.quiz.classList.contains('hidden')) keys.f = 1; });
addEventListener('pointerup', () => { keys.f = 0; });
if (el.pad && el.pad.querySelectorAll) {
  el.pad.querySelectorAll('button').forEach(b => {
    const k = b.dataset.k;
    const down = e => { e.preventDefault(); keys[k] = 1; if (k === 'u') jumpQ = 0.15; };
    const up = e => { e.preventDefault(); keys[k] = 0; };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  });
}

/* ---------------- fisika & update ---------------- */
function ladderNear() {
  for (const s of world.stages) {
    if (s.type === 'ladder' && s.state === 'unlocked' && Math.abs(P.x - s.lx) < 34 && Math.abs(P.y - s.yLow) < 10) return s;
  }
  return null;
}

function physics(dt, ax, accScale = 1) {
  let target = ax * RUN;
  if (P.onGround && !P.plat && ax !== 0) {
    let rise = (groundY(P.x) - groundY(P.x + ax * 8)) / 8;
    if (Math.abs(rise) > 0.8) rise = 0;
    target *= clamp(1 - rise * 0.55, 0.55, 1.12);
  }
  const acc = (P.onGround ? 2800 : 1500) * accScale;
  P.vx += clamp(target - P.vx, -acc * dt, acc * dt);
  if (ax !== 0) P.face = ax;
  if (!P.onGround) P.vy += GRAV * dt;

  if (P.plat) P.x += P.plat.dx;
  let nx = clamp(P.x + P.vx * dt, -520, world.endX - 40);
  if (G.fight) nx = Math.min(nx, G.fight.xq + 262);
  const gx = groundY(nx);
  if (gx < P.y - (P.onGround ? STEP : 4)) { nx = P.x; P.vx = 0; }
  P.x = nx;

  const prevY = P.y;
  if (P.onGround) {
    if (P.plat) {
      if (Math.abs(P.x - P.plat.cx) <= P.plat.w / 2 + 2) P.y = P.plat.y;
      else { P.plat = null; P.onGround = false; P.vy = 0; }
    } else {
      const g = groundY(P.x);
      if (g - P.y > 16) { P.onGround = false; P.vy = 0; }
      else P.y = g;
    }
  } else {
    const ny = P.y + P.vy * dt;
    let land = null;
    if (P.vy >= 0) for (const pl of world.plats) {
      if (Math.abs(P.x - pl.cx) <= pl.w / 2 + 3 && prevY <= pl.y + 6 && ny >= pl.y) { land = pl; break; }
    }
    const g = groundY(P.x);
    if (land) {
      if (P.vy > 420) { sfx.land(); dust(P.x, land.y, 6); }
      P.y = land.y; P.vy = 0; P.onGround = true; P.plat = land;
    } else if (P.vy >= 0 && ny >= g) {
      if (P.vy > 420) { sfx.land(); dust(P.x, g, 8); }
      P.y = g; P.vy = 0; P.onGround = true; P.plat = null;
    } else P.y = ny;
  }
  const sp = Math.abs(P.vx) / RUN;
  if (P.onGround && sp > 0.05) {
    P.anim += dt * (7 + sp * 6);
    P.dustT -= dt;
    if (P.dustT <= 0 && sp > 0.6) { P.dustT = 0.16; dust(P.x, P.y, 1, Math.sign(P.vx)); }
  } else if (!P.onGround) P.anim += dt * 2;
}

function updatePlayer(dt) {
  jumpQ = Math.max(0, jumpQ - dt); spaceQ = Math.max(0, spaceQ - dt);
  P.cd = Math.max(0, P.cd - dt); P.inv = Math.max(0, P.inv - dt); P.recoil = Math.max(0, P.recoil - dt);
  switch (P.mode) {
    case 'move': {
      const ax = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
      let acted = false;
      if ((jumpQ > 0 || keys.u) && P.onGround) {
        const s = ladderNear();
        if (s) { P.mode = 'climb'; P.cs = s; P.u = 0; P.vx = 0; P.face = 1; jumpQ = 0; acted = true; }
      }
      if (!acted) {
        if (jumpQ > 0 && P.onGround) { P.vy = -JUMP; P.onGround = false; P.plat = null; jumpQ = 0; sfx.jump(); dust(P.x, P.y, 5); }
        physics(dt, ax);
        if (keys.f) shoot();
        hazards();
        if (P.mode === 'move') checkTriggers();
      }
      break;
    }
    case 'climb': {
      const s = P.cs, dir = (keys.u ? 1 : 0) - (keys.d ? 1 : 0);
      if (spaceQ > 0) { P.mode = 'move'; P.onGround = false; P.vx = -140; P.vy = -120; spaceQ = 0; jumpQ = 0; break; }
      P.u = clamp(P.u + dir * CLIMB / s.H * dt, 0, 1);
      P.anim += Math.abs(dir) * dt * 10;
      P.x = s.lx + LEAN * P.u; P.y = s.yLow + (s.yTop - s.yLow) * P.u;
      if (P.u >= 1) {
        P.x = s.xc + 18; P.y = groundY(P.x); P.vx = 0; P.vy = 0; P.onGround = true; P.mode = 'move'; P.face = 1;
        s.state = 'done'; burst(P.x, P.y - 40, 18, GOOD, 200, 240); toast('Sampai di atas! 🎉'); jumpQ = 0;
      } else if (P.u <= 0 && dir < 0) {
        P.x = s.lx; P.y = s.yLow; P.mode = 'move'; P.onGround = true; P.vx = 0; jumpQ = 0;
      }
      break;
    }
    case 'ask': physics(dt, 0); break;
    case 'virusIn':
      physics(dt, 0);
      if (V && V.mode === 'idle') openQuestion(G.cur);
      break;
    case 'hurt':
      P.hurtT -= dt; physics(dt, 0, 0.22); hazards();
      if (P.mode === 'hurt' && P.hurtT <= 0) P.mode = 'move';
      break;
    case 'celebrate':
      P.t += dt; physics(dt, 0);
      if (P.onGround && Math.random() < dt * 1.5) { P.vy = -430; P.onGround = false; }
      if (Math.random() < dt * 6) burst(world.flagX + (Math.random() - .5) * 240, groundY(world.flagX) - 170, 14, GOOD, 300, 300);
      if (P.t > 2.8 && !G.ended) endGame();
      break;
  }
}

function checkTriggers() {
  for (const s of world.stages) {
    if (s.state !== 'pending') continue;
    if (P.x >= s.xq) {
      G.cur = s; P.x = s.xq; P.vx = 0;
      if (s.type === 'ladder') openQuestion(s);
      else {
        P.mode = 'virusIn'; P.face = 1;
        const gy = groundY(s.vx);
        V = { x: s.vx, gy, cy: gy - 36 - 560, vy: 0, mode: 'drop', t: 0, scale: 1, rot: 0, hp: 0, max: 1, hurt: 0 };
        tone(500, .25, 'sawtooth', .04);
      }
    }
    break;
  }
  if (P.mode === 'move' && P.x >= world.flagX && G.answered >= TOTAL) {
    P.mode = 'celebrate'; P.t = 0; P.vx = 0;
    burst(world.flagX, groundY(world.flagX) - 120, 60, GOOD, 500, 420);
    sfx.win();
  }
}

function updateShots(dt) {
  for (const b of bullets) {
    b.x += b.vx * dt; b.life += dt;
    if (b.y > groundY(b.x) - 2) { b.dead = true; burst(b.x, b.y, 4, [b.w.col], 80, 60); continue; }
    if (b.life > b.w.life) { b.dead = true; continue; }
    if (V && V.mode === 'fight' && Math.hypot(b.x - V.x, b.y - V.cy) < 34 + b.w.r) {
      b.dead = true; V.hp -= b.w.dmg; V.hurt = 0.14; sfx.hit();
      burst(b.x, b.y, 8, [b.w.col, '#ffffff'], 180, 140);
      if (V.hp <= 0) endFight(true);
    }
  }
  bullets = bullets.filter(b => !b.dead);
  for (const sp of spits) {
    sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.life += dt;
    if (sp.life > 3.5 || sp.y > groundY(sp.x) - 2) { sp.dead = true; continue; }
    if (Math.hypot(sp.x - P.x, sp.y - (P.y - 36)) < 22) { sp.dead = true; damage(1, sp.x - sp.vx); }
  }
  spits = spits.filter(s => !s.dead);
}

function update(dt) {
  G.clock += dt;
  if (G.mode === 'playing' && P.mode !== 'celebrate') G.time += dt;
  if (G.mode === 'playing' || G.mode === 'ended') { const ts = fmtTime(G.time); if (el.stopwatch.textContent !== ts) el.stopwatch.textContent = ts; }
  if (shake > 0) shake = Math.max(0, shake - dt);

  for (const pl of world.plats) {
    if (!pl.mv) continue;
    const nx = pl.cx0 + Math.sin(G.clock * pl.speed + pl.ph) * pl.range;
    pl.dx = nx - pl.cx; pl.cx = nx;
  }
  for (const s of world.stages) {
    if (s.type === 'ladder' && s.state === 'ramp' && s.rampF < 1) {
      s.rampF = Math.min(1, s.rampF + dt * 1.1);
      s.cp.y = s.yLow - s.H * s.rampF;
      if (Math.random() < dt * 30) dust(s.xq + Math.random() * (s.xc - s.xq) * s.rampF, groundY(s.xq + 40), 1);
    }
  }
  for (const p of particles) { p.life += dt; if (p.kind === 'sq') p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  particles = particles.filter(p => p.life < p.max);

  if (V) {
    V.t += dt;
    if (V.mode === 'drop') {
      V.vy += 1500 * dt; V.cy += V.vy * dt;
      if (V.cy >= V.gy - 36) { V.cy = V.gy - 36; V.mode = 'idle'; shake = 0.25; dust(V.x, V.gy, 8); tone(120, .25, 'square', .06); }
    } else if (V.mode === 'fight') {
      V.bx += (V.hx - V.bx) * Math.min(1, dt * 1.6);
      V.x = V.bx + Math.sin(V.t * 0.9) * 55;
      V.gy = groundY(V.x);
      const tcy = groundY(P.x) - 52 + Math.sin(V.t * 2.2) * 12;
      V.cy += (tcy - V.cy) * Math.min(1, dt * 3);
      V.hurt = Math.max(0, V.hurt - dt);
      V.fireT -= dt;
      if (V.fireT <= 0) {
        V.fireT = 1.5 + Math.random() * 0.5;
        const dx = P.x - V.x, dy = (P.y - 38) - V.cy, d = Math.hypot(dx, dy) || 1;
        spits.push({ x: V.x - 18, y: V.cy, vx: dx / d * 240, vy: dy / d * 240, life: 0 });
        sfx.spit();
      }
      if (Math.hypot(P.x - V.x, (P.y - 36) - V.cy) < 46) damage(1, V.x);
    } else if (V.mode === 'zap') {
      V.scale -= dt * 2.4; V.rot += dt * 14;
      if (V.scale <= 0) V = null;
    } else if (V.mode === 'flee') {
      V.cy -= 320 * dt; V.x += 140 * dt; V.rot += dt * 6;
      if (V.t > 1.6) V = null;
    }
  }

  if (G.mode === 'playing') { updatePlayer(dt); updateShots(dt); }
  else if (G.mode === 'menu') P.anim += dt;

  // kamera
  cam.look += ((P.face || 1) * 70 - cam.look) * Math.min(1, dt * 2.5);
  const anchor = P.mode === 'ask' ? 0.4 : 0.62;
  const tx = P.x - VW * 0.38 + cam.look * 0.6, ty = P.y - VH * anchor;
  const snap = G.mode === 'menu';
  cam.x += (tx - cam.x) * (snap ? 1 : Math.min(1, dt * 6));
  cam.y += (ty - cam.y) * (snap ? 1 : Math.min(1, dt * 3.2));

  if (alt() > 0.3) for (const f of snow) {
    f.y += f.v * dt; f.x += Math.sin(G.clock + f.s * 3) * 12 * dt - 10 * dt;
    if (f.y > VH) { f.y = -4; f.x = Math.random() * VW; }
    if (f.x < -4) f.x = VW;
  }
}

/* ---------------- render: langit & latar ---------------- */
const alt = () => clamp(-cam.y / 1500, 0, 1);

function drawSky() {
  const al = alt();
  const top = ma([88, 168, 255], [10, 18, 66], al), bot = ma([218, 240, 255], [64, 104, 196], al);
  G.fog = bot;
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, css(top)); g.addColorStop(1, css(bot));
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  const sx = VW * 0.8, sy = VH * 0.16 + al * 40;
  const sg = ctx.createRadialGradient(sx, sy, 6, sx, sy, VH * 0.6);
  sg.addColorStop(0, `rgba(255,244,200,${Math.max(0, 0.9 - al * 0.8)})`);
  sg.addColorStop(0.25, `rgba(255,226,150,${Math.max(0, 0.35 - al * 0.35)})`);
  sg.addColorStop(1, 'rgba(255,226,150,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = `rgba(255,251,230,${Math.max(0, 0.95 - al * 0.9)})`;
  ctx.beginPath(); ctx.arc(sx, sy, 28, 0, 7); ctx.fill();
  if (al > 0.35) {
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${(al - 0.35) * (0.5 + hash(i + 7) * 0.7)})`;
      ctx.fillRect(hash(i) * VW, hash(i + 99) * VH * 0.65, 1.6, 1.6);
    }
  }
}

function peaks(par, baseFrac, period, hmin, hmax, seed, L, D, snowCap, fogAmt) {
  const al = alt(), offx = cam.x * par, offy = cam.y * par * 0.55;
  const k0 = Math.floor(offx / period) - 1, n = Math.ceil(VW / period) + 3, by = VH * baseFrac - offy;
  const cl = mix(L, NIGHT, al * 0.65), cd = mix(D, NIGHT, al * 0.65);
  for (let k = k0; k < k0 + n; k++) {
    const h = hmin + hash(k * 7 + seed) * (hmax - hmin);
    const x0 = k * period - offx, x1 = x0 + period, xm = x0 + period / 2 + (hash(k * 3 + seed) - 0.5) * period * 0.3;
    const py = by - h, xr = xm + period * 0.07;
    ctx.fillStyle = cd; ctx.beginPath(); ctx.moveTo(x0, by + 2); ctx.lineTo(xm, py); ctx.lineTo(xr, by + 2); ctx.fill();
    ctx.fillStyle = cl; ctx.beginPath(); ctx.moveTo(xm, py); ctx.lineTo(x1, by + 2); ctx.lineTo(xr, by + 2); ctx.fill();
    if (snowCap && h > hmin + (hmax - hmin) * 0.35) {
      const ch = h * 0.3, Lx = xm - (xm - x0) * ch / h, Rx = xm + (x1 - xm) * ch / h;
      ctx.fillStyle = '#c9d9ef';
      ctx.beginPath(); ctx.moveTo(xm, py); ctx.lineTo(Lx, py + ch); ctx.lineTo(lerp(xm, Lx, 0.5), py + ch * 0.58); ctx.lineTo(xm, py + ch * 0.95); ctx.fill();
      ctx.fillStyle = '#f6fbff';
      ctx.beginPath(); ctx.moveTo(xm, py); ctx.lineTo(xm, py + ch * 0.95); ctx.lineTo(lerp(xm, Rx, 0.45), py + ch * 0.6); ctx.lineTo(Rx, py + ch); ctx.fill();
    }
  }
  ctx.fillStyle = cd; ctx.fillRect(0, by, VW, VH - by + 120);
  const fg = ctx.createLinearGradient(0, by - hmax, 0, by + 8);
  fg.addColorStop(0, css(G.fog, 0)); fg.addColorStop(1, css(G.fog, fogAmt));
  ctx.fillStyle = fg; ctx.fillRect(0, by - hmax, VW, hmax + 10);
}

function hills(par, baseFrac, cTop, cBot, amp, freq, seed) {
  const al = alt(), offx = cam.x * par, offy = cam.y * par * 0.55, by = VH * baseFrac - offy;
  const yAt = wx => by - amp * (0.55 + 0.45 * Math.sin(wx * freq + seed)) - amp * 0.35 * Math.sin(wx * freq * 2.3 + seed * 2);
  const g = ctx.createLinearGradient(0, by - amp * 1.6, 0, by + VH * 0.35);
  g.addColorStop(0, mix(cTop, NIGHT, al * 0.6)); g.addColorStop(1, mix(cBot, NIGHT, al * 0.6));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, VH + 120);
  for (let x = 0; x <= VW + 30; x += 30) ctx.lineTo(x, yAt(x + offx));
  ctx.lineTo(VW + 30, VH + 120); ctx.closePath(); ctx.fill();
  ctx.fillStyle = mix(cBot, NIGHT, al * 0.6);
  for (let x = -((offx) % 34); x < VW + 40; x += 34) {
    const wx = x + offx, h = 12 + hash(Math.floor(wx / 34) + seed) * 18, y = yAt(wx);
    ctx.beginPath(); ctx.moveTo(x - 7, y + 3); ctx.lineTo(x + 7, y + 3); ctx.lineTo(x, y - h); ctx.fill();
  }
}

function drawClouds() {
  const w = VW + 400, al = alt();
  for (let i = 0; i < 8; i++) {
    const x = ((i * 280 - cam.x * 0.16 + G.clock * 6) % w + w) % w - 200;
    const y = 36 + (i * 67) % 210 - cam.y * 0.1;
    const sc = 0.8 + hash(i) * 0.7;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.fillStyle = `rgba(150,176,220,${0.5 - al * 0.25})`;
    ctx.beginPath(); ctx.ellipse(28, 12, 52, 12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.92 - al * 0.45})`;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.arc(26, -10, 27, 0, 7); ctx.arc(56, 0, 21, 0, 7); ctx.arc(28, 4, 22, 0, 7); ctx.fill();
    ctx.restore();
  }
  if (al < 0.5) {
    ctx.strokeStyle = 'rgba(30,45,80,.6)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 330 + G.clock * 38 - cam.x * 0.3) % (VW + 200) + VW + 200) % (VW + 200) - 100;
      const y = 90 + i * 34 + Math.sin(G.clock * 0.8 + i) * 8 - cam.y * 0.14, f = Math.sin(G.clock * 9 + i * 2) * 4;
      ctx.beginPath(); ctx.moveTo(x - 7, y - 2 + f); ctx.quadraticCurveTo(x - 3, y - 4, x, y); ctx.quadraticCurveTo(x + 3, y - 4, x + 7, y - 2 + f); ctx.stroke();
    }
  }
}

/* ---------------- render: dunia ---------------- */
const LIP = [[0, [96, 190, 72]], [0.25, [118, 170, 76]], [0.5, [140, 158, 120]], [0.7, [200, 214, 226]], [1, [242, 247, 252]]];
const SUN = (() => { const l = Math.hypot(0.55, -0.85); return [0.55 / l, -0.85 / l]; })();

function drawEmbankments(x0, x1) {
  for (const s of world.stages) {
    if (s.type !== 'ladder' || s.xc < x0 || s.xq > x1 || s.rampF >= 1) continue;
    const g = ctx.createLinearGradient(0, s.yTop, 0, s.yLow);
    g.addColorStop(0, '#79a05a'); g.addColorStop(1, '#456b3a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(s.xq, s.yLow); ctx.lineTo(s.xc, s.yTop); ctx.lineTo(s.xc, s.yLow + 8); ctx.lineTo(s.xq, s.yLow + 8); ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#d9b985'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(s.xq + 6, s.yLow - 3); ctx.lineTo(s.xc, s.yTop - 3); ctx.stroke();
    ctx.strokeStyle = '#a98355'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.moveTo(s.xq + 6, s.yLow - 3); ctx.lineTo(s.xc, s.yTop - 3); ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawTerrain(x0, x1) {
  const p = world.pts, bottom = 2600;
  ctx.beginPath(); ctx.moveTo(p[0].x, bottom);
  for (const q of p) ctx.lineTo(q.x, q.y);
  ctx.lineTo(p[p.length - 1].x, bottom); ctx.closePath();
  const g = ctx.createLinearGradient(0, -1800, 0, 300);
  g.addColorStop(0, '#8591aa'); g.addColorStop(0.33, '#69738c'); g.addColorStop(0.55, '#70675a'); g.addColorStop(0.88, '#7b5b3c'); g.addColorStop(1, '#5e432b');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.lineJoin = 'round';
  const line = () => { ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (const q of p) ctx.lineTo(q.x, q.y); ctx.stroke(); };
  ctx.strokeStyle = 'rgba(0,0,0,.09)'; ctx.lineWidth = 420; line();
  ctx.strokeStyle = 'rgba(0,0,0,.09)'; ctx.lineWidth = 240; line();
  ctx.strokeStyle = 'rgba(255,232,190,.08)'; ctx.lineWidth = 70; line();
  ctx.lineCap = 'round';
  for (const c of world.cracks) {
    if (c.x < x0 || c.x > x1) continue;
    const x1c = c.x + Math.cos(c.a) * c.l, y1c = c.y + Math.sin(c.a) * c.l * 0.6;
    const x2c = x1c + Math.cos(c.a + 0.8) * c.l * 0.6, y2c = y1c + Math.sin(c.a + 0.8) * c.l * 0.5;
    ctx.strokeStyle = 'rgba(20,16,28,.3)'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(x1c, y1c); ctx.lineTo(x2c, y2c); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(c.x + 1.5, c.y + 1.5); ctx.lineTo(x1c + 1.5, y1c + 1.5); ctx.stroke();
  }
  // bayangan di sisi tebing
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (Math.abs(b.x - a.x) < 1 && Math.abs(b.y - a.y) > 100 && b.x > x0 - 60 && b.x < x1 + 60) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 70;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 26;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.restore();
  // bibir rumput dengan shading sesuai arah cahaya
  ctx.lineCap = 'round';
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], dx = b.x - a.x, dy = b.y - a.y;
    if (b.x < x0 - 80 || a.x > x1 + 80) continue;
    if (a.floor && b.floor) continue;
    if (Math.abs(dx) < 1) {
      ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      continue;
    }
    const d = Math.hypot(dx, dy), nx = dy / d, ny = -dx / d;
    const lit = clamp(0.66 + 0.5 * (nx * SUN[0] + ny * SUN[1]), 0.55, 1.12);
    const base = ramp(LIP, clamp(-(a.y + b.y) / 2 / 1500, 0, 1));
    ctx.strokeStyle = 'rgba(40,28,18,.35)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(a.x, a.y + 9); ctx.lineTo(b.x, b.y + 9); ctx.stroke();
    ctx.strokeStyle = css(shade(base, lit)); ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = css(shade(base, lit * 1.2), 0.55); ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 5); ctx.lineTo(b.x, b.y - 5); ctx.stroke();
  }
}

function drawTufts(x0, x1) {
  ctx.lineCap = 'round';
  for (const t of world.tufts) {
    if (t.x < x0 || t.x > x1) continue;
    const y = groundY(t.x);
    if (Math.abs(groundY(t.x + 3) - groundY(t.x - 3)) > 3.5 && Math.abs(groundY(t.x + 3) - groundY(t.x - 3)) > 40) continue;
    const base = ramp(LIP, clamp(-y / 1500, 0, 1));
    const sw = Math.sin(G.clock * 2 + t.x * 0.05) * 2;
    ctx.strokeStyle = css(shade(base, 0.8 + t.k * 0.3)); ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x - 3, y - 4); ctx.quadraticCurveTo(t.x - 3 + sw * 0.5, y - t.h * 0.7, t.x - 5 + sw, y - t.h - 4);
    ctx.moveTo(t.x, y - 4); ctx.quadraticCurveTo(t.x + sw * 0.5, y - t.h, t.x + sw, y - t.h * 1.3 - 4);
    ctx.moveTo(t.x + 3, y - 4); ctx.quadraticCurveTo(t.x + 3 + sw * 0.5, y - t.h * 0.7, t.x + 5 + sw, y - t.h - 3);
    ctx.stroke();
    if (t.flower && y > -700) {
      ctx.fillStyle = ['#ff6b8b', '#ffd23f', '#ffffff', '#b28bff'][Math.floor(t.k * 4) % 4];
      ctx.beginPath(); ctx.arc(t.x + sw, y - t.h * 1.3 - 6, 3, 0, 7); ctx.fill();
    }
  }
}

let pineG = null, rockG = null;
function drawTree(t) {
  if (!pineG) {
    pineG = ctx.createLinearGradient(-30, 0, 30, 0);
    pineG.addColorStop(0, '#1b5a38'); pineG.addColorStop(0.55, '#2f8f4e'); pineG.addColorStop(1, '#58c46f');
    rockG = ctx.createLinearGradient(-22, 0, 22, 0);
    rockG.addColorStop(0, '#6a6f7c'); rockG.addColorStop(0.6, '#9aa0ad'); rockG.addColorStop(1, '#c7ccd6');
  }
  const y = groundY(t.x);
  ctx.save(); ctx.translate(t.x, y + 3); ctx.scale(t.s, t.s);
  ctx.fillStyle = 'rgba(15,25,30,.25)'; ctx.beginPath(); ctx.ellipse(-14, 0, 30, 5, 0, 0, 7); ctx.fill();
  if (t.kind === 'rock') {
    ctx.fillStyle = rockG; ctx.strokeStyle = 'rgba(20,24,40,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-17, -17); ctx.lineTo(-4, -26); ctx.lineTo(12, -21); ctx.lineTo(22, -4); ctx.lineTo(22, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-17, -17); ctx.lineTo(-4, -26); ctx.lineTo(-2, 0); ctx.fill();
    if (t.snowy) { ctx.fillStyle = '#f4f9ff'; ctx.beginPath(); ctx.moveTo(-17, -17); ctx.lineTo(-4, -26); ctx.lineTo(12, -21); ctx.lineTo(4, -16); ctx.lineTo(-6, -19); ctx.lineTo(-12, -13); ctx.fill(); }
  } else {
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(-4, -22, 8, 24);
    ctx.fillStyle = '#7a5130'; ctx.fillRect(1, -22, 3, 24);
    for (let i = 0; i < 3; i++) {
      const by = -16 - i * 22, w = 28 - i * 4;
      ctx.fillStyle = pineG;
      ctx.beginPath(); ctx.moveTo(-w, by); ctx.lineTo(w, by); ctx.lineTo(0, by - 38); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.moveTo(-w, by); ctx.lineTo(w, by); ctx.lineTo(w * 0.7, by - 7); ctx.lineTo(-w * 0.7, by - 7); ctx.fill();
      if (t.snowy) {
        ctx.fillStyle = '#f4f9ff';
        ctx.beginPath(); ctx.moveTo(-w * 0.45, by - 21); ctx.lineTo(0, by - 38); ctx.lineTo(w * 0.45, by - 21); ctx.lineTo(w * 0.2, by - 17); ctx.lineTo(0, by - 22); ctx.lineTo(-w * 0.2, by - 16); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawLadder(s) {
  const fade = s.state === 'ramp' ? 1 - s.rampF : 1;
  if (fade <= 0.02) return;
  const locked = s.state === 'pending', open = s.state === 'unlocked';
  const dx = s.xc - s.lx;
  ctx.save(); ctx.globalAlpha = fade * (locked ? 0.7 : 1);
  ctx.lineCap = 'round';
  if (open) {
    ctx.strokeStyle = `rgba(90,255,160,${0.22 + Math.sin(G.clock * 4) * 0.08})`; ctx.lineWidth = 22;
    ctx.beginPath(); ctx.moveTo(s.lx, s.yLow); ctx.lineTo(s.lx + LEAN, s.yTop); ctx.stroke();
  }
  ctx.strokeStyle = '#4a2f16'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(s.lx - 10, s.yLow); ctx.lineTo(s.lx + LEAN - 10, s.yTop);
  ctx.moveTo(s.lx + 10, s.yLow); ctx.lineTo(s.lx + LEAN + 10, s.yTop); ctx.stroke();
  ctx.strokeStyle = '#a8713a'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(s.lx - 10, s.yLow); ctx.lineTo(s.lx + LEAN - 10, s.yTop);
  ctx.moveTo(s.lx + 10, s.yLow); ctx.lineTo(s.lx + LEAN + 10, s.yTop); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,225,170,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(s.lx + 11.5, s.yLow); ctx.lineTo(s.lx + LEAN + 11.5, s.yTop); ctx.stroke();
  const h = s.yLow - s.yTop;
  for (let t = 14; t < h; t += 20) {
    const u = t / h, cx = s.lx + LEAN * u, y = s.yLow - t;
    ctx.strokeStyle = '#4a2f16'; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.moveTo(cx - 10, y); ctx.lineTo(cx + 10, y); ctx.stroke();
    ctx.strokeStyle = '#d3a066'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 10, y); ctx.lineTo(cx + 10, y); ctx.stroke();
  }
  if (locked) {
    const cx = s.lx + LEAN * 0.5, cy = s.yLow - h * 0.5;
    ctx.strokeStyle = '#c9ccd4'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(cx, cy - 6, 6, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#f0b429'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(cx - 9, cy - 6, 18, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 7); ctx.fill();
  }
  ctx.restore();
  if (open && Math.abs(P.x - s.lx) < 160 && P.mode === 'move') {
    const bx = s.lx, by = s.yLow - h - 26 + Math.sin(G.clock * 5) * 3;
    ctx.fillStyle = 'rgba(14,24,50,.9)'; ctx.strokeStyle = '#ffb703'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - 38, by - 14, 76, 26, 8) : ctx.rect(bx - 38, by - 14, 76, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(isTouch ? '▲ panjat' : 'W panjat', bx, by + 4);
  }
}

function drawFlag() {
  const x = world.flagX, y = groundY(x);
  ctx.fillStyle = '#9aa3b5';
  ctx.beginPath(); ctx.moveTo(x - 38, y + 2); ctx.lineTo(x - 22, y - 16); ctx.lineTo(x + 2, y - 24); ctx.lineTo(x + 30, y - 12); ctx.lineTo(x + 42, y + 2); ctx.fill();
  ctx.fillStyle = '#f4f9ff'; ctx.beginPath(); ctx.moveTo(x - 22, y - 16); ctx.lineTo(x + 2, y - 24); ctx.lineTo(x + 18, y - 19); ctx.lineTo(x, y - 12); ctx.lineTo(x - 12, y - 14); ctx.fill();
  ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 175); ctx.stroke();
  const w = Math.sin(G.clock * 4) * 5;
  const fg = ctx.createLinearGradient(x, 0, x + 70, 0); fg.addColorStop(0, '#c1121f'); fg.addColorStop(1, '#ff4d5a');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(x, y - 175); ctx.quadraticCurveTo(x + 32, y - 165 + w, x + 70, y - 152); ctx.quadraticCurveTo(x + 32, y - 140 - w, x, y - 128); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x, y - 178, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('PUNCAK', x, y + 28);
}

function drawVirus(v) {
  const bob = Math.sin(G.clock * 4) * 4, r = 24;
  ctx.save();
  ctx.translate(v.x, v.cy + bob); ctx.rotate(v.rot); ctx.scale(v.scale, v.scale);
  const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 56);
  glow.addColorStop(0, 'rgba(190,90,255,.4)'); glow.addColorStop(1, 'rgba(190,90,255,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 56, 0, 7); ctx.fill();
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + G.clock * 0.4, c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = '#4b1d6b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(c * r, s * r); ctx.lineTo(c * (r + 10), s * (r + 10)); ctx.stroke();
    ctx.fillStyle = '#e29bff'; ctx.strokeStyle = '#4b1d6b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c * (r + 13), s * (r + 13), 4.5, 0, 7); ctx.fill(); ctx.stroke();
  }
  const g = ctx.createRadialGradient(-8, -9, 3, 0, 0, r + 2);
  g.addColorStop(0, '#d79bf3'); g.addColorStop(0.5, '#9b46c8'); g.addColorStop(1, '#5d1f86');
  ctx.fillStyle = g; ctx.strokeStyle = '#3a1457'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-9, -12, 7, 4, -0.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a0f3a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-8, -3, 6.5, 0, 7); ctx.arc(8, -3, 6.5, 0, 7); ctx.fill(); ctx.stroke();
  const lx = clamp((P.x - v.x) / 120, -1, 1) * 2;
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-8 + lx, -2, 3, 0, 7); ctx.arc(8 + lx, -2, 3, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a0f3a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-16, -13); ctx.lineTo(-3, -8); ctx.moveTo(16, -13); ctx.lineTo(3, -8); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-5, 7); ctx.lineTo(0, 12); ctx.lineTo(5, 7); ctx.lineTo(10, 12); ctx.stroke();
  if (v.hurt > 0) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, 7); ctx.fill(); }
  ctx.restore();
  if (v.mode === 'fight') {
    const bx = v.x - 32, by = v.cy - 58 + bob, f = clamp(v.hp / v.max, 0, 1);
    ctx.fillStyle = 'rgba(14,24,50,.85)'; rr(bx - 2, by - 2, 68, 10, 5); ctx.fill();
    ctx.fillStyle = f > 0.5 ? '#2ecc71' : f > 0.25 ? '#ffb703' : '#ff5d5d'; rr(bx, by, 64 * f, 6, 3); ctx.fill();
  }
}

/* ---------------- render: karakter ---------------- */
function ik(hx, hy, fx, fy, l1, l2, dir) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
  const mx = l1 + l2 - 0.01;
  if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; }
  if (d < 0.001) d = 0.001;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [hx + dx * a / d + dir * (-dy / d) * h, hy + dy * a / d + dir * (dx / d) * h, hx + dx, hy + dy];
}
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function limb(a, b, c, col, lw) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = lw + 3.4;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
}
function boot(c) {
  ctx.fillStyle = '#1d1d2b'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
  rr(c[0] - 5, c[1] - 6, 14, 8, 3.5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0c0c14'; ctx.fillRect(c[0] - 5, c[1] - 1, 14, 3);
}

function drawPlayer() {
  const p = P, mode = p.mode, f = p.face || 1, t = G.clock;
  if (p.inv > 0 && Math.floor(t * 14) % 2 === 0) return;
  const sp = clamp(Math.abs(p.vx) / RUN, 0, 1.2);
  const climb = mode === 'climb', party = mode === 'celebrate', hurt = mode === 'hurt', talk = mode === 'ask' || mode === 'virusIn';
  const air = !p.onGround && !climb;
  ctx.save();
  if (!climb && groundY(p.x) - p.y < 160) {
    const gy = groundY(p.x), h = clamp((gy - p.y) / 120, 0, 1);
    ctx.fillStyle = `rgba(10,18,30,${0.28 - h * 0.12})`;
    ctx.beginPath(); ctx.ellipse(p.x - 6, gy + 1, 17 * (1 - h * 0.4), 4.5, 0, 0, 7); ctx.fill();
  }
  ctx.translate(p.x, p.y); ctx.scale(f, 1);
  const ph = p.anim, moving = p.onGround && sp > 0.05;
  const bo = moving ? -Math.abs(Math.sin(ph)) * 2.6 * sp : Math.sin(t * 2.2) * 0.9;
  const HIP = [0, -27 + bo], SH = [1, -50 + bo];

  let fa, fb;
  if (climb) { const c = Math.sin(ph); fa = [6, -4 - 12 * Math.max(0, c)]; fb = [3, -4 - 12 * Math.max(0, -c)]; }
  else if (air) { if (p.vy < 0) { fa = [11, -15]; fb = [-7, -7]; } else { fa = [8, -10]; fb = [-9, -13]; } }
  else if (moving) { fa = [Math.sin(ph) * 15 * sp + 1, -Math.max(0, Math.cos(ph)) * 10 * sp]; fb = [Math.sin(ph + Math.PI) * 15 * sp + 1, -Math.max(0, Math.cos(ph + Math.PI)) * 10 * sp]; }
  else { fa = [6, 0]; fb = [-5, 0]; }

  let ha, hb;
  if (party) { ha = [11, -80 + bo]; hb = [-5, -80 + bo]; }
  else if (hurt) { ha = [13, -74]; hb = [-9, -68]; }
  else if (climb) { const c = Math.sin(ph); ha = [8, -66 - 13 * Math.max(0, c)]; hb = [6, -66 - 13 * Math.max(0, -c)]; }
  else if (air) { ha = [11, -66]; hb = [-10, -58]; }
  else if (moving) { ha = [Math.sin(ph + Math.PI) * 13 * sp + 3, -38 - 3 * sp * Math.max(0, Math.cos(ph + Math.PI))]; hb = [Math.sin(ph) * 13 * sp + 3, -38 - 3 * sp * Math.max(0, Math.cos(ph))]; }
  else { ha = [7, -34 + Math.sin(t * 2) * 1]; hb = [-2, -34]; }
  if (p.weapon && !party && !hurt && !climb) ha = [13 - p.recoil * 22, -46 + bo - (air ? 3 : 0)];

  // lengan belakang & kaki belakang
  const armB = ik(SH[0] - 2, SH[1] + 3, hb[0], hb[1], 11.5, 11.5, 1);
  limb([SH[0] - 2, SH[1] + 3], armB, [armB[2], armB[3]], '#1c47a6', 6.5);
  ctx.fillStyle = '#e8b88c'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(armB[2], armB[3], 4, 0, 7); ctx.fill(); ctx.stroke();
  const legB = ik(HIP[0] - 1, HIP[1], fb[0], fb[1], 14, 14, -1);
  limb([HIP[0] - 1, HIP[1]], legB, [legB[2], legB[3]], '#1a2346', 8); boot([legB[2], legB[3]]);

  // ransel (abu-abu gelap)
  const pg = ctx.createLinearGradient(-21, 0, -8, 0); pg.addColorStop(0, '#222c46'); pg.addColorStop(1, '#46557a');
  ctx.fillStyle = pg; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  rr(-21, -52 + bo, 13, 28, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5b6b92'; rr(-23, -58 + bo, 16, 7, 3.5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a2238'; rr(-20, -37 + bo, 7, 9, 3); ctx.fill();

  // badan: seragam biru
  const jg = ctx.createLinearGradient(-9, 0, 11, 0); jg.addColorStop(0, '#1b3f96'); jg.addColorStop(0.6, '#2b63d8'); jg.addColorStop(1, '#4a86f0');
  ctx.fillStyle = jg; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  rr(-10, -54 + bo, 21, 31, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#12121c'; ctx.fillRect(-10, -30 + bo, 21, 4);          // ikat pinggang
  ctx.fillStyle = '#e0b84a'; ctx.fillRect(2, -30 + bo, 5, 4);
  ctx.fillStyle = '#d62839'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;   // dasi merah
  ctx.beginPath(); ctx.moveTo(4.2, -51 + bo); ctx.lineTo(8.8, -51 + bo); ctx.lineTo(8, -47.5 + bo); ctx.lineTo(9.6, -37 + bo); ctx.lineTo(6.5, -34 + bo); ctx.lineTo(3.4, -37 + bo); ctx.lineTo(5, -47.5 + bo); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#10142a'; ctx.strokeStyle = '#cfe2ff'; ctx.lineWidth = 0.9; rr(-6.5, -44 + bo, 8, 4, 1); ctx.fill(); ctx.stroke();   // papan nama
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-5, -42.3 + bo, 5, 1);
  ctx.fillStyle = '#e8f1ff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-2, -36 + bo, 2, 0, 7); ctx.fill(); ctx.stroke();   // lencana
  ctx.fillStyle = '#9ccaff'; ctx.strokeStyle = '#eaf3ff'; ctx.lineWidth = 1; rr(-6, -56.5 + bo, 13, 4.2, 1.8); ctx.fill(); ctx.stroke();       // pangkat bahu
  ctx.fillStyle = '#e0b84a'; ctx.beginPath(); ctx.arc(5.2, -54.4 + bo, 1, 0, 7); ctx.fill();

  // kaki depan
  const legA = ik(HIP[0] + 1, HIP[1], fa[0], fa[1], 14, 14, -1);
  limb([HIP[0] + 1, HIP[1]], legA, [legA[2], legA[3]], '#222d58', 8); boot([legA[2], legA[3]]);

  // kepala
  const hy = -62 + bo;
  const sg = ctx.createLinearGradient(-8, 0, 12, 0); sg.addColorStop(0, '#d9a47d'); sg.addColorStop(1, '#f6cfa8');
  ctx.fillStyle = sg; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(2, hy, 9.8, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11, hy - 1); ctx.lineTo(14, hy + 2.5); ctx.lineTo(10.5, hy + 3.5); ctx.fillStyle = '#efbf95'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,120,.35)'; ctx.beginPath(); ctx.arc(4, hy + 4, 2.6, 0, 7); ctx.fill();
  const blink = (t % 3.6) < 0.12;
  ctx.strokeStyle = OUT; ctx.fillStyle = OUT; ctx.lineWidth = 1.8;
  if (blink || hurt) { ctx.beginPath(); ctx.moveTo(4, hy - 1); ctx.lineTo(9, hy - 1); ctx.stroke(); }
  else {
    ctx.beginPath(); ctx.ellipse(7, hy - 1, 2.2, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7.8, hy - 2.2, 0.9, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath();
  if (party || talk) { ctx.arc(8, hy + 5, 2.8, 0.1, Math.PI - 0.1); } else if (hurt) { ctx.arc(8, hy + 7, 2.4, Math.PI + 0.3, -0.3); } else { ctx.moveTo(6, hy + 6); ctx.lineTo(10, hy + 5.4); }
  ctx.stroke();
  // rambut + baret biru
  ctx.fillStyle = '#14141c';
  ctx.beginPath(); ctx.moveTo(2, hy); ctx.arc(2, hy, 10.3, Math.PI * 0.85, Math.PI * 1.78); ctx.closePath(); ctx.fill();
  const bg = ctx.createLinearGradient(-10, 0, 14, 0); bg.addColorStop(0, '#15296e'); bg.addColorStop(0.6, '#2a4fb5'); bg.addColorStop(1, '#3d68d0');
  ctx.fillStyle = bg; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(1, hy - 9.5, 13, 6.6, -0.16, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#12235f'; rr(-9.5, hy - 8.4, 22, 3.6, 1.8); ctx.fill();
  ctx.fillStyle = '#15296e'; ctx.fillRect(-1, hy - 16.6, 2.6, 2);
  ctx.fillStyle = '#e0b84a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(9, hy - 11, 3.3, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d62839'; ctx.beginPath(); ctx.arc(9, hy - 11, 1.4, 0, 7); ctx.fill();
  // syal melingkar
  const sc = ctx.createLinearGradient(-9, 0, 10, 0); sc.addColorStop(0, '#7fb0f5'); sc.addColorStop(1, '#d8e9ff');
  ctx.fillStyle = sc; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(1.5, -52 + bo, 10, 4.6, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d62839'; rr(4, -53.8 + bo, 5, 3.2, 1.2); ctx.fill();
  ctx.fillStyle = '#e0b84a'; ctx.beginPath(); ctx.arc(-4.5, -52 + bo, 1.2, 0, 7); ctx.fill();

  // lengan depan
  const armA = ik(SH[0] + 3, SH[1] + 3, ha[0], ha[1], 11.5, 11.5, 1);
  limb([SH[0] + 3, SH[1] + 3], armA, [armA[2], armA[3]], '#2c63d6', 6.5);
  ctx.fillStyle = '#e8b88c'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(armA[2], armA[3], 4.2, 0, 7); ctx.fill(); ctx.stroke();
  if (p.weapon && !climb) drawWeaponSprite(p.wi, armA[2], armA[3], p.recoil);
  ctx.restore();

  if (talk) {
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 22px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.strokeText('?', p.x + 4, p.y - 98 + Math.sin(t * 6) * 3); ctx.fillText('?', p.x + 4, p.y - 98 + Math.sin(t * 6) * 3);
  }
}

function drawWeaponSprite(i, x, y, rec) {
  ctx.save(); ctx.translate(x - rec * 14, y); ctx.lineJoin = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
  if (i === 0) {
    ctx.fillStyle = '#2f9bd8'; rr(-5, -3, 13, 11, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8eefc'; rr(8, -2, 12, 5, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff4d5a'; ctx.fillRect(-1, -8, 7, 5); ctx.strokeRect(-1, -8, 7, 5);
  } else if (i === 1) {
    ctx.fillStyle = '#ff8a1f'; rr(-4, -5, 24, 8, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7a3b00'; rr(-2, 2, 8, 10, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(6, -3, 6, 3);
  } else if (i === 2) {
    ctx.fillStyle = '#4a34d6'; rr(-5, -6, 26, 10, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0b0ff'; ctx.beginPath(); ctx.arc(21, -1, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#9be9ff'; ctx.fillRect(2, -4, 10, 2);
  } else {
    ctx.fillStyle = '#1f8a5b'; rr(-4, -8, 32, 14, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c7ccd6'; rr(-12, -4, 9, 6, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4ade80'; rr(24, -10, 6, 18, 2); ctx.fill(); ctx.stroke();
  }
  if (rec > 0.06) { const tip = [20, 24, 25, 32][i] || 24; ctx.fillStyle = 'rgba(255,240,170,.9)'; ctx.beginPath(); ctx.arc(tip + 6, -1, 7, 0, 7); ctx.fill(); }
  ctx.restore();
}

function drawShots() {
  for (const b of bullets) {
    ctx.save(); ctx.translate(b.x, b.y); if (b.vx < 0) ctx.scale(-1, 1);
    if (b.i === 0) {
      ctx.fillStyle = 'rgba(107,227,255,.35)'; ctx.beginPath(); ctx.arc(-9, 0, 4, 0, 7); ctx.arc(-17, 1, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#6be3ff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); ctx.stroke();
    } else if (b.i === 1) {
      ctx.fillStyle = '#ff4d5a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; rr(-9, -4, 18, 8, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; rr(0, -3, 8, 6, 3); ctx.fill();
    } else if (b.i === 2) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(192,123,255,.4)'; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.strokeStyle = '#e0b0ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(8, 0); ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22); g.addColorStop(0, 'rgba(120,255,170,.9)'); g.addColorStop(1, 'rgba(120,255,170,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fill();
      ctx.fillStyle = '#4ade80'; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8fff0'; ctx.fillRect(-4, -1.5, 8, 3);
    }
    ctx.restore();
  }
  for (const s of spits) {
    const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 20); g.addColorStop(0, 'rgba(200,255,120,.9)'); g.addColorStop(1, 'rgba(200,255,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, 7); ctx.fill();
    ctx.fillStyle = '#a3e635'; ctx.strokeStyle = '#2a0f3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(s.x - 2.5, s.y - 2.5, 2.2, 0, 7); ctx.fill();
  }
}

function drawPits(x0, x1) {
  for (const t of world.pits) {
    if (t.x1 < x0 || t.x0 > x1) continue;
    const w = t.x1 - t.x0;
    const g = ctx.createLinearGradient(0, t.rimY, 0, t.floor);
    g.addColorStop(0, '#4a3b5c'); g.addColorStop(0.45, '#2b2140'); g.addColorStop(1, '#0d0818');
    ctx.fillStyle = g; ctx.fillRect(t.x0, t.rimY + 2, w, t.floor - t.rimY);
    const sg = ctx.createLinearGradient(t.x0, 0, t.x1, 0);
    sg.addColorStop(0, 'rgba(0,0,0,.5)'); sg.addColorStop(0.12, 'rgba(0,0,0,0)'); sg.addColorStop(0.88, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = sg; ctx.fillRect(t.x0, t.rimY + 2, w, t.floor - t.rimY);
    ctx.fillStyle = 'rgba(190,120,255,.07)';
    for (let k = 0; k < w / 40; k++) ctx.fillRect(t.x0 + 14 + k * 40, t.rimY + 12, 2, 120 + hash(k + t.x0) * 120);
    for (let sx = t.x0 + 10; sx < t.x1 - 8; sx += 26) {
      ctx.fillStyle = '#8a86a6'; ctx.beginPath(); ctx.moveTo(sx - 11, t.floor); ctx.lineTo(sx, t.floor - 34); ctx.lineTo(sx + 11, t.floor); ctx.fill();
      ctx.fillStyle = '#5a5675'; ctx.beginPath(); ctx.moveTo(sx, t.floor - 34); ctx.lineTo(sx + 11, t.floor); ctx.lineTo(sx + 2, t.floor); ctx.fill();
    }
  }
}

function drawPlats(x0, x1) {
  for (const pl of world.plats) {
    if (pl.cx + pl.w / 2 < x0 || pl.cx - pl.w / 2 > x1) continue;
    const x = pl.cx - pl.w / 2, w = pl.w, y = pl.y;
    const g = ctx.createLinearGradient(0, y, 0, y + 44);
    g.addColorStop(0, pl.mv ? '#8a7650' : '#7f889f'); g.addColorStop(1, pl.mv ? '#4a3d28' : '#39425c');
    ctx.fillStyle = g; ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x + 3, y + 6); ctx.lineTo(x + w - 3, y + 6); ctx.lineTo(x + w - 15, y + 32); ctx.lineTo(x + w * 0.55, y + 46); ctx.lineTo(x + 15, y + 30); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(x + w * 0.55, y + 6); ctx.lineTo(x + w - 3, y + 6); ctx.lineTo(x + w - 15, y + 32); ctx.lineTo(x + w * 0.55, y + 46); ctx.fill();
    const top = ctx.createLinearGradient(0, y, 0, y + 12);
    top.addColorStop(0, pl.mv ? '#ffd166' : '#86e060'); top.addColorStop(1, pl.mv ? '#d99a1f' : '#3f9a3a');
    ctx.fillStyle = top; rr(x, y, w, 12, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 6, y + 2, w - 12, 2);
    if (pl.mv) {
      ctx.fillStyle = '#7a4f00';
      for (let k = 0; k < 3; k++) { const cx = pl.cx - 20 + k * 20; ctx.beginPath(); ctx.moveTo(cx - 4, y + 3); ctx.lineTo(cx + 4, y + 6); ctx.lineTo(cx - 4, y + 9); ctx.fill(); }
    }
  }
}

function drawSpikes(x0, x1) {
  for (const sp of world.spikes) {
    if (sp.x + sp.w < x0 || sp.x - sp.w > x1) continue;
    const left = sp.x - sp.w / 2;
    ctx.fillStyle = '#3a3f55'; ctx.fillRect(left - 2, sp.y - 3, sp.w + 4, 5);
    for (let k = 0; k < sp.w / 20; k++) {
      const bx = left + k * 20;
      ctx.fillStyle = '#e3e8f5'; ctx.beginPath(); ctx.moveTo(bx + 1, sp.y - 3); ctx.lineTo(bx + 10, sp.y - 26); ctx.lineTo(bx + 10, sp.y - 3); ctx.fill();
      ctx.fillStyle = '#8f98b3'; ctx.beginPath(); ctx.moveTo(bx + 10, sp.y - 26); ctx.lineTo(bx + 19, sp.y - 3); ctx.lineTo(bx + 10, sp.y - 3); ctx.fill();
      ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.moveTo(bx + 7.5, sp.y - 20); ctx.lineTo(bx + 10, sp.y - 26); ctx.lineTo(bx + 12.5, sp.y - 20); ctx.fill();
    }
  }
}

function drawCps() {
  world.cps.forEach((c, i) => {
    if (i === 0) return;
    const gy = groundY(c.x), on = P.x >= c.x;
    ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c.x, gy); ctx.lineTo(c.x, gy - 58); ctx.stroke();
    const w = Math.sin(G.clock * 5 + i) * 2;
    ctx.fillStyle = on ? '#2ecc71' : '#8d93a8';
    ctx.beginPath(); ctx.moveTo(c.x, gy - 58); ctx.quadraticCurveTo(c.x + 14, gy - 54 + w, c.x + 28, gy - 49); ctx.quadraticCurveTo(c.x + 14, gy - 44 - w, c.x, gy - 40); ctx.fill();
  });
}

function drawArena() {
  if (!G.fight) return;
  const x = G.fight.xq + 262, gy = groundY(x), a = 0.3 + Math.sin(G.clock * 6) * 0.08;
  const g = ctx.createLinearGradient(x - 26, 0, x + 4, 0);
  g.addColorStop(0, 'rgba(120,200,255,0)'); g.addColorStop(1, `rgba(120,200,255,${a})`);
  ctx.fillStyle = g; ctx.fillRect(x - 26, gy - 240, 30, 244);
  ctx.strokeStyle = `rgba(190,230,255,${a + 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 4, gy - 240); ctx.lineTo(x + 4, gy); ctx.stroke();
}

function render() {
  ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
  drawSky();
  peaks(0.06, 0.74, 560, 130, 290, 3, [168, 190, 226], [128, 152, 200], true, 0.55);
  peaks(0.14, 0.82, 400, 100, 210, 11, [122, 150, 198], [92, 120, 170], true, 0.5);
  drawClouds();
  peaks(0.26, 0.9, 300, 60, 140, 29, [88, 118, 156], [62, 88, 128], false, 0.42);
  hills(0.42, 0.96, [66, 122, 100], [40, 84, 74], 46, 0.0042, 5);
  hills(0.62, 1.02, [48, 98, 84], [30, 68, 62], 38, 0.0061, 17);

  ctx.save();
  const sh = shake > 0 ? shake / 0.35 : 0;
  ctx.translate(-cam.x + (Math.random() - .5) * 8 * sh, -cam.y + (Math.random() - .5) * 8 * sh);
  const x0 = cam.x - 140, x1 = cam.x + VW + 140;
  drawEmbankments(x0, x1);
  drawTerrain(x0, x1);
  drawPits(x0, x1);
  drawTufts(x0, x1);
  for (const t of world.trees) if (t.x > x0 && t.x < x1) drawTree(t);
  for (const s of world.stages) if (s.type === 'ladder' && s.xc > x0 && s.xq < x1) drawLadder(s);
  drawPlats(x0, x1); drawSpikes(x0, x1); drawCps(); drawArena();
  drawFlag();
  if (V) drawVirus(V);
  drawShots();
  drawPlayer();
  for (const p of particles) {
    const k = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'dust') {
      ctx.globalAlpha = 0.45 * (1 - k); ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 + k * 1.8), 0, 7); ctx.fill();
    } else {
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (alt() > 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, (alt() - 0.3) * 1.6)})`;
    for (const f of snow) { ctx.beginPath(); ctx.arc(f.x % VW, f.y, f.s, 0, 7); ctx.fill(); }
  }
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, Math.max(VW, VH) * 0.78);
  vg.addColorStop(0, 'rgba(8,12,40,0)'); vg.addColorStop(1, 'rgba(8,12,40,.4)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
}

let lastT = 0;
function frame(t) {
  const dt = Math.min(0.033, (t - lastT) / 1000 || 0); lastT = t;
  update(dt); render();
  requestAnimationFrame(frame);
}

/* ---------------- leaderboard ---------------- */
const LB_KEY = 'pendaki_bakteri_lb_v1';
function fetchT(u, o = {}, ms = 8000) {
  const c = new AbortController(), id = setTimeout(() => c.abort(), ms);
  return fetch(u, Object.assign({}, o, { signal: c.signal })).finally(() => clearTimeout(id));
}
function cleanRow(r) {
  if (!r || typeof r !== 'object') return null;
  const score = Number(r.score);
  if (!isFinite(score)) return null;
  return {
    name: String(r.name || '').slice(0, 20), kelas: String(r.kelas || '').slice(0, 6),
    score: clamp(Math.round(score), 0, 100), benar: Math.max(0, Number(r.benar) || 0),
    total: Math.max(1, Number(r.total) || 10), time: Math.max(0, Number(r.time) || 0), ts: Number(r.ts) || 0
  };
}
const LB = {
  sb() {
    const u = (cfg.SUPABASE_URL || '').trim().replace(/\/+$/, ''), k = (cfg.SUPABASE_ANON_KEY || '').trim();
    if (!u || !k) return null;
    const headers = { apikey: k, 'Content-Type': 'application/json' };
    if (k.startsWith('eyJ')) headers.Authorization = 'Bearer ' + k;   // kunci anon lama berbentuk JWT
    return { u, headers };
  },
  url() { return (cfg.FIREBASE_DB_URL || '').trim().replace(/\/+$/, ''); },
  readLocal() { try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch (e) { return []; } },
  writeLocal(rows) { try { localStorage.setItem(LB_KEY, JSON.stringify(rows.slice(-500))); } catch (e) { } },
  async save(entry) {
    const rows = this.readLocal(); rows.push(entry); this.writeLocal(rows);
    const sb = this.sb();
    if (sb) {
      try {
        const body = JSON.stringify({ name: entry.name, kelas: entry.kelas, score: entry.score, benar: entry.benar, total: entry.total, waktu: entry.time });
        const r = await fetchT(sb.u + '/rest/v1/leaderboard', { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, sb.headers), body });
        if (!r.ok) throw new Error(r.status);
        return 'online';
      } catch (e) { return 'fallback'; }
    }
    if (!this.url()) return 'local';
    try {
      const r = await fetchT(this.url() + '/leaderboard.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      if (!r.ok) throw new Error(r.status);
      return 'online';
    } catch (e) { return 'fallback'; }
  },
  async load() {
    const local = this.readLocal();
    const sb = this.sb();
    if (sb) {
      try {
        const r = await fetchT(sb.u + '/rest/v1/leaderboard?select=name,kelas,score,benar,total,waktu,created_at&order=score.desc,waktu.asc&limit=1000', { headers: sb.headers, cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        return { rows: (Array.isArray(d) ? d : []).map(x => ({ name: x.name, kelas: x.kelas, score: x.score, benar: x.benar, total: x.total, time: x.waktu, ts: Date.parse(x.created_at) || 0 })), source: 'online' };
      } catch (e) { return { rows: local, source: 'fallback' }; }
    }
    if (!this.url()) return { rows: local, source: 'local' };
    try {
      const r = await fetchT(this.url() + '/leaderboard.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      return { rows: d ? Object.values(d) : [], source: 'online' };
    } catch (e) { return { rows: local, source: 'fallback' }; }
  }
};

let boardRows = [], boardSource = 'local', myKey = '';
const rowKey = r => r.name.toLowerCase() + '|' + r.kelas;

function drawBoard() {
  const f = el.boardClass.value;
  const best = new Map();
  for (const raw of boardRows) {
    const r = cleanRow(raw); if (!r || !r.name) continue;
    if (f !== 'all' && r.kelas !== f) continue;
    const k = rowKey(r), old = best.get(k);
    if (!old || r.score > old.score || (r.score === old.score && r.time < old.time)) best.set(k, r);
  }
  const rows = [...best.values()].sort((a, b) => b.score - a.score || a.time - b.time || a.ts - b.ts).slice(0, 50);
  el.table.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 5; td.className = 'empty'; td.textContent = 'Belum ada nilai. Jadilah yang pertama!';
    tr.append(td); el.table.append(tr);
  }
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (rowKey(r) === myKey) tr.className = 'me';
    const medal = ['🥇', '🥈', '🥉'][i] || String(i + 1);
    [medal, r.name, r.kelas, r.score, fmtTime(r.time)].forEach(v => {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    });
    el.table.append(tr);
  });
  el.boardNote.textContent =
    boardSource === 'online' ? 'Papan peringkat online: dibagikan ke semua pemain.' :
    boardSource === 'fallback' ? 'Server tidak terjangkau - menampilkan nilai yang tersimpan di perangkat ini.' :
    'Papan ini hanya tersimpan di perangkat ini. Aktifkan penyimpanan online di config.js agar semua kelas berbagi satu papan.';
}

async function loadBoard() {
  el.boardNote.textContent = 'Memuat…';
  const res = await LB.load();
  boardRows = res.rows; boardSource = res.source;
  drawBoard();
}

function openBoard(afterGame) {
  el.board.classList.remove('hidden');
  el.menu.classList.add('hidden');
  el.result.classList.toggle('hidden', !afterGame);
  el.closeBoard.textContent = afterGame ? 'Main Lagi' : 'Kembali';
  el.board.dataset.after = afterGame ? '1' : '';
  loadBoard();
}

async function endGame() {
  G.ended = true; G.mode = 'ended';
  el.quiz.classList.add('hidden'); syncPad();
  const score = Math.round(G.correct / TOTAL * 100);
  const entry = { name: G.player.name, kelas: G.player.kelas, score, benar: G.correct, total: TOTAL, time: Math.round(G.time), ts: Date.now() };
  myKey = rowKey(entry);
  el.resTitle.textContent = score >= 90 ? '🏔️ Luar biasa! Kamu sampai puncak!' : score >= 70 ? '🎉 Hebat, kamu sampai puncak!' : score >= 50 ? '👍 Sampai puncak, ayo tingkatkan lagi!' : '💪 Sampai puncak! Belajar lagi, ya!';
  el.resScore.textContent = score;
  el.resBenar.textContent = `✅ Benar ${G.correct}/${TOTAL}`;
  el.resTime.textContent = `⏱️ ${fmtTime(G.time)}`;
  el.resSave.textContent = 'Menyimpan nilai…';
  el.hud.classList.add('hidden');
  openBoard(true);
  const how = await LB.save(entry);
  el.resSave.textContent = how === 'online' ? '✅ Nilaimu tersimpan di papan peringkat online.'
    : how === 'fallback' ? '⚠️ Gagal terhubung ke server, nilai disimpan di perangkat ini saja.'
    : '💾 Nilaimu tersimpan di perangkat ini.';
  loadBoard();
}

/* ---------------- menu ---------------- */
function fillSelect(sel, withAll) {
  sel.innerHTML = '';
  if (withAll) { const o = document.createElement('option'); o.value = 'all'; o.textContent = 'Semua kelas'; sel.append(o); }
  KELAS.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; sel.append(o); });
}
fillSelect(el.cls, false); fillSelect(el.boardClass, true);
try {
  const pf = JSON.parse(localStorage.getItem('pb_prefs') || 'null');
  if (pf) { el.name.value = pf.name || ''; if (KELAS.includes(pf.kelas)) el.cls.value = pf.kelas; }
} catch (e) { }

el.start.onclick = startGame;
el.openBoard.onclick = () => { myKey = ''; openBoard(false); };
el.boardClass.onchange = drawBoard;
el.next.onclick = nextAfterAnswer;
el.closeBoard.onclick = () => {
  el.board.classList.add('hidden'); el.menu.classList.remove('hidden');
  if (el.board.dataset.after) { G.mode = 'menu'; prepareScene(); }
};
el.name.addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });

/* ---------------- mulai ---------------- */
if (window.__pbHook) window.__pbHook({ G, keys, groundY, jump() { jumpQ = 0.15; }, get P() { return P; }, get world() { return world; }, get V() { return V; }, get bullets() { return bullets; } });
prepareScene();
requestAnimationFrame(frame);
})();
