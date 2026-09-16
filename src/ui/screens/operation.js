import { el, icon, actionButton, screenHeader } from '../components.js';
import { rewardPreview } from '../../gameplay/rewards.js';

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
  const mapFallback = (import.meta.env.BASE_URL || '/') + 'textures/blacksite-meridian-map.png';

  let difficulty = api.save.profile.loadout.difficulty || 'veteran';
  let dropZone = api.save.profile.loadout.dropZone || 'main';
  let mapId = api.save.profile.loadout.map || api.DEFAULT_MAP;
  const MAP_IDS = Object.keys(api.MAPS);
  function currentMap() { const st = api.mp.state(); if (st.connected && st.settings?.map && api.MAPS[st.settings.map]) mapId = st.settings.map; return api.MAPS[mapId] || api.MAPS[api.DEFAULT_MAP]; }
  function setMap(id) {
    if (!isHost() || !api.MAPS[id]) return;
    mapId = id; dropZone = 'main';
    api.save.setLoadout({ map: id, dropZone });
    if (inLobby()) api.mp.setSettings({ map: id, dropZone });
    render();
  }

  function isHost() {
    const st = api.mp.state();
    return !st.connected || st.isHost;
  }
  function inLobby() { return api.mp.state().connected; }

  function setDifficulty(id) {
    if (!isHost()) return;
    difficulty = id;
    api.save.setLoadout({ difficulty: id });
    if (inLobby()) api.mp.setSettings({ difficulty, dropZone, map: mapId });
    render();
  }
  function buildHeader() {
    return screenHeader(api, {
      title: 'ORBITAL COMMAND',
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

  function buildWarTable() {
    const map = currentMap();
    const inner = el('div', { class: 'war-table' }, [
      el('img', { class: 'map-img', src: (import.meta.env.BASE_URL || '/') + map.mapImage, alt: 'Tactical map', onerror: `this.onerror=null;this.src='${mapFallback}'` }),
      el('div', { class: 'map-grid' }),
      el('div', { class: 'map-tint' }),
      el('div', { class: 'scanlines' }),
      el('div', { class: 'compass', text: 'N ▲' }),
    ]);
    (map.markers || []).forEach((m) => inner.appendChild(buildMarker(m)));
    (map.enemyMarkers || []).forEach((m) => inner.appendChild(buildEnemyMarker(m)));
    inner.appendChild(buildMarker({ x: (map.dropZones || api.DROP_ZONES).main.mapX, y: (map.dropZones || api.DROP_ZONES).main.mapY, kind: 'dz', label: 'INSERTION', tag: 'MISSION START', desc: 'Designated insertion point.' }));
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
    const map = currentMap(); const host = isHost();
    const payout = rewardPreview(map.id, api.DIFFICULTIES[difficulty], api.save.profile.unlockedWeapons);
    const rewards = [{ name: 'xp', label: `${payout.xp.toLocaleString()} XP` }, { name: 'req', label: `${payout.requisition.toLocaleString()} REQUISITION` }];
    const selector = el('div', { class: 'op-select' }, MAP_IDS.map((id) => {
      const m = api.MAPS[id];
      const b = el('button', { class: `op-card ${id === map.id ? 'active' : ''} ${!host ? 'readonly' : ''}`, type: 'button' }, [
        el('div', { class: 'oc-thumb', style: { backgroundImage: `url(${(import.meta.env.BASE_URL || '/') + m.mapImage})` } }),
        el('div', { class: 'oc-body' }, [el('div', { class: 'oc-name', text: m.name }), el('div', { class: 'oc-tag', text: m.tagline || '' })]),
      ]);
      if (host && id !== map.id) { b.addEventListener('mouseenter', () => api.ui.hover()); b.addEventListener('click', () => { api.ui.click(); setMap(id); }); }
      return b;
    }));
    return el('div', { class: 'briefing-panel panel' }, [
      el('div', { class: 'bp-kicker' }, [el('span', { html: icon('chevronBig') }), el('span', { text: 'SELECT OPERATION' })]),
      selector,
      el('div', { class: 'bp-kicker', style: { marginTop: '20px' }, text: 'MISSION PLAN' }),
      el('div', { class: 'bp-loc', text: map.location }),
      el('div', { class: 'bp-objective' }, [
        el('span', { html: icon('target') }),
        el('div', {}, [el('div', { class: 'bp-o-label', text: '01 / DISABLE DEFENCES' }), el('div', { class: 'bp-o-text', text: map.briefing.primary })]),
      ]),
      el('div', { class: 'bp-objective' }, [el('span', { html: icon('intel') }), el('div', {}, [el('div', { class: 'bp-o-label', text: map.id === 'lantern' ? '02 / BROADCAST' : '02 / RECOVER INTEL' }), el('div', { class: 'bp-o-text', text: map.id === 'lantern' ? 'Upload the counter-broadcast' : 'Secure the communications base data' })])]),
      el('div', { class: 'bp-objective' }, [el('span', { html: icon('deploy') }), el('div', {}, [el('div', { class: 'bp-o-label', text: '03 / EXTRACT' }), el('div', { class: 'bp-o-text', text: 'Hold the landing zone and board the dropship' })])]),
      el('div', { class: 'bp-objective secondary' }, [
        el('span', { html: '&#9733;' }),
        el('div', {}, [el('div', { class: 'bp-o-label', text: 'OPTIONAL / RESCUE' }), el('div', { class: 'bp-o-text', text: map.briefing.secondary })]),
      ]),
      el('div', { class: 'bp-rewards' }, [
        el('div', { class: 'bp-r-title', text: 'COMPLETION REWARDS' }),
        el('div', { class: 'bp-r-row' }, rewards.map((r) => el('div', { class: 'bp-r-item' }, [
          (() => { const d = el('div', { class: 'hex-icon' }, [el('div', { class: 'hex-shape' }), el('div', { class: 'hex-glyph', html: icon(r.name) })]); return d; })(),
          el('span', { text: r.label }),
        ]))),
        payout.weapon ? el('div', { class: 'bp-weapon-reward' }, [el('span', { html: icon('rifle') }), el('div', {}, [el('div', { class: 'bp-o-label', text: 'NEXT WEAPON UNLOCK' }), el('strong', { text: api.WEAPONS[payout.weapon].name })])]) : el('div', { class: 'bp-reward-note', text: 'All operation weapons unlocked' }),
        el('div', { class: 'bp-reward-note', text: 'Combat and optional objectives award additional XP, requisition and intel.' }),
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
    const bar = el('div', { class: 'op-bottombar' }, [
      diffGroup,
      el('div', { class: 'spacer' }),
      actionButton(api, {
        label: host ? 'REVIEW LOADOUT' : 'WAITING FOR HOST',
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
      dropZone = 'main';
      api.save.setLoadout({ dropZone });
      if (inLobby() && isHost()) api.mp.setSettings({ dropZone });
      mapId = api.save.profile.loadout.map || api.DEFAULT_MAP;
      render();
      if (!this._lobbyOff) this._lobbyOff = api.events.on('lobby:update', () => { if (root.classList.contains('visible') && !isHost()) render(); });
    },
    onHide() {},
  };
}
