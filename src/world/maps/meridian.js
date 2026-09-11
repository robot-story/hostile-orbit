// Map definition: Blacksite Meridian (Operation: Silent Meridian) — burnt-orange canyon world Khepri-9.
// A map bundles everything the engine needs to build and run a level: floor layout, terrain style,
// lighting/sky, named locations, patrols, spawns, drop zones, war-table markers, briefing, the level
// builder and the mission class. New maps add a file here and register in ./index.js.
import { FLOOR } from '../terrain.js';
import { LOCATIONS, patrolRoutes, spawnPoints } from '../locations.js';
import { buildMeridian } from '../level.js';
import { Mission } from '../../gameplay/mission.js';
import { DROP_ZONES } from '../../gameplay/weapons.js';

export const MERIDIAN = {
  id: 'meridian',
  name: 'BLACKSITE MERIDIAN',
  opName: 'OPERATION: SILENT MERIDIAN',
  location: 'LOCATION: KHEPRI-9',
  tagline: 'Canyon blacksite. Jammer, comms base, two prisoners, one Warden.',
  briefing: {
    primary: 'Destroy the Null Legion jammer',
    secondary: 'Rescue captured operatives',
    intel: 'Heavy resistance. Orbital support blocked until jammer destruction.',
  },
  mapImage: 'textures/menus/map_clean.jpg',
  floor: FLOOR,
  terrain: { style: 'canyon', texture: 'tex_terrain', repeat: 60, veinIntensity: 1.7, wallTexture: 'tex_rock_strata', wallScale: 1 / 7, wallTint: '#e0a874', palette: { veinScale: 0.7 },
    // authored relief (map coords): cover berms along the routes, bowls and mounds inside the compounds, pinnacles on the mesas
    features: [
      { type: 'crater', mx: 200, my: 130, r: 13, h: 1.4 },                 // canyon junction: impact bowl
      { type: 'berm', mx: 186, my: 172, r: 9, w: 4, h: 1.5, dir: [0.2, 1] }, { type: 'berm', mx: 214, my: 232, r: 9, w: 4, h: 1.5, dir: [-0.2, 1] },
      { type: 'mound', mx: 150, my: 342, r: 17, h: 2.4 }, { type: 'mound', mx: 252, my: 362, r: 15, h: 2.2 },   // comms base: two firing mounds
      { type: 'crater', mx: 200, my: 322, r: 15, h: 1.7 },                 // comms base: sunken pit in front of the terminal
      { type: 'berm', mx: 176, my: 300, r: 12, w: 3.5, h: 1.3, dir: [1, 0] }, { type: 'berm', mx: 228, my: 300, r: 12, w: 3.5, h: 1.3, dir: [1, 0] },
      { type: 'mound', mx: 70, my: 320, r: 34, h: -1.6 }, { type: 'mound', mx: 70, my: 320, r: 50, h: 1.8 },    // jammer sits in a bowl inside a ring berm
      { type: 'mound', mx: 300, my: 226, r: 14, h: 2.6 }, { type: 'crater', mx: 348, my: 276, r: 11, h: 1.2 },  // extraction: overwatch mound + shell hole
      { type: 'mound', mx: 292, my: 352, r: 10, h: 1.6 },                  // detention yard step
      { type: 'pinnacle', mx: 110, my: 182, r: 11, h: 14 }, { type: 'pinnacle', mx: 302, my: 150, r: 12, h: 16 }, { type: 'pinnacle', mx: 84, my: 118, r: 9, h: 11 }, { type: 'pinnacle', mx: 330, my: 105, r: 10, h: 12 }, { type: 'pinnacle', mx: 140, my: 250, r: 8, h: 9 },
    ] },
  lighting: null, // engine defaults (warm canyon daylight)
  sky: {},
  celestials: 'khepri',
  dropZones: DROP_ZONES,
  markers: [
    { x: 70, y: 320, label: 'JAMMER OUTPOST', kind: 'primary', tag: 'PRIMARY OBJECTIVE', desc: 'Plant charges on the Null Legion jammer. Orbital support stays blocked until it falls.' },
    { x: 200, y: 335, label: 'COMMUNICATIONS BASE', kind: 'primary', tag: 'PRIMARY OBJECTIVE', desc: 'Breach the comms base and download the invasion data from the core terminal.' },
    { x: 292, y: 355, label: 'DETENTION', kind: 'secondary', tag: 'SECONDARY OBJECTIVE', desc: 'Two captured operatives are held here. Free them for bonus requisition and a friendly gun.' },
    { x: 330, y: 250, label: 'EXTRACTION', kind: 'primary', tag: 'EXTRACTION', desc: 'Call the dropship and hold the pad for 90 seconds. The Warden will contest it.' },
    { x: 200, y: 190, label: 'SIDE OP: PROPAGANDA', kind: 'side', tag: 'SIDE OPERATION', desc: 'Silence the Legion propaganda broadcasters scattered through the canyon.' },
    { x: 108, y: 205, label: 'SIDE OP: SUPPLY CACHES', kind: 'side', tag: 'SIDE OPERATION', desc: 'Recover lost Commonwealth supply caches for intel and requisition.' },
    { x: 200, y: 130, label: 'SIDE OP: RECON DRONES', kind: 'side', tag: 'SIDE OPERATION', desc: 'Shoot down recon drones before they mark the squad for reinforcements.' },
  ],
  enemyMarkers: [{ x: 30, y: 210 }, { x: 105, y: 375 }, { x: 350, y: 375 }, { x: 340, y: 130 }, { x: 220, y: 90 }],
  locations: LOCATIONS, patrolRoutes, spawnPoints,
  build: buildMeridian,
  Mission,
};
