// Pause menu: a command tablet. Left: actions. Right: tabs for OBJECTIVES (quest card + side ops), MAP (tactical map
// launcher with a live thumbnail of markers), SQUAD (roster, frame, kills), and LOADOUT (weapons and orbital abilities).
import { el, menuButton, actionButton } from '../components.js';
import { events } from '../../core/events.js';

export function createPauseScreen(api, mgr) {
  const root = el('div', { class: 'screen pause-screen' });
  const confirm = mgr.confirm;
  let tab = 'objectives'; let lastQuest = null; let unsub = null;
  function fmtTime(sec) { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }

  function objectivesTab(data) {
    const q = lastQuest || data.quest; const side = data.side || {};
    return el('div', { class: 'ptab' }, [
      el('div', { class: 'pt-title', text: 'PRIMARY OBJECTIVE' }),
      el('div', { class: 'pt-big', text: data.objectiveText || '—' }),
      q ? el('div', { class: 'pt-quest' }, [el('div', { class: 'pt-sub', text: q.title }), ...q.steps.map((s) => el('div', { class: 'pt-step' + (s.done ? ' done' : '') }, [el('i'), el('span', { text: s.text })])), q.hint ? el('div', { class: 'pt-hint', text: q.hint }) : null]) : null,
      el('div', { class: 'pt-title', text: 'SIDE OPERATIONS' }),
      ...Object.values(side).map((s) => el('div', { class: 'pt-step' + (s.done >= s.total ? ' done' : '') }, [el('i'), el('span', { text: `${s.name}  ${s.done}/${s.total}` })])),
      el('div', { class: 'pt-hint', text: 'Side operations pay out at extraction. Posters, caches and prisoners are marked on the tactical map.' }),
    ]);
  }
  function mapTab(data) {
    return el('div', { class: 'ptab' }, [
      el('div', { class: 'pt-title', text: 'TACTICAL MAP' }),
      el('div', { class: 'pt-mapwrap' }, [el('img', { class: 'pt-map', src: data.mapImage || '' }), el('div', { class: 'pt-mapdots' })]),
      el('div', { class: 'pt-hint', text: 'Press M in play for the live map with pins and squad positions. Cyan: objective. Yellow: side ops. Red: known Legion.' }),
      actionButton(api, { label: 'OPEN LIVE MAP', kind: 'primary', onClick: () => { mgr.closePause(); api.resume(); events.emit('hud:map-toggle'); } }),
    ]);
  }
  function squadTab(data) {
    const rows = (data.squad || []).map((s) => el('div', { class: 'pt-row' }, [el('span', { class: 'dot', style: { background: s.color, boxShadow: `0 0 8px ${s.color}` } }), el('span', { text: s.name }), el('span', { class: 'muted', text: s.frame }), el('span', { text: `${s.kills} K` }), el('span', { text: s.ready ? 'IN' : '' })]));
    return el('div', { class: 'ptab' }, [el('div', { class: 'pt-title', text: 'SQUAD' }), ...(rows.length ? rows : [el('div', { class: 'pt-hint', text: 'Solo deployment. Host a lobby from the main menu to bring friends.' })]), el('div', { class: 'pt-title', text: 'MISSION' }), el('div', { class: 'pt-row' }, [el('span', { text: `TIME ${fmtTime(data.time || 0)}` }), el('span', { text: `KILLS ${data.kills ?? 0}` }), el('span', { text: `LIVES ${data.lives ?? '—'}` })])]);
  }
  function loadoutTab(data) {
    const lo = api.save.profile.loadout; const w1 = api.WEAPONS[lo.primary], w2 = api.WEAPONS[lo.secondary];
    return el('div', { class: 'ptab' }, [
      el('div', { class: 'pt-title', text: 'LOADOUT' }),
      el('div', { class: 'pt-row' }, [el('span', { class: 'muted', text: 'PRIMARY' }), el('span', { text: w1?.name || '—' }), el('span', { class: 'muted', text: w1?.description || '' })]),
      el('div', { class: 'pt-row' }, [el('span', { class: 'muted', text: 'SECONDARY' }), el('span', { text: w2?.name || '—' }), el('span', { class: 'muted', text: w2?.description || '' })]),
      el('div', { class: 'pt-title', text: 'ORBITAL ABILITIES' }),
      ...Object.values(api.ABILITIES || {}).map((a) => el('div', { class: 'pt-row' }, [el('span', { class: 'muted', text: api.keyLabel(api.settings.data.binds[a.key] || '') }), el('span', { text: a.name }), el('span', { class: 'muted', text: a.description || '' })])),
      el('div', { class: 'pt-title', text: 'CONTROLS' }),
      el('div', { class: 'pt-hint', text: 'SHIFT rolls in and out instantly. SPACE (hold) jets; tapped while rolling it launches; tapped just before landing it slams. Ramps and rails carry momentum. Aim in the air to hover.' }),
    ]);
  }

  function render(data = {}) {
    root.innerHTML = '';
    const tabs = el('div', { class: 'ptabs' }, ['objectives', 'map', 'squad', 'loadout'].map((t) => { const b = el('button', { class: 'ptab-btn' + (t === tab ? ' on' : ''), text: t.toUpperCase() }); b.addEventListener('click', () => { tab = t; render(data); }); return b; }));
    const body = tab === 'objectives' ? objectivesTab(data) : tab === 'map' ? mapTab(data) : tab === 'squad' ? squadTab(data) : loadoutTab(data);
    const left = el('div', { class: 'pause-box panel' }, [
      el('h1', { text: 'PAUSED' }),
      el('div', { class: 'pause-obj' }, [el('span', { text: data.objectiveTitle || 'CURRENT OBJECTIVE' }), el('b', { text: data.objectiveText || '—' }), el('span', { text: data.time != null ? `MISSION TIME  ${fmtTime(data.time)}` : '' })]),
      el('div', { class: 'pause-list stagger' }, [
        menuButton(api, { label: 'Resume', onClick: () => { mgr.closePause(); api.resume(); } }),
        menuButton(api, { label: 'Tactical Map', onClick: () => { mgr.closePause(); api.resume(); events.emit('hud:map-toggle'); } }),
        menuButton(api, { label: 'Restart From Checkpoint', onClick: () => confirm.show({ title: 'RESTART FROM CHECKPOINT', text: 'Progress since your last checkpoint will be lost.', okLabel: 'RESTART', danger: true, onConfirm: () => { mgr.closePause(); api.restartCheckpoint(); } }) }),
        menuButton(api, { label: 'Settings', onClick: () => { mgr.closePause(); mgr.show('settings'); } }),
        menuButton(api, { label: 'Dev Menu', onClick: () => { mgr.closePause(); api.devMenu(); } }),
        menuButton(api, { label: 'Abort to Orbit', onClick: () => confirm.show({ title: 'ABORT TO ORBIT', text: 'Abandoning the mission is recorded as a voluntary resignation.', okLabel: 'ABORT', danger: true, onConfirm: () => { mgr.closePause(); api.abortToOrbit(); } }) }),
        menuButton(api, { label: 'Quit to Desktop', onClick: () => confirm.show({ title: 'QUIT TO DESKTOP', text: 'Any unsaved progress since your last checkpoint will be lost.', okLabel: 'QUIT', danger: true, onConfirm: () => api.quit() }) }),
      ]),
    ]);
    const right = el('div', { class: 'pause-side panel' }, [tabs, body]);
    root.appendChild(el('div', { class: 'pause-grid' }, [left, right]));
  }

  return { el: root, render, onShow(data) { render(data); unsub && unsub(); unsub = api.events.on('quest:set', (q) => { lastQuest = q; }); }, onHide() { unsub && unsub(); unsub = null; } };
}
