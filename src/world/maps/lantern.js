// Map definition: Black Lantern (Operation: Black Lantern) — a neon Commonwealth colony city on the
// dark moon Erebus, occupied by the Null Legion. Same objective skeleton as Meridian (spire → tower →
// extraction) so the shared Mission class drives it; the words, layout, dressing and lighting differ.
import { M } from '../terrain.js';
import { buildLantern } from '../level_lantern.js';
import { LanternMission } from '../../gameplay/mission_lantern.js';

function circleMapPoints(cx, cy, r, n, startAngle = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = startAngle + (i / n) * Math.PI * 2; pts.push(M(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
  return pts;
}

/** Walkable street layout (map coords, my up = north). Mirrors Meridian's topology east-west so the
 *  mission skeleton (gate → spire → tower → pad) still works, but every street reads as a city. */
export const FLOOR_LANTERN = {
  circles: [
    { c: [200, 42], r: 36, name: 'dropzone' },            // transit plaza
    { c: [322, 318], r: 48, name: 'jammer' },             // substation + signal spire
    { c: [72, 246], r: 56, name: 'extraction' },          // rooftop pad plaza
    { c: [200, 125], r: 26, name: 'canyon_junction' },    // Lantern Square
  ],
  rects: [
    { min: [108, 282], max: [282, 392], name: 'comms' },  // broadcast compound
    { min: [72, 332], max: [146, 382], name: 'detention' }, // re-education block
  ],
  corridors: [
    { pts: [[200, 42], [200, 125], [200, 200], [200, 285]], w: 28, name: 'main' },                                   // Meridian Avenue
    { pts: [[222, 84], [262, 110], [288, 150], [296, 200], [290, 245], [300, 282], [312, 298]], w: 16, name: 'high', lift: 4 },   // skyway
    { pts: [[176, 70], [146, 96], [130, 140], [128, 195], [122, 238], [104, 262]], w: 12, name: 'trench', lift: -2.5 },         // drainage canal
    { pts: [[288, 300], [270, 320]], w: 18, name: 'jammer_comms' },
    { pts: [[115, 320], [96, 292]], w: 18, name: 'comms_extraction' },
    { pts: [[152, 258], [124, 240]], w: 10, name: 'trench_ext' },
    { pts: [[360, 60], [374, 150], [378, 260], [360, 330], [340, 372]], w: 11, name: 'west_road' },
    { pts: [[30, 90], [20, 180], [28, 280], [40, 360]], w: 11, name: 'east_road' },
    { pts: [[250, 392], [250, 400]], w: 14, name: 'north_gate_w' },
    { pts: [[160, 392], [160, 400]], w: 14, name: 'north_gate_e' },
    { pts: [[360, 60], [280, 40], [240, 45]], w: 11, name: 'sw_road' },
    { pts: [[30, 90], [100, 50], [160, 45]], w: 11, name: 'se_road' },
    { pts: [[378, 260], [360, 300]], w: 11, name: 'west_link' },
    { pts: [[28, 280], [12, 250]], w: 11, name: 'east_link' },
  ],
};

export const LOCATIONS_LANTERN = {
  dropZone: { pos: M(200, 42), yaw: Math.PI },
  dropZoneAlt1: { pos: M(280, 55), yaw: Math.PI },
  dropZoneAlt2: { pos: M(110, 55), yaw: Math.PI },
  canyonJunction: { pos: M(200, 125), yaw: Math.PI },
  highRouteMid: { pos: M(296, 200), yaw: Math.PI },
  mainRouteMid: { pos: M(200, 200), yaw: Math.PI },
  trenchRouteMid: { pos: M(128, 195), yaw: Math.PI },
  jammerGateSouth: { pos: M(290, 300), yaw: Math.PI * 1.25 },
  jammerCenter: { pos: M(322, 318), yaw: 0 },
  commsGateSouth: { pos: M(200, 284), yaw: Math.PI },
  commsPlaza: { pos: M(195, 337), yaw: 0 },
  commsTerminal: { pos: M(195, 329), yaw: Math.PI },
  detentionEntrance: { pos: M(142, 355), yaw: Math.PI / 2 },
  extractionCenter: { pos: M(72, 246), yaw: 0 },
  extractionApproach: { pos: M(96, 285), yaw: -Math.PI * 0.3 },
};

export const patrolRoutesLantern = [
  { name: 'high_route', points: [[222, 84], [262, 110], [288, 150], [296, 200], [290, 245], [300, 282], [312, 298]].map(([mx, my]) => M(mx, my)) },
  { name: 'main_route', points: [[200, 42], [200, 125], [200, 200], [200, 285]].map(([mx, my]) => M(mx, my)) },
  { name: 'trench_route', points: [[176, 70], [146, 96], [130, 140], [128, 195], [122, 238], [104, 262]].map(([mx, my]) => M(mx, my)) },
  { name: 'jammer_perimeter', points: circleMapPoints(322, 318, 36, 8) },
  { name: 'comms_courtyard', points: [[130, 295], [260, 295], [260, 375], [130, 375]].map(([mx, my]) => M(mx, my)) },
  { name: 'extraction_perimeter', points: circleMapPoints(72, 246, 32, 8) },
  { name: 'canyon_junction_loop', points: circleMapPoints(200, 125, 18, 6) },
];

export const spawnPointsLantern = {
  jammer: circleMapPoints(322, 318, 42, 6).concat([M(292, 302), M(362, 340)]),
  comms: [M(250, 290), M(140, 290), M(100, 340), M(270, 340), M(250, 388), M(170, 388)],
  extraction: circleMapPoints(72, 246, 50, 6),
  roads: [
    M(360, 60), M(374, 150), M(378, 260), M(360, 330), M(340, 372),
    M(30, 90), M(20, 180), M(28, 280), M(40, 360),
    M(250, 398), M(160, 398),
  ],
};

export const DROP_ZONES_LANTERN = {
  main: { id: 'main', name: 'DROP ZONE // TRANSIT PLAZA', mapX: 200, mapY: 42, description: 'The old transit plaza. Straight up Meridian Avenue to the square.' },
  east: { id: 'east', name: 'EAST APPROACH // SKYWAY', mapX: 280, mapY: 58, description: 'Elevated skyway ramp. Longer, quieter, closest to the substation.' },
  west: { id: 'west', name: 'WEST APPROACH // CANAL', mapX: 115, mapY: 58, description: 'Drainage canal under the towers. Heavier patrols, direct line to extraction later.' },
};

export const LANTERN = {
  id: 'lantern',
  name: 'BLACK LANTERN',
  opName: 'OPERATION: BLACK LANTERN',
  location: 'LOCATION: EREBUS COLONY, DARK SIDE',
  tagline: 'Neon colony city under a dead moon. Cut the power, take the tower, get out.',
  briefing: {
    primary: 'Overload the Null Legion signal spire',
    secondary: 'Rescue citizens from the re-education block',
    intel: 'Dense urban terrain. Orbital support blocked until the substation spire is down.',
  },
  mapImage: 'textures/menus/map_lantern.jpg',
  briefingLine: 'voss_lantern_briefing',
  floor: FLOOR_LANTERN,
  terrain: {
    style: 'city', texture: 'tex_asphalt', repeat: 90, tint: '#c8ccd8', roughness: 0.5, metalness: 0.06, envIntensity: 1.0, veinIntensity: 1.6,
    palette: { floor: [0.22, 0.23, 0.28], floorNoise: [0.04, 0.04, 0.05], rock: [0.07, 0.075, 0.10], rockNoise: [0.03, 0.03, 0.04], ridge: [0.10, 0.10, 0.14], veinScale: 0.5 },
  },
  lighting: {
    background: '#06050e', fog: '#150c24', fogDensity: 0.0030,
    hemiSky: '#6a7cd0', hemiGround: '#4a2458', hemiIntensity: 1.7,
    sun: '#c0ccff', sunIntensity: 2.4, sunOffset: [60, 120, -70],
    ambient: '#3e4270', ambientIntensity: 1.4, envIntensity: 0.22,
  },
  sky: { top: '#020308', mid: '#0b0c1c', horizon: '#3a1650', aurora: 0, space: 0.35, sunDir: [0.3, 0.12, -0.9], sunColor: '#5a4a8a' },
  celestials: 'darkmoon',
  dropZones: DROP_ZONES_LANTERN,
  markers: [
    { x: 322, y: 318, label: 'SUBSTATION SPIRE', kind: 'primary', tag: 'PRIMARY OBJECTIVE', desc: 'Plant charges on the signal spire. Orbital support stays blocked until it falls.' },
    { x: 195, y: 337, label: 'BROADCAST TOWER', kind: 'primary', tag: 'PRIMARY OBJECTIVE', desc: 'Breach the broadcast compound and upload the counter-broadcast from the control room.' },
    { x: 108, y: 357, label: 'RE-EDUCATION BLOCK', kind: 'secondary', tag: 'SECONDARY OBJECTIVE', desc: 'Two Commonwealth citizens await correction here. Release them for bonus requisition.' },
    { x: 72, y: 246, label: 'EXTRACTION', kind: 'primary', tag: 'EXTRACTION', desc: 'Rooftop landing pad. Hold it for 90 seconds. The Warden will come up the ramps.' },
    { x: 200, y: 190, label: 'SIDE OP: PROPAGANDA', kind: 'side', tag: 'SIDE OPERATION', desc: 'Correct the Legion neon signage along Meridian Avenue.' },
    { x: 292, y: 205, label: 'SIDE OP: SUPPLY CACHES', kind: 'side', tag: 'SIDE OPERATION', desc: 'Recover Commonwealth supply caches abandoned on the skyway.' },
    { x: 200, y: 130, label: 'SIDE OP: RECON DRONES', kind: 'side', tag: 'SIDE OPERATION', desc: 'Shoot down recon drones patrolling between the towers.' },
  ],
  enemyMarkers: [{ x: 370, y: 210 }, { x: 295, y: 375 }, { x: 50, y: 375 }, { x: 60, y: 130 }, { x: 180, y: 90 }],
  locations: LOCATIONS_LANTERN, patrolRoutes: patrolRoutesLantern, spawnPoints: spawnPointsLantern,
  build: buildLantern,
  Mission: LanternMission,
};
