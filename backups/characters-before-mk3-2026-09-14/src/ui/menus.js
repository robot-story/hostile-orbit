import './menus.css';
import { el, ToastStack, SubtitleBar, ObjectiveBanner, InteractPrompt, TacticalMapOverlay, ConfirmDialog } from './components.js';
import { createMainScreen } from './screens/main.js';
import { createOperationScreen } from './screens/operation.js';
import { createLoadoutScreen } from './screens/loadout.js';
import { createMultiplayerScreen } from './screens/multiplayer.js';
import { createArmouryScreen } from './screens/armoury.js';
import { createRecordScreen } from './screens/record.js';
import { createSettingsScreen } from './screens/settings.js';
import { createPauseScreen } from './screens/pause.js';
import { createResultsScreen } from './screens/results.js';

const NON_ESCAPABLE = new Set(['pause']);

export function createMenus(api, root) {
  const menuRoot = el('div', { class: 'menu-root' });
  root.appendChild(menuRoot);

  const wipe = el('div', { id: 'wipe' }, [el('div', { class: 'scan' })]);
  menuRoot.appendChild(wipe);

  const mgr = {
    _current: null,
    _pauseOpen: false,
    get current() { return mgr._current; },
    isOpen() { return !!mgr._current || mgr._pauseOpen; },
    toast(text, kind) { toastStack.push(text, kind); },
    banner(title, sub) { objectiveBanner.show({ title, sub }); },
    showSubtitle(data) { subtitleBar.show(data); },
    hideSubtitle() { subtitleBar.hide(); },
    setLoadingProgress(p) { /* boot progress owned by game.js; kept for API completeness */ },
    showInteract(text, progress) { interactPrompt.show(text, progress); },
    hideInteract() { interactPrompt.hide(); },
    showTacticalMap(state) { tacticalMap.show(state); },
    setTacticalMapTitle(name) { tacticalMap.setTitle(name); },
    onTacticalMapClose(fn) { tacticalMap.onClose = fn; },
    hideTacticalMap() { tacticalMap.hide(); },
    setMapImage(rel) { tacticalMap.setImage((import.meta.env.BASE_URL || '/') + rel); },
    confirm: null, // set below
    show,
    hide,
    openPause,
    closePause,
    showResults,
    showFailed,
    showDropSequence, showDeathReport,
  };

  const confirm = new ConfirmDialog(menuRoot, api);
  mgr.confirm = confirm;

  const screens = {
    main: createMainScreen(api, mgr),
    operation: createOperationScreen(api, mgr),
    loadout: createLoadoutScreen(api, mgr),
    multiplayer: createMultiplayerScreen(api, mgr),
    armoury: createArmouryScreen(api, mgr),
    record: createRecordScreen(api, mgr),
    settings: createSettingsScreen(api, mgr),
    results: createResultsScreen(api, mgr),
  };
  const pauseScreen = createPauseScreen(api, mgr);

  for (const key in screens) menuRoot.appendChild(screens[key].el);
  menuRoot.appendChild(pauseScreen.el);

  const toastStack = new ToastStack(root);
  const subtitleBar = new SubtitleBar(root, api.settings);
  const objectiveBanner = new ObjectiveBanner(root);
  const interactPrompt = new InteractPrompt(root);
  const mapUrl = (import.meta.env.BASE_URL || '/') + 'textures/menus/map_clean.jpg';
  const tacticalMap = new TacticalMapOverlay(root, mapUrl);

  let transitioning = false;
  let settingsReturnTo = 'main';

  function show(name, data) {
    if (!screens[name]) { console.warn('[menus] unknown screen', name); return; }
    if (mgr._current === name) { screens[name].onShow && screens[name].onShow(data); return; }
    const prev = mgr._current;
    mgr._current = name;
    api.events.emit('menu:open', name);
    const doSwap = () => {
      for (const key in screens) {
        const s = screens[key];
        if (key === name) { s.el.classList.add('visible'); s.onShow && s.onShow(data); }
        else { if (s.el.classList.contains('visible')) s.onHide && s.onHide(); s.el.classList.remove('visible'); }
      }
    };
    if (prev) transitionSwap(doSwap); else doSwap();
  }

  function hide() {
    for (const key in screens) { const s = screens[key]; if (s.el.classList.contains('visible')) s.onHide && s.onHide(); s.el.classList.remove('visible'); }
    mgr._current = null;
    closePause();
  }

  function transitionSwap(fn) {
    if (transitioning) { fn(); return; }
    transitioning = true;
    wipe.classList.add('on');
    setTimeout(() => { fn(); }, 220);
    setTimeout(() => { wipe.classList.remove('on'); transitioning = false; }, 450);
  }

  function openPause(data) {
    mgr._pauseOpen = true;
    pauseScreen.el.classList.add('visible');
    pauseScreen.onShow && pauseScreen.onShow(data);
  }
  function closePause() {
    mgr._pauseOpen = false;
    pauseScreen.el.classList.remove('visible');
    pauseScreen.onHide && pauseScreen.onHide();
  }

  function showResults(results) { show('results', { results, failed: false }); }
  function showFailed(results) { show('results', { results, failed: true }); }

  function showDropSequence(steps = ['DEPLOYMENT AUTHORISED', 'POD SEPARATION', 'ATMOSPHERIC ENTRY', 'IMPACT IN 3..2..1']) {
    const overlay = el('div', { class: 'drop-sequence' });
    const lineEls = steps.map((t) => el('div', { class: 'ds-line', text: t }));
    const countdown = el('div', { class: 'ds-countdown hidden' });
    lineEls.forEach((l) => overlay.appendChild(l));
    overlay.appendChild(countdown);
    menuRoot.appendChild(overlay);
    let curIdx = -1;
    const handle = {
      setStep(i) {
        curIdx = i;
        lineEls.forEach((l, idx) => { l.classList.toggle('active', idx === i); l.classList.toggle('done', idx < i); });
      },
      setCountdown(n) {
        if (n == null) { countdown.classList.add('hidden'); return; }
        countdown.classList.remove('hidden');
        countdown.textContent = n > 0 ? String(n) : 'IMPACT';
      },
      remove() { overlay.remove(); },
    };
    handle.setStep(0);
    return handle;
  }

  /** Death report (Counter-Strike style hold screen): cause of death, what this life achieved, respawn timer, then it
   *  becomes the pod status board until the replacement frame opens. */
  function showDeathReport(d) {
    const TIPS = ['Rolling frames take no damage for the first third of a roll. Roll through, not away.', 'Tap SPACE the instant before landing to slam. Everything nearby is knocked flat.', 'Ramps and rails carry speed. A fast frame is a hard target.', 'Every kill restores a sliver of hull. Aggression is Commonwealth policy.', 'Drones scan before they report. Kill them during the scan and the Legion never learns.', 'Aim while airborne to hover. The Legion looks up slowly.', 'Ram through crates and fence panels rather than around them.', 'Reinforcements land on the nearest launch pad. Fight near one.'];
    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const root = el('div', { class: 'death-report' });
    const head = el('div', { class: 'dr-head' }, [el('div', { class: 'dr-kicker', text: 'WORKFORCE CONTINUITY EVENT' }), el('h1', { text: 'FRAME LOST' }), el('div', { class: 'dr-sub', text: 'Your remains have been logged as Commonwealth property.' })]);
    const cause = el('div', { class: 'dr-cause panel' }, [el('span', { class: 'lbl', text: 'TERMINATED BY' }), el('b', { text: d.killer }), d.weapon ? el('span', { class: 'wp', text: d.weapon + (d.zone === 'head' ? '  //  HEAD' : '') }) : null]);
    const stat = (v, l) => el('div', { class: 'dr-stat' }, [el('b', { text: String(v) }), el('span', { text: l })]);
    const stats = el('div', { class: 'dr-stats' }, [stat(d.kills, 'KILLS THIS LIFE'), stat(d.damage, 'DAMAGE DEALT'), stat(fmt(d.survived), 'SURVIVED'), stat(d.lives, 'REINFORCEMENTS LEFT')]);
    const bar = el('div', { class: 'dr-bar' }, [el('i')]); const timer = el('div', { class: 'dr-timer' }, [el('span', { text: 'REPLACEMENT FRAME IN' }), el('b', { text: d.wait.toFixed(1) })]);
    const tip = el('div', { class: 'dr-tip', text: 'FIELD NOTE  //  ' + TIPS[(Math.random() * TIPS.length) | 0] });
    const steps = el('div', { class: 'dr-steps' });
    root.append(head, cause, stats, timer, bar, steps, tip);
    menuRoot.appendChild(root); setTimeout(() => root.classList.add('on'), 20);
    const t0 = performance.now(); let raf = 0; let podMode = false;
    const tick = () => { if (podMode) return; const t = (performance.now() - t0) / 1000; const left = Math.max(0, d.wait - t); timer.querySelector('b').textContent = left.toFixed(1); bar.querySelector('i').style.width = `${Math.min(100, t / d.wait * 100)}%`; raf = setTimeout(tick, 50); };
    raf = setTimeout(tick, 50);
    const lineEls = [];
    const handle = {
      el: root,
      toPod(stepNames) {
        podMode = true; clearTimeout(raf); timer.querySelector('span').textContent = 'POD INBOUND'; timer.querySelector('b').textContent = ''; bar.querySelector('i').style.width = '100%'; root.classList.add('pod');
        steps.innerHTML = ''; lineEls.length = 0; for (const n of stepNames) { const l = el('div', { class: 'ds-line', text: n }); lineEls.push(l); steps.appendChild(l); }
        handle.setStep(0); return handle;
      },
      setStep(i) { lineEls.forEach((l, idx) => { l.classList.toggle('active', idx === i); l.classList.toggle('done', idx < i); }); },
      setCountdown(n) { if (n == null) { timer.querySelector('b').textContent = ''; return; } timer.querySelector('b').textContent = n > 0 ? String(n) : 'IMPACT'; },
      remove() { clearTimeout(raf); root.classList.remove('on'); setTimeout(() => root.remove(), 350); },
    };
    return handle;
  }

  // Escape handling: close current sub-screen back to main (not while paused).
  api.events.on('input:keydown', (code) => {
    if (code !== 'Escape') return;
    if (mgr._pauseOpen) return;
    if (mgr._current && mgr._current !== 'main') show('main');
  });

  api.events.on('subtitle:show', (d) => mgr.showSubtitle(d));
  api.events.on('subtitle:hide', () => mgr.hideSubtitle());
  api.events.on('toast', (text, kind) => mgr.toast(text, kind));
  api.events.on('objective:banner', (d) => mgr.banner(d.title, d.sub));
  api.events.on('mp:error', (msg) => mgr.toast(msg, 'warn'));
  api.events.on('lobby:update', () => {});

  return mgr;
}
