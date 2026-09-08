import { el, icon, actionButton, starRating } from '../components.js';

function fmtTime(sec) { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }

export function createResultsScreen(api, mgr) {
  const root = el('div', { class: 'screen results-screen' });

  function objRow(done, text, count) {
    return el('div', { class: 'res-obj-row' }, [
      el('div', { class: `ro-check ${done ? '' : 'incomplete'}`, html: icon('check') }),
      el('div', { class: 'ro-text', text }),
      count ? el('div', { class: 'ro-count', text: count }) : null,
    ]);
  }
  function perfRow(iconName, label, val) {
    return el('div', { class: 'res-perf-row' }, [el('span', { html: icon(iconName) }), el('span', { class: 'rp-name', text: label }), el('span', { class: 'rp-val', text: val })]);
  }
  function rewardItem(iconName, num, label) {
    const numEl = el('span', { class: 'rr-num', text: '0' });
    let start = null; const dur = 900;
    const step = (t) => { if (!start) start = t; const p = Math.min(1, (t - start) / dur); numEl.textContent = Math.round(p * num).toLocaleString(); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    return el('div', { class: 'res-reward-item' }, [el('span', { html: icon(iconName), style: { width: '26px', height: '26px' } }), el('div', {}, [numEl, el('div', { class: 'rr-label', text: label })])]);
  }

  function render(results = {}, failed = false) {
    root.className = `screen results-screen ${failed ? 'failed' : ''}`;
    root.innerHTML = '';
    const o = results.objectives || {};
    const coop = !!results.coop;
    const isHost = results.isHost !== false;

    root.appendChild(el('div', { class: 'res-title-bar panel' }, [
      el('div', { class: 'res-kicker' }, [el('span', { html: icon('chevronBig') }), el('h1', { class: 'res-title', text: failed ? 'MISSION FAILED' : 'MISSION COMPLETE' })]),
      el('div', { class: 'res-op', text: 'OPERATION: SILENT MERIDIAN' }),
      el('div', { class: 'res-loc', text: failed ? 'ALL REINFORCEMENT BODIES EXPENDED' : 'BLACKSITE MERIDIAN LIBERATED' }),
    ]));

    if (failed) {
      root.appendChild(el('div', { class: 'res-loc', style: { marginBottom: '14px' }, text: 'Your performance review has been scheduled posthumously.' }));
    }

    const body = el('div', { class: 'res-body' }, [
      el('div', { class: 'res-col' }, [
        el('div', { class: 'res-col-title', text: 'OBJECTIVES' }),
        objRow(!!o.jammer, 'JAMMER DESTROYED'),
        objRow(!!o.data, 'DATA RECOVERED'),
        objRow((o.rescued || 0) >= (o.rescuedTotal || 2), 'OPERATIVES RESCUED', `${o.rescued || 0}/${o.rescuedTotal || 2}`),
      ]),
      el('div', { class: 'res-col' }, [
        el('div', { class: 'res-col-title', text: 'PERFORMANCE' }),
        perfRow('clock', 'MISSION TIME', fmtTime(results.time || 0)),
        perfRow('target', 'ACCURACY', Math.round((results.accuracy || 0) * 100) + '%'),
        perfRow('skull', 'ENEMIES ELIMINATED', results.kills || 0),
        perfRow('target', 'HEADSHOTS', results.headshots || 0),
        perfRow('reinforce', 'REINFORCEMENTS USED', results.reinforcementsUsed || 0),
      ]),
    ]);
    root.appendChild(body);

    root.appendChild(el('div', { class: 'res-rewards' }, [
      rewardItem('xp', results.xp || 0, 'EXPERIENCE'),
      rewardItem('req', results.requisition || 0, 'REQUISITION'),
      rewardItem('intel', results.intel || 0, 'INTEL'),
    ]));

    if (!failed) {
      const starsEl = el('div', { class: 'res-stars' });
      root.appendChild(starsEl);
      starRating(starsEl, results.stars || 0, api);
    }

    const actions = el('div', { class: 'res-actions' });
    if (coop && !isHost) {
      actions.appendChild(el('div', { class: 'res-waiting', text: 'WAITING FOR HOST' }));
    } else if (failed) {
      actions.appendChild(actionButton(api, { label: 'RETRY FROM CHECKPOINT', kind: 'primary', sound: 'deploy', onClick: () => api.restartCheckpoint() }));
      actions.appendChild(actionButton(api, { label: 'RETURN TO ORBIT', sound: 'back', onClick: () => api.abortToOrbit() }));
    } else {
      actions.appendChild(actionButton(api, { label: coop ? 'RETURN TO LOBBY' : 'RETURN TO ORBIT', sound: 'back', onClick: () => api.abortToOrbit() }));
      actions.appendChild(actionButton(api, { label: 'REDEPLOY', kind: 'primary', sound: 'deploy', onClick: () => mgr.show('loadout') }));
    }
    root.appendChild(actions);
  }

  return {
    el: root,
    onShow(data) {
      const failed = !!(data && data.failed);
      const results = (data && data.results) || api.getLastResults() || {};
      api.preview.setMode('results');
      api.music(failed ? 'failed' : 'results');
      render(results, failed);
    },
    onHide() {},
  };
}
