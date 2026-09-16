// Squad lobby: host or join, see who is in, share the invite in one click, pick frame and loadout, ready up, deploy.
// Everything lives on one screen so nobody has to hunt for the code or wonder who is still loading.
import { el, actionButton, screenHeader, screenFooter } from '../components.js';



export function createMultiplayerScreen(api, mgr) {
  const FRAMES=Object.entries(api.FRAME_VARIANTS).map(([id,f])=>({id,name:f.name,blurb:f.blurb}));
  const root = el('div', { class: 'screen mp-screen' });
  let saidHello = false, unsub = null, busy = false;

  const initials = (name) => (name || '?').trim().slice(0, 2).toUpperCase();
  const frameOf = (loadout) => FRAMES.find((f) => f.id === (loadout?.neon || '#00e5ff')) || FRAMES[0];
  const localFrame = () => api.save.profile.loadout.neon || '#00e5ff';
  const setLocalFrame = id => { api.save.setLoadout({neon:id,robot:'a'}); api.mp.setLoadout(api.save.profile.loadout); };
  async function copy(text, what) { try { if (!navigator.clipboard) throw Error('Clipboard unavailable'); await navigator.clipboard.writeText(text); mgr.toast(`${what} COPIED`, 'info'); } catch { mgr.toast('SELECT THE LINK OR ROOM CODE AND COPY IT MANUALLY', 'warn'); } }

  // ---------- pieces
  function slotCard(state, i) {
    const p = state.players.find((pl) => pl.slot === i); const color = api.SQUAD_COLORS[i] || '#888';
    if (!p) return el('div', { class: 'squad-slot empty panel', style: { borderTopColor: color } }, [el('div', { class: 'slot-avatar hollow', style: { borderColor: color } }, [el('span', { text: '+' })]), el('div', { class: 'slot-name', text: 'OPEN SLOT' }), el('div', { class: 'slot-status', text: 'INVITE A FRIEND' }), el('div', { class: 'slot-loadout', text: 'Share the code or link below.' })]);
    const w = p.loadout && api.WEAPONS[p.loadout.primary]; const w2 = p.loadout && api.WEAPONS[p.loadout.secondary]; const fr = frameOf(p.loadout);
    return el('div', { class: `squad-slot panel ${p.ready ? 'ready' : ''} ${p.isLocal ? 'local' : ''} ${p.connected === false ? 'offline' : ''}`, style: { borderTopColor: color } }, [
      p.isHost ? el('div', { class: 'crown', html: '&#9812; HOST' }) : null,
      el('div', { class: 'slot-avatar', style: { background: color, color: '#031218', boxShadow: `0 0 18px ${color}88` }, text: initials(p.name) }),
      el('div', { class: 'slot-name', text: (p.name || 'VANGUARD') + (p.isLocal ? '  (YOU)' : '') }),
      el('div', { class: 'slot-status', text: p.connected === false ? 'DISCONNECTED' : (p.ready ? 'READY' : 'STANDING BY') }),
      el('div', { class: 'slot-frame', style: { color }, text: fr.name }),
      el('div', { class: 'slot-loadout', text: `${w ? w.name : '—'}  /  ${w2 ? w2.name : '—'}` }),
    ]);
  }
  function invitePanel(state) {
    const link = state.link || (location.origin + location.pathname + '?join=' + (state.code || ''));
    return el('div', { class: 'mp-invite panel' }, [
      el('div', { class: 'mp-invite-title', text: 'INVITE' }),
      el('div', { class: 'mp-code-row' }, [el('div', { class: 'mp-code', text: state.code || '——————' }), actionButton(api, { label: 'COPY CODE', onClick: () => copy(state.code || '', 'CODE') })]),
      el('div', { class: 'mp-link-row' }, [el('input', { class: 'mp-input mp-link', type: 'text', readonly: 'readonly', value: link }), actionButton(api, { label: 'COPY LINK', kind: 'primary', onClick: () => copy(link, 'LINK') })]),
      el('div', { class: 'mp-hint', text: 'Friends open the link and land straight in this lobby. Up to ' + api.MAX_PLAYERS + ' Vanguards.' }),
    ]);
  }
  function settingsPanel(state) {
    const s = state.settings || {}; const host = state.isHost;
    const row = (label, options, current, onPick) => el('div', { class: 'mp-set-row' }, [el('div', { class: 'mp-set-label', text: label }), el('div', { class: 'mp-set-opts' }, options.map((o) => { const b = el('button', { class: 'mp-opt' + (o.id === current ? ' on' : '') + (host ? '' : ' locked'), text: o.name }); if (host) b.addEventListener('click', () => { api.audio?.play?.('ui_tab', { volume: 0.5 }); onPick(o.id); render(); }); return b; }))]);
    const maps = Object.keys(api.MAPS).map((id) => ({ id, name: api.MAPS[id].name || id.toUpperCase() }));
    const diffs = Object.values(api.DIFFICULTIES).map((d) => ({ id: d.id, name: d.name }));
    return el('div', { class: 'mp-settings panel' }, [
      el('div', { class: 'mp-invite-title', text: host ? 'OPERATION  (you set these)' : 'OPERATION  (host sets these)' }),
      row('MAP', maps, s.map || api.DEFAULT_MAP, (id) => api.mp.setSettings({ map: id })),
      row('DIFFICULTY', diffs, s.difficulty || 'veteran', (id) => api.mp.setSettings({ difficulty: id })),
    ]);
  }
  function loadoutPanel(state) {
    const lo = api.save.profile.loadout; const cur = localFrame();
    const frames = el('div', { class: 'mp-frames' }, FRAMES.map((f) => { const b = el('button', { class: 'mp-frame' + (f.id === cur ? ' on' : '') }, [el('div', { class: 'mp-frame-name', text: f.name }), el('div', { class: 'mp-frame-blurb', text: f.blurb })]); b.addEventListener('click', () => { setLocalFrame(f.id); api.audio?.play?.('ui_confirm', { volume: 0.5 }); render(); }); return b; }));
    return el('div', { class: 'mp-loadout panel' }, [
      el('div', { class: 'mp-invite-title', text: 'YOUR FRAME' }), frames,
      el('div', { class: 'mp-set-row' }, [el('div', { class: 'mp-set-label', text: 'WEAPONS' }), el('div', { class: 'mp-weapons', text: `${api.WEAPONS[lo.primary]?.name || '—'}  /  ${api.WEAPONS[lo.secondary]?.name || '—'}` }), actionButton(api, { label: 'EDIT LOADOUT', onClick: () => mgr.show('loadout') })]),
    ]);
  }

  // ---------- screen
  function render() {
    const state = api.mp.state();
    root.innerHTML = '';
    root.appendChild(screenHeader(api, { title: 'SQUAD LOBBY' }));
    root.appendChild(screenFooter(state.connected ? [{ key: 'ESC', label: 'BACK' }, { key: 'ENTER', label: 'READY' }] : [{ key: 'ESC', label: 'BACK' }]));

    if (!state.connected) {
      const nameInput = el('input', { class: 'mp-input', type: 'text', maxlength: '16', placeholder: 'CALLSIGN', value: api.settings.data.playerName });
      nameInput.addEventListener('change', () => api.settings.set('playerName', nameInput.value.trim() || 'Vanguard'));
      const codeInput = el('input', { class: 'mp-input mp-code-input', type: 'text', maxlength: '6', placeholder: 'ROOM CODE' });
      codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      const join = async () => { if (busy) return; busy = true; try { await api.mp.join(codeInput.value.trim().toUpperCase(), nameInput.value.trim() || 'Vanguard'); render(); } catch (e) { mgr.toast(String(e?.message || 'FAILED TO JOIN LOBBY').toUpperCase(), 'warn'); } busy = false; };
      codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
      root.appendChild(el('div', { class: 'mp-entry' }, [
        el('div', { class: 'mp-entry-card panel' }, [el('div', { class: 'mp-invite-title', text: 'CALLSIGN' }), nameInput]),
        el('div', { class: 'mp-entry-grid' }, [
          el('div', { class: 'mp-entry-card panel host' }, [el('div', { class: 'mp-invite-title', text: 'HOST A SQUAD' }), el('div', { class: 'mp-hint', text: 'Opens a lobby and gives you a code and link to share. You pick the map and launch.' }), actionButton(api, { label: 'HOST LOBBY', kind: 'primary', onClick: async () => { if (busy) return; busy = true; try { await api.mp.host(nameInput.value.trim() || 'Vanguard'); render(); } catch (e) { mgr.toast(String(e?.message || 'FAILED TO HOST LOBBY').toUpperCase(), 'warn'); } busy = false; } })]),
          el('div', { class: 'mp-entry-card panel' }, [el('div', { class: 'mp-invite-title', text: 'JOIN A SQUAD' }), el('div', { class: 'mp-hint', text: 'Paste the 6-character code from your host, or open their link.' }), el('div', { class: 'mp-join-row' }, [codeInput, actionButton(api, { label: 'JOIN', onClick: join })])]),
        ]),
        state.error ? el('div', { class: 'mp-error', text: state.error }) : null,
        el('div', { class: 'mp-footer-flavor', text: 'Friendship is currently undergoing certification.' }),
      ]));
      return;
    }

    if (!saidHello) { saidHello = true; api.say('ship_multiplayer'); }
    const local = state.players.find((p) => p.isLocal);
    const readyCount = state.players.filter((p) => p.ready && p.connected !== false).length, total = state.players.filter((p) => p.connected !== false).length;
    const allReady = total > 0 && readyCount === total;
    root.appendChild(el('div', { class: 'mp-lobby' }, [
      el('div', { class: 'mp-status' }, [el('span', { class: 'dot on' }), el('span', { text: `${total}/${api.MAX_PLAYERS} IN LOBBY  ·  ${readyCount} READY` }), state.isHost ? el('span', { class: 'mp-status-note', text: allReady ? 'SQUAD READY. DEPLOY WHEN YOU ARE.' : 'EVERYONE READIES UP, THEN YOU DEPLOY.' }) : el('span', { class: 'mp-status-note', text: 'THE HOST LAUNCHES. READY UP SO THEY KNOW.' })]),
      el('div', { class: 'squad-slots' }, Array.from({ length: api.MAX_PLAYERS }, (_, i) => slotCard(state, i))),
      el('div', { class: 'mp-columns' }, [el('div', { class: 'mp-col' }, [invitePanel(state), settingsPanel(state)]), el('div', { class: 'mp-col' }, [loadoutPanel(state)])]),
      el('div', { class: 'mp-actions' }, [
        actionButton(api, { label: local && local.ready ? 'CANCEL READY' : 'READY UP', kind: local && local.ready ? '' : 'primary', onClick: () => { api.mp.setReady(!(local && local.ready)); render(); } }),
        state.isHost ? actionButton(api, { label: allReady ? 'DEPLOY SQUAD' : 'DEPLOY (WAITING FOR READY-UPS)', kind: allReady ? 'primary' : '', disabled: !allReady, sound: 'deploy', onClick: () => api.mp.start() }) : null,
        actionButton(api, { label: 'LEAVE', kind: 'danger', sound: 'back', onClick: () => { api.mp.leave(); render(); } }),
      ]),
      state.error ? el('div', { class: 'mp-error', text: state.error }) : null,
    ]));
  }

  return {
    el: root,
    onShow() { render(); unsub && unsub(); unsub = api.events.on('lobby:update', render); },
    onHide() { unsub && unsub(); unsub = null; },
  };
}
