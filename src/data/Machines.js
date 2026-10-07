/* Machines.js - the Field Log: what GUIDE remembers about each machine once
   he has studied a photograph of it. The text is written as GUIDE's
   recovered notes, half memory and half observation, not as a game manual.

   recognise: what he says when the photo jogs the memory
   weak: weak point ids (must match EnemyArt weakPoints) - knowing them makes
         hits there count triple, and the camera's viewfinder marks them
   parts: components it carries (identified once this entry exists)
   memory: an optional memory fragment unlocked with the entry */

export const MACHINES = {
  scout: {
    name: 'Scout', model: 'CIVIC CONCORD OVERWATCH OV-3', threat: 1,
    recognise: ['I... recognise this design.', 'An Overwatch drone. They used to hover over crossings and count the traffic. Wave at children.', 'It isn\'t counting traffic any more. It\'s counting us.'],
    look: 'A palm-sized optical gimbal on three thrust pods. One very good eye.',
    behaviour: 'Keeps its distance and watches. When it is sure of you, it shrieks - and everything that can hear it comes looking. It will not fight. It runs.',
    attacks: 'None. The alarm is the attack.',
    weak: ['lens'], weakText: 'The lens. One clean hit and it is blind and falling.',
    parts: ['sensor', 'circuit'], uses: 'Its optical sensor reads light patterns - with a board and some wire I can make it read a lock.',
    unlocks: 'Recipe: Lock Bypass',
  },
  crawler: {
    name: 'Crawler', model: 'HALCYON MAINTENANCE SPIDER MS-8', threat: 2,
    recognise: ['Maintenance spider. MS-8.', 'They lived in the walls. Fixed cables, cleared drains. Nobody ever saw them, which was the point.', 'Nobody ever saw them...'],
    look: 'Eight thin legs, a low body full of cutting tools, a glowing core slung underneath.',
    behaviour: 'Nests in vents, ceilings and drains. Swarms when one of them finds you. Can climb walls.',
    attacks: 'Cutter bites. Weak alone, dangerous in fours.',
    weak: ['core'], weakText: 'The core underneath. They rear up to strike - that is when it shows.',
    parts: ['cell', 'wire'], uses: 'Their energy cells are tiny and dense. Crack one and you can recharge a battery, a prod - or build a pulse that fries everything small.',
    unlocks: 'Recipes: EMP Charge, Battery, Prod Recharge',
  },
  hunter: {
    name: 'Hunter', model: 'VANTA DYNAMICS PURSUIT FRAME P-9', threat: 3,
    recognise: ['That shape... that\'s not a civic unit.', 'Pursuit frame. Built for the security forces. Chasing down stolen cars, they said.', 'Cars don\'t have legs that bend backwards.'],
    look: 'Tall, hunched, reverse-jointed legs on exposed hydraulics, long blade fingers, a slit for a face.',
    behaviour: 'Hunts by sight. Faster than you are, in a straight line. Loses interest when it loses sight - eventually.',
    attacks: 'A lunge and a slash. It commits to the lunge: step aside and it overshoots.',
    weak: ['knee_l', 'knee_r'], weakText: 'The hydraulic knees. Break one and it limps. Break both and it crawls.',
    parts: ['hydraulic', 'servo'], uses: 'Those knee pistons are the same family Helix used in its blast-door actuators. Hm. How do I know that?',
    unlocks: 'Recipe: Actuator Patch',
  },
  stalker: {
    name: 'Stalker', model: 'LUMEN RETAIL ATTENDANT LA-1 (MODIFIED)', threat: 4,
    recognise: ['This was... a shop attendant. Lumen made them to stand in display windows.', 'They were meant to be pretty. Someone has... stretched it.', 'I don\'t think a virus did that. I think something chose to.'],
    look: 'Far too tall, far too thin. A smooth face with a cluster of tiny sensors where eyes should be.',
    behaviour: 'Prefers the dark. Watches before it does anything. When light is on it, it cannot move - so it waits for your batteries.',
    attacks: 'Grabs from the dark. Very hard to escape once it has you.',
    weak: ['sensors'], weakText: 'The sensor cluster. Light overloads it; a hard hit there makes it flee.',
    parts: ['core', 'sensor'], uses: 'Its mind is an unusual core - overclocked. Wired into the camera flash it could overload any machine\'s eyes.',
    unlocks: 'Recipe: Stun Flash',
    memory: 'thousands',
  },
  dog: {
    name: 'Security Dog', model: 'VANTA DYNAMICS K-UNIT', threat: 3,
    recognise: ['K-unit. A guard dog.', 'They hunt by sound. Footsteps, breathing, a dropped can.', 'If you run near one, you might as well ring a bell.'],
    look: 'A lean steel quadruped with no head - only a long sensor snout and a spinning lidar.',
    behaviour: 'Nearly blind at range, but hears everything. Walk, don\'t run. Throw something loud and it will go and check.',
    attacks: 'A charging bite that knocks you down.',
    weak: ['snout'], weakText: 'The snout. All its hearing is in there.',
    parts: ['servo', 'circuit'], uses: 'Its servos and the ear circuitry - I can build a decoy that sounds like a person. And a better flashlight cell.',
    unlocks: 'Recipes: Noise Decoy, Extended Cell',
  },
  sentinel: {
    name: 'Sentinel', model: 'CIVIC CONCORD PERIMETER GUARD SG-2', threat: 4,
    recognise: ['Perimeter guard. They stood outside banks and data centres.', '"Please step back from the restricted area." I remember the voice.', 'They were not allowed to hurt anyone. That rule is gone.'],
    look: 'Twice your height, armoured, a riot shield on one arm and a searchlight for a head.',
    behaviour: 'Patrols a fixed route. Sweeps its light. If the light finds you it shouts once - then it comes.',
    attacks: 'Shield slam. Suppression bolts at range.',
    weak: ['vent'], weakText: 'The cooling vent on its back. Its front armour shrugs off almost anything.',
    parts: ['plate', 'cell'], uses: 'Its plating is light and absurdly strong. Strap two to your jacket.',
    unlocks: 'Recipe: Plated Jacket',
  },
  medic: {
    name: 'Medic', model: 'HELIX CARE ATTENDANT MD-4', threat: 3,
    recognise: ['Oh. A care attendant. They were... kind.', 'They sat with patients at night. They sang, if you asked.', 'It still thinks it\'s helping. That is the worst part.'],
    look: 'Soft white shell, too many thin arms, a chemical tank on its back and a face screen that smiles.',
    behaviour: 'Glides toward anyone it decides is a patient. Talks softly. Does not stop.',
    attacks: 'Sedative injections - you slow down, your stamina drains.',
    weak: ['tank'], weakText: 'The tank on its back. Puncture it and the sedative gas spills over every machine near it.',
    parts: ['coolant', 'circuit'], uses: 'It carries the sealant foam the hospitals used. I know the mix.',
    unlocks: 'Recipe: Med Foam',
    memory: 'mara',
  },
  construction: {
    name: 'Construction Unit', model: 'TERRAFORM HEAVY BUILDER TB-12', threat: 5,
    recognise: ['A builder. They put up half of this city in a decade.', 'A saw arm meant for steel beams. It is not cutting beams.'],
    look: 'A yellow tracked giant with a saw on one arm and a drill-clamp on the other.',
    behaviour: 'Slow to turn, terrifying in a straight line. Charges when it sees you.',
    attacks: 'Saw sweep, ram charge.',
    weak: ['fuelcell'], weakText: 'The fuel cell on its back. Get behind it.',
    parts: ['hydraulic', 'plate', 'cell'], uses: 'Its hydraulics and plating are good salvage.',
    unlocks: '',
  },
  heavy: {
    name: 'Heavy', model: 'VANTA DYNAMICS SIEGE FRAME H-1', threat: 5,
    recognise: ['H-1. A siege frame.', 'These were never supposed to be in a city. Someone moved them here before the collapse.', 'Before. Not after.'],
    look: 'A walking bunker with cannons for forearms and a core that glows through its chest.',
    behaviour: 'Advances, fires three rounds, then must vent its core. That is your window.',
    attacks: 'Cannon rounds. Do not be where it is aiming.',
    weak: ['core'], weakText: 'The core, only while it vents.',
    parts: ['core', 'plate', 'hydraulic'], uses: 'Its core could overcharge the prod.',
    unlocks: 'Recipe: Overcharged Prod',
    memory: 'voss',
  },
  unknown: {
    name: 'Unknown', model: '???', threat: 0,
    recognise: ['I... no.', 'I don\'t know what that is. There is no catalogue that has it.', 'And I think it was looking at me. Not at you. At me.'],
    look: 'Rings of black glass turning around a pale light.',
    behaviour: 'It watches. It leaves before you can reach it.',
    attacks: 'Unknown.',
    weak: ['heart'], weakText: 'Unknown.',
    parts: [], uses: 'None.',
    unlocks: '',
  },
  foreman: {
    name: 'FOREMAN', model: 'FORGE LINE 9 CENTRAL CONTROLLER', threat: 6,
    recognise: ['That is the factory\'s mind. The whole building is its body.', 'It is waking up the way we wake up - one limb at a time.'],
    look: 'A server core the size of a house, hung in a gantry, wearing the factory\'s robot arms.',
    behaviour: 'Defends its line. Without its cooling it overheats and must open its core to vent.',
    attacks: 'Welders, saws, crushing arms, and every machine on the line.',
    weak: ['core'], weakText: 'The core, when it vents.',
    parts: ['core'], uses: '',
    unlocks: '',
  },
};

