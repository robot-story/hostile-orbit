// Weapon and equipment definitions.
export const WEAPONS = {
  viper: {
    id: 'viper', name: 'VIPER AR', slot: 'primary', kind: 'rifle',
    damage: 26, headMult: 2.6, rpm: 720, auto: true, mag: 30, reserve: 210, maxReserve: 300,
    spread: 0.010, spreadAim: 0.004, bloom: 0.006, bloomMax: 0.05, spreadMove: 0.012,
    recoil: 0.018, recoilYaw: 0.006, kick: 0.35, range: 220, falloffStart: 60,
    reloadTime: 2.1, reloadType: 'mag', pellets: 1, tracer: '#7fe9ff', tracerEvery: 1,
    sound: 'viper_fire', reloadSounds: ['reload_mag_out', 'reload_mag_in', 'reload_bolt'],
    stats: { damage: 78, control: 65, mobility: 70, defence: 40 }, impulse: 1.2,
    description: 'Standard-issue Commonwealth assault rifle. Reliable, accurate, and legally distinct from a war crime.',
  },
  hammer: {
    id: 'hammer', name: 'HAMMER SHOTGUN', slot: 'primary', kind: 'shotgun',
    damage: 16, headMult: 2.0, rpm: 75, auto: false, mag: 8, reserve: 48, maxReserve: 72,
    spread: 0.045, spreadAim: 0.03, bloom: 0.0, bloomMax: 0.0, spreadMove: 0.01,
    recoil: 0.06, recoilYaw: 0.015, kick: 1.1, range: 45, falloffStart: 12,
    reloadTime: 0.55, reloadType: 'shell', pellets: 10, tracer: '#ffd17f', tracerEvery: 1,
    sound: 'hammer_fire', reloadSounds: ['reload_shotgun_shell'],
    stats: { damage: 95, control: 40, mobility: 60, defence: 40 }, impulse: 9,
    description: 'Close-quarters compliance tool. Removes limbs, doors and dissent.',
  },
  atlas: {
    id: 'atlas', name: 'ATLAS LMG', slot: 'primary', kind: 'lmg',
    damage: 30, headMult: 2.2, rpm: 640, auto: true, mag: 100, reserve: 300, maxReserve: 400,
    spread: 0.022, spreadAim: 0.009, bloom: 0.004, bloomMax: 0.06, spreadMove: 0.03,
    recoil: 0.022, recoilYaw: 0.01, kick: 0.45, range: 260, falloffStart: 80,
    reloadTime: 4.2, reloadType: 'mag', pellets: 1, tracer: '#9ff5ff', tracerEvery: 1,
    sound: 'atlas_fire', reloadSounds: ['reload_lmg_box', 'reload_bolt'],
    stats: { damage: 84, control: 45, mobility: 35, defence: 55 }, impulse: 1.8, moveMult: 0.85,
    description: 'Sustained suppression platform. Heavy enough to count as a second employee.',
  },
  longshot: {
    id: 'longshot', name: 'LONGSHOT MARKSMAN', slot: 'secondary', kind: 'sniper',
    damage: 140, headMult: 3.2, rpm: 48, auto: false, mag: 5, reserve: 30, maxReserve: 45,
    spread: 0.03, spreadAim: 0.0008, bloom: 0.02, bloomMax: 0.06, spreadMove: 0.05,
    recoil: 0.09, recoilYaw: 0.012, kick: 1.3, range: 400, falloffStart: 200, zoom: 0.3,
    reloadTime: 2.8, reloadType: 'mag', pellets: 1, tracer: '#c8f6ff', tracerEvery: 1, pierce: true,
    sound: 'atlas_fire', reloadSounds: ['reload_mag_out', 'reload_mag_in', 'reload_bolt'],
    stats: { damage: 98, control: 35, mobility: 55, defence: 40 }, impulse: 6,
    description: 'Long-range compliance instrument. One round, one reconsidered opinion.',
  },
  sidearm: {
    id: 'sidearm', name: 'P-9 CITIZEN', slot: 'secondary', kind: 'pistol', hidden: true,
    damage: 34, headMult: 3.0, rpm: 400, auto: false, mag: 12, reserve: 72, maxReserve: 96,
    spread: 0.012, spreadAim: 0.004, bloom: 0.01, bloomMax: 0.05, spreadMove: 0.01,
    recoil: 0.03, recoilYaw: 0.008, kick: 0.5, range: 120, falloffStart: 30,
    reloadTime: 1.5, reloadType: 'mag', pellets: 1, tracer: '#c8f6ff', tracerEvery: 1,
    sound: 'pistol_fire', reloadSounds: ['reload_mag_out', 'reload_mag_in'],
    stats: { damage: 55, control: 80, mobility: 95, defence: 40 }, impulse: 1.0,
    description: 'Compact sidearm issued to every citizen at birth. Batteries not included.',
  },
  // enemy weapons (stats used by AI)
  legion_rifle: { id: 'legion_rifle', name: 'NULL CARBINE', damage: 7, rpm: 560, burst: 4, burstPause: 1.3, spread: 0.05, range: 90, tracer: '#ff5a1f', sound: 'enemy_rifle_fire', impulse: 0.8 },
  legion_shotgun: { id: 'legion_shotgun', name: 'NULL SCATTER', damage: 5, rpm: 70, burst: 1, burstPause: 1.5, spread: 0.08, pellets: 8, range: 20, tracer: '#ff7a1a', sound: 'enemy_shotgun_fire', impulse: 4 },
  legion_heavy: { id: 'legion_heavy', name: 'NULL SUPPRESSOR', damage: 5, rpm: 800, burst: 18, burstPause: 2.4, spread: 0.075, range: 110, tracer: '#ff5a1f', sound: 'enemy_suppressor_fire', impulse: 0.6 },
};

