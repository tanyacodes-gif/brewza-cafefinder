/* BREWZA intro (about 6 s): the two drinks float, sparkles rise from them and gather into the BREWZA wordmark, a gust of wind blows it away,
   then the login (or the app) appears. Click, tap, press Esc/Enter/Space or "Skip" to skip it.
   It plays once per browser tab (add ?intro to the address to replay) and is skipped for "reduce motion". */
(() => {
  "use strict";
  const root = document.getElementById("intro");
  if (!root) return;
  let seen = false;
  try { seen = sessionStorage.getItem("brewza.intro") === "1"; } catch (e) { }
  const replay = /[?&]intro\b/.test(location.search);
  const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (reduce || (seen && !replay)) { root.remove(); return; }
  try { sessionStorage.setItem("brewza.intro", "1"); } catch (e) { }
  const cv = document.getElementById("introCanvas"), ctx = cv.getContext && cv.getContext("2d");
  if (!ctx) { root.remove(); return; }
  const $ = id => document.getElementById(id);
  const logo = $("introLogo"), word = $("introWord"), tag = $("introTag"), wait = $("introWait");
  const WIND = 3.6, END = 6.0;          // seconds: when the gust starts, and the latest the animation may run
  let W, H, ps = [], raf, finished = false;

  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // warm palette: coffee -> caramel -> rose
  const stops = [[104, 62, 46], [196, 118, 72], [226, 134, 164]], PALE = [255, 238, 222];
  const lerp = (a, b, t) => a + (b - a) * t;
  const finalColor = f => { const [a, b, t] = f < .5 ? [stops[0], stops[1], f * 2] : [stops[1], stops[2], (f - .5) * 2]; return [0, 1, 2].map(i => lerp(a[i], b[i], t)); };

  function build() {
    const fs = Math.max(54, Math.min(150, W * .15));
    const off = document.createElement("canvas"), o = off.getContext("2d"), font = `800 ${fs}px Fraunces, Georgia, serif`;
    o.font = font;
    const pad = 12, ow = Math.ceil(o.measureText("BREWZA").width) + pad * 2, oh = Math.ceil(fs * 1.3);
    off.width = ow; off.height = oh;
    o.font = font; o.textBaseline = "middle"; o.textAlign = "left"; o.fillStyle = "#000"; o.fillText("BREWZA", pad, oh / 2);
    word.style.width = ow + "px"; word.style.height = oh + "px";
    const r = word.getBoundingClientRect(), lr = logo.getBoundingClientRect();
    const data = o.getImageData(0, 0, ow, oh).data, cap = W < 600 ? 2600 : 4200;
    let gap = Math.max(2, Math.round(fs / 38)), pts;
    for (;;) {
      pts = [];
      for (let y = 0; y < oh; y += gap) for (let x = 0; x < ow; x += gap) if (data[(y * ow + x) * 4 + 3] > 128) pts.push([x, y]);
      if (pts.length <= cap) break;
      gap++;
    }
        ps = pts.map(([sx, sy]) => {
      const f = Math.min(1, Math.max(0, sx / ow)), fc = finalColor(Math.min(1, Math.max(0, f + (Math.random() - .5) * .12)));
      const steam = Math.random() < .65;
      return {
        tx: r.left + sx - pad, ty: r.top + r.height / 2 + sy - oh / 2,
        x: steam ? lr.left + lr.width * ((Math.random() < .5 ? .255 : .763) + (Math.random() - .5) * .24) : Math.random() * W, y: steam ? lr.top + lr.height * (.3 + Math.random() * .24) : H * (.05 + Math.random() * .55),
        vx: (Math.random() - .5) * 22, vy: -(25 + Math.random() * 70),
        spawn: Math.random() * .9, gather: .9 + Math.random() * .9, wind: WIND + f * .7 + Math.random() * .2,
        size: 1.5 + Math.random() * 1.7, ph: Math.random() * 6.283, w1: .6 + Math.random() * .8, w2: Math.random(),
        a: 0, c: 0, dead: false,
        cols: [0, 1, 2, 3, 4, 5].map(k => `rgb(${[0, 1, 2].map(i => Math.round(lerp(PALE[i], fc[i], k / 5))).join(",")})`)
      };
    });
  }

  function step(T, dt) {
    for (const p of ps) {
      if (p.dead || T < p.spawn) continue;
      if (T < p.gather) {                       // 1. steam rises and wobbles
        p.x += (p.vx + Math.sin(T * 2 + p.ph) * 14) * dt; p.y += p.vy * dt;
        p.a = Math.min(.5, p.a + dt * 1.2);
      } else if (T < p.wind) {                  // 2. steam flows into the letters
        p.vx += ((p.tx - p.x) * 9 - p.vx * 6) * dt; p.vy += ((p.ty - p.y) * 9 - p.vy * 6) * dt;
        const sp = Math.hypot(p.vx, p.vy); if (sp > 1100) { p.vx *= 1100 / sp; p.vy *= 1100 / sp; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.c = 1 - Math.min(1, Math.hypot(p.tx - p.x, p.ty - p.y) / 220);
        p.a += (.95 - p.a) * Math.min(1, dt * 3);
      } else {                                  // 3. a gust sweeps left to right and carries everything away
        const g = Math.min(1, (T - p.wind) * 1.8);
        p.vx += (240 + 760 * p.w1) * g * dt;
        p.vy += (Math.sin(p.x * .011 + T * 3.5 + p.ph) * 320 - 110 * p.w2) * g * dt;
        p.vx *= 1 - .5 * dt; p.vy *= 1 - .8 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.a -= dt * (.7 + p.w2 * .6); p.size *= 1 - .12 * dt; p.c = 1;
        if (p.a <= 0 || p.x > W + 60) p.dead = true;
      }
    }
  }

  function draw(T) {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      if (p.dead || p.a <= .01 || T < p.spawn) continue;
      ctx.globalAlpha = Math.min(1, p.a); ctx.fillStyle = p.cols[Math.round(p.c * 5)];
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  let start = 0, last = 0;
  function frame(now) {
    if (finished) return;
    if (!start) start = last = now;
    const T = (now - start) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
    if (T > 2.6) tag.classList.add("show");
    if (T > WIND - .1) { logo.classList.add("blow"); tag.classList.add("blow"); }
    step(T, dt); draw(T);
    if (T > END || (T > WIND + 1 && ps.every(p => p.dead))) return finish();
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (finished) return;
    finished = true; cancelAnimationFrame(raf); ctx.clearRect(0, 0, W, H);
    const go = () => { document.body.classList.remove("intro-on"); root.classList.add("out"); setTimeout(() => root.remove(), 1000); };
    if (window.__ready) return go();
    // the app is still starting (a sleeping free server can take a while): show a gentle "warming up" state
    root.classList.add("waiting"); logo.classList.remove("blow"); tag.classList.remove("show", "blow"); wait.hidden = false;
    const t0 = Date.now(), iv = setInterval(() => { if (window.__ready || Date.now() - t0 > 90000) { clearInterval(iv); go(); } }, 250);
  }

  async function begin() {
    size();
    try { if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load("800 100px Fraunces"), new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
    if (finished) return;
    try { build(); } catch (e) { return finish(); }
    raf = requestAnimationFrame(frame);
  }

  document.body.classList.add("intro-on");
  root.addEventListener("click", finish);
  document.addEventListener("keydown", e => { if (!finished && (e.key === "Escape" || e.key === "Enter" || e.key === " ")) finish(); });
  window.addEventListener("resize", () => { if (!finished) finish(); });
  begin();
})();
