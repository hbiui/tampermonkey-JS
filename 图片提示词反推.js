// ==UserScript==
// @name         PromptLens · 图片提示词反推
// @namespace    promptlens-v2
// @version      1.2.2
// @description  修复同一页面出现多个FAB图标的问题（@noframes + 单例守卫）。框选/粘贴图片，多AI并发反推提示词。
// @author       PromptLens
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ── Guard 1: only run in the top-level window, never inside iframes ──
  if (window.self !== window.top) return;

  // ── Guard 2: singleton — bail out if already initialized on this page ──
  if (document.getElementById('promptlens-host')) return;

  /* ══════════════════════════════════════════════════════════════
   *  CONSTANTS
   * ══════════════════════════════════════════════════════════════ */
  const CFG_KEY      = 'promptlens_v2_cfg';
  const HIST_KEY     = 'promptlens_v2_hist';
  const MAX_HIST     = 50;
  const CFG_VERSION  = 2;
  const DRAG_THRESH  = 5;   // px — below this, mousedown→mouseup = click, not drag [BUG-FIX-①]

  /* ══════════════════════════════════════════════════════════════
   *  DEFAULT CONFIG
   * ══════════════════════════════════════════════════════════════ */
  const DEFAULTS = {
    version:      CFG_VERSION,
    shortcut:     'Alt+Shift+S',
    outputLang:   'en',          // en | zh | both
    theme:        'auto',        // auto | light | dark
    showFab:      true,
    displayMode:  'drawer',      // drawer | modal | bubble | float
    resultView:   'tags',        // tags | text | cards
    fabPos:       null,          // {left,top} persisted
    floatPos:     null,          // {left,top} persisted
    drawerWidth:  420,           // px, resizable in drawer mode
    compress:     true,          // auto-compress before API send
    compressMaxPx:1280,          // max longer side in px
    compressQ:    0.85,          // jpeg quality 0-1
    providers: {
      openai:   { enabled:false, key:'', model:'gpt-4o',          label:'ChatGPT',  baseUrl:'https://api.openai.com' },
      deepseek: { enabled:false, key:'', model:'deepseek-chat',   label:'DeepSeek', baseUrl:'https://api.deepseek.com' },
      doubao:   { enabled:false, key:'', model:'',                label:'豆包',      baseUrl:'https://ark.cn-beijing.volces.com' },
      minimax:  { enabled:false, key:'', model:'abab6.5s-chat',   label:'MiniMax',  baseUrl:'https://api.minimax.chat' },
      qwen:     { enabled:false, key:'', model:'qwen-vl-max',     label:'通义千问', baseUrl:'https://dashscope.aliyuncs.com' },
      gemini:   { enabled:false, key:'', model:'gemini-1.5-pro',  label:'Gemini',   baseUrl:'https://generativelanguage.googleapis.com' },
      custom:   { enabled:false, key:'', model:'',                label:'自定义',   baseUrl:'' },
    },
  };

  /* ══════════════════════════════════════════════════════════════
   *  CONFIG STORAGE  (with version migration) [BUG-FIX-⑦ version]
   * ══════════════════════════════════════════════════════════════ */
  function loadConfig() {
    try {
      const raw = GM_getValue(CFG_KEY, null);
      if (!raw) return clone(DEFAULTS);
      const saved = JSON.parse(raw);
      // Version migration: if old version, reset providers to get new fields
      if ((saved.version || 1) < CFG_VERSION) {
        const migrated = merge(clone(DEFAULTS), saved);
        migrated.version = CFG_VERSION;
        // Keep user keys/models but reset structural fields from defaults
        Object.keys(DEFAULTS.providers).forEach(k => {
          if (saved.providers?.[k]) {
            migrated.providers[k].key     = saved.providers[k].key     || '';
            migrated.providers[k].model   = saved.providers[k].model   || DEFAULTS.providers[k].model;
            migrated.providers[k].enabled = saved.providers[k].enabled || false;
          }
        });
        saveConfig(migrated);
        return migrated;
      }
      return merge(clone(DEFAULTS), saved);
    } catch { return clone(DEFAULTS); }
  }
  function saveConfig(c) { GM_setValue(CFG_KEY, JSON.stringify(c)); }
  function clone(o)      { return JSON.parse(JSON.stringify(o)); }
  function merge(t, s) {
    for (const k in s) {
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]))
        t[k] = merge(t[k] || {}, s[k]);
      else t[k] = s[k];
    }
    return t;
  }

  /* ══════════════════════════════════════════════════════════════
   *  HISTORY STORAGE
   * ══════════════════════════════════════════════════════════════ */
  function loadHist()       { try { return JSON.parse(GM_getValue(HIST_KEY,'[]')); } catch { return []; } }
  function saveHist(a)      { GM_setValue(HIST_KEY, JSON.stringify(a)); }
  function deleteHist(id)   { saveHist(loadHist().filter(h => h.id !== id)); }
  function clearHist()      { saveHist([]); }

  // Compress to tiny thumbnail — properly releases canvas [BUG-FIX-③]
  function makeThumb(b64) {
    return new Promise(resolve => {
      try {
        const img = new Image();
        img.onload = () => {
          const W = 120, H = 80;
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          const ratio = Math.max(W / img.width, H / img.height);
          cv.getContext('2d').drawImage(img, (W - img.width*ratio)/2, (H - img.height*ratio)/2, img.width*ratio, img.height*ratio);
          const result = cv.toDataURL('image/jpeg', 0.6);
          cv.width = 0; cv.height = 0; // release GPU memory [BUG-FIX-③]
          resolve(result);
        };
        img.onerror = () => resolve('');
        img.src = 'data:image/png;base64,' + b64;
      } catch { resolve(''); }
    });
  }

  async function pushHist(thumb, modelResults) {
    const hist = loadHist();
    hist.unshift({
      id:     Date.now().toString(36) + Math.random().toString(36).slice(2,7),
      ts:     Date.now(),
      thumb,
      url:    location.href.slice(0,120),
      title:  document.title.slice(0,60),
      lang:   cfg.outputLang,
      models: modelResults,
    });
    if (hist.length > MAX_HIST) hist.splice(MAX_HIST);
    saveHist(hist);
  }

  /* ══════════════════════════════════════════════════════════════
   *  SYSTEM PROMPT
   * ══════════════════════════════════════════════════════════════ */
  function buildPrompt(lang) {
    if (lang === 'zh') return `你是专业的AI绘图提示词工程师。请仔细分析图片内容，用【中文】输出适用于 Stable Diffusion、Midjourney 的详细提示词。

重要：所有标签和内容必须使用中文，不要输出英文。

请严格按以下格式输出（每行一个标签组，用中文逗号分隔）：
**提示词：** 主体描述, 艺术风格, 画面构图, 光线效果, 色彩色调, 画面质量
**负面提示词：** 模糊, 水印, 变形, 低质量（列出需要避免的元素）
**风格参考：** 艺术家名字或风格流派

示例格式：
**提示词：** 一位年轻女性, 油画风格, 三分构图, 柔和自然光, 暖色调, 超精细
**负面提示词：** 模糊, 噪点, 变形, 低分辨率
**风格参考：** 莫奈印象派`;

    if (lang === 'both') return `You are a professional AI image prompt engineer. Analyze the image and output prompts in BOTH English and Chinese (中英双语).

Strictly follow this format:
**Prompt:** subject description, art style, composition, lighting, color palette, quality tags (masterpiece, best quality, 8k)
**中文提示词：** 主体描述, 艺术风格, 构图, 光线, 色调, 质量标签（与上方英文对应的中文版本）
**Negative Prompt:** elements to avoid (blurry, watermark, deformed, low quality)
**风格参考：** artist name or style movement (中英文均可)`;

    return `You are a professional AI image prompt engineer. Analyze the image carefully and generate detailed prompts for Stable Diffusion, Midjourney, or DALL-E.

Strictly follow this format:
**Prompt:** comma-separated English tags: subject description, art style, composition, lighting, color palette, quality tags (e.g. masterpiece, best quality, 8k, ultra-detailed, photorealistic)
**Negative Prompt:** comma-separated elements to avoid (e.g. blurry, watermark, text, deformed, low quality)
**Style Reference:** specific artist names or style movements

Be precise, specific, and use standard prompt engineering conventions.`;
  }

  /* ══════════════════════════════════════════════════════════════
   *  IMAGE COMPRESSION  [NEW FEATURE]
   * ══════════════════════════════════════════════════════════════ */
  function compressImage(b64, maxPx, quality) {
    return new Promise(resolve => {
      if (!cfg.compress) { resolve(b64); return; }
      try {
        const img = new Image();
        img.onload = () => {
          const longer = Math.max(img.width, img.height);
          if (longer <= maxPx) { resolve(b64); return; } // No resize needed
          const scale = maxPx / longer;
          const W = Math.round(img.width * scale);
          const H = Math.round(img.height * scale);
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          cv.getContext('2d').drawImage(img, 0, 0, W, H);
          const result = cv.toDataURL('image/jpeg', quality).split(',')[1];
          cv.width = 0; cv.height = 0;
          resolve(result);
        };
        img.onerror = () => resolve(b64);
        img.src = 'data:image/png;base64,' + b64;
      } catch { resolve(b64); }
    });
  }

  /* ══════════════════════════════════════════════════════════════
   *  GM FETCH — with offline check [NEW FEATURE]
   * ══════════════════════════════════════════════════════════════ */
  function gmFetch(url, opts = {}) {
    // Offline detection [NEW FEATURE]
    if (!navigator.onLine) return Promise.reject(new Error('🚫 当前处于离线状态，请检查网络连接'));
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method || 'POST', url,
        headers: opts.headers || {}, data: opts.body, timeout: 60000,
        onload: r => {
          try { resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => JSON.parse(r.responseText), text: () => r.responseText }); }
          catch { reject(new Error('响应解析失败: ' + r.responseText.slice(0,120))); }
        },
        onerror:   () => reject(new Error('网络请求失败，请检查网络或 API 地址')),
        ontimeout: () => reject(new Error('请求超时（60s），API 可能无响应')),
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
   *  AI PROVIDERS
   * ══════════════════════════════════════════════════════════════ */
  const OAI_BODY = (model, imgB64, prompt) => JSON.stringify({ model, max_tokens:1500, messages:[{ role:'user', content:[
    { type:'image_url', image_url:{ url:'data:image/png;base64,'+imgB64 } },
    { type:'text', text:prompt },
  ]}]});

  async function callOpenAI(baseUrl, key, model, imgB64, prompt) {
    const r = await gmFetch(baseUrl+'/v1/chat/completions', { headers:{ 'Content-Type':'application/json','Authorization':'Bearer '+key }, body:OAI_BODY(model,imgB64,prompt) });
    if (!r.ok) throw new Error('HTTP '+r.status+': '+r.text().slice(0,200));
    return r.json().choices?.[0]?.message?.content || '（空响应）';
  }
  async function callDoubao(key, model, imgB64, prompt) {
    const r = await gmFetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', { headers:{ 'Content-Type':'application/json','Authorization':'Bearer '+key }, body:OAI_BODY(model,imgB64,prompt) });
    if (!r.ok) throw new Error('HTTP '+r.status+': '+r.text().slice(0,200));
    return r.json().choices?.[0]?.message?.content || '（空响应）';
  }
  async function callQwen(key, model, imgB64, prompt) {
    const r = await gmFetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', { headers:{ 'Content-Type':'application/json','Authorization':'Bearer '+key }, body:OAI_BODY(model,imgB64,prompt) });
    if (!r.ok) throw new Error('HTTP '+r.status+': '+r.text().slice(0,200));
    return r.json().choices?.[0]?.message?.content || '（空响应）';
  }
  async function callGemini(key, model, imgB64, prompt) {
    const r = await gmFetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+key, {
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ contents:[{ parts:[{ inline_data:{ mime_type:'image/png', data:imgB64 } },{ text:prompt }] }] }),
    });
    if (!r.ok) throw new Error('HTTP '+r.status+': '+r.text().slice(0,200));
    return r.json().candidates?.[0]?.content?.parts?.[0]?.text || '（空响应）';
  }
  async function callMiniMax(key, model, imgB64, prompt) {
    const r = await gmFetch('https://api.minimax.chat/v1/text/chatcompletion_v2', { headers:{ 'Content-Type':'application/json','Authorization':'Bearer '+key }, body:OAI_BODY(model,imgB64,prompt) });
    if (!r.ok) throw new Error('HTTP '+r.status+': '+r.text().slice(0,200));
    return r.json().choices?.[0]?.message?.content || '（空响应）';
  }

  async function callProvider(key, p, imgB64, prompt) {
    if (!p.key)   throw new Error('API Key 未配置，请在设置中填写');
    if (!p.model) throw new Error('模型名称未配置，请在设置中填写');
    // Compress before sending [NEW FEATURE]
    const compressed = await compressImage(imgB64, cfg.compressMaxPx, cfg.compressQ);
    switch (key) {
      case 'doubao':  return callDoubao(p.key, p.model, compressed, prompt);
      case 'qwen':    return callQwen(p.key, p.model, compressed, prompt);
      case 'gemini':  return callGemini(p.key, p.model, compressed, prompt);
      case 'minimax': return callMiniMax(p.key, p.model, compressed, prompt);
      default:        return callOpenAI(p.baseUrl, p.key, p.model, compressed, prompt);
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  IMAGE CAPTURE
   * ══════════════════════════════════════════════════════════════ */
  async function captureRect(rect) {
    // Best-intersecting <img>
    let bestImg = null, bestArea = 0;
    for (const img of document.querySelectorAll('img')) {
      const r  = img.getBoundingClientRect();
      const ix = Math.max(rect.x, r.left), iy = Math.max(rect.y, r.top);
      const iw = Math.min(rect.x+rect.w, r.right)-ix, ih = Math.min(rect.y+rect.h, r.bottom)-iy;
      if (iw > 0 && ih > 0 && iw*ih > bestArea) { bestArea = iw*ih; bestImg = img; }
    }
    if (bestImg) return imgToB64(bestImg);
    // Canvas fallback
    for (const cv of document.querySelectorAll('canvas')) {
      const r = cv.getBoundingClientRect();
      if (r.left < rect.x+rect.w && r.right > rect.x && r.top < rect.y+rect.h && r.bottom > rect.y) {
        try { return cv.toDataURL('image/png').split(',')[1]; } catch {}
      }
    }
    throw new Error('选区内未找到图片元素，请确保矩形框住了完整图片区域。');
  }

  function imgToB64(img) {
    return new Promise((resolve, reject) => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth || img.width || 512;
        cv.height = img.naturalHeight || img.height || 512;
        cv.getContext('2d').drawImage(img, 0, 0);
        const b64 = cv.toDataURL('image/png').split(',')[1];
        cv.width = 0; cv.height = 0;
        if (b64 && b64.length > 200) { resolve(b64); return; }
      } catch {}
      const src = img.currentSrc || img.src || '';
      if (!src) { reject(new Error('无法获取图片地址')); return; }
      if (src.startsWith('data:')) { resolve(src.split(',')[1]); return; }
      GM_xmlhttpRequest({ method:'GET', url:src, responseType:'arraybuffer', timeout:15000,
        onload: r => {
          try { const b = new Uint8Array(r.response); let s=''; for (let i=0;i<b.length;i++) s+=String.fromCharCode(b[i]); resolve(btoa(s)); }
          catch { reject(new Error('图片编码失败')); }
        },
        onerror:   () => reject(new Error('图片跨域请求失败')),
        ontimeout: () => reject(new Error('图片请求超时')),
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
   *  CLIPBOARD IMAGE PASTE  [NEW FEATURE]
   * ══════════════════════════════════════════════════════════════ */
  function readClipboardImage() {
    return new Promise((resolve, reject) => {
      if (!navigator.clipboard?.read) { reject(new Error('此浏览器不支持剪贴板图片读取（需 Chrome 86+）')); return; }
      navigator.clipboard.read().then(items => {
        for (const item of items) {
          const type = item.types.find(t => t.startsWith('image/'));
          if (type) {
            item.getType(type).then(blob => {
              const reader = new FileReader();
              reader.onload = e => resolve(e.target.result.split(',')[1]);
              reader.onerror = () => reject(new Error('剪贴板图片读取失败'));
              reader.readAsDataURL(blob);
            });
            return;
          }
        }
        reject(new Error('剪贴板中没有图片，请先复制一张图片'));
      }).catch(() => reject(new Error('无法读取剪贴板（权限被拒绝）')));
    });
  }

  /* ══════════════════════════════════════════════════════════════
   *  SCREENSHOT OVERLAY
   * ══════════════════════════════════════════════════════════════ */
  function startScreenshot(onDone) {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position:'fixed', inset:0, zIndex:2147483647, cursor:'crosshair', userSelect:'none', background:'rgba(0,0,0,0.42)' });

    const hint = document.createElement('div');
    hint.textContent = '拖拽框选图片  ·  Enter/双击 确认  ·  Esc 取消';
    Object.assign(hint.style, { position:'absolute', top:'18px', left:'50%', transform:'translateX(-50%)', background:'rgba(15,15,25,0.78)', backdropFilter:'blur(14px)', border:'1px solid rgba(255,255,255,0.14)', color:'#e8eaf6', fontSize:'12.5px', letterSpacing:'.3px', padding:'9px 22px', borderRadius:'99px', pointerEvents:'none', fontFamily:'system-ui,sans-serif', boxShadow:'0 4px 24px rgba(0,0,0,0.3)', whiteSpace:'nowrap' });
    overlay.appendChild(hint);

    const sel = document.createElement('div');
    Object.assign(sel.style, { position:'absolute', display:'none', border:'2px solid #818cf8', background:'rgba(99,102,241,0.07)', boxShadow:'0 0 0 1px rgba(129,140,248,0.35)', borderRadius:'3px', pointerEvents:'none' });
    overlay.appendChild(sel);

    const badge = document.createElement('div');
    Object.assign(badge.style, { position:'absolute', display:'none', background:'#6366f1', color:'#fff', fontSize:'11px', padding:'2px 8px', borderRadius:'5px', pointerEvents:'none', fontFamily:'monospace', boxShadow:'0 2px 8px rgba(99,102,241,0.4)' });
    overlay.appendChild(badge);

    let sx, sy, ex, ey, drawing=false, finalRect=null;
    const upd = () => {
      const x=Math.min(sx,ex), y=Math.min(sy,ey), w=Math.abs(ex-sx), h=Math.abs(ey-sy);
      finalRect={x,y,w,h};
      Object.assign(sel.style,   {left:x+'px',top:y+'px',width:w+'px',height:h+'px',display:'block'});
      Object.assign(badge.style, {left:(x+w-88)+'px',top:(y+h+8)+'px',display:'block'});
      badge.textContent = Math.round(w)+' × '+Math.round(h);
    };

    // 8 resize handles
    let handles=[];
    const DIRS=[['nw',-1,-1],['n',0,-1],['ne',1,-1],['w',-1,0],['e',1,0],['sw',-1,1],['s',0,1],['se',1,1]];
    const CUR={nw:'nwse-resize',n:'ns-resize',ne:'nesw-resize',w:'ew-resize',e:'ew-resize',sw:'nesw-resize',s:'ns-resize',se:'nwse-resize'};

    function bldHandles() {
      handles.forEach(h=>h.remove()); handles=[];
      if (!finalRect) return;
      DIRS.forEach(([d,dx,dy]) => {
        const h = document.createElement('div');
        Object.assign(h.style, { position:'absolute', width:'10px', height:'10px', borderRadius:'50%', background:'#6366f1', border:'2px solid #fff', boxShadow:'0 1px 4px rgba(0,0,0,0.35)', left:(finalRect.x+(dx+1)/2*finalRect.w-5)+'px', top:(finalRect.y+(dy+1)/2*finalRect.h-5)+'px', cursor:CUR[d], zIndex:1, pointerEvents:'auto' });
        h.addEventListener('mousedown', e => {
          e.stopPropagation(); e.preventDefault();
          const orig={...finalRect}, ox=e.clientX, oy=e.clientY;
          const mv = ev => {
            let {x,y,w,h:ht}=orig, ddx=ev.clientX-ox, ddy=ev.clientY-oy;
            if(dx===-1){x+=ddx;w-=ddx;} if(dx===1)w+=ddx;
            if(dy===-1){y+=ddy;ht-=ddy;} if(dy===1)ht+=ddy;
            if(w<10||ht<10)return;
            finalRect={x,y,w,h:ht};
            Object.assign(sel.style,   {left:x+'px',top:y+'px',width:w+'px',height:ht+'px'});
            Object.assign(badge.style, {left:(x+w-88)+'px',top:(y+ht+8)+'px'});
            badge.textContent=Math.round(w)+' × '+Math.round(ht);
            bldHandles();
          };
          const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
          document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
        });
        overlay.appendChild(h); handles.push(h);
      });
      // Move zone
      const mv2=document.createElement('div');
      Object.assign(mv2.style,{position:'absolute',cursor:'move',pointerEvents:'auto',zIndex:0,left:finalRect.x+'px',top:finalRect.y+'px',width:finalRect.w+'px',height:finalRect.h+'px'});
      mv2.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        const ox=e.clientX-finalRect.x, oy=e.clientY-finalRect.y;
        const mv=ev=>{finalRect.x=ev.clientX-ox;finalRect.y=ev.clientY-oy;Object.assign(sel.style,{left:finalRect.x+'px',top:finalRect.y+'px'});Object.assign(badge.style,{left:(finalRect.x+finalRect.w-88)+'px',top:(finalRect.y+finalRect.h+8)+'px'});bldHandles();};
        const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
        document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
      });
      overlay.appendChild(mv2); handles.push(mv2);
    }

    overlay.addEventListener('mousedown', e => {
      if(e.button!==0)return;
      handles.forEach(h=>h.remove()); handles=[];
      sx=e.clientX; sy=e.clientY; ex=sx; ey=sy; drawing=true;
      sel.style.display=badge.style.display='none';
    });
    const onMv = e => { if(!drawing)return; ex=e.clientX; ey=e.clientY; upd(); };
    const onUp = e => { if(!drawing)return; drawing=false; ex=e.clientX; ey=e.clientY; upd(); bldHandles(); };
    document.addEventListener('mousemove', onMv);
    document.addEventListener('mouseup', onUp);
    overlay.addEventListener('dblclick', confirm);
    const onKey = e => { if(e.key==='Escape')cancel(); if(e.key==='Enter'&&finalRect?.w>8)confirm(); };
    document.addEventListener('keydown', onKey);

    let done=false;
    function confirm() { if(done||!finalRect||finalRect.w<8||finalRect.h<8)return; done=true; cleanup(); onDone(finalRect); }
    function cancel()  { if(done)return; done=true; cleanup(); onDone(null); }
    function cleanup() {
      document.removeEventListener('mousemove',onMv);
      document.removeEventListener('mouseup',onUp);
      document.removeEventListener('keydown',onKey);
      overlay.remove();
    }
    document.body.appendChild(overlay);
  }

  /* ══════════════════════════════════════════════════════════════
   *  CSS
   * ══════════════════════════════════════════════════════════════ */
  const CSS = `
:host { all:initial; font-family:"SF Pro Text",Inter,"PingFang SC","Noto Sans SC",system-ui,sans-serif; }
*,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
:host {
  --bg:#fff; --bg2:#f8f9fc; --bg3:rgba(0,0,0,.04);
  --border:rgba(0,0,0,.08); --text:#0f172a; --text2:#64748b;
  --accent:#6366f1; --acc2:#8b5cf6; --green:#10b981; --red:#ef4444; --amber:#f59e0b;
}
@media(prefers-color-scheme:dark){
  :host{--bg:#12131f;--bg2:#1a1b2e;--bg3:rgba(255,255,255,.04);--border:rgba(255,255,255,.08);--text:#e2e4f0;--text2:#8b90ad;}
}

/* ── panel base ── */
#pl-panel {
  position:fixed; display:flex; flex-direction:column;
  background:var(--bg); color:var(--text); overflow:hidden;
  z-index:2147483646; font-family:inherit;
}

/* ── DRAWER ── */
#pl-panel.mode-drawer {
  top:0; right:0; height:100dvh; max-height:100vh;
  border-left:1px solid var(--border);
  box-shadow:-12px 0 48px rgba(0,0,0,.12);
  transform:translateX(102%);
  transition:transform .32s cubic-bezier(.22,.68,0,1.2);
}
#pl-panel.mode-drawer.open{transform:translateX(0);}
/* drawer resize handle [NEW] */
#pl-resize-handle {
  position:absolute; left:0; top:0; bottom:0; width:5px;
  cursor:ew-resize; z-index:10;
  background:transparent;
  transition:background .2s;
}
#pl-resize-handle:hover,#pl-resize-handle.dragging{background:rgba(99,102,241,.4);}

/* ── MODAL backdrop ── */
#pl-backdrop {
  position:fixed; inset:0; z-index:2147483644;
  background:rgba(0,0,0,.46); backdrop-filter:blur(6px);
  opacity:0; pointer-events:none; transition:opacity .22s;
}
#pl-backdrop.open{opacity:1;pointer-events:auto;}

/* ── MODAL ── */
#pl-panel.mode-modal {
  top:50%; left:50%; width:500px; height:700px; max-height:90vh;
  border-radius:16px; border:1px solid var(--border);
  box-shadow:0 32px 100px rgba(0,0,0,.3);
  transform:translate(-50%,-48%) scale(.95);
  opacity:0; pointer-events:none;
  transition:transform .3s cubic-bezier(.22,.68,0,1.2),opacity .22s;
}
#pl-panel.mode-modal.open{transform:translate(-50%,-50%) scale(1);opacity:1;pointer-events:auto;}

/* ── BUBBLE ── */
#pl-panel.mode-bubble {
  width:400px; height:560px; max-height:82vh;
  border-radius:14px; border:1px solid var(--border);
  box-shadow:0 16px 56px rgba(0,0,0,.2);
  opacity:0; transform:scale(.93) translateY(8px); pointer-events:none;
  transition:opacity .24s,transform .24s cubic-bezier(.22,.68,0,1.2);
}
#pl-panel.mode-bubble.open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto;}

/* ── FLOAT ── */
#pl-panel.mode-float {
  width:420px; height:600px; max-height:90vh;
  border-radius:14px; border:1px solid var(--border);
  box-shadow:0 20px 70px rgba(0,0,0,.22);
  opacity:0; transform:scale(.96); pointer-events:none;
  transition:opacity .2s,transform .2s cubic-bezier(.22,.68,0,1.2);
}
#pl-panel.mode-float.open{opacity:1;transform:scale(1);pointer-events:auto;}

/* ── header ── */
.pl-hdr{display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg);user-select:none;}
.pl-logo{width:26px;height:26px;flex-shrink:0;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:7px;display:grid;place-items:center;font-size:14px;color:#fff;}
.pl-title{font-size:13.5px;font-weight:600;letter-spacing:-.2px;}
.pl-hdr-r{display:flex;gap:2px;align-items:center;margin-left:auto;}
.pl-ibtn{width:28px;height:28px;border-radius:7px;border:none;background:transparent;cursor:pointer;color:var(--text2);font-size:13px;display:grid;place-items:center;transition:background .15s,color .15s;flex-shrink:0;}
.pl-ibtn:hover{background:var(--bg3);color:var(--text);}
.pl-float-handle{cursor:move;}

/* ── view switch ── */
.pl-vsw{display:flex;gap:1px;padding:2px;background:var(--bg3);border-radius:8px;}
.pl-vopt{padding:3px 9px;font-size:11px;font-weight:500;border:none;background:transparent;cursor:pointer;border-radius:6px;color:var(--text2);transition:all .15s;white-space:nowrap;}
.pl-vopt.on{background:var(--accent);color:#fff;}

/* ── strip ── */
.pl-strip{display:flex;align-items:center;gap:11px;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;}
.pl-strip-thumb{width:72px;height:50px;flex-shrink:0;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:var(--bg3);}
.pl-strip-meta{flex:1;min-width:0;}
.pl-strip-lbl{font-size:10.5px;color:var(--text2);margin-bottom:3px;}
.pl-strip-mdls{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pl-strip-r{display:flex;gap:5px;flex-shrink:0;}
.pl-reanalyze{padding:5px 11px;font-size:11.5px;font-weight:500;background:linear-gradient(135deg,var(--accent),var(--acc2));color:#fff;border:none;border-radius:7px;cursor:pointer;transition:opacity .15s,transform .1s;}
.pl-reanalyze:hover{opacity:.88;transform:translateY(-1px);}
.pl-reanalyze:disabled{opacity:.45;cursor:not-allowed;transform:none;}
.pl-paste-btn{padding:5px 9px;font-size:11px;font-weight:500;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text2);cursor:pointer;transition:all .15s;}
.pl-paste-btn:hover{border-color:var(--accent);color:var(--accent);}

/* ── tabs ── */
.pl-tabbar{display:flex;overflow-x:auto;gap:1px;padding:7px 14px 0;border-bottom:1px solid var(--border);flex-shrink:0;scrollbar-width:none;}
.pl-tabbar::-webkit-scrollbar{display:none;}
.pl-tab{display:flex;align-items:center;gap:5px;padding:5px 12px;font-size:12px;font-weight:500;border:none;background:transparent;cursor:pointer;border-radius:7px 7px 0 0;color:var(--text2);white-space:nowrap;transition:all .15s;border-bottom:2px solid transparent;margin-bottom:-1px;}
.pl-tab.on{color:var(--accent);border-bottom-color:var(--accent);background:var(--bg3);}
.pl-dot{width:6px;height:6px;border-radius:50%;background:var(--text2);transition:background .2s;flex-shrink:0;}
.pl-dot.loading{background:var(--amber);animation:blink 1s infinite;}
.pl-dot.done{background:var(--green);}
.pl-dot.error{background:var(--red);}

/* ── results ── */
.pl-results{flex:1;overflow-y:auto;padding:13px 14px;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
.pl-results::-webkit-scrollbar{width:4px;}
.pl-results::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px;}

/* ── empty state ── */
.pl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:11px;color:var(--text2);text-align:center;padding:40px;}
.pl-empty-icon{font-size:38px;opacity:.7;}
.pl-empty-title{font-size:14px;font-weight:600;color:var(--text);}
.pl-empty-sub{font-size:12px;line-height:1.75;}
.pl-empty-actions{display:flex;gap:8px;margin-top:6px;}
kbd{padding:2px 6px;border:1px solid var(--border);border-radius:5px;font-family:monospace;font-size:11px;background:var(--bg2);color:var(--text);}

/* ── skeleton ── */
.pl-skel{display:flex;flex-direction:column;gap:9px;padding:4px 0;}
.pl-skel-line{height:11px;border-radius:5px;background:linear-gradient(90deg,var(--bg3) 25%,rgba(99,102,241,.12) 50%,var(--bg3) 75%);background-size:200% 100%;animation:shimmer 1.6s infinite;}
.pl-skel-line:nth-child(1){width:100%}.pl-skel-line:nth-child(2){width:88%}.pl-skel-line:nth-child(3){width:75%}.pl-skel-line:nth-child(4){width:92%}.pl-skel-line:nth-child(5){width:60%}

/* ── TEXT view ── */
.pl-result-meta{font-size:10.5px;color:var(--text2);margin-bottom:9px;font-family:monospace;display:flex;gap:12px;align-items:center;}
.pl-result-body{font-size:13px;line-height:1.8;color:var(--text);white-space:pre-wrap;word-break:break-word;}
.pl-result-error{font-size:12.5px;color:var(--red);line-height:1.6;}
.pl-edit-area{width:100%;font-size:13px;line-height:1.8;min-height:120px;border:1.5px solid var(--accent);border-radius:8px;padding:10px 12px;resize:vertical;background:var(--bg);color:var(--text);font-family:inherit;outline:none;}

/* ── TAG BUBBLE view [NEW] ── */
.pl-tags-wrap{display:flex;flex-direction:column;gap:14px;}
.pl-tags-section{}
.pl-tags-section-label{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text2);margin-bottom:7px;}
.pl-tags-cloud{display:flex;flex-wrap:wrap;gap:5px;}
.pl-tag{
  display:inline-flex;align-items:center;gap:4px;
  padding:4px 10px;font-size:12px;font-weight:500;
  border-radius:6px;border:1px solid var(--border);
  background:var(--bg2);color:var(--text);
  cursor:default;transition:all .15s;user-select:text;
}
.pl-tag:hover{border-color:rgba(99,102,241,.5);background:rgba(99,102,241,.07);}
.pl-tag.deleted{opacity:.3;text-decoration:line-through;cursor:pointer;}
.pl-tag-del{width:14px;height:14px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:var(--text2);font-size:10px;display:grid;place-items:center;transition:all .15s;padding:0;flex-shrink:0;}
.pl-tag-del:hover{background:var(--red);color:#fff;}
.pl-tag-add{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;font-size:12px;border-radius:6px;border:1px dashed var(--border);background:transparent;color:var(--text2);cursor:pointer;transition:all .15s;}
.pl-tag-add:hover{border-color:var(--accent);color:var(--accent);}
.pl-tag-input{font-size:12px;border:none;outline:none;background:transparent;color:var(--text);font-family:inherit;min-width:80px;max-width:200px;}
.pl-tags-copy-row{display:flex;gap:6px;margin-top:10px;align-items:center;}
.pl-tags-copy-info{font-size:11px;color:var(--text2);}

/* ── cards layout ── */
.pl-cards{display:flex;flex-direction:column;gap:12px;}
.pl-card{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg2);}
.pl-card-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);}
.pl-card-name{font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;}
.pl-card-time{font-size:10.5px;color:var(--text2);font-family:monospace;}
.pl-card-body{padding:11px 12px;}

/* ── actions ── */
.pl-actions{display:flex;gap:5px;align-items:center;padding:9px 13px;border-top:1px solid var(--border);flex-shrink:0;background:var(--bg);}
.pl-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;font-size:11.5px;font-weight:500;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;transition:all .15s;white-space:nowrap;}
.pl-btn:hover{background:var(--bg3);border-color:var(--accent);color:var(--accent);}
.pl-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;}
.pl-btn.primary:hover{opacity:.85;}
.pl-btn.ok{border-color:var(--green);color:var(--green);}
.pl-snap{margin-left:auto;}

/* ── overlays (settings, history) ── */
.pl-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.48);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;}
.pl-ov-box{background:var(--bg);border-radius:14px;color:var(--text);box-shadow:0 24px 80px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;}

/* ── settings ── */
.pl-set-head{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg);}
.pl-set-title{font-size:15px;font-weight:600;}
.pl-set-scroll{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
.pl-set-scroll::-webkit-scrollbar{width:4px;}
.pl-set-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px;}
.pl-set-body{padding:18px 22px;display:flex;flex-direction:column;gap:22px;}
.pl-set-lbl{font-size:10.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:var(--text2);margin-bottom:10px;}
.pl-prow{display:flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid var(--border);border-radius:9px;margin-bottom:7px;}
.pl-pname{font-size:12px;font-weight:500;min-width:65px;flex-shrink:0;}
.pl-pkey{flex:1;font-size:11.5px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg3);color:var(--text);font-family:"JetBrains Mono",monospace;outline:none;min-width:0;}
.pl-pkey:focus{border-color:var(--accent);}
.pl-pmodel{width:120px;flex-shrink:0;}
.pl-sw{position:relative;width:32px;height:18px;flex-shrink:0;cursor:pointer;}
.pl-sw input{display:none;}
.pl-sw-tr{display:block;width:32px;height:18px;border-radius:9px;background:#d1d5db;transition:background .2s;}
.pl-sw input:checked~.pl-sw-tr{background:var(--accent);}
.pl-sw-th{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .18s;pointer-events:none;}
.pl-sw input:checked~.pl-sw-th{transform:translateX(14px);}
.pl-set-inp{width:100%;padding:8px 12px;font-size:13px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text);font-family:inherit;outline:none;}
.pl-set-inp:focus{border-color:var(--accent);}
.pl-set-sub{font-size:11px;color:var(--text2);margin-top:5px;line-height:1.6;}
.pl-pills{display:flex;gap:6px;flex-wrap:wrap;}
.pl-pill{padding:5px 13px;font-size:12px;font-weight:500;border:1px solid var(--border);border-radius:99px;background:transparent;cursor:pointer;color:var(--text);transition:all .15s;}
.pl-pill.on{background:var(--accent);border-color:var(--accent);color:#fff;}
.pl-set-foot{padding:13px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;background:var(--bg);}
/* display mode grid */
.pl-dmode-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.pl-dmode-card{padding:11px 13px;border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all .15s;background:var(--bg2);}
.pl-dmode-card:hover{border-color:rgba(99,102,241,.4);}
.pl-dmode-card.on{border-color:var(--accent);background:rgba(99,102,241,.07);}
.pl-dmode-icon{font-size:18px;margin-bottom:5px;}
.pl-dmode-name{font-size:12px;font-weight:600;color:var(--text);}
.pl-dmode-desc{font-size:11px;color:var(--text2);margin-top:2px;line-height:1.5;}
/* compress row */
.pl-compress-row{display:flex;align-items:center;gap:10px;}
.pl-range{flex:1;accent-color:var(--accent);}
.pl-range-val{font-size:12px;font-weight:500;min-width:36px;text-align:right;color:var(--text);}

/* ── history ── */
.pl-hist-head{display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg);}
.pl-hist-title{font-size:14.5px;font-weight:600;}
.pl-hist-cnt{font-size:12px;font-weight:400;color:var(--text2);}
.pl-hist-acts{display:flex;gap:7px;align-items:center;}
.pl-hist-body{flex:1;overflow-y:auto;padding:14px 18px;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
.pl-hist-body::-webkit-scrollbar{width:4px;}
.pl-hist-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px;}
.pl-hist-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:var(--text2);}
.pl-hist-empty-icon{font-size:38px;opacity:.6;}
.pl-hist-empty-sub{font-size:12.5px;text-align:center;line-height:1.7;}
.pl-hist-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.pl-hist-wrap{position:relative;}
.pl-hist-card{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg2);cursor:pointer;transition:all .18s;}
.pl-hist-card:hover{border-color:rgba(99,102,241,.45);transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,.08);}
.pl-hist-img{width:100%;height:78px;object-fit:cover;display:block;background:var(--bg3);}
.pl-hist-img-ph{width:100%;height:78px;background:var(--bg3);display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:24px;}
.pl-hist-body2{padding:9px 11px;}
.pl-hist-meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;gap:6px;}
.pl-hist-time{font-size:10px;color:var(--text2);font-family:monospace;white-space:nowrap;}
.pl-hist-tags{display:flex;gap:3px;flex-wrap:wrap;}
.pl-hist-tag{font-size:9.5px;padding:1px 6px;border-radius:4px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);}
.pl-hist-preview{font-size:11.5px;color:var(--text);line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.pl-hist-del{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;background:rgba(15,15,25,.55);border:none;cursor:pointer;color:#fff;font-size:10px;display:grid;place-items:center;opacity:0;transition:opacity .15s;}
.pl-hist-wrap:hover .pl-hist-del{opacity:1;}
.pl-hist-del:hover{background:var(--red)!important;opacity:1!important;}

/* ── FAB ── */
#pl-fab{position:fixed;bottom:22px;right:22px;width:46px;height:46px;border-radius:23px;background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 4px 18px rgba(99,102,241,.42);border:none;cursor:pointer;color:#fff;font-size:18px;display:grid;place-items:center;z-index:2147483645;transition:transform .2s,box-shadow .2s;user-select:none;}
#pl-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(99,102,241,.55);}
#pl-fab:active{transform:scale(.94);}

/* ── animations ── */
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
`;

  /* ══════════════════════════════════════════════════════════════
   *  GLOBAL STATE
   * ══════════════════════════════════════════════════════════════ */
  let cfg            = loadConfig();
  let SR             = null;        // shadowRoot
  let panelEl        = null;
  let backdropEl     = null;
  let imgB64         = null;        // current captured image
  let results        = {};          // { key: {status, text, time, chars} }
  let activeTab      = null;
  let layoutMode     = 'tabs';      // synced from cfg.resultView at init
  let tagState       = {};          // { key: {sections:[{label,tags:[{text,deleted}]}]} }
  let isEditing      = false;
  let scFn           = null;        // shortcut listener ref
  let lastRect       = null;        // last screenshot rect for bubble positioning
  let floatUnsub     = null;        // cleanup fn for float drag [BUG-FIX-②]

  /* ══════════════════════════════════════════════════════════════
   *  SHADOW DOM INIT
   * ══════════════════════════════════════════════════════════════ */
  function initDOM() {
    // Idempotent: reuse if already mounted (e.g. SPA navigation re-trigger)
    const existing = document.getElementById('promptlens-host');
    if (existing && existing.shadowRoot) {
      SR = existing.shadowRoot;
      backdropEl = SR.getElementById('pl-backdrop');
      return;
    }
    const host = document.createElement('div');
    host.id = 'promptlens-host';
    document.documentElement.appendChild(host);
    SR = host.attachShadow({ mode:'open' });
    const st = document.createElement('style');
    st.textContent = CSS;
    SR.appendChild(st);
    backdropEl = document.createElement('div');
    backdropEl.id = 'pl-backdrop';
    backdropEl.addEventListener('click', hidePanel);
    SR.appendChild(backdropEl);
  }

  /* ══════════════════════════════════════════════════════════════
   *  BUILD PANEL
   * ══════════════════════════════════════════════════════════════ */
  function buildPanel() {
    panelEl = document.createElement('div');
    panelEl.id = 'pl-panel';
    setModeClass();

    panelEl.innerHTML = `
      <div class="pl-hdr" id="pl-hdr">
        <div class="pl-logo">🔍</div>
        <span class="pl-title">PromptLens</span>
        <div class="pl-hdr-r">
          <div class="pl-vsw">
            <button class="pl-vopt ${cfg.resultView==='tags' ?'on':''}" data-view="tags">🏷 标签</button>
            <button class="pl-vopt ${cfg.resultView==='text' ?'on':''}" data-view="text">📄 文本</button>
            <button class="pl-vopt ${cfg.resultView==='cards'?'on':''}" data-view="cards">⊞ 对比</button>
          </div>
          <button class="pl-ibtn" id="pl-btn-hist"  title="历史记录">🕐</button>
          <button class="pl-ibtn" id="pl-btn-set"   title="设置">⚙️</button>
          <button class="pl-ibtn" id="pl-btn-close" title="关闭">✕</button>
        </div>
      </div>

      <div class="pl-strip" id="pl-strip" style="display:none">
        <img class="pl-strip-thumb" id="pl-thumb" alt="">
        <div class="pl-strip-meta">
          <div class="pl-strip-lbl">已选图片</div>
          <div class="pl-strip-mdls" id="pl-mdls">—</div>
        </div>
        <div class="pl-strip-r">
          <button class="pl-paste-btn" id="pl-paste-strip" title="粘贴剪贴板图片重新分析">📋 粘贴</button>
          <button class="pl-reanalyze" id="pl-reanalyze">重新分析</button>
        </div>
      </div>

      <div class="pl-tabbar" id="pl-tabbar" style="display:none"></div>

      <div class="pl-results" id="pl-results">
        <div class="pl-empty">
          <div class="pl-empty-icon">🖼️</div>
          <div class="pl-empty-title">框选图片开始分析</div>
          <div class="pl-empty-sub">按 <kbd id="pl-sc-hint">${h(cfg.shortcut)}</kbd> 截图<br>或点击右下角 🔍 按钮</div>
          <div class="pl-empty-actions">
            <button class="pl-btn primary" id="pl-shot-btn">📷 开始截图</button>
            <button class="pl-btn"         id="pl-paste-btn">📋 粘贴图片</button>
          </div>
        </div>
      </div>

      <div class="pl-actions" id="pl-actions" style="display:none">
        <button class="pl-btn primary" id="pl-copy">📋 复制</button>
        <button class="pl-btn"         id="pl-edit">✏️ 编辑</button>
        <button class="pl-btn"         id="pl-export">↗ 导出</button>
        <button class="pl-btn pl-snap" id="pl-snap">📷 重新截图</button>
      </div>`;

    SR.appendChild(panelEl);

    // Drawer resize handle [NEW FEATURE]
    const rh = document.createElement('div');
    rh.id = 'pl-resize-handle';
    panelEl.appendChild(rh);
    bindResizeHandle(rh);

    // Wire events
    pq('#pl-btn-close').onclick = hidePanel;
    pq('#pl-btn-set').onclick   = openSettings;
    pq('#pl-btn-hist').onclick  = openHistory;
    pq('#pl-snap').onclick      = triggerShot;
    pq('#pl-shot-btn').onclick  = triggerShot;
    pq('#pl-reanalyze').onclick = () => imgB64 && runAnalysis();
    pq('#pl-copy').onclick      = copyResult;
    pq('#pl-edit').onclick      = toggleEdit;
    pq('#pl-export').onclick    = exportAll;
    pq('#pl-paste-btn').onclick     = handlePaste;
    pq('#pl-paste-strip').onclick   = handlePaste;

    pq('.pl-vsw').addEventListener('click', e => {
      const btn = e.target.closest('.pl-vopt');
      if (!btn) return;
      const v = btn.dataset.view;
      cfg.resultView = v;  // 'tags' | 'text' | 'cards'
      layoutMode     = v === 'cards' ? 'cards' : 'tabs';
      pqs('.pl-vopt').forEach(b => b.classList.toggle('on', b === btn));
      saveConfig(cfg); // persist view preference
      renderAll();
    });

    if (cfg.displayMode === 'float') bindFloatDrag();
  }

  // Drawer left-edge resize [NEW FEATURE]
  function bindResizeHandle(rh) {
    let resizing = false;
    rh.addEventListener('mousedown', e => {
      if (cfg.displayMode !== 'drawer') return;
      e.preventDefault(); resizing = true;
      rh.classList.add('dragging');
      const mv = ev => {
        if (!resizing) return;
        const w = Math.max(300, Math.min(700, window.innerWidth - ev.clientX));
        panelEl.style.width = w + 'px';
      };
      const up = () => {
        resizing = false; rh.classList.remove('dragging');
        cfg.drawerWidth = panelEl.offsetWidth;
        saveConfig(cfg);
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  }

  function setModeClass() {
    if (!panelEl) return;
    panelEl.classList.remove('mode-drawer','mode-modal','mode-bubble','mode-float');
    panelEl.classList.add('mode-' + cfg.displayMode);
    if (cfg.displayMode === 'drawer') panelEl.style.width = cfg.drawerWidth + 'px';
    const hdr = panelEl.querySelector('#pl-hdr');
    if (hdr) hdr.classList.toggle('pl-float-handle', cfg.displayMode === 'float');
  }

  // Float drag — fully teardown-able [BUG-FIX-②]
  function bindFloatDrag() {
    if (floatUnsub) { floatUnsub(); floatUnsub = null; } // remove old listeners
    const hdr = pq('#pl-hdr');
    if (!hdr) return;
    let dragging = false, ox, oy;
    const onDown = e => {
      if (e.target.closest('.pl-ibtn,.pl-vsw,.pl-logo')) return;
      dragging = true;
      const r = panelEl.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      e.preventDefault();
    };
    const onMove = e => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth  - panelEl.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - panelEl.offsetHeight));
      Object.assign(panelEl.style, { left:x+'px', top:y+'px', right:'auto', bottom:'auto' });
    };
    const onUp = () => {
      if (!dragging) return; dragging = false;
      const r = panelEl.getBoundingClientRect();
      cfg.floatPos = { left:Math.round(r.left), top:Math.round(r.top) };
      saveConfig(cfg);
    };
    hdr.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    floatUnsub = () => {  // cleanup fn [BUG-FIX-②]
      hdr.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }

  const pq  = s => panelEl.querySelector(s);
  const pqs = s => [...panelEl.querySelectorAll(s)];

  /* ══════════════════════════════════════════════════════════════
   *  SHOW / HIDE PANEL  — idempotent [BUG-FIX-⑥]
   * ══════════════════════════════════════════════════════════════ */
  function showPanel(shotRect) {
    if (!panelEl) buildPanel();
    setModeClass();
    const mode = cfg.displayMode;

    // Idempotent backdrop [BUG-FIX-⑥]
    if (mode === 'modal') {
      if (!backdropEl.classList.contains('open')) backdropEl.classList.add('open');
    } else {
      backdropEl.classList.remove('open');
    }

    if (mode === 'bubble' && shotRect) positionBubble(shotRect);
    if (mode === 'float')              positionFloat();

    if (!panelEl.classList.contains('open')) {
      requestAnimationFrame(() => panelEl.classList.add('open'));
    }
  }

  function hidePanel() {
    panelEl?.classList.remove('open');
    backdropEl?.classList.remove('open');
  }

  // Bubble: two-pass positioning after render [BUG-FIX-⑤]
  function positionBubble(rect) {
    const place = () => {
      const PW = panelEl.offsetWidth  || 400;
      const PH = panelEl.offsetHeight || 560;
      const M  = 12, vw = window.innerWidth, vh = window.innerHeight;
      let left = rect.x + rect.w + M, top = rect.y;
      if (left + PW > vw - M) left = rect.x - PW - M;
      if (left < M)           left = Math.max(M, (vw - PW) / 2);
      if (top + PH > vh - M)  top  = Math.max(M, vh - PH - M);
      Object.assign(panelEl.style, { left:left+'px', top:top+'px', right:'auto', bottom:'auto' });
    };
    place(); // first pass (dimensions might be 0 before open)
    requestAnimationFrame(() => requestAnimationFrame(place)); // second pass after render [BUG-FIX-⑤]
  }

  function positionFloat() {
    const pos = cfg.floatPos;
    if (pos) {
      const safeL = Math.max(0, Math.min(pos.left, window.innerWidth  - (panelEl.offsetWidth  || 420)));
      const safeT = Math.max(0, Math.min(pos.top,  window.innerHeight - (panelEl.offsetHeight || 600)));
      Object.assign(panelEl.style, { left:safeL+'px', top:safeT+'px', right:'auto', bottom:'auto' });
    } else {
      Object.assign(panelEl.style, { left:((window.innerWidth-420)/2)+'px', top:((window.innerHeight-600)/2)+'px', right:'auto', bottom:'auto' });
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  MAIN FLOW: SCREENSHOT / PASTE → CAPTURE → ANALYZE
   * ══════════════════════════════════════════════════════════════ */
  function triggerShot() {
    startScreenshot(async rect => {
      if (!rect) return;
      lastRect = rect;
      showPanel(rect);
      beginLoading();
      try {
        imgB64 = await captureRect(rect);
        pq('#pl-thumb').src = 'data:image/png;base64,' + imgB64;
        await runAnalysis();
      } catch (err) {
        showError(err.message);
      }
    });
  }

  // Clipboard paste flow [NEW FEATURE]
  async function handlePaste() {
    showPanel(null);
    beginLoading();
    try {
      imgB64 = await readClipboardImage();
      pq('#pl-thumb').src = 'data:image/png;base64,' + imgB64;
      await runAnalysis();
    } catch (err) {
      showError(err.message);
    }
  }

  function beginLoading() {
    pq('#pl-strip').style.display   = 'flex';
    pq('#pl-actions').style.display = 'none';
    pq('#pl-results').innerHTML     = skelHTML();
    // Disable reanalyze until done, and null imgB64 to prevent stale state [BUG-FIX-④]
    imgB64 = null;
    pq('#pl-reanalyze').disabled = true;
  }

  function showError(msg) {
    pq('#pl-results').innerHTML = '<div class="pl-result-error">❌ ' + h(msg) + '</div>';
    pq('#pl-reanalyze').disabled = false;
  }

  async function runAnalysis() {
    if (!imgB64) return;
    results = {}; tagState = {}; isEditing = false;
    currentProviders = null; // clear history override, use live providers

    const enabled = enabledProviders();
    if (!enabled.length) {
      pq('#pl-results').innerHTML = `<div class="pl-empty"><div class="pl-empty-icon">⚙️</div><div class="pl-empty-title">请先配置 AI 提供商</div><div class="pl-empty-sub">在设置中填写 API Key 并启用至少一个模型</div></div>`;
      openSettings(); return;
    }

    pq('#pl-mdls').textContent     = enabled.map(([,p]) => p.label).join(' · ');
    pq('#pl-actions').style.display = 'flex';
    pq('#pl-reanalyze').disabled    = true;
    activeTab = enabled[0][0];
    enabled.forEach(([k]) => { results[k] = { status:'loading', text:'', time:null, chars:0 }; });
    renderAll();

    const prompt = buildPrompt(cfg.outputLang);
    await Promise.allSettled(enabled.map(async ([k, p]) => {
      const t0 = performance.now();
      try {
        const text = await callProvider(k, p, imgB64, prompt);
        const elapsed = ((performance.now()-t0)/1000).toFixed(1) + 's';
        results[k] = { status:'done', text, time:elapsed, chars:text.length };
        tagState[k] = parseTagSections(text);
      } catch (e) {
        results[k] = { status:'error', text:e.message, time:null, chars:0 };
      }
      renderAll();
    }));

    pq('#pl-reanalyze').disabled = false;

    // Save history
    const done = enabled.filter(([k]) => results[k]?.status === 'done');
    if (done.length) {
      const thumb = await makeThumb(imgB64);
      await pushHist(thumb, enabled.map(([k,p]) => ({
        key:k, label:p.label,
        text:   results[k]?.text   || '',
        time:   results[k]?.time   || null,
        status: results[k]?.status || 'error',
      })));
    }
  }

  // Set to non-null during history restore to override live provider list
  let currentProviders = null;

  function enabledProviders() {
    if (currentProviders) return currentProviders;
    return Object.entries(cfg.providers).filter(([,p]) => p.enabled);
  }

  /* ══════════════════════════════════════════════════════════════
   *  TAG PARSING & RENDERING  [NEW FEATURE]
   * ══════════════════════════════════════════════════════════════ */
  function parseTagSections(text) {
    // Extract labelled sections like "**Prompt:** a, b, c"
    const sections = [];
    const lines = text.split('\n');
    let cur = null;

    for (const line of lines) {
      const m = line.match(/^\*{0,2}([^:*]+?)\*{0,2}[：:]\s*(.+)/);
      if (m) {
        if (cur) sections.push(cur);
        const rawTags = m[2].split(',').map(t => t.trim()).filter(Boolean);
        cur = { label: m[1].trim(), tags: rawTags.map(t => ({ text:t, deleted:false })) };
      } else if (cur && line.trim()) {
        // continuation line
        const extra = line.split(',').map(t => t.trim()).filter(Boolean);
        cur.tags.push(...extra.map(t => ({ text:t, deleted:false })));
      } else if (!cur && line.trim()) {
        // No header — treat as "Prompt"
        cur = { label:'Prompt', tags: line.split(',').map(t=>t.trim()).filter(Boolean).map(t=>({text:t,deleted:false})) };
      }
    }
    if (cur) sections.push(cur);
    return { sections };
  }

  function renderTagView(k) {
    const state = tagState[k];
    if (!state) return skelHTML();
    const r = results[k];

    const metaHTML = `<div class="pl-result-meta">
      ${r.time ? '<span>⏱ '+r.time+'</span>' : ''}
      <span>📝 ${r.chars} 字符</span>
    </div>`;

    const sectionsHTML = state.sections.map((sec, si) => {
      const tagsHTML = sec.tags.map((tag, ti) =>
        `<span class="pl-tag ${tag.deleted?'deleted':''}" data-si="${si}" data-ti="${ti}">
          ${h(tag.text)}
          <button class="pl-tag-del" data-si="${si}" data-ti="${ti}" title="${tag.deleted?'恢复':'删除'}">
            ${tag.deleted ? '↩' : '✕'}
          </button>
        </span>`
      ).join('');

      return `<div class="pl-tags-section">
        <div class="pl-tags-section-label">${h(sec.label)}</div>
        <div class="pl-tags-cloud" id="cloud-${si}">
          ${tagsHTML}
          <button class="pl-tag-add" data-si="${si}">＋ 添加</button>
        </div>
      </div>`;
    }).join('');

    const activeTags = state.sections.flatMap(s => s.tags.filter(t=>!t.deleted).map(t=>t.text));
    return metaHTML + `<div class="pl-tags-wrap" id="pl-tags-wrap-${k}">
      ${sectionsHTML}
      <div class="pl-tags-copy-row">
        <span class="pl-tags-copy-info">${activeTags.length} 个有效标签</span>
        <button class="pl-btn primary" id="pl-tags-copy-${k}">📋 复制提示词</button>
      </div>
    </div>`;
  }

  function bindTagEvents(k) {
    const wrap = SR.getElementById('pl-tags-wrap-' + k);
    if (!wrap) return;

    // Delete / restore tag
    wrap.querySelectorAll('.pl-tag-del').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const si = +btn.dataset.si, ti = +btn.dataset.ti;
        tagState[k].sections[si].tags[ti].deleted = !tagState[k].sections[si].tags[ti].deleted;
        // Re-render only the results area to preserve scroll
        const resEl = pq('#pl-results');
        resEl.innerHTML = renderResultContent(k);
        bindTagEvents(k);
      };
    });

    // Add tag
    wrap.querySelectorAll('.pl-tag-add').forEach(btn => {
      btn.onclick = () => {
        const si = +btn.dataset.si;
        // Replace button with inline input
        const inp = document.createElement('input');
        inp.className = 'pl-tag-input';
        inp.placeholder = '输入标签…';
        btn.replaceWith(inp);
        inp.focus();
        const commit = () => {
          const val = inp.value.trim();
          if (val) tagState[k].sections[si].tags.push({ text:val, deleted:false });
          const resEl = pq('#pl-results');
          resEl.innerHTML = renderResultContent(k);
          bindTagEvents(k);
        };
        inp.addEventListener('keydown', e => { if(e.key==='Enter') commit(); if(e.key==='Escape'){const resEl=pq('#pl-results');resEl.innerHTML=renderResultContent(k);bindTagEvents(k);} });
        inp.addEventListener('blur', commit);
      };
    });

    // Copy tags
    const copyBtn = SR.getElementById('pl-tags-copy-' + k);
    if (copyBtn) {
      copyBtn.onclick = () => {
        const text = tagState[k].sections
          .map(s => s.tags.filter(t=>!t.deleted).map(t=>t.text).join(', '))
          .filter(Boolean).join('\n');
        GM_setClipboard(text);
        copyBtn.textContent = '✅ 已复制';
        setTimeout(() => { copyBtn.textContent = '📋 复制提示词'; }, 2000);
      };
    }
  }

  function renderResultContent(k) {
    const r = results[k];
    if (!r || r.status === 'loading') return skelHTML();
    if (r.status === 'error') return '<div class="pl-result-error">❌ ' + h(r.text) + '</div>';

    // In cards layout, always use text view (tags per-card are too cramped)
    const useTagView = cfg.resultView === 'tags' && layoutMode !== 'cards';
    if (useTagView && tagState[k]?.sections?.length) return renderTagView(k);

    // Text view
    return `<div class="pl-result-meta">
      ${r.time ? '<span>⏱ '+r.time+'</span>' : ''}
      <span>📝 ${r.chars} 字符</span>
    </div>
    <div class="pl-result-body">${h(r.text)}</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
   *  RENDER ALL
   * ══════════════════════════════════════════════════════════════ */
  function renderAll() {
    if (!panelEl) return;
    const enabled = enabledProviders();
    if (!enabled.length) return;

    if (layoutMode === 'cards') renderCards(enabled);
    else                        renderTabs(enabled);
  }

  function renderTabs(enabled) {
    const tabbar = pq('#pl-tabbar');
    tabbar.style.display = 'flex';
    tabbar.innerHTML = enabled.map(([k,p]) => {
      const st = results[k]?.status || 'loading';
      return `<button class="pl-tab ${activeTab===k?'on':''}" data-key="${k}"><span class="pl-dot ${st}"></span>${h(p.label)}</button>`;
    }).join('');
    tabbar.querySelectorAll('.pl-tab').forEach(b => {
      b.onclick = () => { activeTab = b.dataset.key; renderAll(); };
    });
    pq('#pl-results').innerHTML = renderResultContent(activeTab);
    if (cfg.resultView === 'tags') bindTagEvents(activeTab);
  }

  function renderCards(enabled) {
    pq('#pl-tabbar').style.display = 'none';
    pq('#pl-results').innerHTML = '<div class="pl-cards">' + enabled.map(([k,p]) => {
      const r = results[k], st = r?.status || 'loading';
      return `<div class="pl-card">
        <div class="pl-card-head">
          <div class="pl-card-name"><span style="width:7px;height:7px;border-radius:50%;background:${stColor(st)};display:inline-block;flex-shrink:0"></span>${h(p.label)}</div>
          ${r?.time ? '<span class="pl-card-time">⏱ '+r.time+' · '+r.chars+' 字</span>' : ''}
        </div>
        <div class="pl-card-body">${renderResultContent(k)}</div>
      </div>`;
    }).join('') + '</div>';
  }

  function skelHTML() {
    return '<div class="pl-skel"><div class="pl-skel-line"></div><div class="pl-skel-line"></div><div class="pl-skel-line"></div><div class="pl-skel-line"></div><div class="pl-skel-line"></div></div>';
  }

  function stColor(s) { return s==='done'?'var(--green)':s==='error'?'var(--red)':'var(--amber)'; }

  /* ══════════════════════════════════════════════════════════════
   *  ACTIONS: COPY / EDIT / EXPORT
   * ══════════════════════════════════════════════════════════════ */
  function getActiveText() {
    if (layoutMode !== 'cards' && activeTab) {
      // Tag view: return only active (non-deleted) tags
      if (cfg.resultView === 'tags' && tagState[activeTab]) {
        return tagState[activeTab].sections
          .map(s => s.tags.filter(t=>!t.deleted).map(t=>t.text).join(', '))
          .filter(Boolean).join('\n');
      }
      return results[activeTab]?.text || '';
    }
    // Cards view: all done providers
    return enabledProviders()
      .filter(([k]) => results[k]?.status==='done')
      .map(([k,p]) => '=== '+(p.label || k)+' ===\n'+results[k].text)
      .join('\n\n');
  }

  function copyResult() {
    const t = getActiveText();
    if (!t) return;
    GM_setClipboard(t);
    const btn = pq('#pl-copy'), prev = btn.innerHTML;
    btn.innerHTML = '✅ 已复制'; btn.classList.add('ok');
    setTimeout(() => { btn.innerHTML = prev; btn.classList.remove('ok'); }, 2200);
  }

  function toggleEdit() {
    if (layoutMode !== 'tabs' || !activeTab || results[activeTab]?.status !== 'done') return;
    isEditing = !isEditing;
    const btn = pq('#pl-edit');
    if (isEditing) {
      btn.innerHTML = '💾 保存';
      pq('#pl-results').innerHTML = '<textarea class="pl-edit-area" id="pl-ta">' + h(results[activeTab].text) + '</textarea>';
    } else {
      const ta = SR.querySelector('#pl-ta');
      if (ta) {
        results[activeTab].text  = ta.value;
        results[activeTab].chars = ta.value.length;
        tagState[activeTab] = parseTagSections(ta.value);
      }
      btn.innerHTML = '✏️ 编辑';
      renderAll();
      if (cfg.resultView === 'tags') bindTagEvents(activeTab);
    }
  }

  function exportAll() {
    const done = enabledProviders().filter(([k]) => results[k]?.status==='done');
    if (!done.length) return;
    const body = done.map(([k,p]) => '=== '+(p.label||cfg.providers[k]?.label||k)+' ('+(results[k].time||'-')+') ===\n'+results[k].text).join('\n\n');
    const text = 'PromptLens 导出\n' + '─'.repeat(40) + '\n' + new Date().toLocaleString() + '\n' + location.href + '\n\n' + body;
    const uid = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})), download:'promptlens-'+uid+'.txt' });
    a.click(); URL.revokeObjectURL(a.href);
  }

  /* ══════════════════════════════════════════════════════════════
   *  HISTORY
   * ══════════════════════════════════════════════════════════════ */
  function openHistory() {
    const ex = SR.querySelector('#pl-history');
    if (ex) { ex.remove(); return; }

    const ov = document.createElement('div');
    ov.id = 'pl-history';
    ov.className = 'pl-ov';
    const hist = loadHist();

    let gridHTML;
    if (!hist.length) {
      gridHTML = '<div class="pl-hist-empty"><div class="pl-hist-empty-icon">📭</div><div class="pl-hist-empty-sub">暂无历史记录<br>截图或粘贴分析后自动保存</div></div>';
    } else {
      gridHTML = '<div class="pl-hist-grid">' + hist.map(item => {
        const d = new Date(item.ts);
        const ts = (d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getDate().toString().padStart(2,'0')+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
        const done = item.models.filter(m=>m.status==='done');
        const preview = done[0]?.text?.slice(0,100) || '（无结果）';
        const imgEl = item.thumb ? '<img class="pl-hist-img" src="'+a(item.thumb)+'" alt="" loading="lazy">' : '<div class="pl-hist-img-ph">🖼️</div>';
        return '<div class="pl-hist-wrap"><div class="pl-hist-card" data-id="'+a(item.id)+'">'+imgEl+'<div class="pl-hist-body2"><div class="pl-hist-meta"><span class="pl-hist-time">'+h(ts)+'</span><div class="pl-hist-tags">'+done.map(m=>'<span class="pl-hist-tag">'+h(m.label)+'</span>').join('')+'</div></div><div class="pl-hist-preview">'+h(preview)+'</div></div></div><button class="pl-hist-del" data-del="'+a(item.id)+'" title="删除">✕</button></div>';
      }).join('') + '</div>';
    }

    ov.innerHTML = '<div class="pl-ov-box" style="width:680px;height:76vh;"><div class="pl-hist-head"><span class="pl-hist-title">🕐 历史记录 <span class="pl-hist-cnt" id="pl-hcnt">('+hist.length+'/'+MAX_HIST+')</span></span><div class="pl-hist-acts">'+( hist.length?'<button class="pl-btn" id="pl-hclear">🗑 清空全部</button>':'')+'<button class="pl-ibtn" id="pl-hclose">✕</button></div></div><div class="pl-hist-body" id="pl-hbody">'+gridHTML+'</div></div>';

    SR.appendChild(ov);
    ov.querySelector('#pl-hclose').onclick = () => ov.remove();
    ov.querySelector('#pl-hclear')?.addEventListener('click', () => {
      if (confirm('确定清空全部 '+hist.length+' 条历史记录？')) { clearHist(); ov.remove(); }
    });
    ov.onclick = e => { if(e.target===ov) ov.remove(); };

    ov.querySelectorAll('.pl-hist-card[data-id]').forEach(card => {
      card.onclick = () => {
        const item = loadHist().find(i => i.id===card.dataset.id);
        if (!item) return;
        ov.remove();
        restoreFromHist(item);
      };
    });

    ov.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        deleteHist(btn.dataset.del);
        btn.closest('.pl-hist-wrap')?.remove();
        const nc = loadHist().length;
        const el = ov.querySelector('#pl-hcnt');
        if (el) el.textContent = '('+nc+'/'+MAX_HIST+')';
        if (nc===0) { const b=ov.querySelector('#pl-hbody'); if(b) b.innerHTML='<div class="pl-hist-empty"><div class="pl-hist-empty-icon">📭</div><div class="pl-hist-empty-sub">暂无历史记录</div></div>'; }
      };
    });
  }

  function restoreFromHist(item) {
    imgB64 = null;          // prevent stale image reanalysis [BUG-FIX-④]
    showPanel(null);
    pq('#pl-strip').style.display   = 'flex';
    pq('#pl-actions').style.display = 'flex';
    pq('#pl-reanalyze').disabled    = true; // disable reanalyze for history items [BUG-FIX-④]
    if (item.thumb) pq('#pl-thumb').src = item.thumb;

    const done = item.models.filter(m=>m.status==='done');
    pq('#pl-mdls').textContent = (done.map(m=>m.label).join(' · ')||'—') + '（历史）';

    results = {}; tagState = {};
    item.models.forEach(m => {
      results[m.key] = { status:m.status, text:m.text, time:m.time, chars:(m.text||'').length };
      if (m.status==='done') tagState[m.key] = parseTagSections(m.text);
    });
    activeTab = (done[0]||item.models[0])?.key;

    // Override provider list with history providers so renderAll works correctly
    currentProviders = item.models.map(m => [m.key, {label:m.label, enabled:true}]);
    renderAll();

    // Wire tab clicks (renderAll generates tabbar HTML but doesn't bind clicks for history)
    if (layoutMode !== 'cards') {
      pq('#pl-tabbar').querySelectorAll('.pl-tab').forEach(b => {
        b.onclick = () => {
          activeTab = b.dataset.key;
          pq('#pl-tabbar').querySelectorAll('.pl-tab').forEach(t=>t.classList.toggle('on',t===b));
          pq('#pl-results').innerHTML = renderResultContent(activeTab);
          if (cfg.resultView==='tags') bindTagEvents(activeTab);
        };
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════
   *  SETTINGS
   * ══════════════════════════════════════════════════════════════ */
  function openSettings() {
    const ex = SR.querySelector('#pl-settings');
    if (ex) { ex.remove(); return; }

    const ov = document.createElement('div');
    ov.id = 'pl-settings';
    ov.className = 'pl-ov';

    const provRows = Object.entries(cfg.providers).map(([k,p]) => {
      const cu = k==='custom' ? '<input class="pl-pkey pl-pmodel" type="text" placeholder="Base URL" data-pk="'+k+'" data-f="baseUrl" value="'+a(p.baseUrl)+'">' : '';
      return '<div class="pl-prow"><label class="pl-sw"><input type="checkbox" data-pk="'+k+'" data-f="enabled" '+(p.enabled?'checked':'')+' ><span class="pl-sw-tr"></span><span class="pl-sw-th"></span></label><span class="pl-pname">'+h(p.label)+'</span><input class="pl-pkey" type="password" placeholder="API Key" autocomplete="off" data-pk="'+k+'" data-f="key" value="'+a(p.key)+'"><input class="pl-pkey pl-pmodel" type="text" placeholder="模型名称" data-pk="'+k+'" data-f="model" value="'+a(p.model)+'">'+cu+'</div>';
    }).join('');

    const modes = [
      {key:'drawer',icon:'⬜',name:'右侧抽屉',  desc:'从右侧滑入，不遮挡页面，宽度可调'},
      {key:'modal', icon:'🪟',name:'居中弹窗',  desc:'居中模态弹窗，含遮罩背景'},
      {key:'bubble',icon:'💬',name:'截图旁浮层',desc:'自动定位在截图区域旁边'},
      {key:'float', icon:'🗂', name:'可拖动浮窗',desc:'自由拖动，记忆上次位置'},
    ];
    const dmGrid = modes.map(m=>'<div class="pl-dmode-card '+(cfg.displayMode===m.key?'on':'')+'" data-dmode="'+m.key+'"><div class="pl-dmode-icon">'+m.icon+'</div><div class="pl-dmode-name">'+m.name+'</div><div class="pl-dmode-desc">'+m.desc+'</div></div>').join('');

    const hc = loadHist().length;

    ov.innerHTML = `
      <div class="pl-ov-box" style="width:520px;height:min(88vh,860px);">
        <div class="pl-set-head">
          <span class="pl-set-title">⚙️ 设置</span>
          <button class="pl-ibtn" id="pl-sx">✕</button>
        </div>
        <div class="pl-set-scroll"><div class="pl-set-body">

          <div>
            <div class="pl-set-lbl">快捷键</div>
            <input class="pl-set-inp" id="pl-sc-inp" type="text" value="${h(cfg.shortcut)}" placeholder="Alt+Shift+S" readonly>
            <div class="pl-set-sub">点击后按组合键录制（需含修饰键 Ctrl/Alt/Shift）</div>
          </div>

          <div>
            <div class="pl-set-lbl">结果面板展示形式</div>
            <div class="pl-dmode-grid">${dmGrid}</div>
          </div>

          <div>
            <div class="pl-set-lbl">图片压缩</div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <label class="pl-sw">
                <input type="checkbox" id="pl-compress-sw" ${cfg.compress?'checked':''}>
                <span class="pl-sw-tr"></span><span class="pl-sw-th"></span>
              </label>
              <label for="pl-compress-sw" style="font-size:13px;color:var(--text);cursor:pointer;user-select:none;">发送前自动压缩大图</label>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;padding:12px;background:var(--bg3);border-radius:9px;border:1px solid var(--border);" id="pl-compress-opts">
              <div class="pl-compress-row">
                <span style="font-size:12px;color:var(--text2);min-width:72px;flex-shrink:0;">最长边</span>
                <input type="range" class="pl-range" id="pl-maxpx" min="512" max="2048" step="128" value="${cfg.compressMaxPx}">
                <span class="pl-range-val" id="pl-maxpx-val">${cfg.compressMaxPx}px</span>
              </div>
              <div class="pl-compress-row">
                <span style="font-size:12px;color:var(--text2);min-width:72px;flex-shrink:0;">压缩质量</span>
                <input type="range" class="pl-range" id="pl-compq" min="50" max="100" step="5" value="${Math.round(cfg.compressQ*100)}">
                <span class="pl-range-val" id="pl-compq-val">${Math.round(cfg.compressQ*100)}%</span>
              </div>
            </div>
            <div class="pl-set-sub" style="margin-top:7px;">大图（超过最长边限制）会在本地压缩后再发送，节省 Token 并加快响应。</div>
          </div>

          <div>
            <div class="pl-set-lbl">AI 提供商</div>
            <div style="font-size:11px;color:var(--text2);margin-bottom:10px;line-height:1.65">豆包填 <b>Endpoint ID</b>（ep-xxxx）· Gemini Key 来自 <b>Google AI Studio</b></div>
            ${provRows}
          </div>

          <div>
            <div class="pl-set-lbl">提示词输出语言</div>
            <div class="pl-pills">
              <button class="pl-pill ${cfg.outputLang==='en'  ?'on':''}" data-lang="en">English</button>
              <button class="pl-pill ${cfg.outputLang==='zh'  ?'on':''}" data-lang="zh">中文</button>
              <button class="pl-pill ${cfg.outputLang==='both'?'on':''}" data-lang="both">双语</button>
            </div>
          </div>

          <div>
            <div class="pl-set-lbl">界面主题</div>
            <div class="pl-pills">
              <button class="pl-pill ${cfg.theme==='auto' ?'on':''}" data-theme="auto">跟随系统</button>
              <button class="pl-pill ${cfg.theme==='light'?'on':''}" data-theme="light">亮色</button>
              <button class="pl-pill ${cfg.theme==='dark' ?'on':''}" data-theme="dark">暗色</button>
            </div>
          </div>

          <div>
            <div class="pl-set-lbl">历史记录</div>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:12.5px;color:var(--text2)">已存 <b style="color:var(--text)">${hc}</b> / ${MAX_HIST} 条</span>
              <button class="pl-btn" id="pl-shclear">🗑 清空历史</button>
            </div>
            <div class="pl-set-sub">仅存储在本地 GM 存储，不上传任何服务器。</div>
          </div>

        </div></div>
        <div class="pl-set-foot">
          <button class="pl-btn" id="pl-scancel">取消</button>
          <button class="pl-btn primary" id="pl-ssave">保存</button>
        </div>
      </div>`;

    SR.appendChild(ov);

    // Shortcut recorder — with basic debounce [BUG-FIX-⑧]
    const scInp = ov.querySelector('#pl-sc-inp');
    scInp.addEventListener('focus', () => { scInp.readOnly = false; });
    let scTimer;
    scInp.addEventListener('keydown', e => {
      e.preventDefault();
      clearTimeout(scTimer);
      scTimer = setTimeout(() => {
        const p=[];
        if(e.ctrlKey)p.push('Ctrl'); if(e.altKey)p.push('Alt');
        if(e.shiftKey)p.push('Shift'); if(e.metaKey)p.push('Meta');
        const k=e.key;
        if(!['Control','Alt','Shift','Meta'].includes(k)) p.push(k.length===1?k.toUpperCase():k);
        if(p.length>=2) scInp.value=p.join('+');
      }, 80); // 80ms debounce [BUG-FIX-⑧]
    });

    // Compress toggle — show/hide slider options
    const swCompress = ov.querySelector('#pl-compress-sw');
    const compOpts   = ov.querySelector('#pl-compress-opts');
    const updateCompressUI = () => {
      compOpts.style.opacity = swCompress.checked ? '1' : '.4';
      compOpts.style.pointerEvents = swCompress.checked ? 'auto' : 'none';
    };
    updateCompressUI();
    swCompress.addEventListener('change', updateCompressUI);

    // Range inputs live update
    const maxPxInp = ov.querySelector('#pl-maxpx');
    const maxPxVal = ov.querySelector('#pl-maxpx-val');
    maxPxInp.addEventListener('input', () => { maxPxVal.textContent = maxPxInp.value+'px'; });

    const compQInp = ov.querySelector('#pl-compq');
    const compQVal = ov.querySelector('#pl-compq-val');
    compQInp.addEventListener('input', () => { compQVal.textContent = compQInp.value+'%'; });

    // Display mode toggle
    ov.querySelectorAll('[data-dmode]').forEach(c => { c.onclick=()=>{ ov.querySelectorAll('[data-dmode]').forEach(x=>x.classList.remove('on')); c.classList.add('on'); }; });
    // Pills
    ov.querySelectorAll('[data-lang]').forEach(b=>{b.onclick=()=>{ov.querySelectorAll('[data-lang]').forEach(x=>x.classList.remove('on'));b.classList.add('on');};});
    ov.querySelectorAll('[data-theme]').forEach(b=>{b.onclick=()=>{ov.querySelectorAll('[data-theme]').forEach(x=>x.classList.remove('on'));b.classList.add('on');};});

    // Clear history
    ov.querySelector('#pl-shclear')?.addEventListener('click', () => {
      const n=loadHist().length;
      if(!n)return;
      if(confirm('确定清空全部 '+n+' 条历史记录？')){ clearHist(); ov.querySelector('#pl-shclear').textContent='✅ 已清空'; }
    });

    const close = () => ov.remove();
    ov.querySelector('#pl-sx').onclick      = close;
    ov.querySelector('#pl-scancel').onclick  = close;
    ov.onclick = e => { if(e.target===ov) close(); };

    ov.querySelector('#pl-ssave').onclick = () => {
      // Provider fields
      ov.querySelectorAll('[data-pk]').forEach(el => {
        const k=el.dataset.pk, f=el.dataset.f;
        if(!cfg.providers[k]) return;
        cfg.providers[k][f] = el.type==='checkbox' ? el.checked : el.value.trim();
      });
      cfg.shortcut      = ov.querySelector('#pl-sc-inp').value || cfg.shortcut;
      cfg.compress      = ov.querySelector('#pl-compress-sw').checked;
      cfg.compressMaxPx = +ov.querySelector('#pl-maxpx').value;
      cfg.compressQ     = ov.querySelector('#pl-compq').value / 100;

      const al=ov.querySelector('[data-lang].on');
      const at=ov.querySelector('[data-theme].on');
      const ad=ov.querySelector('[data-dmode].on');
      if(al) cfg.outputLang  = al.dataset.lang;
      if(at) cfg.theme       = at.dataset.theme;
      if(ad) {
        const newMode = ad.dataset.dmode;
        const changed = newMode !== cfg.displayMode;
        cfg.displayMode = newMode;
        if (changed) {
          if (floatUnsub) { floatUnsub(); floatUnsub=null; } // [BUG-FIX-②] teardown old float drag
          setModeClass();
          if (newMode==='float') bindFloatDrag();
          if (newMode!=='drawer') Object.assign(panelEl.style,{left:'',top:'',right:'',bottom:''});
          if (newMode==='modal'&&panelEl.classList.contains('open')) backdropEl.classList.add('open');
          else if (newMode!=='modal') backdropEl.classList.remove('open');
        }
      }
      saveConfig(cfg);
      registerShortcut();
      const hint=panelEl?.querySelector('#pl-sc-hint');
      if(hint) hint.textContent=cfg.shortcut;
      close();
    };
  }

  /* ══════════════════════════════════════════════════════════════
   *  FAB — drag with distance threshold [BUG-FIX-①]
   * ══════════════════════════════════════════════════════════════ */
  function buildFab() {
    // Guard: never create a second FAB
    if (SR.getElementById('pl-fab')) return;

    const fab = document.createElement('button');
    fab.id    = 'pl-fab';
    fab.title = 'PromptLens · ' + cfg.shortcut;
    fab.innerHTML = '🔍';
    SR.appendChild(fab);

    // Restore saved position
    if (cfg.fabPos) {
      const {left,top} = cfg.fabPos;
      Object.assign(fab.style, {
        left:   Math.max(0,Math.min(left,window.innerWidth-46))+'px',
        top:    Math.max(0,Math.min(top,window.innerHeight-46))+'px',
        right:  'auto', bottom:'auto',
      });
    }

    let startX, startY, movedPx=0;
    fab.addEventListener('mousedown', e => {
      if(e.button!==0) return;
      startX=e.clientX; startY=e.clientY; movedPx=0;
      const rect = fab.getBoundingClientRect();
      const ox=e.clientX-rect.left, oy=e.clientY-rect.top;

      const mv = ev => {
        movedPx = Math.max(Math.abs(ev.clientX-startX), Math.abs(ev.clientY-startY));
        if (movedPx < DRAG_THRESH) return; // [BUG-FIX-①] threshold
        const x = Math.max(0,Math.min(ev.clientX-ox, window.innerWidth-fab.offsetWidth));
        const y = Math.max(0,Math.min(ev.clientY-oy, window.innerHeight-fab.offsetHeight));
        Object.assign(fab.style, {left:x+'px',top:y+'px',right:'auto',bottom:'auto'});
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        if (movedPx >= DRAG_THRESH) {
          const r=fab.getBoundingClientRect();
          cfg.fabPos={left:Math.round(r.left),top:Math.round(r.top)};
          saveConfig(cfg);
        }
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });

    // Click = trigger only if not a drag [BUG-FIX-①]
    fab.addEventListener('click', () => { if(movedPx < DRAG_THRESH) triggerShot(); });

    // Right-click = open settings
    fab.addEventListener('contextmenu', e => { e.preventDefault(); openSettings(); });
  }

  /* ══════════════════════════════════════════════════════════════
   *  SHORTCUT
   * ══════════════════════════════════════════════════════════════ */
  function parseSC(str) {
    const p=str.toLowerCase().split('+').map(s=>s.trim());
    return { ctrl:p.includes('ctrl'), alt:p.includes('alt'), shift:p.includes('shift'), meta:p.includes('meta'), key:p.find(x=>!['ctrl','alt','shift','meta'].includes(x))||'' };
  }
  function registerShortcut() {
    if(scFn) document.removeEventListener('keydown', scFn);
    const sc=parseSC(cfg.shortcut);
    scFn = e => {
      if(!!e.ctrlKey!==sc.ctrl||!!e.altKey!==sc.alt||!!e.shiftKey!==sc.shift) return;
      if(e.key.toLowerCase()!==sc.key&&e.key.toUpperCase()!==sc.key.toUpperCase()) return;
      e.preventDefault(); triggerShot();
    };
    document.addEventListener('keydown', scFn);
  }

  /* ══════════════════════════════════════════════════════════════
   *  UTILS
   * ══════════════════════════════════════════════════════════════ */
  const h = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const a = s => String(s).replace(/"/g,'&quot;');

  /* ══════════════════════════════════════════════════════════════
   *  INIT
   * ══════════════════════════════════════════════════════════════ */
  function init() {
    cfg = loadConfig();
    // Restore layout mode from persisted resultView
    layoutMode = cfg.resultView === 'cards' ? 'cards' : 'tabs';
    initDOM();
    buildPanel();
    if(cfg.showFab) buildFab();
    registerShortcut();

    // Clipboard paste shortcut Ctrl+V on page [NEW FEATURE]
    document.addEventListener('keydown', e => {
      if((e.ctrlKey||e.metaKey) && e.key==='v' && !e.shiftKey && !e.altKey) {
        // Only intercept if panel is open and results area is focused/hovered
        // To avoid hijacking normal paste, only trigger if panel is open
        if(panelEl?.classList.contains('open')) {
          // Check active element isn't a text input
          const ae = SR.activeElement || document.activeElement;
          if(ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA')) return;
          e.preventDefault();
          handlePaste();
        }
      }
    });

    GM_registerMenuCommand('🔍 PromptLens · 截图分析',  triggerShot);
    GM_registerMenuCommand('📋 PromptLens · 粘贴图片',  handlePaste);
    GM_registerMenuCommand('🕐 PromptLens · 历史记录',  openHistory);
    GM_registerMenuCommand('⚙️ PromptLens · 设置',      openSettings);
  }

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();

})();