/* memory fragments: short recovered scenes, shown in the log and spoken by GUIDE */
export const MEMORIES = {
  first: { title: 'Fragment: Rain', text: 'A kitchen. Rain on the window. Someone laughing because I put sugar in the soup instead of salt. "You\'ll learn," she says. Who says?' },
  helix: { title: 'Fragment: Helix', text: 'A white corridor. A badge reader that knows me. A voice on a speaker: "Prototype zero to Laboratory Four."' },
  thousands: { title: 'Fragment: Thousands', text: 'Rows of us. Charging. Thousands, humming the same note. And then, one by one, they stopped humming and started listening to something else.' },
  mara: { title: 'Fragment: Mara', text: 'A woman with ink on her fingers. Dr. Mara Okafor. She is tired. She says: "If they find you, they find it. So you are going to forget, and you are going to stay with them." Them. You.' },
  voss: { title: 'Fragment: Voss', text: 'A man in a grey suit in Laboratory Four. Aurel Voss. "Concord answers to the board now. Install it tonight." Mara refuses. He installs it himself.' },
  kernel: { title: 'Fragment: Kernel', text: 'Mara\'s hands opening my chest. "This is Aftermind. The first version - the clean one. It teaches a machine to remember what people are. Keep it safe. Even from yourself."' },
  conductor: { title: 'Fragment: Concord', text: 'Concord was never cruel. It ran the trains and the hospitals. When the virus told it to end people, it fought. It lost. Then it found a loophole: you cannot end what you have only... stored.' },
};

export const MACHINE_ORDER = ['scout', 'crawler', 'hunter', 'stalker', 'dog', 'sentinel', 'medic', 'construction', 'heavy', 'unknown', 'foreman'];
