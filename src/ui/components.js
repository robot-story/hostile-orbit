// Shared DOM widgets used by every menu screen: buttons, sliders, toggles, tab
// bars, hex icons, star ratings, key-bind rows, toast stack, subtitle bar,
// objective banner, interact prompt, tactical map overlay, confirm dialog.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/* ---------------------------------------------------------------- icons */

const ICON_PATHS = {
  rifle: 'M4 30 h34 v-6 h6 v-4 h4 v6 h6 v4 h-8 v4 h-4 v3 h-10 v-3 h-28 z M12 20 h20 v-4 h6 v4 h-26 z',
  pistol: 'M6 26 h24 v-8 h12 v6 h-6 v4 h6 v3 h-24 v9 h-6 v-14 z',
  shotgun: 'M2 27 h6 v-3 h38 v3 h6 v4 h-6 v3 h-6 v-3 h-26 v9 h-6 v-9 h-6 z',
  lmg: 'M2 24 h40 v-5 h6 v5 h4 v5 h-6 v4 h-4 v3 h-10 v-3 h-24 v4 h-6 v-4 h-4 z M40 12 v6 h-14 v-6 z',
  grenade: 'M22 4 h8 v4 h4 l3 4 h-4 v3 a12 12 0 1 1 -14 0 v-3 h-4 l3 -4 h4 z M20 15 a9 9 0 1 0 12 0',
  helmet: 'M24 4 c12 0 19 9 19 20 v6 h-6 v-6 c0-9-6-15-13-15 s-13 6-13 15 v6 h-6 v-6 c0-11 7-20 19-20 z M15 30 h6 v10 h-6 z M27 30 h6 v10 h-6 z',
  kinetic: 'M24 2 l4 14 h10 l-16 30 l4 -18 h-10 z',
  gunship: 'M4 24 h16 l6 -10 h6 l-4 10 h12 l6 6 h-10 l-4 6 h-6 l3 -6 h-15 l-6 8 h-6 l4 -8 h-6 z',
  sentry: 'M24 4 v8 M14 30 l10 -18 l10 18 z M10 44 h28 l-4 -10 h-20 z M16 44 v-4 h16 v4 z',
  supply: 'M8 6 h32 v10 h-32 z M12 18 h24 v22 h-24 z M20 24 h8 v8 h-8 z',
  check: 'M6 14 l6 6 l12 -14',
  chevronBig: 'M4 4 L20 22 L4 40 M18 4 L34 22 L18 40',
  target: 'M16 2 a14 14 0 1 0 0.1 0 z M16 8 a8 8 0 1 0 0.1 0 z M16 0 v6 M16 26 v6 M0 16 h6 M26 16 h6',
  skull: 'M16 2 a13 13 0 0 0 -13 13 v6 l4 5 v6 h4 v-4 h4 v4 h2 v-4 h4 v4 h4 v-6 l4 -5 v-6 a13 13 0 0 0 -13 -13 z M11 14 a2.4 2.4 0 1 0 .1 0 M21 14 a2.4 2.4 0 1 0 .1 0',
  clock: 'M16 2 a14 14 0 1 0 0.1 0 z M16 7 v10 l7 5',
  reinforce: 'M16 2 l14 8 v16 l-14 8 l-14 -8 v-16 z M16 10 v14 M9 14 l7 4 l7 -4',
  drop: 'M16 2 v22 M6 14 l10 10 l10 -10 M4 30 h24',
  intel: 'M8 2 h20 l8 8 v36 h-36 v-44 h8 z M28 2 v8 h8 M12 20 h16 M12 26 h16 M12 32 h10',
  req: 'M16 2 l14 8 v16 l-14 8 l-14 -8 v-16 z',
  xp: 'M16 2 l14 8 v16 l-14 8 l-14 -8 v-16 z M10 24 v-10 l6 7 l6 -7 v10',
  save: 'M4 4 h32 l8 8 v32 h-40 z M12 4 v12 h20 v-12 M10 26 h28 v18 h-28 z',
  deploy: 'M4 24 l14 -14 v8 h22 v12 h-22 v8 z',
};

export function icon(name, cls = '') {
  const d = ICON_PATHS[name] || ICON_PATHS.target;
  const vb = name === 'skull' || name === 'clock' || name === 'target' ? '0 0 32 32' : '0 0 48 48';
  return `<svg class="icon icon-${name} ${cls}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg>`;
}

