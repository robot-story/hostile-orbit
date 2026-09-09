import { el, icon, actionButton, screenHeader, screenFooter } from '../components.js';

function fmtTime(sec) {
  if (!sec) return '—:—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function xpForLevel(level) { return Math.pow(level - 1, 2) * 400; }

function ratingText(r) {
  const lines = [
    { test: (r) => r.accuracy > 0.6, text: 'DISTURBINGLY PRECISE. HR HAS BEEN NOTIFIED.' },
    { test: (r) => r.deaths === 0 && r.missionsCompleted > 0, text: 'ZERO RECORDED DEATHS. STATISTICALLY SUSPICIOUS.' },
    { test: (r) => r.missionsFailed > r.missionsCompleted, text: 'ACCEPTABLE. YOUR SACRIFICE REMAINS PRE-APPROVED.' },
    { test: (r) => r.headshots > 50, text: 'EXCEEDS CRANIAL COMPLIANCE QUOTA.' },
    { test: () => true, text: 'PERFORMANCE WITHIN EXPECTED PARAMETERS OF VIOLENCE.' },
  ];
  return (lines.find((l) => l.test(r)) || lines[lines.length - 1]).text;
}

export function createRecordScreen(api, mgr) {
  const root = el('div', { class: 'screen record-screen' });
  let saidHello = false;
  const confirm = mgr.confirm;

  function tile(val, label) { return el('div', { class: 'stat-tile panel' }, [el('div', { class: 'st-val', text: val }), el('div', { class: 'st-label', text: label })]); }

  function render() {
    root.innerHTML = '';
    const r = api.save.profile.record;
    const accuracy = r.shotsFired ? Math.round((r.shotsHit / r.shotsFired) * 100) : 0;
    const level = api.save.profile.level;
    const xpBase = xpForLevel(level), xpNext = xpForLevel(level + 1);
    const pct = Math.max(0, Math.min(100, ((api.save.profile.xp - xpBase) / (xpNext - xpBase)) * 100));

    root.appendChild(screenHeader(api, { title: 'COMBAT RECORD' }));

    const rp = el('div', { class: 'record-progress panel' }, [
      el('div', { class: 'rp-level', text: level }),
      el('div', { class: 'rp-bar' }, [el('div', { class: 'rp-fill' })]),
      el('div', { class: 'rp-xp', text: `${api.save.profile.xp} XP` }),
    ]);
    root.appendChild(rp);
    requestAnimationFrame(() => { rp.querySelector('.rp-fill').style.width = pct + '%'; });

    root.appendChild(el('div', { class: 'record-currency' }, [
      el('div', { class: 'rc-item panel' }, [el('div', { html: icon('req') }), el('div', {}, [el('div', { class: 'rc-val', text: api.save.profile.requisition }), el('div', { class: 'rc-label', text: 'REQUISITION' })])]),
      el('div', { class: 'rc-item panel' }, [el('div', { html: icon('intel') }), el('div', {}, [el('div', { class: 'rc-val', text: api.save.profile.intel }), el('div', { class: 'rc-label', text: 'INTEL' })])]),
    ]));

    const tiles = el('div', { class: 'stat-tiles stagger' }, [
      tile(r.kills, 'KILLS'), tile(r.headshots, 'HEADSHOTS'), tile(accuracy + '%', 'ACCURACY'), tile(r.deaths, 'DEATHS'),
      tile(r.missionsCompleted, 'MISSIONS COMPLETED'), tile(r.missionsFailed, 'MISSIONS FAILED'),
      tile(fmtTime(api.save.profile.missions.silent_meridian?.bestTime), 'BEST TIME'),
      tile('★'.repeat(api.save.profile.missions.silent_meridian?.bestStars || 0) || '—', 'BEST STARS'),
      tile(r.operativesRescued, 'OPERATIVES RESCUED'), tile(r.wardensKilled, 'WARDENS KILLED'),
      tile(r.orbitalStrikes, 'ORBITAL STRIKES'), tile(r.limbsRemoved, 'LIMBS REMOVED'),
      tile(fmtTime(r.timePlayed), 'TIME PLAYED'),
    ]);
    root.appendChild(tiles);

    root.appendChild(el('div', { class: 'perf-rating panel' }, [
      el('div', { class: 'pr-title', text: 'PERFORMANCE RATING' }),
      el('div', { class: 'pr-text', text: ratingText(r) }),
    ]));

    root.appendChild(actionButton(api, {
      label: 'RESET RECORD', kind: 'danger', onClick: () => confirm.show({
        title: 'RESET COMBAT RECORD', text: 'This permanently erases all progression, unlocks and statistics. This action cannot be undone.',
        okLabel: 'ERASE RECORD', danger: true, onConfirm: () => { api.save.wipe(); render(); mgr.toast('RECORD ERASED', 'warn'); },
      }),
    }));
    root.appendChild(screenFooter([{ key: 'ESC', label: 'BACK' }]));
  }

  return {
    el: root,
    onShow() { if (!saidHello) { saidHello = true; api.say('ship_record'); } render(); },
    onHide() {},
  };
}
