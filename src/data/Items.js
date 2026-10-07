/* Items.js - what you can carry, and what GUIDE can help you build.

   Components start out UNIDENTIFIED: you can pick them up, but until GUIDE
   remembers what they are (by studying photographs of the machines that use
   them) they show as "Unknown component" and cannot go into recipes.
   `knownFrom` names the machine whose analysis identifies it; null means
   GUIDE knows it from the start (basic household knowledge survived). */

export const COMPONENTS = {
  battery:   { name: 'Battery', icon: 'battery', desc: 'A standard flashlight battery. Press R to swap it in.', knownFrom: null, stack: 9 },
  wire:      { name: 'Copper Wire', icon: 'wire', desc: 'A coil of insulated wire.', knownFrom: null, stack: 12 },
  circuit:   { name: 'Circuit Board', icon: 'circuit', desc: 'A logic board pulled from a dead machine.', knownFrom: null, stack: 9 },
  sensor:    { name: 'Optical Sensor', icon: 'sensor', desc: 'A machine eye. Still focuses when you tap it.', knownFrom: 'scout', stack: 9 },
  cell:      { name: 'Energy Cell', icon: 'cell', desc: 'A dense power cell. Warm to the touch.', knownFrom: 'crawler', stack: 9 },
  servo:     { name: 'Servo Motor', icon: 'servo', desc: 'A precise little motor from a robot joint.', knownFrom: 'dog', stack: 9 },
  hydraulic: { name: 'Hydraulic Actuator', icon: 'hydraulic', desc: 'A high-pressure piston. Leaks a little.', knownFrom: 'hunter', stack: 6 },
  plate:     { name: 'Armour Plate', icon: 'plate', desc: 'A curved ceramic-steel plate.', knownFrom: 'sentinel', stack: 6 },
  coolant:   { name: 'Coolant Canister', icon: 'coolant', desc: 'Pressurised coolant. Very cold.', knownFrom: 'medic', stack: 6 },
  core:      { name: 'AI Core', icon: 'core', desc: 'A machine mind, the size of a fist. Something still flickers inside.', knownFrom: 'stalker', stack: 3 },
};

export const TOOLS = {
  camera:  { name: 'Camera', icon: 'camera', key: 1, desc: 'An old optical camera. Hold right mouse to raise it, left click to take a photo. Show photos to GUIDE.' },
  prod:    { name: 'Arc Prod', icon: 'prod', key: 2, desc: 'A maintenance shock baton. Left click to strike, hold right mouse for a charged strike. Uses its own charge.' },
  emp:     { name: 'EMP Charge', icon: 'emp', key: 3, desc: 'Throw it. Stuns every machine nearby; small ones burn out.' },
  decoy:   { name: 'Noise Decoy', icon: 'decoy', key: 4, desc: 'Throw it. It beeps like a person for 12 seconds; hearing machines go to it.' },
  medkit:  { name: 'Med Foam', icon: 'medkit', key: 5, desc: 'Sealant foam and painkillers. Restores health.' },
};

/* story items: not used up by crafting, shown on the key items row */
export const KEYS = {
  powercell: { name: 'Home Robot Power Cell', icon: 'powercell', desc: 'A spare cell from GUIDE\'s charging dock.' },
  forearm:   { name: 'GUIDE\'s Forearm', icon: 'servo', desc: 'His left arm, torn off at the elbow. The fingers still twitch.' },
  harness:   { name: 'Wiring Harness', icon: 'wire', desc: 'A bundle of wire from the building\'s fuse closet.' },
  map:       { name: 'Maintenance Map', icon: 'map', desc: 'Helix Facilities map. A secondary generator under Meridian Station feeds the facility\'s service elevator.' },
  bypass:    { name: 'Lock Bypass', icon: 'bypass', desc: 'Spoofs an electronic lock for a few seconds.' },
  actuator:  { name: 'Actuator Patch', icon: 'actuator', desc: 'A rebuilt door actuator. Should fit a Helix emergency door.' },
  keycard:   { name: 'Director\'s Keycard', icon: 'keycard', desc: 'A. VOSS - BOARD DIRECTOR. Opens Helix freight security.' },
  fuse:      { name: 'Heavy Fuse', icon: 'circuit', desc: 'A 400 A cartridge fuse.' },
  core_m:    { name: 'Manifest Core', icon: 'core', desc: 'A data core from the Helix server room. It holds transfer manifests.' },
};

/* recipes: GUIDE helps build these. needs = what GUIDE must remember first. */
export const RECIPES = [
  { id: 'battery',  out: 'battery', n: 1, cost: { cell: 1, wire: 1 }, needs: 'crawler', desc: 'Rebuild a flashlight battery from an energy cell.' },
  { id: 'bypass',   out: 'bypass', key: true, cost: { sensor: 1, circuit: 1, wire: 2 }, needs: 'scout', desc: 'A lock spoofer: a scout\'s eye reads the lock, the board replays its handshake.' },
  { id: 'prodcell', out: 'prodcharge', n: 1, cost: { cell: 1 }, needs: 'crawler', desc: 'Recharge the arc prod fully.' },
  { id: 'emp',      out: 'emp', n: 1, cost: { cell: 1, wire: 1, circuit: 1 }, needs: 'crawler', desc: 'A one-shot electromagnetic pulse. Crawler cores taught us how fragile machines are.' },
  { id: 'decoy',    out: 'decoy', n: 1, cost: { servo: 1, circuit: 1, battery: 1 }, needs: 'dog', desc: 'A noise maker that sounds like footsteps and breathing. Security dogs hunt by ear.' },
  { id: 'actuator', out: 'actuator', key: true, cost: { hydraulic: 1, servo: 1, wire: 1 }, needs: 'hunter', desc: 'A door actuator rebuilt around a hunter\'s knee piston.' },
  { id: 'medkit',   out: 'medkit', n: 1, cost: { coolant: 1, wire: 1 }, needs: 'medic', desc: 'Sealant foam, the way the hospital units made it.' },
  { id: 'armor',    out: 'upgrade:armor', cost: { plate: 2, wire: 2 }, needs: 'sentinel', once: true, desc: 'Strap sentinel plates into your jacket: take 30% less damage.' },
  { id: 'flash',    out: 'upgrade:flash', cost: { core: 1, sensor: 1, cell: 1 }, needs: 'stalker', once: true, desc: 'Camera flash overcharge: the flash stuns machines in front of you (stalkers hate it).' },
  { id: 'bigbatt',  out: 'upgrade:bigbatt', cost: { cell: 2, circuit: 1, wire: 1 }, needs: 'dog', once: true, desc: 'Flashlight cell upgrade: batteries last 60% longer.' },
  { id: 'prodplus', out: 'upgrade:prodplus', cost: { core: 1, hydraulic: 1, cell: 1 }, needs: 'heavy', once: true, desc: 'Overcharged prod: double damage, wider arc.' },
];

export const UPGRADES = {
  armor: { name: 'Plated Jacket', desc: 'Take 30% less damage.' },
  flash: { name: 'Stun Flash', desc: 'The camera flash stuns machines in front of you.' },
  bigbatt: { name: 'Extended Cell', desc: 'Flashlight batteries last 60% longer.' },
  prodplus: { name: 'Overcharged Prod', desc: 'Double damage, wider arc.' },
};

export const START_INV = () => ({ items: {}, tools: { flashlight: true }, keys: {}, upgrades: {}, batteries: 1, prod: 0 });
