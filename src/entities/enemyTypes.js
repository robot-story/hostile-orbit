// Null Legion unit definitions. Regular units die to a short accurate burst; the Warden is a boss (warden.js).
export const ENEMY_TYPES = {
  rifleman: {
    id: 'rifleman', name: 'RIFLEMAN', style: 'legion', scale: 1.0, health: 95, armour: { chest: 40, head: 0 },
    weapon: 'legion_rifle', speed: 4.6, sprint: 6.4, preferredRange: [14, 32], usesCover: true, accuracy: 1.0, reactionTime: 0.55,
    xp: 40, gibThreshold: 0.55, staggerThreshold: 28, mass: 1.0, voiceBarks: ['lg_contact', 'lg_freedom', 'lg_citizens', 'lg_contract'],
  },
  breacher: {
    id: 'breacher', name: 'BREACHER', style: 'legion', scale: 1.05, health: 130, armour: { chest: 60, head: 0 },
    weapon: 'legion_shotgun', speed: 5.4, sprint: 7.4, preferredRange: [3, 9], usesCover: false, accuracy: 0.9, reactionTime: 0.35, rusher: true,
    xp: 55, gibThreshold: 0.5, staggerThreshold: 40, mass: 1.2, voiceBarks: ['lg_contact', 'lg_replace', 'lg_not_first'],
  },
  suppressor: {
    id: 'suppressor', name: 'SUPPRESSOR', style: 'legionHeavy', scale: 1.18, health: 320, armour: { chest: 140, head: 30 },
    weapon: 'legion_heavy', speed: 3.0, sprint: 4.0, preferredRange: [18, 45], usesCover: true, accuracy: 0.8, reactionTime: 0.8, heavy: true,
    xp: 110, gibThreshold: 0.45, staggerThreshold: 90, mass: 2.2, voiceBarks: ['lg_suppress', 'lg_buried'],
  },
  grenadier: {
    id: 'grenadier', name: 'GRENADIER', style: 'legion', scale: 1.0, health: 100, armour: { chest: 40, head: 0 },
    weapon: 'legion_rifle', speed: 4.4, sprint: 6.0, preferredRange: [20, 40], usesCover: true, accuracy: 0.85, reactionTime: 0.6, grenadier: true, grenadeInterval: [6, 10],
    xp: 60, gibThreshold: 0.55, staggerThreshold: 28, mass: 1.0, voiceBarks: ['lg_grenade', 'lg_update'],
  },
  drone: {
    id: 'drone', name: 'RECON DRONE', style: null, scale: 1.0, health: 45, armour: {}, mechanical: true,
    weapon: null, speed: 9, hoverHeight: 6.5, orbitRadius: 16, markTime: 2.5, callCooldown: 28,
    xp: 35, gibThreshold: 1, staggerThreshold: 999, mass: 0.4, voiceBarks: [],
  },
  rescued: { id: 'rescued', name: 'OPERATIVE', style: 'rescued', scale: 1.0, health: 200, armour: {}, weapon: null, speed: 4.5, ally: true, xp: 0, gibThreshold: 0.6, staggerThreshold: 30, mass: 1 },
};

// Squad templates by pressure tier
export const SQUADS = {
  patrol_light: ['rifleman', 'rifleman'],
  patrol: ['rifleman', 'rifleman', 'breacher'],
  patrol_heavy: ['rifleman', 'rifleman', 'grenadier', 'suppressor'],
  assault: ['breacher', 'breacher', 'rifleman', 'rifleman'],
  fire_team: ['rifleman', 'rifleman', 'rifleman', 'grenadier'],
  heavy: ['suppressor', 'rifleman', 'grenadier'],
  recon: ['drone'],
  elite: ['suppressor', 'suppressor', 'breacher', 'grenadier'],
};
