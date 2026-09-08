// Standalone menu preview: builds a stub `api` (using the real settings/save/
// weapon data modules) so every screen can be exercised without booting the
// 3D game. Useful for design review of src/ui/* in isolation.
import { createMenus } from './menus.js';
import { settings } from '../core/settings.js';
import { save } from '../core/save.js';
import { events } from '../core/events.js';
import { input, keyLabel } from '../core/input.js';
import { WEAPONS, GRENADE, INJECTOR, ARMOUR, ABILITIES, DIFFICULTIES, DROP_ZONES } from '../gameplay/weapons.js';
import { SQUAD_COLORS, MAX_PLAYERS } from '../net/protocol.js';

function noop() {}

function makeStubApi() {
  let lobby = { players: [], connected: false, isHost: false, code: null, link: null, settings: {}, error: null };
  let lastResults = {
    success: true, time: 872, accuracy: 0.61, kills: 124, headshots: 37, reinforcementsUsed: 1,
    xp: 1850, requisition: 720, intel: 3, stars: 4,
    objectives: { jammer: true, data: true, rescued: 2, rescuedTotal: 2 },
    coop: false, isHost: true,
  };

  const api = {
    settings, save, events, WEAPONS, GRENADE, INJECTOR, ARMOUR, ABILITIES, DIFFICULTIES, DROP_ZONES, SQUAD_COLORS, MAX_PLAYERS,
    keyLabel, input,
    ui: {
      click: () => console.debug('[ui] click'),
      hover: () => {},
      back: () => console.debug('[ui] back'),
      confirm: () => console.debug('[ui] confirm'),
      deploy: () => console.debug('[ui] deploy'),
      error: () => console.debug('[ui] error'),
      tab: () => {},
    },
    say: (id) => console.debug('[voice]', id),
    music: (state) => console.debug('[music]', state),
    hasOperation: () => !!save.profile.operationInProgress,
    continueOperation: () => console.debug('[dev] continueOperation'),
    startDeployment: (opts) => { console.debug('[dev] startDeployment', opts); menus.showDropSequence(); },
    preview: {
      setMode: (m) => console.debug('[preview] mode', m),
      setWeapon: (id) => console.debug('[preview] weapon', id),
      rotate: noop,
      setArmour: (id) => console.debug('[preview] armour', id),
    },
    resume: noop, restartCheckpoint: noop, abortToOrbit: () => menus.show('main'), quit: noop,
    setFullscreen: noop,
    mp: {
      host: async (name) => { lobby = { players: [{ id: 'p1', slot: 0, name, ready: false, loadout: save.profile.loadout, connected: true, isHost: true, isLocal: true }], connected: true, isHost: true, code: 'AB12CD', link: 'https://hostileorbit.game/join/AB12CD', settings: {}, error: null }; return { code: lobby.code, link: lobby.link }; },
      join: async (code, name) => { lobby = { players: [{ id: 'h', slot: 0, name: 'HOST', ready: false, loadout: save.profile.loadout, connected: true, isHost: true, isLocal: false }, { id: 'p2', slot: 1, name, ready: false, loadout: save.profile.loadout, connected: true, isHost: false, isLocal: true }], connected: true, isHost: false, code, link: 'https://hostileorbit.game/join/' + code, settings: {}, error: null }; },
      leave: () => { lobby = { players: [], connected: false, isHost: false, code: null, link: null, settings: {}, error: null }; },
      setReady: (v) => { const me = lobby.players.find((p) => p.isLocal); if (me) me.ready = v; },
      setLoadout: (l) => { const me = lobby.players.find((p) => p.isLocal); if (me) me.loadout = l; },
      setSettings: (s) => { lobby.settings = s; },
      start: () => console.debug('[dev] mp.start'),
      state: () => lobby,
    },
    getLastResults: () => lastResults,
  };
  let menus;
  return { api, setMenus: (m) => { menus = m; } };
}

export function mountPreview(root) {
  const { api, setMenus } = makeStubApi();
  const canvas = document.createElement('canvas');
  input.attach(canvas);
  const menus = createMenus(api, root);
  setMenus(menus);
  menus.show('main');
  return menus;
}