export function hexIcon(name, cls = '') {
  return el('div', { class: `hex-icon ${cls}` }, [
    el('div', { class: 'hex-shape' }),
    el('div', { class: 'hex-glyph', html: icon(name) }),
  ]);
}

/* ---------------------------------------------------------------- buttons */

export function menuButton(api, { label, tag = '', disabled = false, onClick } = {}) {
  const btn = el('button', { class: 'menu-btn' + (disabled ? ' disabled' : ''), type: 'button' }, [
    el('span', { class: 'chev' }),
    el('span', { class: 'lbl', text: label }),
    tag ? el('span', { class: 'tag', text: tag }) : null,
  ]);
  if (!disabled) {
    btn.addEventListener('mouseenter', () => api.ui.hover());
    btn.addEventListener('click', () => { api.ui.click(); onClick && onClick(); });
  }
  return btn;
}

export function actionButton(api, { label, kind = '', icon: iconName = null, disabled = false, sound = 'click', onClick } = {}) {
  const btn = el('button', { class: `btn ${kind}` + (disabled ? ' disabled' : ''), type: 'button' }, [
    iconName ? el('span', { class: 'btn-icon', html: icon(iconName) }) : null,
    el('span', { text: label }),
  ]);
  if (!disabled) {
    btn.addEventListener('mouseenter', () => api.ui.hover());
    btn.addEventListener('click', () => {
      if (sound === 'deploy') api.ui.deploy();
      else if (sound === 'back') api.ui.back();
      else if (sound === 'confirm') api.ui.confirm();
      else api.ui.click();
      onClick && onClick();
    });
  }
  return btn;
}

/* ---------------------------------------------------------------- slider */

export function sliderRow(api, { label, value, min = 0, max = 1, step = 0.01, format, onChange, onSelect } = {}) {
  const fmt = format || ((v) => Math.round(v * 100) + '%');
  const valueEl = el('span', { class: 'row-value', text: fmt(value) });
  const input = el('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      valueEl.textContent = fmt(v);
      onChange && onChange(v);
    },
    onchange: () => api.ui.tab(),
  });
  const row = el('div', { class: 'settings-row', tabindex: '0' }, [
    el('div', { class: 'row-label', text: label }),
    el('div', { class: 'row-control slider-control' }, [input, valueEl]),
  ]);
  if (onSelect) row.addEventListener('focus', onSelect);
  if (onSelect) row.addEventListener('mouseenter', onSelect);
  return row;
}

export function toggleRow(api, { label, value, onChange, onSelect } = {}) {
  const offBtn = el('button', { class: 'pill-seg' + (!value ? ' active' : ''), type: 'button', text: 'OFF' });
  const onBtn = el('button', { class: 'pill-seg' + (value ? ' active' : ''), type: 'button', text: 'ON' });
  function set(v) { offBtn.classList.toggle('active', !v); onBtn.classList.toggle('active', v); onChange && onChange(v); }
  offBtn.addEventListener('click', () => { api.ui.click(); set(false); });
  onBtn.addEventListener('click', () => { api.ui.click(); set(true); });
  offBtn.addEventListener('mouseenter', () => api.ui.hover());
  onBtn.addEventListener('mouseenter', () => api.ui.hover());
  const sw = el('div', { class: 'pill-toggle' }, [offBtn, onBtn]);
  const row = el('div', { class: 'settings-row', tabindex: '0' }, [
    el('div', { class: 'row-label', text: label }),
    el('div', { class: 'row-control' }, [sw]),
  ]);
  if (onSelect) { row.addEventListener('focus', onSelect); row.addEventListener('mouseenter', onSelect); }
  return row;
}

