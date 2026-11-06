// Atelier 教程播放器：按"场景"推进。旁白用浏览器免费 TTS，动作与朗读同时开始，
// 两者都结束才进入下一段，实现音画同步。#cam 是镜头层（推拉摇移），Clawd 在镜头外自由跳动。
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  // 播放速度：所有等待、过渡、旁白都按 Player.speed 缩放
  const spd = () => (window.Player && window.Player.speed) || 1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms / spd()));

  // ---------- 音效：WebAudio 合成，无需音频文件 ----------
  let ctx;
  function tone(freq, dur = 0.08, type = 'sine', gain = 0.08, slide = 0, delay = 0) {
    if (!Player.sfxOn) return;
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    click: () => { tone(1400, 0.04, 'square', 0.035); tone(700, 0.06, 'sine', 0.05); },
    pop: () => tone(500, 0.12, 'sine', 0.07, 2),
    whoosh: () => tone(220, 0.35, 'triangle', 0.035, 3.5),
    key: () => tone(2000 + Math.random() * 400, 0.02, 'square', 0.012),
    boing: () => tone(260, 0.3, 'sine', 0.07, 2.6),
    land: () => tone(140, 0.08, 'sine', 0.09, 0.6),
    blip: () => { tone(900, 0.05, 'square', 0.03); tone(1300, 0.05, 'square', 0.03, 0, 0.06); },
    ding: () => { tone(880, 0.3, 'sine', 0.06); tone(1320, 0.4, 'sine', 0.05, 0, 0.12); },
  };

  // ---------- 旁白：Web Speech API（系统自带、免费） ----------
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    voice = vs.find((v) => /zh[-_]CN/i.test(v.lang) && /Xiaoxiao|Xiaoyi|Yunxi|Natural/i.test(v.name))
      || vs.find((v) => /zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  let audio = null;
  function speak(text, i) {
    $('#subtitle').textContent = text;
    const estimate = text.length * 230 + 400; // 无语音时按字数估算时长（sleep 会按倍速缩放）
    if (!Player.voiceOn) return sleep(estimate);
    // 优先播放预生成的自然人声（voice/NN.mp3），失败再退回系统 TTS
    if (i != null) {
      return new Promise((resolve) => {
        if (audio) audio.pause();
        audio = new Audio(`voice/${String(i + 1).padStart(2, '0')}.mp3`);
        const guard = setTimeout(resolve, estimate / spd() + 6000);
        const done = () => { clearTimeout(guard); resolve(); };
        audio.playbackRate = spd(); audio.onended = done;
        audio.onerror = () => { clearTimeout(guard); speak(text).then(resolve); };
        audio.play().catch(audio.onerror);
      });
    }
    if (!('speechSynthesis' in window)) return sleep(estimate);
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1.05 * spd(); u.pitch = 1.15; if (voice) u.voice = voice;
      const guard = setTimeout(resolve, estimate / spd() + 4000); // 部分 WebView 不触发 onend
      u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
      speechSynthesis.speak(u);
    });
  }

  // ---------- 坐标 ----------
  const W = 1280, H = 720;
  const cam = { x: 0, y: 0, z: 1 };
  const k = () => $('#stage').getBoundingClientRect().width / W;
  // 元素中心在舞台坐标（屏幕所见）
  function stagePt(el) {
    const s = $('#stage').getBoundingClientRect(), r = el.getBoundingClientRect(), q = k();
    return { x: (r.left - s.left + r.width / 2) / q, y: (r.top - s.top + r.height / 2) / q, h: r.height / q };
  }
  // 元素中心在镜头层坐标（不受推拉影响）
  function camPt(el) { const p = stagePt(el); return { x: (p.x - cam.x) / cam.z, y: (p.y - cam.y) / cam.z }; }
  const el = (sel) => (typeof sel === 'string' ? $(sel) : sel);

  // ---------- 动作 API ----------
  const m = () => $('#mascot');
  let mPos = { x: 60, y: 560 };
  const api = {
    sfx, sleep, $,
    // 镜头：zoom>1 推近，=1 拉回全景；dx/dy 用于构图偏移
    async cam(sel, zoom = 1, ms = 1100, dx = 0, dy = 0) {
      const p = sel ? camPt(el(sel)) : { x: W / 2, y: H / 2 };
      cam.z = zoom; cam.x = W / 2 + dx - p.x * zoom; cam.y = H / 2 + dy - p.y * zoom;
      if (zoom === 1 && !sel) { cam.x = 0; cam.y = 0; }
      const c = $('#cam'); c.style.transitionDuration = ms / spd() + 'ms';
      c.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`;
      if (ms > 300) sfx.whoosh();
      await sleep(ms);
    },
    async move(sel, ms = 650) {
      const p = camPt(el(sel)), c = $('#cursor');
      c.style.transitionDuration = ms / spd() + 'ms';
      c.style.transform = `translate(${p.x}px,${p.y}px)`;
      await sleep(ms);
    },
    async click(sel) {
      await api.move(sel); sfx.click();
      const c = $('#cursor'), t = el(sel);
      c.classList.add('down'); t.classList.add('pressed');
      await sleep(170); c.classList.remove('down'); t.classList.remove('pressed');
    },
    focus(sel) {
      document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
      if (sel) { document.querySelectorAll(sel).forEach((e) => e.classList.add('hl')); sfx.pop(); }
    },
    async type(sel, text, gap = 65) {
      const t = el(sel); t.textContent = '';
      for (const ch of text) { t.textContent += ch; sfx.key(); await sleep(gap); }
    },
    mood(mood) { m().dataset.mood = mood || ''; },
    say(text, ms = 1400) { const b = $('#mascot .bubble'); b.textContent = text; b.classList.add('show'); sfx.blip(); setTimeout(() => b.classList.remove('show'), ms); },
    // Clawd 跳到某个元素旁边（舞台坐标，跟随镜头后的画面位置）
    async hop(target, side = 'left') {
      let x, y;
      if (Array.isArray(target)) [x, y] = target;
      else { const p = stagePt(el(target)); x = p.x + (side === 'left' ? -150 : 40); y = p.y - 100 + p.h / 2; }
      x = Math.max(10, Math.min(W - 140, x)); y = Math.max(10, Math.min(H - 150, y));
      const g = m(); g.classList.toggle('flip', x < mPos.x);
      g.style.transitionDuration = 900 / spd() + 'ms'; g.querySelector('.bob').style.animationDuration = '';
      g.classList.remove('jump'); void g.offsetWidth; if (spd() !== 1) g.querySelector('.bob').style.animationDuration = 900 / spd() + 'ms'; g.classList.add('jump'); sfx.boing();
      g.style.transform = `translate(${x}px,${y}px)`; mPos = { x, y };
      await sleep(900); sfx.land(); g.style.transitionDuration = ''; g.querySelector('.bob').style.animationDuration = '';
    },
    async walk(x, y, ms = 1400) {
      const g = m(); g.classList.toggle('flip', x < mPos.x); g.classList.add('walk');
      g.style.transitionDuration = ms / spd() + 'ms'; g.style.transform = `translate(${x}px,${y}px)`; mPos = { x, y };
      await sleep(ms); g.classList.remove('walk'); g.style.transitionDuration = '';
    },
  };

  // ---------- 播放控制 ----------
  const Player = {
    voiceOn: true, sfxOn: true, speed: 1, scenes: [], idx: 0, run: 0, reset: null,
    init(scenes, reset) {
      Player.scenes = scenes; Player.reset = reset;
      const bar = $('#steps');
      scenes.forEach((s, i) => {
        const b = document.createElement('button'); b.title = s.title; b.textContent = i + 1;
        b.onclick = () => Player.play(i); bar.appendChild(b);
      });
      $('#btn-play').onclick = () => Player.play(Player.idx >= scenes.length ? 0 : Player.idx);
      $('#btn-voice').onclick = (e) => { Player.voiceOn = !Player.voiceOn; e.target.classList.toggle('off'); };
      $('#btn-sfx').onclick = (e) => { Player.sfxOn = !Player.sfxOn; e.target.classList.toggle('off'); };
      // 倍速按钮：点击循环切换，当前播放的旁白立即跟随
      const SPEEDS = [0.75, 1, 1.25, 1.5, 2], sb = document.createElement('button');
      sb.id = 'btn-speed'; sb.title = '播放速度'; sb.textContent = '1×';
      sb.onclick = () => { Player.speed = SPEEDS[(SPEEDS.indexOf(Player.speed) + 1) % SPEEDS.length]; sb.textContent = Player.speed + '×'; if (audio) audio.playbackRate = Player.speed; };
      $('#btn-sfx').after(sb);
      $('#overlay').onclick = () => Player.play(Player.idx >= scenes.length ? 0 : Player.idx);
      const fit = () => {
        const q = Math.min(innerWidth / W, (innerHeight - 56) / H);
        $('#stage').style.transform = `scale(${q})`;
        $('#wrap').style.width = W * q + 'px'; $('#wrap').style.height = H * q + 'px';
      };
      addEventListener('resize', fit); fit();
    },
    async play(from) {
      const run = ++Player.run; // 新一次播放会让旧循环自然退出
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      if (audio) audio.pause();
      $('#overlay').hidden = true;
      if (Player.reset) Player.reset(api);
      for (let i = from; i < Player.scenes.length; i++) {
        if (run !== Player.run) return;
        Player.idx = i;
        document.querySelectorAll('#steps button').forEach((b, j) => b.classList.toggle('on', j === i));
        const s = Player.scenes[i];
        api.mood(s.mood);
        await Promise.all([speak(s.say, i), s.act ? s.act(api) : null]);
        await sleep(300);
      }
      if (run === Player.run) {
        Player.idx = Player.scenes.length; sfx.ding();
        $('#overlay').hidden = false; $('#overlay h2').textContent = '教程结束，点击重播';
      }
    },
  };
  window.Player = Player;
})();
