/* ============================================================
   dokyo — sutra.js
   讀誦對照頁的互動：顯示切換、字級、語音檢測、日文朗讀

   放在 </body> 前以 <script src="js/sutra.js"></script> 載入。
   所有控制項皆為選配 —— 頁面沒放的元件會自動略過，不會報錯。

   依賴的 DOM 約定：
     .w[data-kana] / .tw[data-kana]   一個梵文詞，data-kana 為送進 TTS 的假名
     .line                            一句（朗讀與高亮的單位）
     button.say                       發音鈕，位於所屬 .line 內
   ============================================================ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /* ── 顯示切換（羅馬拼音／句義）── */
  const toggle = (id, cls) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!on));
      document.body.classList.toggle(cls, on);
    });
  };
  toggle('t-romaji', 'hide-romaji');
  toggle('t-meaning', 'hide-meaning');

  /* ── 頂部固定區高度隨內容變動，據此設定錨點偏移 ── */
  const topbar = $('.topbar');
  if (topbar) {
    const setTop = () => document.documentElement.style
      .setProperty('--top', (topbar.offsetHeight + 12) + 'px');
    setTop();
    addEventListener('resize', setTop);
    if (window.ResizeObserver) new ResizeObserver(setTop).observe(topbar);
  }

  /* ── 字級加減 ── */
  const zIn = document.getElementById('z-in');
  const zOut = document.getElementById('z-out');
  if (zIn || zOut) {
    let size = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--kana-size')
    ) || 1.55;
    const apply = () => document.documentElement.style
      .setProperty('--kana-size', size.toFixed(2) + 'rem');
    if (zIn)  zIn.onclick  = () => { size = Math.min(3.2, size + .18); apply(); };
    if (zOut) zOut.onclick = () => { size = Math.max(1.0, size - .18); apply(); };
  }

  /* ============================================================
     日文發音（瀏覽器內建語音合成）
     ============================================================ */
  const synth = window.speechSynthesis;
  const stopBtn = document.getElementById('stop');
  const allBtn  = document.getElementById('playall');
  const spdWrap = $('.spd');
  const spdBtns = $$('.spd button');

  /* 速度分三段。單純調 rate 在多數引擎有下限，
     真正的放慢靠「逐詞念 + 詞間停頓」達成。 */
  const SPEED = [
    { rate: 0.85, gap: 120 },   // 常速
    { rate: 0.60, gap: 420 },   // 慢
    { rate: 0.42, gap: 900 },   // 極慢
  ];
  let level = 0, jaVoice = null, current = null, timer = null, alive = null;

  /* ── 環境檢測面板 ── */
  const envBtn   = document.getElementById('envbtn');
  const envDot   = document.getElementById('envdot');
  const envLabel = document.getElementById('envlabel');
  const envPanel = document.getElementById('envpanel');
  const envMsg   = document.getElementById('envmsg');
  const envHelp  = document.getElementById('envhelp');
  const envFt    = document.getElementById('envft');
  const envHd    = document.getElementById('envhd');
  const envPick  = document.getElementById('envpick');
  const voiceSel = document.getElementById('voicesel');

  const ua = navigator.userAgent;
  const OS = /iPhone|iPad|iPod/.test(ua) ? 'ios'
           : /Android/.test(ua)          ? 'android'
           : /Macintosh/.test(ua)        ? 'mac'
           : /Windows/.test(ua)          ? 'win' : '';
  const isFirefox = /Firefox/.test(ua);
  $$('#envhelp li').forEach(li => {
    if (li.dataset.os === OS) li.dataset.hit = '1';
  });

  if (envBtn && envPanel) {
    envBtn.addEventListener('click', () => {
      const open = envBtn.getAttribute('aria-expanded') === 'true';
      envBtn.setAttribute('aria-expanded', String(!open));
      envPanel.hidden = open;
    });
  }

  const VOICE_NOTE = name =>
    '將使用「' + name + '」朗讀。這是通用日語語音，'
    + '旨在學習假名讀音，念誦的調子、語氣、斷句請依道場阿闍梨為主。';

  const setEnv = (state, label, msg, help) => {
    if (envDot)   envDot.className = 'dot ' + state;
    if (envLabel) envLabel.textContent = label;
    if (envMsg)   envMsg.textContent = msg;
    if (envHelp)  envHelp.hidden = !help;
    if (envHd)    envHd.textContent =
      state === 'ok' ? '加裝其他日語語音' : '安裝日語語音的方式';
    if (state === 'warn' && envBtn && envPanel) {
      envBtn.setAttribute('aria-expanded', 'true');
      envPanel.hidden = false;
    }
  };

  if (!synth) {
    document.body.classList.add('no-tts');
    if (spdWrap) spdWrap.hidden = true;
    if (allBtn)  allBtn.hidden = true;
    setEnv('warn', '語音不可用',
      '這個瀏覽器不支援語音合成（Web Speech API），朗讀功能已隱藏。'
      + '建議改用 Chrome、Edge 或 Safari。', false);
    return;
  }

  let settled = false;

  const pickVoice = () => {
    const vs = synth.getVoices();
    jaVoice = vs.find(v => v.lang === 'ja-JP') ||
              vs.find(v => v.lang && v.lang.replace('_', '-').startsWith('ja')) || null;
    if (jaVoice) {
      settled = true;
      const jas = vs.filter(v =>
        v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('ja'));
      if (voiceSel && voiceSel.options.length !== jas.length) {
        voiceSel.innerHTML = '';
        jas.forEach(v => {
          const o = document.createElement('option');
          o.value = v.voiceURI; o.textContent = v.name;
          if (v === jaVoice) o.selected = true;
          voiceSel.appendChild(o);
        });
        if (envPick) envPick.hidden = jas.length < 2;
      }
      setEnv('ok', '語音可用', VOICE_NOTE(jaVoice.name), true);
    } else if (vs.length) {
      settled = true;
      if (envFt) envFt.textContent = isFirefox
        ? 'Firefox 在部分平台不提供語音清單，改用 Chrome、Edge 或 Safari 通常可解決。'
        : '裝好之後請重新開啟瀏覽器，再回到本頁。';
      setEnv('warn', '缺日語語音',
        '系統目前有 ' + vs.length + ' 個語音，但沒有日語。'
        + '朗讀仍可按下，但會用其他語言的發音規則念，聽起來不會正確。', true);
    }
    return !!jaVoice;
  };

  if (voiceSel) {
    voiceSel.addEventListener('change', () => {
      const v = synth.getVoices().find(x => x.voiceURI === voiceSel.value);
      if (v) {
        jaVoice = v;
        if (envMsg) envMsg.textContent = VOICE_NOTE(v.name);
      }
    });
  }

  pickVoice();
  synth.addEventListener('voiceschanged', pickVoice);

  /* getVoices() 在部分瀏覽器需要一段時間才回填，重試數次 */
  let tries = 0;
  const probe = setInterval(() => {
    if (settled || pickVoice() || ++tries > 12) {
      clearInterval(probe);
      if (!settled) {
        if (envFt) envFt.textContent = isFirefox
          ? 'Firefox 在部分平台不提供語音清單，改用 Chrome、Edge 或 Safari 通常可解決。'
          : '若已安裝日語語音，重新開啟瀏覽器後再試一次。';
        setEnv('warn', '找不到語音',
          '瀏覽器沒有回報任何可用語音。朗讀可能無聲。', true);
      }
    }
  }, 250);

  /* ── 速度切換 ── */
  spdBtns.forEach(b => b.addEventListener('click', () => {
    level = +b.dataset.spd;
    spdBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));

  /* ── 播放 ── */
  let queue = [], qi = 0, chain = false;

  const clear = () => {
    clearTimeout(timer);
    clearInterval(alive); alive = null;
    $$('.speaking').forEach(el => el.classList.remove('speaking'));
    $$('.saying').forEach(el => el.classList.remove('saying'));
    if (stopBtn) stopBtn.hidden = true;
    if (allBtn)  allBtn.setAttribute('aria-pressed', 'false');
    current = null; chain = false; queue = []; qi = 0;
  };

  const stop = () => { synth.cancel(); clear(); };
  if (stopBtn) stopBtn.addEventListener('click', stop);

  /* 題簽那一行的詞散在 header 裡，範圍要放大到整個 header */
  const wordsOf = line => {
    const scope = line.classList.contains('titleline')
      ? (line.closest('header') || line) : line;
    return $$('.w[data-kana], .tw[data-kana]', scope);
  };

  /* 一句念完後，若在全篇模式則接下一句 */
  const lineDone = () => {
    if (!chain) { clear(); return; }
    qi += 1;
    if (qi >= queue.length) { clear(); return; }
    timer = setTimeout(() => playLine(queue[qi]), SPEED[level].gap * 1.6);
  };

  /* 逐詞依序念出，每念完一詞停頓 gap 毫秒 */
  const speakWords = (line, words, i) => {
    if (current !== line) return;
    if (i >= words.length) {
      words.forEach(w => w.classList.remove('saying'));
      line.classList.remove('speaking');
      lineDone();
      return;
    }
    const { rate, gap } = SPEED[level];
    words.forEach(w => w.classList.remove('saying'));
    words[i].classList.add('saying');

    /* data-say 是給語音引擎的覆寫值（如合拗音 クヮン → カン），
       沒有就用顯示的假名 */
    const u = new SpeechSynthesisUtterance(
      words[i].dataset.say || words[i].dataset.kana);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.rate = rate;
    u.pitch = 0.95;

    let done = false, started = false;
    const finish = () => {
      if (done || current !== line) return;
      done = true;
      clearInterval(poll); clearTimeout(bail);
      timer = setTimeout(() => speakWords(line, words, i + 1), gap);
    };

    synth.speak(u);

    /* 以引擎實際狀態判斷是否唸完：唯有真的停止發聲才前進，
       如此顯示不會超前聲音，也不需要估算時長。 */
    const poll = setInterval(() => {
      if (current !== line) { clearInterval(poll); return; }
      if (synth.speaking || synth.pending) { started = true; return; }
      if (started) finish();
    }, 120);

    /* 若引擎始終沒有開始（指令被吃掉），放行以免整段卡死 */
    const bail = setTimeout(() => { if (!started) finish(); }, 2500);

    u.onend = () => { if (started) finish(); };
    u.onerror = finish;
  };

  const keepAlive = () => {
    clearInterval(alive);
    alive = setInterval(() => {
      if (!current) { clearInterval(alive); alive = null; return; }
      if (!synth.speaking && !synth.pending && synth.paused) synth.resume();
    }, 9000);
  };

  const playLine = line => {
    current = line;
    keepAlive();
    line.classList.add('speaking');
    if (stopBtn) stopBtn.hidden = false;
    if (chain) line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const ws = wordsOf(line);
    setTimeout(() => speakWords(line, ws, 0), 140);
  };

  $$('.say').forEach(btn => {
    const line = btn.closest('.line');
    if (!line) return;
    btn.addEventListener('click', () => {
      const again = current === line && !chain;
      stop();
      if (again) return;
      playLine(line);
    });
  });

  /* 全篇：題簽 + 所有句子，依序念完 */
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      const running = chain;
      stop();
      if (running) return;
      queue = $$('.line');
      if (!queue.length) return;
      qi = 0; chain = true;
      allBtn.setAttribute('aria-pressed', 'true');
      playLine(queue[0]);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && current && synth.paused) synth.resume();
  });

  addEventListener('beforeunload', () => synth.cancel());
})();
