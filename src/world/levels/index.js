/* index.js - every place in the city, in the order you travel through them.
   Each level file exports build(G) (geometry, zones, props, interactables),
   populate(G) (machines, GUIDE hooks - after every system exists) and steps
   (its part of the story). */
import * as Apartment from './Apartment.js';
import * as Street from './Street.js';
import * as Metro from './Metro.js';
import * as Tunnels from './Tunnels.js';
import * as Helix from './Helix.js';
import * as Factory from './Factory.js';
import * as Archive from './Archive.js';

const LEVELS = [Apartment, Street, Metro, Tunnels, Helix, Factory, Archive];

export function buildAll(G) { for (const L of LEVELS) L.build(G); }
export function populate(G) { for (const L of LEVELS) L.populate?.(G); }
export const STEPS = [...LEVELS.flatMap(L => L.steps || [])];
