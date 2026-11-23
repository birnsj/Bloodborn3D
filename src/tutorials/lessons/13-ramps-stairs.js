export const rampsStairsLesson = {
  id: 'ramps-stairs',
  title: 'Ramps and Stairs',
  summary: 'Connect elevations with ramps and procedural stairs — including curved and spiral turns.',
  order: 12,
  starterPath: 'tutorials/multilevel.json',
  steps: [
    {
      id: 'intro',
      title: 'Vertical connections',
      body: 'Ramps are smooth wedges with slope-aligned collision. Stairs are one editable actor made of many step solids — not a pile of separate boxes.',
      terms: [
        { term: 'Ramp', def: 'A parametric sloped surface with width, length, rise, and direction.' },
        { term: 'Stairs', def: 'A single procedural staircase actor with step count, riser, and tread.' },
      ],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'place-ramp',
      title: 'Place a ramp',
      body: 'Click Ramp, then drag a long footprint. Edit Rise and Direction in Details if needed.',
      highlight: ['toolbar.ramp'],
      verify: { type: 'rampCreated', trackAs: 'ramp1' },
      failHint: 'Use the Ramp toolbar tool and drag in the viewport.',
    },
    {
      id: 'place-stairs',
      title: 'Place stairs',
      body: 'Click Stairs and drag a run. Default rise matches one wall module so stairs can reach a ceiling or upper floor.',
      highlight: ['toolbar.stair'],
      verify: { type: 'stairCreated', trackAs: 'stairs1' },
      failHint: 'Use the Stairs toolbar tool and drag a footprint.',
    },
    {
      id: 'make-curved',
      title: 'Turn them curved',
      body: 'With the stairs selected, open Details → Stairs and set Type to Curved. The steps become wedge-shaped around a central opening.',
      highlight: ['details.stair.type'],
      terms: [
        {
          term: 'Inner radius',
          def: 'How wide the open well in the middle is. Larger radius = wider hole; smaller = tighter spiral.',
        },
        {
          term: 'Sweep',
          def: 'How many degrees the stairs turn (90, 180, 270, 360, or custom).',
        },
        {
          term: 'Winding',
          def: 'Clockwise or counterclockwise as you walk up.',
        },
      ],
      verify: { type: 'stairTypeIs', trackAs: 'stairs1', stairType: 'curved' },
      failHint: 'Select your stairs and set Type to Curved in Details.',
    },
    {
      id: 'tune-sweep',
      title: 'Adjust the sweep',
      body: 'Try the 180° or 270° preset buttons, or type a custom Sweep Angle. Change Winding if you want the opposite turn.',
      highlight: ['details.stair.sweep'],
      verify: { type: 'stairSweepSet', trackAs: 'stairs1', minSweep: 90 },
      failHint: 'With curved stairs selected, set Sweep Angle to at least 90°.',
    },
  ],
};
