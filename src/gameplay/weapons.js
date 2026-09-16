// Weapon and equipment definitions.
export const WEAPONS = {
  viper: {
    id: 'viper', name: 'VIPER AR', slot: 'primary', kind: 'rifle',
    damage: 34, headMult: 2.6, rpm: 720, auto: true, mag: 30, reserve: 210, maxReserve: 300,
    spread: 0.010, spreadAim: 0.004, bloom: 0.006, bloomMax: 0.05, spreadMove: 0.012,
    recoil: 0.018, recoilYaw: 0.006, kick: 0.35, range: 220, falloffStart: 60,
    reloadTime: 1.05, reloadType: 'mag', pellets: 1, tracer: '#7fe9ff', tracerEvery: 1,
    sound: 'viper_fire', reloadSounds: ['reload_mag_out', 'reload_mag_in', 'reload_bolt'],
    stats: { damage: 78, control: 65, mobility: 70, defence: 40 }, impulse: 1.2,
    description: 'Standard-issue Commonwealth assault rifle. Reliable, accurate, and legally distinct from a war crime.',
  },
  hammer: {
    id: 'hammer', name: 'HAMMER SHOTGUN', slot: 'primary', kind: 'shotgun',
    damage: 23, headMult: 2.0, rpm: 75, auto: false, mag: 8, reserve: 48, maxReserve: 72,
    spread: 0.062, spreadAim: 0.042, bloom: 0.0, bloomMax: 0.0, spreadMove: 0.012,
    recoil: 0.06, recoilYaw: 0.015, kick: 1.1, range: 45, falloffStart: 12,
    reloadTime: 0.4, reloadType: 'shell', pellets: 11, tracer: '#ffd17f', tracerEvery: 1,
    sound: 'hammer_fire', reloadSounds: ['reload_shotgun_shell'],
    stats: { damage: 95, control: 40, mobility: 60, defence: 40 }, impulse: 9,
    description: 'Close-quarters compliance tool. Removes limbs, doors and dissent.',
  },
  atlas: {
    id: 'atlas', name: 'ATLAS LMG', slot: 'primary', kind: 'lmg',
    damage: 38, headMult: 2.2, rpm: 640, auto: true, mag: 100, reserve: 300, maxReserve: 400,
    spread: 0.022, spreadAim: 0.009, bloom: 0.004, bloomMax: 0.06, spreadMove: 0.03,
    recoil: 0.022, recoilYaw: 0.01, kick: 0.45, range: 260, falloffStart: 80,
    reloadTime: 2.1, reloadType: 'mag', pellets: 1, tracer: '#9ff5ff', tracerEvery: 1,
    sound: 'atlas_fire', reloadSounds: ['reload_lmg_box', 'reload_bolt'],
    stats: { damage: 84, control: 45, mobility: 35, defence: 55 }, impulse: 1.8, moveMult: 0.85,
    description: 'Sustained suppression platform. Heavy enough to count as a second employee.',
  },
  longshot: {
    id: 'longshot', name: 'LONGSHOT MARKSMAN', slot: 'secondary', kind: 'sniper',
    damage: 180, headMult: 3.2, rpm: 48, auto: false, mag: 5, reserve: 30, maxReserve: 45,
    spread: 0.03, spreadAim: 0.0008, bloom: 0.02, bloomMax: 0.06, spreadMove: 0.05,
    recoil: 0.09, recoilYaw: 0.012, kick: 1.3, range: 400, falloffStart: 200, zoom: 0.3,
    reloadTime: 1.5, reloadType: 'mag', pellets: 1, tracer: '#c8f6ff', tracerEvery: 1, pierce: true,
    sound: 'atlas_fire', reloadSounds: ['reload_mag_out', 'reload_mag_in', 'reload_bolt'],
    stats: { damage: 98, control: 35, mobility: 55, defence: 40 }, impulse: 6,
    description: 'Long-range compliance instrument. One round, one reconsidered opinion.',
  },
  sidearm: {
    id: 'sidearm', name: 'P-9 CITIZEN', slot: 'secondary', kind: 'pistol', hidden: true,
    damage: 42, headMult: 3.0, rpm: 400, auto: false, mag: 12, reserve: 72, maxReserve: 96,
    spread: 0.012, spreadAim: 0.004, bloom: 0.01, bloomMax: 0.05, spreadMove: 0.01,
    recoil: 0.03, recoilYaw: 0.008, kick: 0.5, range: 120, falloffStart: 30,
    reloadTime: 0.9, reloadType: 'mag', pellets: 1, tracer: '#c8f6ff', tracerEvery: 1,
    sound: 'pistol_fire', reloadSounds: ['reload_mag_out', 'reload_mag_in'],
    stats: { damage: 55, control: 80, mobility: 95, defence: 40 }, impulse: 1.0,
    description: 'Compact sidearm issued to every citizen at birth. Batteries not included.',
  },
  reaper: {
    id: 'reaper', name: 'REAPER SMG', slot: 'primary', kind: 'smg',
    damage: 22, headMult: 2.4, rpm: 1050, auto: true, mag: 45, reserve: 270, maxReserve: 360,
    spread: 0.016, spreadAim: 0.007, bloom: 0.005, bloomMax: 0.06, spreadMove: 0.006,
    recoil: 0.012, recoilYaw: 0.009, kick: 0.25, range: 120, falloffStart: 28,
    reloadTime: 1.0, reloadType: 'mag', pellets: 1, tracer: '#b8ff7a', tracerEvery: 2,
    sound: 'pistol_fire', reloadSounds: ['reload_mag_out', 'reload_mag_in'],
    stats: { damage: 62, control: 70, mobility: 92, defence: 40 }, impulse: 0.8, moveMult: 1.06,
    description: 'Rolling-frame personal defence weapon. Shoots as fast as you can regret it.',
  },
  breaker: {
    id: 'breaker', name: 'BREAKER AUTO-SHOTGUN', slot: 'primary', kind: 'shotgun',
    damage: 16, headMult: 1.8, rpm: 210, auto: true, mag: 12, reserve: 60, maxReserve: 84,
    spread: 0.075, spreadAim: 0.05, bloom: 0.004, bloomMax: 0.03, spreadMove: 0.01,
    recoil: 0.045, recoilYaw: 0.02, kick: 0.9, range: 32, falloffStart: 9,
    reloadTime: 1.4, reloadType: 'mag', pellets: 9, tracer: '#ffd17f', tracerEvery: 1,
    sound: 'hammer_fire', reloadSounds: ['reload_lmg_box', 'reload_bolt'],
    stats: { damage: 90, control: 30, mobility: 55, defence: 40 }, impulse: 7,
    description: 'Drum-fed room clearance. The Ministry recommends closing the door first.',
  },
  javelin: {
    id: 'javelin', name: 'JAVELIN LAUNCHER', slot: 'primary', kind: 'launcher',
    damage: 40, headMult: 1.0, rpm: 42, auto: false, mag: 3, reserve: 12, maxReserve: 18,
    spread: 0.004, spreadAim: 0.001, bloom: 0.0, bloomMax: 0.0, spreadMove: 0.02,
    recoil: 0.11, recoilYaw: 0.02, kick: 1.6, range: 260, falloffStart: 200,
    reloadTime: 2.2, reloadType: 'mag', pellets: 1, tracer: '#ffb347', tracerEvery: 1,
    explosive: { radius: 4.6, damage: 240, impulse: 16 },
    sound: 'enemy_suppressor_fire', reloadSounds: ['reload_lmg_box', 'reload_bolt'],
    stats: { damage: 100, control: 25, mobility: 40, defence: 40 }, impulse: 12, moveMult: 0.88,
    description: 'Shoulder-fired area denial. Denies the area to everyone, including the area.',
  },
  lancer: {
    id: 'lancer', name: 'LANCER RAIL', slot: 'secondary', kind: 'sniper',
    damage: 120, headMult: 3.0, rpm: 90, auto: false, mag: 8, reserve: 40, maxReserve: 56,
    spread: 0.02, spreadAim: 0.001, bloom: 0.012, bloomMax: 0.04, spreadMove: 0.03,
    recoil: 0.06, recoilYaw: 0.008, kick: 0.9, range: 380, falloffStart: 220, zoom: 0.45, pierce: true,
    reloadTime: 1.3, reloadType: 'mag', pellets: 1, tracer: '#d8b4ff', tracerEvery: 1,
    sound: 'atlas_fire', reloadSounds: ['reload_mag_out', 'reload_mag_in'],
    stats: { damage: 88, control: 55, mobility: 65, defence: 40 }, impulse: 5,
    description: 'Magnetic rail marksman piece. Quiet, precise, and it goes through the first thing it meets.',
  },
  arc: {
    id: 'arc', name: 'ARC PROJECTOR', slot: 'secondary', kind: 'arc',
    damage: 30, headMult: 1.2, rpm: 300, auto: true, mag: 60, reserve: 240, maxReserve: 300,
    spread: 0.03, spreadAim: 0.02, bloom: 0.0, bloomMax: 0.0, spreadMove: 0.0,
    recoil: 0.004, recoilYaw: 0.002, kick: 0.1, range: 26, falloffStart: 22,
    reloadTime: 1.8, reloadType: 'mag', pellets: 1, tracer: '#7fe9ff', tracerEvery: 1, chain: { count: 3, range: 6, falloff: 0.6 },
    sound: 'kinetic_charge', reloadSounds: ['reload_mag_out', 'reload_mag_in'],
    stats: { damage: 66, control: 90, mobility: 80, defence: 40 }, impulse: 2,
    description: 'Short-range lightning that jumps between Legion frames. Do not use in the rain.',
  },
  // enemy weapons (stats used by AI)
  legion_rifle: { id: 'legion_rifle', name: 'NULL CARBINE', damage: 7, rpm: 560, burst: 4, burstPause: 1.3, spread: 0.05, range: 90, tracer: '#ff5a1f', sound: 'enemy_rifle_fire', impulse: 0.8 },
  legion_shotgun: { id: 'legion_shotgun', name: 'NULL SCATTER', damage: 5, rpm: 70, burst: 1, burstPause: 1.5, spread: 0.08, pellets: 8, range: 20, tracer: '#ff7a1a', sound: 'enemy_shotgun_fire', impulse: 4 },
  legion_heavy: { id: 'legion_heavy', name: 'NULL SUPPRESSOR', damage: 5, rpm: 800, burst: 18, burstPause: 2.4, spread: 0.075, range: 110, tracer: '#ff5a1f', sound: 'enemy_suppressor_fire', impulse: 0.6 },
};

