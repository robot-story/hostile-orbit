import { el, actionButton, screenHeader, screenFooter } from '../components.js';

export function createMultiplayerScreen(api, mgr) {
  const root = el('div', { class: 'screen mp-screen' });
  let saidHello = false;
  let poll = null;
  let unsub = null;

  function initials(name) { return (name || '?').trim().slice(0, 2).toUpperCase(); }

  function buildSlots(state) {
    const wrap = el('div', { class: 'squad-slots' });
    for (let i = 0; i < api.MAX_PLAYERS; i++) {
      const p = state.players.find((pl) => pl.slot === i);
      const color = api.SQUAD_COLORS[i] || '#888';
      if (!p) { wrap.appendChild(el('div', { class: 'squad-slot empty panel' }, [el('div', { class: 'slot-status', text: 'OPEN SLOT' })])); continue; }
      const loadoutName = p.loadout && api.WEAPONS[p.loadout.primary] ? api.WEAPONS[p.loadout.primary].name : '—';
      wrap.appendChild(el('div', { class: `squad-slot panel ${p.ready ? 'ready' : ''}`, style: { borderTopColor: color } }, [
        p.isHost ? el('div', { class: 'crown', html: '&#9812;' }) : null,
        el('div', { class: 'slot-avatar', style: { background: color, color: '#031218' }, text: initials(p.name) }),
        el('div', { class: 'slot-name', text: p.name || 'VANGUARD' }),
        el('div', { class: 'slot-status', text: p.connected === false ? 'DISCONNECTED' : (p.ready ? 'READY' : 'STANDING BY') }),
        el('div', { class: 'slot-loadout', text: loadoutName }),
      ]));
    }
    return wrap;
  }

  function copy(text) { try { navigator.clipboard.writeText(text); mgr.toast('COPIED TO CLIPBOARD', 'info'); } catch { mgr.toast('COPY FAILED', 'warn'); } }

  function render() {
    const state = api.mp.state();
    root.innerHTML = '';
    root.appendChild(screenHeader(api, { title: 'SQUAD LOBBY' }));
    root.appendChild(screenFooter([{ key: 'ESC', label: 'BACK' }, { key: 'ENTER', label: 'READY' }]));

    if (!state.connected) {
      const nameInput = el('input', { class: 'mp-input', type: 'text', maxlength: '16', placeholder: 'CALLSIGN', value: api.settings.data.playerName });
      nameInput.addEventListener('change', () => api.settings.set('playerName', nameInput.value.trim() || 'Vanguard'));
      const codeInput = el('input', { class: 'mp-input', type: 'text', maxlength: '6', placeholder: 'CODE' });
      root.appendChild(el('div', { class: 'mp-join-row' }, [nameInput]));
      root.appendChild(el('div', { class: 'mp-join-row' }, [
        actionButton(api, { label: 'HOST LOBBY', kind: 'primary', onClick: async () => {
          try { await api.mp.host(nameInput.value.trim() || 'Vanguard'); render(); }
          catch { mgr.toast('FAILED TO HOST LOBBY', 'warn'); }
        } }),
        codeInput,
        actionButton(api, { label: 'JOIN LOBBY', onClick: async () => {
          try { await api.mp.join(codeInput.value.trim().toUpperCase(), nameInput.value.trim() || 'Vanguard'); render(); }
          catch { mgr.toast('FAILED TO JOIN LOBBY', 'warn'); }
        } }),
      ]));
      if (state.error) root.appendChild(el('div', { class: 'mp-error', text: state.error }));
      root.appendChild(el('div', { class: 'mp-footer-flavor', text: 'Friendship is currently undergoing certification.' }));
      return;
    }

    if (!saidHello) { saidHello = true; api.say('ship_multiplayer'); }
    const lobby = el('div', { class: 'mp-lobby' }, [
      buildSlots(state),
      el('div', { class: 'mp-share panel' }, [
        el('div', { class: 'mp-code', text: state.code || '——————' }),
        actionButton(api, { label: 'COPY CODE', onClick: () => copy(state.code || '') }),
        actionButton(api, { label: 'COPY LINK', onClick: () => copy(state.link || '') }),
      ]),
    ]);
    root.appendChild(lobby);

    const local = state.players.find((p) => p.isLocal);
    const actions = el('div', { class: 'mp-actions' });
    actions.appendChild(actionButton(api, {
      label: local && local.ready ? 'CANCEL READY' : 'READY',
      kind: local && local.ready ? '' : 'primary',
      onClick: () => api.mp.setReady(!(local && local.ready)),
    }));
    if (state.isHost) {
      actions.appendChild(actionButton(api, {
        label: 'LAUNCH OPERATION', kind: 'primary', sound: 'deploy',
        onClick: () => mgr.show('operation'),
      }));
    }
    actions.appendChild(actionButton(api, { label: 'LEAVE', kind: 'danger', sound: 'back', onClick: () => { api.mp.leave(); render(); } }));
    root.appendChild(actions);
    if (state.error) root.appendChild(el('div', { class: 'mp-error', text: state.error }));
    root.appendChild(el('div', { class: 'mp-footer-flavor', text: state.isHost ? 'Only the host may launch — everyone else just has to trust the process.' : 'Friendship is currently undergoing certification.' }));
  }

  return {
    el: root,
    onShow() {
      render();
      clearInterval(poll);
      poll = setInterval(render, 1500);
      unsub && unsub();
      unsub = api.events.on('lobby:update', render);
    },
    onHide() { clearInterval(poll); unsub && unsub(); unsub = null; },
  };
}
