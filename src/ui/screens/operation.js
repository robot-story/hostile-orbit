import { el, icon, actionButton, screenHeader } from '../components.js';

const MARKERS = [
  { x: 70, y: 320, label: 'JAMMER OUTPOST', kind: 'primary', tag: 'PRIMARY OBJECTIVE', desc: 'Plant charges on the Null Legion jammer. Orbital support stays blocked until it falls.' },
  { x: 200, y: 335, label: 'COMMUNICATIONS BASE', kind: 'primary', tag: 'PRIMARY OBJECTIVE', desc: 'Breach the comms base and download the invasion data from the core terminal.' },
  { x: 292, y: 355, label: 'DETENTION', kind: 'secondary', tag: 'SECONDARY OBJECTIVE', desc: 'Two captured operatives are held here. Free them for bonus requisition and a friendly gun.' },
  { x: 330, y: 250, label: 'EXTRACTION', kind: 'primary', tag: 'EXTRACTION', desc: 'Call the dropship and hold the pad for 90 seconds. The Warden will contest it.' },
  { x: 200, y: 190, label: 'SIDE OP: PROPAGANDA', kind: 'side', tag: 'SIDE OPERATION', desc: 'Silence the Legion propaganda broadcasters scattered through the canyon.' },
  { x: 108, y: 205, label: 'SIDE OP: SUPPLY CACHES', kind: 'side', tag: 'SIDE OPERATION', desc: 'Recover lost Commonwealth supply caches for intel and requisition.' },
  { x: 200, y: 130, label: 'SIDE OP: RECON DRONES', kind: 'side', tag: 'SIDE OPERATION', desc: 'Shoot down recon drones before they mark the squad for reinforcements.' },
];
const ENEMY_MARKERS = [
  { x: 30, y: 210 }, { x: 105, y: 375 }, { x: 350, y: 375 }, { x: 340, y: 130 }, { x: 220, y: 90 },
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function holo(tag, title, desc) {
  return el('div', { class: 'holo' }, [
    el('div', { class: 'h-kind', text: tag }),
    el('div', { class: 'h-title', text: title }),
    desc ? el('div', { class: 'h-desc', text: desc }) : null,
  ]);
}

export function createOperationScreen(api, mgr) {
  const root = el('div', { class: 'screen op-screen' });
  const mapUrl = (import.meta.env.BASE_URL || '/') + 'textures/menus/map_clean.jpg';
  const mapFallback = (import.meta.env.BASE_URL || '/') + 'textures/blacksite-meridian-map.png';

  let difficulty = api.save.profile.loadout.difficulty || 'veteran';
  let dropZone = api.save.profile.loadout.dropZone || 'main';
  let pickingZone = false;

  function isHost() {
    const st = api.mp.state();
    return !st.connected || st.isHost;
  }
  function inLobby() { return api.mp.state().connected; }

  function setDifficulty(id) {
    if (!isHost()) return;
    difficulty = id;
    api.save.setLoadout({ difficulty: id });
    if (inLobby()) api.mp.setSettings({ difficulty, dropZone });
    render();
  }
  function setDropZone(id) {
    if (!isHost()) return;
    dropZone = id;
    api.save.setLoadout({ dropZone: id });
    if (inLobby()) api.mp.setSettings({ difficulty, dropZone });
    pickingZone = false;
    render();
  }

  function buildHeader() {
    return screenHeader(api, {
      title: 'ORBITAL COMMAND',
      tabs: [{ id: 'summary', label: 'SUMMARY' }, { id: 'briefing', label: 'BRIEFING' }, { id: 'deploy', label: 'DEPLOY' }],
      activeTab: 'deploy',
    });
  }

  function buildMarker(m) {
    const x = (m.x / 400) * 100, y = (1 - m.y / 400) * 100;
    const node = el('div', { class: `marker ${m.kind}`, style: { left: x + '%', top: y + '%' } }, [
      el('div', { class: 'diamond' }),
      el('div', { class: 'mk-label', text: m.label }),
      holo(m.tag, m.label.replace(/^SIDE OP: /, ''), m.desc),
    ]);
    node.addEventListener('mouseenter', () => api.ui.hover());
    return node;
  }

  function buildEnemyMarker(m) {
    const x = (m.x / 400) * 100, y = (1 - m.y / 400) * 100;
    return el('div', { class: 'marker enemy', style: { left: x + '%', top: y + '%' } }, [el('div', { class: 'diamond' }), holo('HOSTILE ACTIVITY', 'LEGION PATROL', 'Recon reports Null Legion movement in this sector.')]);
  }

  function buildDzMarker(zone) {
    const x = (zone.mapX / 400) * 100, y = (1 - zone.mapY / 400) * 100;
    const selected = zone.id === dropZone;
    const canPick = pickingZone && isHost();
    const node = el('div', {
      class: `marker dz ${canPick ? 'selectable' : ''} ${selected ? 'selected' : ''}`,
      style: { left: x + '%', top: y + '%' },
    }, [
      el('div', { class: 'diamond' }),
      selected ? el('div', { class: 'reticle' }) : null,
      el('div', { class: 'mk-label', text: zone.name.split('//')[0].trim() }),
      holo(selected ? 'SELECTED DROP ZONE' : 'DROP ZONE', zone.name.split('//')[0].trim(), zone.desc || zone.description || (canPick ? 'Click to select this insertion point.' : 'Insertion point. Use the drop zone button to change it.')),
    ]);
    if (canPick) {
      node.addEventListener('mouseenter', () => api.ui.hover());
      node.addEventListener('click', () => { api.ui.click(); setDropZone(zone.id); });
    }
    return node;
  }

  function buildWarTable() {
    const inner = el('div', { class: 'war-table' }, [
      el('img', { class: 'map-img', src: mapUrl, alt: 'Tactical map', onerror: `this.onerror=null;this.src='${mapFallback}'` }),
      el('div', { class: 'map-grid' }),
      el('div', { class: 'map-tint' }),
      el('div', { class: 'scanlines' }),
      el('div', { class: 'compass', text: 'N ▲' }),
    ]);
    MARKERS.forEach((m) => inner.appendChild(buildMarker(m)));
    ENEMY_MARKERS.forEach((m) => inner.appendChild(buildEnemyMarker(m)));
    Object.values(api.DROP_ZONES).forEach((z) => inner.appendChild(buildDzMarker(z)));
    const wrap = el('div', { class: 'war-table-wrap' }, [inner]);
    // pan (drag) + zoom (wheel); markers counter-scale via --inv so they stay legible
    let scale = 1, tx = 0, ty = 0, drag = null, moved = false;
    const apply = () => { inner.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; inner.style.setProperty('--inv', String(1 / scale)); };
    const clampPan = () => { const r = wrap.getBoundingClientRect(); const w = inner.offsetWidth * scale, h = inner.offsetHeight * scale; const mx = Math.max(0, (w - r.width) / 2 + 60), my = Math.max(0, (h - r.height) / 2 + 60); tx = clamp(tx, -mx, mx); ty = clamp(ty, -my, my); };
    wrap.addEventListener('wheel', (e) => { e.preventDefault(); const r = wrap.getBoundingClientRect(); const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2; const ns = clamp(scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 1, 3.2); const k = ns / scale; tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; scale = ns; clampPan(); apply(); }, { passive: false });
    wrap.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, tx, ty }; moved = false; wrap.setPointerCapture(e.pointerId); wrap.classList.add('grabbing'); });
    wrap.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (!moved) return; tx = drag.tx + dx; ty = drag.ty + dy; clampPan(); apply(); });
    const end = () => { drag = null; wrap.classList.remove('grabbing'); };
    wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    wrap.addEventListener('dblclick', () => { scale = 1; tx = 0; ty = 0; apply(); });
    return wrap;
  }

  function buildBriefing() {
    const rewards = [
      { name: 'xp', label: 'EXPERIENCE' },
      { name: 'req', label: 'REQUISITION' },
      { name: 'intel', label: 'INTEL' },
    ];
    return el('div', { class: 'briefing-panel panel' }, [
      el('div', { class: 'bp-kicker' }, [el('span', { html: icon('chevronBig') }), el('span', { text: 'OPERATION BRIEFING' })]),
      el('h2', { text: 'OPERATION: SILENT MERIDIAN' }),
      el('div', { class: 'bp-loc', text: 'LOCATION: KHEPRI-9' }),
      el('div', { class: 'bp-preview' }),
      el('div', { class: 'bp-objective' }, [
        el('span', { html: icon('target') }),
        el('div', {}, [el('div', { class: 'bp-o-label', text: 'PRIMARY OBJECTIVE' }), el('div', { class: 'bp-o-text', text: 'Destroy the Null Legion jammer' })]),
      ]),
      el('div', { class: 'bp-objective secondary' }, [
        el('span', { html: '&#9733;' }),
        el('div', {}, [el('div', { class: 'bp-o-label', text: 'SECONDARY OBJECTIVE' }), el('div', { class: 'bp-o-text', text: 'Rescue captured operatives' })]),
      ]),
      el('div', { class: 'bp-intel' }, [
        el('span', { html: icon('intel') }),
        el('span', { text: 'Heavy resistance. Orbital support blocked until jammer destruction.' }),
      ]),
      el('div', { class: 'bp-rewards' }, [
        el('div', { class: 'bp-r-title', text: 'MISSION REWARDS' }),
        el('div', { class: 'bp-r-row' }, rewards.map((r) => el('div', { class: 'bp-r-item' }, [
          (() => { const d = el('div', { class: 'hex-icon' }, [el('div', { class: 'hex-shape' }), el('div', { class: 'hex-glyph', html: icon(r.name) })]); return d; })(),
          el('span', { text: r.label }),
        ]))),
      ]),
    ]);
  }

  function buildBottomBar() {
    const host = isHost();
    const diffGroup = el('div', { class: 'ob-group' }, [
      el('div', { class: 'ob-label' }, [el('span', { html: icon('drop') }), el('span', { text: 'SELECT DIFFICULTY' })]),
      ...Object.values(api.DIFFICULTIES).map((d) => {
        const chip = el('button', { class: `chip ${d.id === 'hostile' ? 'hostile' : ''} ${d.id === difficulty ? 'active' : ''} ${!host ? 'readonly' : ''}`, type: 'button' }, [
          el('span', { text: d.name }),
          el('div', { class: 'chip-tip', text: `${d.description} · ${d.lives} lives` }),
        ]);
        if (host) { chip.addEventListener('mouseenter', () => api.ui.hover()); chip.addEventListener('click', () => setDifficulty(d.id)); }
        return chip;
      }),
    ]);
    const zoneBtn = el('button', { class: `chip ${pickingZone ? 'active' : ''} ${!host ? 'readonly' : ''}`, type: 'button' }, [
      el('span', { html: icon('drop') }),
      el('span', { text: api.DROP_ZONES[dropZone] ? api.DROP_ZONES[dropZone].name : 'SELECT DROP ZONE' }),
    ]);
    if (host) {
      zoneBtn.addEventListener('mouseenter', () => api.ui.hover());
      zoneBtn.addEventListener('click', () => { api.ui.click(); pickingZone = !pickingZone; render(); });
    }
    const bar = el('div', { class: 'op-bottombar' }, [
      diffGroup,
      el('div', { class: 'ob-group' }, [zoneBtn]),
      el('div', { class: 'spacer' }),
      actionButton(api, {
        label: host ? 'BEGIN DEPLOYMENT' : 'WAITING FOR HOST',
        kind: 'primary begin-btn',
        icon: 'deploy',
        disabled: !host,
        sound: 'deploy',
        onClick: () => mgr.show('loadout'),
      }),
    ]);
    return bar;
  }

  function render() {
    root.innerHTML = '';
    root.appendChild(buildHeader());
    root.appendChild(buildWarTable());
    root.appendChild(buildBriefing());
    root.appendChild(buildBottomBar());
  }

  return {
    el: root,
    onShow() {
      difficulty = api.save.profile.loadout.difficulty || 'veteran';
      dropZone = api.save.profile.loadout.dropZone || 'main';
      pickingZone = false;
      render();
    },
    onHide() {},
  };
}
