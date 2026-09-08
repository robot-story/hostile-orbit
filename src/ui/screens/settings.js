import { el, tabBar, sliderRow, toggleRow, selectRow, swatchRow, bindRow, actionButton } from '../components.js';
import { DEFAULT_BINDS, BIND_LABELS } from '../../core/settings.js';

const DESCRIPTIONS = {
  mouseSensitivity: 'Adjusts overall mouse look sensitivity while free-aiming.',
  aimSensitivity: 'Adjusts mouse sensitivity while aiming down sights.',
  invertY: 'Inverts the vertical look axis.',
  aimToggle: 'Press to toggle aiming instead of holding the button.',
  crouchToggle: 'Press to toggle crouch instead of holding the button.',
  sprintToggle: 'Press to toggle sprint instead of holding the button.',
  showFps: 'Displays a frame-rate counter in the corner of the screen.',
  binds: 'Click a control to rebind it. Press Escape while capturing to cancel.',
  resetBinds: 'Restores every control binding to factory default.',
  quality: 'Overall rendering quality preset. Affects shadows, effects and texture resolution.',
  renderScale: 'Renders the game at a fraction of your display resolution for extra performance.',
  fov: 'Field of view, in degrees.',
  bloom: 'Enables bloom glow on bright light sources.',
  shadows: 'Enables dynamic shadow rendering.',
  particles: 'Density of particle effects such as sparks, smoke and debris.',
  fullscreen: 'Toggles fullscreen display mode.',
  masterVolume: 'Overall output volume.',
  musicVolume: 'Volume of the score and ambient stings.',
  sfxVolume: 'Volume of weapons, explosions and environment effects.',
  voiceVolume: 'Volume of mission voice lines and radio chatter.',
  ambienceVolume: 'Volume of background ambience.',
  subtitles: 'Shows subtitles for voice lines.',
  subtitleSize: 'Adjusts the text size of subtitles.',
  screenShake: 'Intensity of camera shake from impacts and explosions.',
  cameraSway: 'Intensity of idle weapon and camera sway.',
  crosshairColor: 'Colour of the aiming crosshair.',
  hudScale: 'Scales the size of the entire heads-up display.',
  hitFlash: 'Flashes the screen red when you take damage.',
  reduceFlashing: 'Reduces strobing and rapid flashing effects.',
  colorblindMode: 'Applies a colour-correction filter tuned for colour vision deficiency.',
  gore: 'Controls the amount of dismemberment and blood shown.',
  bloodDecals: 'Leaves persistent blood decals on surfaces.',
  dismemberment: 'Allows limbs to be removed from enemies.',
};

