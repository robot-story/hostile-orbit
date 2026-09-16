// Map registry. game.buildSession() picks `MAPS[config.map]`; the operation screen lists them in order.
import { MERIDIAN } from './meridian.js';
import { LANTERN } from './lantern.js';

export const MAPS = { meridian: MERIDIAN, lantern: LANTERN };
export const MAP_ORDER = ['meridian', 'lantern'];
export const DEFAULT_MAP = 'meridian';
