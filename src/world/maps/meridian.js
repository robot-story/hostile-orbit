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
  terrain: { style: 'canyon', texture: 'tex_terrain', repeat: 60 },
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