/** Frame highlight variants: the same OUTRIDER, tuned a touch differently. Preference, not power. */
export const FRAME_VARIANTS = {
  '#00e5ff': { id: 'cyan', name: 'KESTREL-7', face: 'kestrel', role: 'BALANCED', blurb: 'Standard issue. No surprises.', hp: 1.0, speed: 1.0, fuel: 1.0, ram: 1.0 },
  '#ffb020': { id: 'amber', name: 'BASTION-4', face: 'bastion', role: 'ARMOURED', blurb: '+12% frame integrity, a touch slower.', hp: 1.12, speed: 0.97, fuel: 1.0, ram: 1.1 },
  '#c44dff': { id: 'violet', name: 'WRAITH-3', face: 'wraith', role: 'SWIFT', blurb: '+6% pace, thinner plating.', hp: 0.92, speed: 1.06, fuel: 1.0, ram: 0.95 },
  '#7dff5a': { id: 'lime', name: 'JOLT-9', face: 'jolt', role: 'HIGH-FLYER', blurb: '+35% jet fuel, standard plating.', hp: 0.97, speed: 1.0, fuel: 1.35, ram: 1.0 },
};
export const GRENADE = { id: 'frag', name: 'FRAG', damage: 160, radius: 6.5, fuse: 3.0, count: 4, maxCount: 6, throwSpeed: 16, impulse: 14 };
export const INJECTOR = { id: 'injector', name: 'WELLNESS INJECTOR', heal: 65, duration: 1.6, count: 4, maxCount: 6, useTime: 1.4 };