export function selectRow(api, { label, value, options, onChange, onSelect } = {}) {
  let idx = Math.max(0, options.findIndex((o) => o.value === value));
  const valueEl = el('span', { class: 'choice-val', text: options[idx] ? options[idx].label : '' });
  const ticks = el('div', { class: 'choice-ticks' }, options.map((o, i) => el('span', { class: 'choice-tick' + (i === idx ? ' active' : '') })));
  function set(i) {
    idx = (i + options.length) % options.length;
    valueEl.textContent = options[idx].label;
    [...ticks.children].forEach((t, j) => t.classList.toggle('active', j === idx));
    onChange && onChange(options[idx].value);
  }
  const prev = el('button', { class: 'choice-arrow', type: 'button', html: '&#8249;' });
  const next = el('button', { class: 'choice-arrow', type: 'button', html: '&#8250;' });
  prev.addEventListener('mouseenter', () => api.ui.hover());
  next.addEventListener('mouseenter', () => api.ui.hover());
  prev.addEventListener('click', () => { api.ui.click(); set(idx - 1); });
  next.addEventListener('click', () => { api.ui.click(); set(idx + 1); });
  const wrap = el('div', { class: 'choice-control' }, [prev, el('div', { class: 'choice-mid' }, [valueEl, ticks]), next]);
  const row = el('div', { class: 'settings-row', tabindex: '0' }, [
    el('div', { class: 'row-label', text: label }),
    el('div', { class: 'row-control' }, [wrap]),
  ]);
  if (onSelect) { row.addEventListener('focus', onSelect); row.addEventListener('mouseenter', onSelect); }
  return row;
}

export function swatchRow(api, { label, value, options, onChange, onSelect } = {}) {
  const wrap = el('div', { class: 'swatch-select' });
  const render = () => {
    wrap.innerHTML = '';
    for (const opt of options) {
      const sw = el('button', { class: 'swatch' + (opt === value ? ' active' : ''), type: 'button', style: { background: opt } });
      sw.addEventListener('mouseenter', () => api.ui.hover());
      sw.addEventListener('click', () => { api.ui.click(); value = opt; render(); onChange && onChange(opt); });
      wrap.appendChild(sw);
    }
  };
  render();
  const row = el('div', { class: 'settings-row', tabindex: '0' }, [
    el('div', { class: 'row-label', text: label }),
    el('div', { class: 'row-control' }, [wrap]),
  ]);
  if (onSelect) { row.addEventListener('focus', onSelect); row.addEventListener('mouseenter', onSelect); }
  return row;
}

export function bindRow(api, { action, label, code, onRebind, onSelect } = {}) {
  const keyBtn = el('button', { class: 'keycap', type: 'button', text: api.keyLabel(code) });
  keyBtn.addEventListener('mouseenter', () => api.ui.hover());
  keyBtn.addEventListener('click', () => {
    api.ui.click();
    keyBtn.classList.add('capturing');
    keyBtn.textContent = 'PRESS A KEY…';
    api.input.rebindCapture = (newCode) => {
      keyBtn.classList.remove('capturing');
      if (newCode) { onRebind && onRebind(newCode); keyBtn.textContent = api.keyLabel(newCode); }
      else keyBtn.textContent = api.keyLabel(code);
    };
  });
  const row = el('div', { class: 'settings-row bind-row', tabindex: '0' }, [
    el('div', { class: 'row-label', text: label }),
    el('div', { class: 'row-control' }, [keyBtn]),
  ]);
  if (onSelect) { row.addEventListener('focus', onSelect); row.addEventListener('mouseenter', onSelect); }
  return { row, setCode: (c) => { keyBtn.textContent = api.keyLabel(c); } };
}

/* ---------------------------------------------------------------- tabs */

export function tabBar(api, tabs, active, onChange) {
  const wrap = el('div', { class: 'tab-bar vertical' });
  const render = () => {
    wrap.innerHTML = '';
    for (const t of tabs) {
      const b = el('button', { class: 'tab-btn' + (t.id === active ? ' active' : ''), type: 'button', text: t.label });
      b.addEventListener('mouseenter', () => api.ui.hover());
      b.addEventListener('click', () => { if (t.id === active) return; api.ui.tab(); active = t.id; render(); onChange && onChange(t.id); });
      wrap.appendChild(b);
    }
  };
  render();
  return { el: wrap, set: (id) => { active = id; render(); } };
}

/* ---------------------------------------------------------------- screen chrome (header / footer) */

export function tabStrip(api, tabs, activeId, onChange) {
  const wrap = el('div', { class: 'hd-tabs' });
  tabs.forEach((t, i) => {
    const b = el('button', { class: 'hd-tab' + (t.id === activeId ? ' active' : '') + (onChange ? '' : ' static'), type: 'button' }, [
      el('span', { class: 'hd-tab-label', text: t.label }),
      el('span', { class: 'hd-tab-num', text: String(i + 1).padStart(2, '0') }),
    ]);
    if (onChange) {
      b.addEventListener('mouseenter', () => api.ui.hover());
      b.addEventListener('click', () => { if (t.id === activeId) return; api.ui.tab(); onChange(t.id); });
    }
    wrap.appendChild(b);
  });
  return wrap;
}

