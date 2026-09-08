import { el, menuButton } from '../components.js';

export function createMainScreen(api, mgr) {
  const root = el('div', { class: 'screen main-screen' });
  let saidWelcome = false;
  let clockTimer = null;

  function build() {
    root.innerHTML = '';
    const title = el('div', { class: 'main-title' }, [
      el('div', { text: 'HOSTILE' }),
      el('div', { text: 'ORBIT' }),
      el('div', { class: 'accent-line' }),
    ]);

    const hasOp = !!(api.hasOperation && api.hasOperation());
    const inLobby = api.mp.state().connected;
    const list = el('div', { class: 'main-menu-list stagger' });
    const items = [
      hasOp && menuButton(api, { label: 'Continue Operation', onClick: () => { api.continueOperation(); } }),
      menuButton(api, { label: inLobby ? 'Return to Squad' : 'New Deployment', onClick: () => mgr.show('operation') }),
      !inLobby && menuButton(api, { label: 'Single Player', onClick: () => mgr.show('operation') }),
      menuButton(api, { label: 'Multiplayer', onClick: () => mgr.show('multiplayer') }),
      menuButton(api, { label: 'Armoury', onClick: () => mgr.show('armoury') }),
      menuButton(api, { label: 'Combat Record', onClick: () => mgr.show('record') }),
      menuButton(api, { label: 'Settings', onClick: () => mgr.show('settings') }),
      menuButton(api, { label: 'Quit', onClick: () => api.quit() }),
    ].filter(Boolean);
    items.forEach((b, i) => list.appendChild(b));
    // keyboard nav
    let focusIdx = 0;
    const focusables = items;
    function setFocus(i) {
      focusIdx = (i + focusables.length) % focusables.length;
      focusables.forEach((b) => b.classList.remove('focus'));
      focusables[focusIdx].classList.add('focus');
    }
    root.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { setFocus(focusIdx + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { setFocus(focusIdx - 1); e.preventDefault(); }
      else if (e.key === 'Enter') { focusables[focusIdx].click(); }
    };
    setFocus(0);

    const clock = el('span', { class: 'clock' });
    const rank = el('div', { class: 'rank' }, [
      el('b', { text: `LEVEL ${api.save.profile.level}` }),
      el('span', { text: `${api.save.profile.xp} XP` }),
    ]);
    const footer = el('div', { class: 'main-footer' }, [
      el('span', { text: 'BLACKSITE MERIDIAN // ORBIT STABLE  //  ' }, ),
      clock,
      rank,
    ]);
    // fix: keep footer left text + clock together
    footer.innerHTML = '';
    footer.appendChild(el('div', {}, [el('span', { text: 'BLACKSITE MERIDIAN // ORBIT STABLE // ' }), clock]));
    footer.appendChild(rank);

    root.appendChild(title);
    root.appendChild(list);
    root.appendChild(footer);

    clearInterval(clockTimer);
    const tick = () => { clock.textContent = new Date().toUTCString().slice(17, 25) + ' UTC'; };
    tick();
    clockTimer = setInterval(tick, 1000);

    root.tabIndex = 0;
    root.focus();
  }

  return {
    el: root,
    onShow() {
      build();
      api.music('menu');
      api.preview.setMode('menu');
      if (!saidWelcome) { saidWelcome = true; api.say('ship_menu_welcome'); }
    },
    onHide() { clearInterval(clockTimer); },
  };
}
