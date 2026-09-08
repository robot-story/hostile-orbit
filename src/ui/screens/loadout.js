import { el, icon, actionButton } from '../components.js';

const SLOT_ICON = { primary: 'rifle', secondary: 'pistol', grenade: 'grenade', armour: 'helmet' };
const SLOT_LABEL = { primary: 'PRIMARY', secondary: 'SECONDARY', grenade: 'GRENADE', armour: 'ARMOUR' };
const ABILITY_ICON = { kinetic: 'kinetic', gunship: 'gunship', sentry: 'sentry', supply: 'supply' };
const STAT_LABELS = ['damage', 'control', 'mobility', 'defence'];

export function createLoadoutScreen(api, mgr) {
  const root = el('div', { class: 'screen loadout-screen' });
  let loadout = { ...api.save.profile.loadout };
  let openSlot = null;
  let dragging = false, lastX = 0;

  function weaponIconName(id) {
    const w = api.WEAPONS[id];
    if (!w) return 'rifle';
    return { rifle: 'rifle', shotgun: 'shotgun', lmg: 'lmg', pistol: 'pistol' }[w.kind] || 'rifle';
  }

  function isHost() { const st = api.mp.state(); return !st.connected || st.isHost; }
  function inLobby() { return api.mp.state().connected; }

  function saveLoadout() {
    api.save.setLoadout(loadout);
    if (inLobby()) api.mp.setLoadout(loadout);
  }

  function pickWeapon(id) {
    const w = api.WEAPONS[id];
    if (!w) return;
    if (!api.save.profile.unlockedWeapons.includes(id)) { api.ui.error(); return; }
    loadout.primary = id;
    saveLoadout();
    api.preview.setWeapon(id);
    openSlot = null;
    render();
  }

  function buildCard(slot) {
    const isPicker = slot === 'primary';
    const idForSlot = slot === 'primary' ? loadout.primary : slot === 'secondary' ? loadout.secondary : slot === 'grenade' ? loadout.grenade : loadout.armour;
    let name, iconName;
    if (slot === 'primary') { const w = api.WEAPONS[idForSlot]; name = w ? w.name : idForSlot; iconName = weaponIconName(idForSlot); }
    else if (slot === 'secondary') { const w = api.WEAPONS[idForSlot] || api.WEAPONS.sidearm; name = w.name; iconName = 'pistol'; }
    else if (slot === 'grenade') { name = api.GRENADE.name; iconName = 'grenade'; }
    else { const a = api.ARMOUR[idForSlot] || Object.values(api.ARMOUR)[0]; name = a.name; iconName = 'helmet'; }

    const card = el('div', { class: `load-card panel ${openSlot === slot ? 'open' : ''}` }, [
      el('div', { class: 'lc-icon', html: icon(iconName) }),
      el('div', { class: 'lc-info' }, [el('div', { class: 'lc-label', text: SLOT_LABEL[slot] }), el('div', { class: 'lc-name', text: name })]),
      el('div', { class: 'chev' }),
    ]);
    card.addEventListener('mouseenter', () => api.ui.hover());
    card.addEventListener('click', () => {
      api.ui.click();
      if (!isPicker) return;
      openSlot = openSlot === slot ? null : slot;
      render();
    });

    const wrap = [card];
    if (isPicker && openSlot === slot) {
      const list = el('div', { class: 'weapon-picker panel' });
      Object.values(api.WEAPONS).filter((w) => w.slot === 'primary').forEach((w) => {
        const unlocked = api.save.profile.unlockedWeapons.includes(w.id);
        const item = el('div', { class: `wp-item ${w.id === loadout.primary ? 'active' : ''} ${!unlocked ? 'locked' : ''}` }, [
          el('div', { class: 'lc-icon', html: icon(weaponIconName(w.id)), style: { width: '32px', height: '32px' } }),
          el('div', { class: 'wp-name', text: w.name }),
          !unlocked ? el('div', { class: 'wp-lock', text: 'RECOVER IN FIELD' }) : null,
        ]);
        item.addEventListener('mouseenter', () => api.ui.hover());
        item.addEventListener('click', (e) => { e.stopPropagation(); if (unlocked) pickWeapon(w.id); else api.ui.error(); });
        list.appendChild(item);
      });
      wrap.push(list);
    }
    return wrap;
  }

  function buildSupportRow() {
    const tiles = Object.values(api.ABILITIES).map((a, i) => el('div', { class: 'sr-tile panel' }, [
      el('div', { class: 'sr-key', text: api.keyLabel(api.settings.data.binds[a.key]) }),
      el('div', { html: icon(ABILITY_ICON[a.id] || 'kinetic') }),
      el('div', { class: 'sr-name', text: a.name }),
      el('div', { class: 'sr-tip', text: a.description }),
    ]));
    return el('div', { class: 'support-row' }, [
      el('div', { class: 'sr-title', text: 'ORBITAL SUPPORT' }),
      el('div', { class: 'sr-tiles' }, tiles),
    ]);
  }

  function buildConditions() {
    return el('div', { class: 'conditions-panel panel' }, [
      el('div', { class: 'panel-title', text: 'MISSION CONDITIONS' }),
      el('div', { class: 'cond-item' }, [
        el('span', { html: icon('reinforce') }),
        el('div', {}, [el('div', { class: 'cond-title', text: 'ORBITAL JAMMING' }), el('div', { class: 'cond-text', text: 'External communications disrupted. Support windows limited.' })]),
      ]),
      el('div', { class: 'cond-item' }, [
        el('span', { html: icon('skull') }),
        el('div', {}, [el('div', { class: 'cond-title', text: 'HEAVY SYNTHETIC PRESENCE' }), el('div', { class: 'cond-text', text: 'High concentration of autonomous hostile units detected.' })]),
      ]),
    ]);
  }

  function buildStats() {
    const w = api.WEAPONS[loadout.primary] || api.WEAPONS.viper;
    const rows = STAT_LABELS.map((k) => {
      const val = w.stats ? w.stats[k] : 0;
      const fill = el('div', { class: 'sb-fill' });
      const row = el('div', { class: 'stat-bar-row' }, [
        el('div', { class: 'sb-label', text: k.toUpperCase() }),
        el('div', { class: 'sb-track' }, [fill]),
        el('div', { class: 'sb-val', text: val }),
      ]);
      requestAnimationFrame(() => { fill.style.width = val + '%'; });
      return row;
    });
    return el('div', { class: 'stats-panel panel' }, [
      el('div', { class: 'panel-title', text: 'WEAPON STATISTICS' }),
      el('div', { class: 'sp-weapon', text: w.name }),
      ...rows,
    ]);
  }

  function bottomBar() {
    if (inLobby() && !isHost()) {
      return el('div', { class: 'lo-waiting', text: 'WAITING FOR HOST' });
    }
    return el('div', { class: 'lo-bottom' }, [
      actionButton(api, { label: 'SAVE LOADOUT', icon: 'save', onClick: () => { saveLoadout(); mgr.toast('LOADOUT SAVED', 'info'); } }),
      actionButton(api, {
        label: 'DEPLOY', kind: 'primary', icon: 'deploy', sound: 'deploy',
        onClick: () => {
          saveLoadout();
          if (inLobby()) {
            if (isHost()) api.mp.start();
            else api.mp.setReady(true);
          } else {
            api.startDeployment({ difficulty: api.save.profile.loadout.difficulty, dropZone: api.save.profile.loadout.dropZone, loadout });
          }
        },
      }),
    ]);
  }

  function attachDrag(centerEl) {
    centerEl.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX;
      api.preview.rotate(dx * 0.01);
    });
  }

  function render() {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'lo-title' }, [el('span', { html: icon('chevronBig') }), el('span', { text: 'DEPLOYMENT LOADOUT' })]));
    const left = el('div', { class: 'lo-col-left stagger' });
    ['primary', 'secondary', 'grenade', 'armour'].forEach((slot) => buildCard(slot).forEach((n) => left.appendChild(n)));
    left.appendChild(buildSupportRow());
    const center = el('div', { class: 'lo-col-center' });
    attachDrag(center);
    const right = el('div', { class: 'lo-col-right stagger' }, [buildConditions(), buildStats()]);
    root.appendChild(left);
    root.appendChild(center);
    root.appendChild(right);
    root.appendChild(bottomBar());
  }

  return {
    el: root,
    onShow() {
      loadout = { ...api.save.profile.loadout };
      openSlot = null;
      api.preview.setMode('loadout');
      api.preview.setWeapon(loadout.primary);
      if (loadout.armour) api.preview.setArmour(loadout.armour);
      render();
    },
    onHide() {},
  };
}
