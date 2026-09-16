// Named tactical locations for Blacksite Meridian, derived from the FLOOR layout in terrain.js.
// Coordinates are in world space (via M()) but built from the same map coordinates used to define
// FLOOR so they always land on walkable ground. yaw hints point "into" the area (useful for facing
// spawned actors or cameras).
import * as THREE from 'three';
import { M } from './terrain.js';

function circleMapPoints(cx, cy, r, n, startAngle = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = startAngle + (i / n) * Math.PI * 2;
    pts.push(M(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

export const LOCATIONS = {
  dropZone: { pos: M(200, 45), yaw: Math.PI },
  dropZoneAlt1: { pos: M(120, 55), yaw: Math.PI },
  dropZoneAlt2: { pos: M(290, 55), yaw: Math.PI },
  canyonJunction: { pos: M(200, 130), yaw: Math.PI },
  highRouteMid: { pos: M(106, 200), yaw: Math.PI },
  mainRouteMid: { pos: M(200, 200), yaw: Math.PI },
  trenchRouteMid: { pos: M(270, 195), yaw: Math.PI },
  jammerGateSouth: { pos: M(110, 300), yaw: Math.PI * 0.75 },
  jammerCenter: { pos: M(70, 320), yaw: 0 },
  commsGateSouth: { pos: M(200, 284), yaw: Math.PI },
  commsPlaza: { pos: M(205, 337), yaw: 0 },
  commsTerminal: { pos: M(205, 329), yaw: Math.PI },
  detentionEntrance: { pos: M(258, 355), yaw: -Math.PI / 2 },
  extractionCenter: { pos: M(330, 250), yaw: 0 },
  extractionApproach: { pos: M(305, 285), yaw: Math.PI * 0.3 },
};

export const patrolRoutes = [
  {
    name: 'high_route',
    points: [[180, 88], [140, 112], [116, 150], [106, 200], [112, 245], [100, 280], [85, 298]].map(([mx, my]) => M(mx, my)),
  },
  {
    name: 'main_route',
    points: [[200, 45], [200, 130], [200, 200], [200, 285]].map(([mx, my]) => M(mx, my)),
  },
  {
    name: 'trench_route',
    points: [[222, 72], [252, 96], [268, 140], [270, 195], [276, 238], [296, 262]].map(([mx, my]) => M(mx, my)),
  },
  {
    name: 'jammer_perimeter',
    points: circleMapPoints(70, 320, 38, 8),
  },
  {
    name: 'comms_courtyard',
    points: [[140, 295], [270, 295], [270, 375], [140, 375]].map(([mx, my]) => M(mx, my)),
  },
  {
    name: 'extraction_perimeter',
    points: circleMapPoints(330, 250, 32, 8),
  },
  {
    name: 'canyon_junction_loop',
    points: circleMapPoints(200, 130, 18, 6),
  },
];

export const spawnPoints = {
  jammer: circleMapPoints(70, 320, 45, 6).concat([M(108, 302), M(35, 340)]),
  comms: [M(150, 290), M(260, 290), M(300, 340), M(130, 340), M(150, 388), M(230, 388)],
  extraction: circleMapPoints(330, 250, 50, 6),
  roads: [
    M(40, 60), M(26, 150), M(22, 260), M(40, 330), M(60, 372),
    M(370, 90), M(380, 180), M(372, 280), M(360, 360),
    M(150, 398), M(240, 398),
  ],
};
