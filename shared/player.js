// Atelier 教程播放器：按"场景"推进，每段旁白用浏览器免费 TTS 朗读，
// 动作与朗读同时开始，等两者都结束再进入下一段，实现音画同步。
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 音效：WebAudio 合成，无需音频文件 ----------
  let ctx;
  function tone(freq, dur = 0.08, type = 'sine', gain = 0.08, slide = 0) {
    if (!Player.sfxOn) return;
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    click: () => { tone(1400, 0.04, 'square', 0.04); tone(700, 0.06, 'sine', 0.05); },
    pop: () => tone(500, 0.12, 'sine', 0.08, 2),
    whoosh: () => tone(300, 0.25, 'triangle', 0.04, 3),
    key: () => tone(2000 + Math.random() * 400, 0.02, 'square', 0.015),
    ding: () => { tone(880, 0.3, 'sine', 0.06); setTimeout(() => tone(1320, 0.4, 'sine', 0.05), 120); },
  };

  // ---------- 旁白：Web Speech API（系统自带、免费） ----------
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    voice = vs.find((v) => /zh[-_]CN/i.test(v.lang) && /Xiaoxiao|Yunxi|Natural/i.test(v.name))
      || vs.find((v) => /zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

  function speak(text) {
    $('#subtitle').textContent = text;
    const estimate = text.length * 230 + 400; // 无语音时按字数估算时长
    if (!Player.voiceOn || !('speechSynthesis' in window)) return sleep(estimate);
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1.05; u.pitch = 1.1; if (voice) u.voice = voice;
      const guard = setTimeout(resolve, estimate + 4000); // 防止部分 WebView 不触发 onend
      u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
      speechSynthesis.speak(u);
    });
  }

  // ---------- 舞台工具 ----------
  const cursor = () => $('#cursor');
  function center(el) {
    const s = $('#stage').getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / 1280;
    return { x: (r.left - s.left + r.width / 2) / k, y: (r.top - s.top + r.height / 2) / k };
  }
  const api = {
    sfx, sleep, $,
    async move(sel, ms = 700) {
      const p = center($(sel)), c = cursor();
      c.style.transitionDuration = ms + 'ms';
      c.style.transform = `translate(${p.x}px, ${p.y}px)`;
      await sleep(ms);
    },
    async click(sel) {
      await api.move(sel); sfx.click();
      cursor().classList.add('down'); $(sel).classList.add('pressed');
      await sleep(160); cursor().classList.remove('down'); $(sel).classList.remove('pressed');
    },
    focus(sel) {
      document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
      if (sel) { document.querySelectorAll(sel).forEach((e) => e.classList.add('hl')); sfx.pop(); }
    },
    async type(sel, text, gap = 70) {
      const el = $(sel); el.textContent = '';
      for (const ch of text) { el.textContent += ch; sfx.key(); await sleep(gap); }
    },
    mascot(mood) { $('#mascot').dataset.mood = mood || ''; },
  };

  // ---------- 播放控制 ----------
  const Player = {
    voiceOn: true, sfxOn: true, scenes: [], idx: 0, run: 0,
    init(scenes) {
      Player.scenes = scenes;
      const bar = $('#steps');
      scenes.forEach((s, i) => {
        const b = document.createElement('button'); b.title = s.title; b.textContent = i + 1;
        b.onclick = () => Player.play(i); bar.appendChild(b);
      });
      $('#btn-play').onclick = () => Player.play(Player.idx >= scenes.length ? 0 : Player.idx);
      $('#btn-voice').onclick = (e) => { Player.voiceOn = !Player.voiceOn; e.target.classList.toggle('off'); };
      $('#btn-sfx').onclick = (e) => { Player.sfxOn = !Player.sfxOn; e.target.classList.toggle('off'); };
      const fit = () => { const k = Math.min(innerWidth / 1280, (innerHeight - 56) / 720); $('#stage').style.transform = `scale(${k})`; $('#wrap').style.height = 720 * k + 'px'; $('#wrap').style.width = 1280 * k + 'px'; };
      addEventListener('resize', fit); fit();
    },
    async play(from) {
      const run = ++Player.run; // 新一次播放会让旧循环自然退出
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      $('#overlay').hidden = true;
      for (let i = from; i < Player.scenes.length; i++) {
        if (run !== Player.run) return;
        Player.idx = i;
        document.querySelectorAll('#steps button').forEach((b, j) => b.classList.toggle('on', j === i));
        const s = Player.scenes[i];
        api.mascot(s.mood);
        await Promise.all([speak(s.say), s.act ? s.act(api) : null]);
        await sleep(350);
      }
      if (run === Player.run) { Player.idx = Player.scenes.length; sfx.ding(); $('#overlay').hidden = false; $('#overlay h2').textContent = '教程结束，点击重播'; }
    },
  };
  window.Player = Player;
})();
