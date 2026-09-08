import { el, menuButton } from '../components.js';

export function createPauseScreen(api, mgr) {
  const root = el('div', { class: 'screen pause-screen' });
  const confirm = mgr.confirm;

  function fmtTime(sec) { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }

  function render(data = {}) {
    root.innerHTML = '';
    const box = el('div', { class: 'pause-box panel' }, [
      el('h1', { text: 'PAUSED' }),
      el('div', { class: 'pause-obj' }, [
        el('span', { text: data.objectiveTitle || 'CURRENT OBJECTIVE' }),
        el('b', { text: data.objectiveText || '—' }),
        el('span', { text: data.time != null ? `MISSION TIME  ${fmtTime(data.time)}` : '' }),
      ]),
      el('div', { class: 'pause-list stagger' }, [
        menuButton(api, { label: 'Resume', onClick: () => { mgr.closePause(); api.resume(); } }),
        menuButton(api, { label: 'Restart From Checkpoint', onClick: () => confirm.show({
          title: 'RESTART FROM CHECKPOINT', text: 'Progress since your last checkpoint will be lost.',
          okLabel: 'RESTART', danger: true, onConfirm: () => { mgr.closePause(); api.restartCheckpoint(); },
        }) }),
        menuButton(api, { label: 'Settings', onClick: () => { mgr.closePause(); mgr.show('settings'); } }),
        menuButton(api, { label: 'Abort to Orbit', onClick: () => confirm.show({
          title: 'ABORT TO ORBIT', text: 'Abandoning the mission is recorded as a voluntary resignation.',
          okLabel: 'ABORT', danger: true, onConfirm: () => { mgr.closePause(); api.abortToOrbit(); },
        }) }),
        menuButton(api, { label: 'Quit to Desktop', onClick: () => confirm.show({
          title: 'QUIT TO DESKTOP', text: 'Any unsaved progress since your last checkpoint will be lost.',
          okLabel: 'QUIT', danger: true, onConfirm: () => api.quit(),
        }) }),
      ]),
    ]);
    root.appendChild(box);
  }

  return { el: root, render, onShow(data) { render(data); }, onHide() {} };
}