export const ABILITIES = {
  kinetic: { id: 'kinetic', name: 'KINETIC STRIKE', key: 'ability1', code: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowDown'], cooldown: 45, delay: 3.2, radius: 13, damage: 900, description: 'Tungsten rod from orbit. Ruins the afternoon of everything within thirteen metres.' },
  gunship: { id: 'gunship', name: 'GUNSHIP RUN', key: 'ability2', code: ['ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowLeft'], cooldown: 60, delay: 4.0, radius: 6, damage: 140, description: 'Strafing run along your marker. Please stand somewhere else.' },
  sentry: { id: 'sentry', name: 'SENTRY POD', key: 'ability3', code: ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowUp'], cooldown: 75, delay: 3.0, duration: 60, damage: 18, description: 'Autonomous turret pod. It does not check who signed its contract.' },
  supply: { id: 'supply', name: 'SUPPLY POD', key: 'ability4', code: ['ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp'], cooldown: 90, delay: 3.0, description: 'Ammunition, grenades and wellness. Arrives at terminal velocity.' },
};

export const DIFFICULTIES = {
  recruit: { id:'recruit', name:'RECRUIT', enemyHp:.8, enemyDmg:.6, enemyCount:.7, accuracy:.7, perception:.8, reaction:1.4, reinforcements:1, xp:.8, lives:5, description:'Fewer enemies, slower reactions, forgiving incoming damage.' },
  veteran: { id:'veteran', name:'VETERAN', enemyHp:1, enemyDmg:.9, enemyCount:.9, accuracy:.9, perception:.9, reaction:1.15, reinforcements:2, xp:1, lives:4, description:'Standard resistance with room to reposition and clear sectors.' },
  elite: { id:'elite', name:'ELITE', enemyHp:1.1, enemyDmg:1.2, enemyCount:1.1, accuracy:1.1, perception:1, reaction:1, reinforcements:3, xp:1.4, lives:3, description:'More coordinated resistance, faster reactions and greater rewards.' },
  hostile: { id:'hostile', name:'HOSTILE', enemyHp:1.2, enemyDmg:1.5, enemyCount:1.3, accuracy:1.2, perception:1.05, reaction:.9, reinforcements:4, xp:2, lives:2, description:'Heavy resistance and lethal fire. Cover and movement are essential.' },
};

export const DROP_ZONES = {
  main: { id: 'main', name: 'DROP ZONE // CANYON MOUTH', mapX: 200, mapY: 45, description: 'Designated landing pad. Fastest route north through the canyon.' },
  west: { id: 'west', name: 'WEST APPROACH // HIGH ROUTE', mapX: 120, mapY: 58, description: 'Rocky approach onto the high route. Longer, quieter, closer to the jammer.' },
  east: { id: 'east', name: 'EAST APPROACH // TRENCH ROUTE', mapX: 285, mapY: 58, description: 'Drop near the trench line. Heavier patrols, direct line to extraction later.' },
};