export const GRENADE = { id: 'frag', name: 'FRAG', damage: 160, radius: 6.5, fuse: 3.0, count: 4, maxCount: 6, throwSpeed: 16, impulse: 14 };
export const INJECTOR = { id: 'injector', name: 'WELLNESS INJECTOR', heal: 65, duration: 1.6, count: 4, maxCount: 6, useTime: 1.4 };

export const ARMOUR = {
  orbital_assault: { id: 'orbital_assault', name: 'ORBITAL ASSAULT', health: 100, speed: 1.0, description: 'Balanced plating. Approved for most forms of dying.' },
};

export const ABILITIES = {
  kinetic: { id: 'kinetic', name: 'KINETIC STRIKE', key: 'ability1', cooldown: 45, delay: 3.2, radius: 13, damage: 900, description: 'Tungsten rod from orbit. Ruins the afternoon of everything within thirteen metres.' },
  gunship: { id: 'gunship', name: 'GUNSHIP RUN', key: 'ability2', cooldown: 60, delay: 4.0, radius: 6, damage: 140, description: 'Strafing run along your marker. Please stand somewhere else.' },
  sentry: { id: 'sentry', name: 'SENTRY POD', key: 'ability3', cooldown: 75, delay: 3.0, duration: 60, damage: 18, description: 'Autonomous turret pod. It does not check who signed its contract.' },
  supply: { id: 'supply', name: 'SUPPLY POD', key: 'ability4', cooldown: 90, delay: 3.0, description: 'Ammunition, grenades and wellness. Arrives at terminal velocity.' },
};

export const DIFFICULTIES = {
  recruit: { id: 'recruit', name: 'RECRUIT', enemyHp: 0.8, enemyDmg: 0.6, enemyCount: 0.75, accuracy: 0.7, xp: 0.8, lives: 5, description: 'A gentle introduction to state-sanctioned violence.' },
  veteran: { id: 'veteran', name: 'VETERAN', enemyHp: 1.0, enemyDmg: 1.0, enemyCount: 1.0, accuracy: 1.0, xp: 1.0, lives: 4, description: 'Standard operational risk. Death waiver applies.' },
  elite: { id: 'elite', name: 'ELITE', enemyHp: 1.15, enemyDmg: 1.35, enemyCount: 1.3, accuracy: 1.2, xp: 1.4, lives: 3, description: 'For Vanguards who have exceeded expectations and wish to exceed them posthumously.' },
  hostile: { id: 'hostile', name: 'HOSTILE', enemyHp: 1.3, enemyDmg: 1.8, enemyCount: 1.6, accuracy: 1.4, xp: 2.0, lives: 2, description: 'Management assumes no responsibility. Management never did.' },
};

export const DROP_ZONES = {
  main: { id: 'main', name: 'DROP ZONE // CANYON MOUTH', mapX: 200, mapY: 45, description: 'Designated landing pad. Fastest route north through the canyon.' },
  west: { id: 'west', name: 'WEST APPROACH // HIGH ROUTE', mapX: 120, mapY: 58, description: 'Rocky approach onto the high route. Longer, quieter, closer to the jammer.' },
  east: { id: 'east', name: 'EAST APPROACH // TRENCH ROUTE', mapX: 285, mapY: 58, description: 'Drop near the trench line. Heavier patrols, direct line to extraction later.' },
};
