import { el, icon, actionButton, screenHeader } from '../components.js';

const MARKERS = [
  { x: 70, y: 320, label: 'JAMMER OUTPOST', kind: 'primary' },
  { x: 200, y: 335, label: 'COMMUNICATIONS BASE', kind: 'primary' },
  { x: 292, y: 355, label: 'DETENTION', kind: 'secondary' },
  { x: 330, y: 250, label: 'EXTRACTION', kind: 'primary' },
  { x: 200, y: 190, label: 'SIDE OP: PROPAGANDA', kind: 'side' },
  { x: 108, y: 205, label: 'SIDE OP: SUPPLY CACHES', kind: 'side' },
  { x: 200, y: 130, label: 'SIDE OP: RECON DRONES', kind: 'side' },
];
const ENEMY_MARKERS = [
  { x: 30, y: 210 }, { x: 105, y: 375 }, { x: 350, y: 375 }, { x: 340, y: 130 }, { x: 220, y: 90 },
];

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
    return el('div', { class: `marker ${m.kind === 'secondary' ? 'secondary' : ''}`, style: { left: x + '%', top: y + '%' } }, [
      el('div', { class: 'diamond' }),
      el('div', { class: 'mk-label', text: m.label }),
    ]);
  }

  function buildEnemyMarker(m) {
    const x = (m.x / 400) * 100, y = (1 - m.y / 400) * 100;
    return el('div', { class: 'marker enemy', style: { left: x + '%', top: y + '%' } }, [el('div', { class: 'diamond' })]);
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
    return el('div', { class: 'war-table-wrap' }, [inner]);
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