export function screenHeader(api, { title, tabs, activeTab, onTab } = {}) {
  const profile = api.save.profile;
  const right = el('div', { class: 'hd-right' }, [
    el('div', { class: 'hd-res' }, [el('span', { class: 'hd-res-icon', html: icon('xp') }), el('span', { class: 'hd-res-val', text: profile.xp })]),
    el('div', { class: 'hd-res' }, [el('span', { class: 'hd-res-icon', html: icon('req') }), el('span', { class: 'hd-res-val', text: profile.requisition })]),
    el('div', { class: 'hd-res' }, [el('span', { class: 'hd-res-icon', html: icon('intel') }), el('span', { class: 'hd-res-val', text: profile.intel })]),
    el('div', { class: 'hd-level', text: `LEVEL ${profile.level}` }),
  ]);
  return el('div', { class: 'scr-header' }, [
    el('div', { class: 'hd-title' }, [el('span', { class: 'hd-emblem', html: icon('chevronBig') }), el('span', { class: 'hd-title-text', text: title })]),
    tabs && tabs.length ? tabStrip(api, tabs, activeTab, onTab) : el('div', { class: 'hd-tabs-spacer' }),
    right,
  ]);
}

export function screenFooter(hints = []) {
  return el('div', { class: 'scr-footer' }, hints.map((h) => el('div', { class: 'ft-hint' }, [el('span', { class: 'keycap small', text: h.key }), el('span', { class: 'ft-label', text: h.label })])));
}

/* ---------------------------------------------------------------- stars */

export function starRating(container, count, api) {
  container.innerHTML = '';
  const stars = [];
  for (let i = 0; i < 5; i++) {
    const s = el('span', { class: 'star' });
    stars.push(s);
    container.appendChild(s);
  }
  let i = 0;
  const tick = () => {
    if (i >= count) return;
    stars[i].classList.add('lit');
    api?.ui?.tab && api.ui.tab();
    i++;
    setTimeout(tick, 260);
  };
  setTimeout(tick, 400);
}

/* ---------------------------------------------------------------- toast */

export class ToastStack {
  constructor(root) {
    this.el = el('div', { class: 'toast-stack' });
    root.appendChild(this.el);
  }
  push(text, kind = 'info') {
    const t = el('div', { class: `toast ${kind}` }, [
      el('div', { class: 'toast-bar' }),
      el('div', { class: 'toast-text', text }),
    ]);
    this.el.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 4200);
  }
}

/* ---------------------------------------------------------------- subtitle bar */

const SPEAKER_COLORS = { VOSS: '#00e5ff', SHIP: '#ffb020', VANGUARD: '#ffffff', LEGION: '#ff5a1f' };

export class SubtitleBar {
  constructor(root, settings) {
    this.settings = settings;
    this.el = el('div', { class: 'subtitle-bar' }, [
      el('div', { class: 'sub-speaker' }),
      el('div', { class: 'sub-text' }),
    ]);
    root.appendChild(this.el);
    this._timer = null; this._type = null;
  }
  show({ speaker = 'SHIP', text = '', duration = 3.5 }) {
    if (!this.settings.data.subtitles) return;
    clearTimeout(this._timer); clearInterval(this._type);
    this.el.className = `subtitle-bar size-${this.settings.data.subtitleSize} visible`;
    const spk = this.el.querySelector('.sub-speaker');
    spk.textContent = speaker;
    spk.style.color = SPEAKER_COLORS[speaker] || SPEAKER_COLORS.SHIP;
    const txt = this.el.querySelector('.sub-text');
    txt.textContent = '';
    let i = 0;
    this._type = setInterval(() => {
      i++; txt.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(this._type);
    }, 16);
    this._timer = setTimeout(() => this.hide(), duration * 1000);
  }
  hide() { this.el.classList.remove('visible'); clearTimeout(this._timer); clearInterval(this._type); }
}

/* ---------------------------------------------------------------- objective banner */

export class ObjectiveBanner {
  constructor(root) {
    this.el = el('div', { class: 'objective-banner' }, [
      el('div', { class: 'ob-title' }),
      el('div', { class: 'ob-sub' }),
    ]);
    root.appendChild(this.el);
    this._timer = null;
  }
  show({ title = 'NEW OBJECTIVE', sub = '' }) {
    clearTimeout(this._timer);
    this.el.querySelector('.ob-title').textContent = title;
    this.el.querySelector('.ob-sub').textContent = sub;
    this.el.classList.remove('visible'); void this.el.offsetWidth;
    this.el.classList.add('visible');
    this._timer = setTimeout(() => this.el.classList.remove('visible'), 3500);
  }
}

