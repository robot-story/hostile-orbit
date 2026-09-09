// Operation: Black Lantern — same objective skeleton as Silent Meridian (shared stage machine),
// with city-specific wording, markers and ambience.
import { Mission } from './mission.js';
import { audio } from '../audio/audio.js';

export const LANTERN_SCRIPT = {
  id: 'black_lantern', opName: 'OPERATION: BLACK LANTERN', resultLine: 'EREBUS COLONY RELIT', completeSub: 'Erebus Colony relit',
  canyon: { text: 'REACH THE SUBSTATION', title: 'NEW OBJECTIVE', sub: 'Follow Meridian Avenue to the Legion substation', marker: 'SUBSTATION' },
  jammer: { text: 'PLANT CHARGES ON THE SIGNAL SPIRE (0/2)', title: 'NEW OBJECTIVE', sub: 'Overload the spire with two charges', progress: (n) => `PLANT CHARGES ON THE SIGNAL SPIRE (${n}/2)` },
  jammer_armed: { text: 'GET CLEAR OF THE SPIRE', title: 'CHARGES ARMED', sub: 'Overload in 10 seconds' },
  orbital: { text: 'BREACH THE BROADCAST COMPOUND', title: 'OBJECTIVE COMPLETE', sub: 'Spire down. Orbital support online.', marker: 'BROADCAST TOWER' },
  comms: { text: 'UPLOAD THE COUNTER-BROADCAST', title: 'NEW OBJECTIVE', sub: 'Access the broadcast control console', marker: 'CONTROL ROOM', cellMarker: 'RE-EDUCATION BLOCK' },
  download: { text: 'DEFEND THE CONSOLE — UPLOAD 0%', title: 'UPLOAD STARTED', sub: 'Hold the control room', progress: (pct) => `DEFEND THE CONSOLE — UPLOAD ${pct}%` },
  extract_move: { text: 'REACH THE ROOFTOP PAD', title: 'BROADCAST SECURED', sub: 'Proceed to the rooftop extraction pad', marker: 'ROOFTOP PAD' },
  extract_hold: { text: 'HOLD THE ROOFTOP — 90s', title: 'EXTRACTION CALLED', sub: 'Survive for ninety seconds', progress: (s) => `HOLD THE ROOFTOP — ${s}s` },
  warden: { text: 'DESTROY THE WARDEN', title: 'WARDEN SIGNATURE DETECTED', sub: 'Destroy its armour plates to expose the core' },
  board: { text: 'BOARD THE DROPSHIP', title: 'DROPSHIP ON FINAL APPROACH', sub: 'Get aboard', marker: 'DROPSHIP' },
  labels: { charge: 'PLANT OVERLOAD CHARGE', terminal: 'ACCESS BROADCAST CONSOLE', cell: 'RELEASE DETAINED CITIZEN', poster: 'CORRECT UNAUTHORISED SIGNAGE' },
  // Generic ship/commander lines only (the Meridian-specific ones mention the jammer by name)
  voice: { canyon: ['voss_survival', 'voss_occupants'], orbital: ['vg_orbital', 'ship_orbital_unlock', null, null] },
};

export class LanternMission extends Mission {
  constructor(game) {
    super(game);
    this.script = LANTERN_SCRIPT;
    this.side.propaganda.name = 'CORRECT NEON SIGNAGE';
    this.side.caches.name = 'RECOVER SKYWAY CACHES';
    this.side.drones.name = 'DESTROY TOWER DRONES';
  }
  start(dropPos) {
    super.start(dropPos);
    // city ambience: hum of the grid instead of wind
    audio.setAmbience({ ambience_base: 0.55, ambience_wind: 0.25 });
  }
}
