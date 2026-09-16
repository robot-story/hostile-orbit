import { el, icon, screenHeader, screenFooter } from '../components.js';

const STAT_LABELS = ['damage', 'control', 'mobility', 'defence'];

export function createArmouryScreen(api, mgr) {
  const root = el('div', { class: 'screen armoury-screen' });
  let saidHello = false;

  function weaponIconName(w) { return { rifle: 'rifle', shotgun: 'shotgun', lmg: 'lmg', pistol: 'pistol' }[w.kind] || 'rifle'; }

  function statsBlock(stats) {
    if (!stats) return null;
    return el('div', {}, STAT_LABELS.map((k) => {
      const val = stats[k] || 0;
      const fill = el('div', { class: 'sb-fill' });
      const row = el('div', { class: 'stat-bar-row' }, [
        el('div', { class: 'sb-label', text: k.toUpperCase() }),
        el('div', { class: 'sb-track' }, [fill]),
        el('div', { class: 'sb-val', text: val }),
      ]);
      requestAnimationFrame(() => { fill.style.width = val + '%'; });
      return row;
    }));
  }

  function weaponCard(w) {
    const unlocked = w.slot === 'secondary' || api.save.profile.unlockedWeapons.includes(w.id);
    const card = el('div', { class: 'weapon-card panel' }, [
      el('div', { class: 'wc-icon', html: icon(weaponIconName(w)) }),
      el('div', { class: 'wc-name', text: w.name }),
      el('div', { class: 'wc-desc', text: w.description || '' }),
      statsBlock(w.stats),
      !unlocked ? el('div', { class: 'wc-locked' }, [el('span', { html: icon('helmet') }), el('span', { text: 'RECOVER FROM THE FIELD TO UNLOCK' })]) : null,
    ]);
    return card;
  }

  function extraCard(name, desc, iconName, extra) {
    return el('div', { class: 'weapon-card panel' }, [
      el('div', { class: 'wc-icon', html: icon(iconName) }),
      el('div', { class: 'wc-name', text: name }),
      el('div', { class: 'wc-desc', text: desc }),
      extra || null,
    ]);
  }

  function render() {
    root.innerHTML = '';
    root.appendChild(screenHeader(api, { title: 'ARMOURY' }));
    const grid = el('div', { class: 'armoury-grid stagger' });
    Object.values(api.WEAPONS).filter((w) => w.slot === 'primary' || w.slot === 'secondary').forEach((w) => grid.appendChild(weaponCard(w)));
    grid.appendChild(extraCard(api.GRENADE.name, `Radius ${api.GRENADE.radius}m · Damage ${api.GRENADE.damage}`, 'grenade'));
    grid.appendChild(extraCard(api.INJECTOR.name, `Heals ${api.INJECTOR.heal}hp over ${api.INJECTOR.duration}s`, 'helmet'));
    Object.values(api.ARMOUR).forEach((a) => grid.appendChild(extraCard(a.name, a.description, 'helmet')));
    root.appendChild(grid);
    root.appendChild(screenFooter([{ key: 'ESC', label: 'BACK' }]));
  }

  return {
    el: root,
    onShow() {
      if (!saidHello) { saidHello = true; api.say('ship_armoury'); }
      render();
    },
    onHide() {},
  };
}