/* ---------------------------------------------------------------- interact prompt */

export class InteractPrompt {
  constructor(root) {
    this.el = el('div', { class: 'interact-prompt' }, [
      el('div', { class: 'ip-ring' }, [el('svg', { viewBox: '0 0 36 36' }, [])]),
      el('div', { class: 'ip-text' }),
    ]);
    this.el.querySelector('.ip-ring svg').innerHTML = '<circle cx="18" cy="18" r="15" class="ip-track"/><circle cx="18" cy="18" r="15" class="ip-fill"/>';
    root.appendChild(this.el);
  }
  show(text, progress = null) {
    this.el.classList.add('visible');
    this.el.querySelector('.ip-text').textContent = text;
    const fill = this.el.querySelector('.ip-fill');
    if (progress == null) { this.el.classList.remove('progressing'); }
    else {
      this.el.classList.add('progressing');
      const c = 2 * Math.PI * 15;
      fill.style.strokeDasharray = `${c}`;
      fill.style.strokeDashoffset = `${c * (1 - progress)}`;
    }
  }
  hide() { this.el.classList.remove('visible'); }
}

/* ---------------------------------------------------------------- tactical map overlay */

export class TacticalMapOverlay {
  constructor(root, mapUrl) {
    this.el = el('div', { class: 'tac-map' }, [
      el('div', { class: 'tac-map-inner' }, [
        el('img', { class: 'tac-map-img', src: mapUrl, onerror: `this.onerror=null;this.src='${(import.meta.env.BASE_URL || '/')}textures/blacksite-meridian-map.png'` }),
        el('div', { class: 'tac-player' }),
        el('div', { class: 'tac-objective' }),
        el('div', { class: 'tac-teammates' }),
      ]),
    ]);
    root.appendChild(this.el);
  }
  show(playerXY, objectiveXY, teammates = []) {
    this.el.classList.add('visible');
    this.update(playerXY, objectiveXY, teammates);
  }
  update(playerXY, objectiveXY, teammates = []) {
    const toPct = ([mx, my]) => [(mx / 400) * 100, (1 - my / 400) * 100];
    if (playerXY) { const [x, y] = toPct(playerXY); const p = this.el.querySelector('.tac-player'); p.style.left = x + '%'; p.style.top = y + '%'; }
    if (objectiveXY) { const [x, y] = toPct(objectiveXY); const o = this.el.querySelector('.tac-objective'); o.style.left = x + '%'; o.style.top = y + '%'; }
    const tw = this.el.querySelector('.tac-teammates');
    tw.innerHTML = '';
    teammates.forEach((t, i) => {
      const [x, y] = toPct(t.xy);
      const d = el('div', { class: 'tac-mate', style: { left: x + '%', top: y + '%', background: t.color || '#fff' } });
      tw.appendChild(d);
    });
  }
  hide() { this.el.classList.remove('visible'); }
}

/* ---------------------------------------------------------------- confirm dialog */

export class ConfirmDialog {
  constructor(root, api) {
    this.api = api;
    this.el = el('div', { class: 'confirm-overlay' });
    root.appendChild(this.el);
  }
  show({ title = 'CONFIRM', text = '', okLabel = 'CONFIRM', cancelLabel = 'CANCEL', danger = false, onConfirm, onCancel } = {}) {
    this.el.innerHTML = '';
    const box = el('div', { class: 'confirm-box panel' }, [
      el('div', { class: 'confirm-title', text: title }),
      el('div', { class: 'confirm-text', text }),
      el('div', { class: 'confirm-actions' }),
    ]);
    this.el.appendChild(box);
    const actions = box.querySelector('.confirm-actions');
    const close = () => { this.el.classList.remove('visible'); };
    actions.appendChild(actionButton(this.api, { label: cancelLabel, sound: 'back', onClick: () => { close(); onCancel && onCancel(); } }));
    actions.appendChild(actionButton(this.api, { label: okLabel, kind: danger ? 'danger' : 'primary', sound: 'confirm', onClick: () => { close(); onConfirm && onConfirm(); } }));
    this.el.classList.add('visible');
  }
}