export function createSettingsScreen(api, mgr) {
  const root = el('div', { class: 'screen settings-screen' });
  let saidHello = false;
  let activeTab = 'gameplay';
  const s = api.settings;

  const descTitle = el('div', { class: 'sd-title' });
  const descText = el('div', { class: 'sd-text' });
  function setDesc(key, labelOverride) {
    descTitle.textContent = labelOverride || key.toUpperCase();
    descText.textContent = DESCRIPTIONS[key] || '';
  }

  function gameplayTab() {
    const c = el('div');
    c.appendChild(sliderRow(api, { label: 'Mouse Sensitivity', value: s.data.mouseSensitivity, min: 0.1, max: 3, step: 0.05, format: (v) => v.toFixed(2), onChange: (v) => s.set('mouseSensitivity', v), onSelect: () => setDesc('mouseSensitivity', 'Mouse Sensitivity') }));
    c.appendChild(sliderRow(api, { label: 'Aim Sensitivity', value: s.data.aimSensitivity, min: 0.1, max: 3, step: 0.05, format: (v) => v.toFixed(2), onChange: (v) => s.set('aimSensitivity', v), onSelect: () => setDesc('aimSensitivity', 'Aim Sensitivity') }));
    c.appendChild(toggleRow(api, { label: 'Invert Y', value: s.data.invertY, onChange: (v) => s.set('invertY', v), onSelect: () => setDesc('invertY', 'Invert Y') }));
    c.appendChild(toggleRow(api, { label: 'Aim Toggle', value: s.data.aimToggle, onChange: (v) => s.set('aimToggle', v), onSelect: () => setDesc('aimToggle', 'Aim Toggle') }));
    c.appendChild(toggleRow(api, { label: 'Crouch Toggle', value: s.data.crouchToggle, onChange: (v) => s.set('crouchToggle', v), onSelect: () => setDesc('crouchToggle', 'Crouch Toggle') }));
    c.appendChild(toggleRow(api, { label: 'Sprint Toggle', value: s.data.sprintToggle, onChange: (v) => s.set('sprintToggle', v), onSelect: () => setDesc('sprintToggle', 'Sprint Toggle') }));
    c.appendChild(toggleRow(api, { label: 'Show FPS', value: s.data.showFps, onChange: (v) => s.set('showFps', v), onSelect: () => setDesc('showFps', 'Show FPS') }));
    return c;
  }

  function controlsTab() {
    const c = el('div');
    Object.keys(DEFAULT_BINDS).forEach((action) => {
      const { row } = bindRow(api, {
        action, label: BIND_LABELS[action], code: s.data.binds[action],
        onRebind: (code) => s.setBind(action, code),
        onSelect: () => setDesc('binds', BIND_LABELS[action]),
      });
      c.appendChild(row);
    });
    c.appendChild(el('div', { class: 'settings-reset' }, [actionButton(api, { label: 'RESET TO DEFAULTS', onClick: () => { s.resetBinds(); renderTab(); mgr.toast('CONTROLS RESET', 'info'); } })]));
    return c;
  }

  function graphicsTab() {
    const c = el('div');
    c.appendChild(selectRow(api, { label: 'Quality', value: s.data.quality, options: ['low', 'medium', 'high', 'ultra'].map((v) => ({ value: v, label: v })), onChange: (v) => s.set('quality', v), onSelect: () => setDesc('quality', 'Quality') }));
    c.appendChild(sliderRow(api, { label: 'Render Scale', value: s.data.renderScale, min: 0.5, max: 1.25, step: 0.05, format: (v) => v.toFixed(2), onChange: (v) => s.set('renderScale', v), onSelect: () => setDesc('renderScale', 'Render Scale') }));
    c.appendChild(sliderRow(api, { label: 'Field of View', value: s.data.fov, min: 60, max: 100, step: 1, format: (v) => Math.round(v) + '°', onChange: (v) => s.set('fov', v), onSelect: () => setDesc('fov', 'Field of View') }));
    c.appendChild(toggleRow(api, { label: 'Bloom', value: s.data.bloom, onChange: (v) => s.set('bloom', v), onSelect: () => setDesc('bloom', 'Bloom') }));
    c.appendChild(toggleRow(api, { label: 'Shadows', value: s.data.shadows, onChange: (v) => s.set('shadows', v), onSelect: () => setDesc('shadows', 'Shadows') }));
    c.appendChild(sliderRow(api, { label: 'Particle Density', value: s.data.particles, min: 0, max: 1, step: 0.05, onChange: (v) => s.set('particles', v), onSelect: () => setDesc('particles', 'Particle Density') }));
    c.appendChild(toggleRow(api, { label: 'Fullscreen', value: s.data.fullscreen, onChange: (v) => { s.set('fullscreen', v); api.setFullscreen(v); }, onSelect: () => setDesc('fullscreen', 'Fullscreen') }));
    return c;
  }

  function audioTab() {
    const c = el('div');
    [['masterVolume', 'Master Volume'], ['musicVolume', 'Music Volume'], ['sfxVolume', 'SFX Volume'], ['voiceVolume', 'Voice Volume'], ['ambienceVolume', 'Ambience Volume']].forEach(([k, label]) => {
      c.appendChild(sliderRow(api, { label, value: s.data[k], onChange: (v) => s.set(k, v), onSelect: () => setDesc(k, label) }));
    });
    return c;
  }

  function accessibilityTab() {
    const c = el('div');
    c.appendChild(toggleRow(api, { label: 'Subtitles', value: s.data.subtitles, onChange: (v) => s.set('subtitles', v), onSelect: () => setDesc('subtitles', 'Subtitles') }));
    c.appendChild(selectRow(api, { label: 'Subtitle Size', value: s.data.subtitleSize, options: ['small', 'medium', 'large'].map((v) => ({ value: v, label: v })), onChange: (v) => s.set('subtitleSize', v), onSelect: () => setDesc('subtitleSize', 'Subtitle Size') }));
    c.appendChild(sliderRow(api, { label: 'Screen Shake', value: s.data.screenShake, min: 0, max: 2, step: 0.05, onChange: (v) => s.set('screenShake', v), onSelect: () => setDesc('screenShake', 'Screen Shake') }));
    c.appendChild(sliderRow(api, { label: 'Camera Sway', value: s.data.cameraSway, min: 0, max: 2, step: 0.05, onChange: (v) => s.set('cameraSway', v), onSelect: () => setDesc('cameraSway', 'Camera Sway') }));
    c.appendChild(swatchRow(api, { label: 'Crosshair Colour', value: s.data.crosshairColor, options: ['#00e5ff', '#ffffff', '#3dff9a', '#ffb020', '#ff3bd4'], onChange: (v) => s.set('crosshairColor', v), onSelect: () => setDesc('crosshairColor', 'Crosshair Colour') }));
    c.appendChild(sliderRow(api, { label: 'HUD Scale', value: s.data.hudScale, min: 0.7, max: 1.3, step: 0.05, format: (v) => v.toFixed(2), onChange: (v) => s.set('hudScale', v), onSelect: () => setDesc('hudScale', 'HUD Scale') }));
    c.appendChild(toggleRow(api, { label: 'Hit Flash', value: s.data.hitFlash, onChange: (v) => s.set('hitFlash', v), onSelect: () => setDesc('hitFlash', 'Hit Flash') }));
    c.appendChild(toggleRow(api, { label: 'Reduce Flashing', value: s.data.reduceFlashing, onChange: (v) => s.set('reduceFlashing', v), onSelect: () => setDesc('reduceFlashing', 'Reduce Flashing') }));
    c.appendChild(selectRow(api, { label: 'Colourblind Mode', value: s.data.colorblindMode, options: ['off', 'deuteranopia', 'protanopia', 'tritanopia'].map((v) => ({ value: v, label: v })), onChange: (v) => s.set('colorblindMode', v), onSelect: () => setDesc('colorblindMode', 'Colourblind Mode') }));
    return c;
  }

  function goreTab() {
    const c = el('div');
    c.appendChild(selectRow(api, { label: 'Gore Level', value: s.data.gore, options: [{ value: 'full', label: 'full' }, { value: 'reduced', label: 'reduced' }, { value: 'off', label: 'off' }], onChange: (v) => s.set('gore', v), onSelect: () => setDesc('gore', 'Gore Level') }));
    c.appendChild(toggleRow(api, { label: 'Blood Decals', value: s.data.bloodDecals, onChange: (v) => s.set('bloodDecals', v), onSelect: () => setDesc('bloodDecals', 'Blood Decals') }));
    c.appendChild(toggleRow(api, { label: 'Dismemberment', value: s.data.dismemberment, onChange: (v) => s.set('dismemberment', v), onSelect: () => setDesc('dismemberment', 'Dismemberment') }));
    return c;
  }

  const TABS = { gameplay: gameplayTab, controls: controlsTab, graphics: graphicsTab, audio: audioTab, accessibility: accessibilityTab, gore: goreTab };
  const mid = el('div', { class: 'settings-mid' });

  function renderTab() {
    mid.innerHTML = '';
    mid.appendChild(TABS[activeTab]());
    setDesc(activeTab, activeTab.toUpperCase());
  }

  function render() {
    root.innerHTML = '';
    const tabs = tabBar(api, [
      { id: 'gameplay', label: 'GAMEPLAY' }, { id: 'controls', label: 'CONTROLS' }, { id: 'graphics', label: 'GRAPHICS' },
      { id: 'audio', label: 'AUDIO' }, { id: 'accessibility', label: 'ACCESSIBILITY' }, { id: 'gore', label: 'GORE' },
    ], activeTab, (id) => { activeTab = id; renderTab(); });
    root.appendChild(el('div', { class: 'settings-tabs' }, [tabs.el]));
    root.appendChild(mid);
    root.appendChild(el('div', { class: 'settings-desc' }, [descTitle, descText]));
    renderTab();
  }

  return {
    el: root,
    onShow() { if (!saidHello) { saidHello = true; api.say('ship_settings'); } render(); },
    onHide() {},
  };
}
