export const prefabsLesson = {
  id: 'prefabs',
  title: 'Prefabs',
  summary: 'Create a prefab from selection, place an instance, and record an override.',
  order: 8,
  starterPath: 'tutorials/openings.json',
  steps: [
    {
      id: 'intro',
      title: 'What is a prefab?',
      body: 'A prefab is a reusable package of objects. Change the source once, then update instances — or override one copy.',
      terms: [
        { term: 'Prefab', def: 'A reusable asset made from one or more actors.' },
        { term: 'Instance', def: 'A copy of a prefab placed in the level.' },
        { term: 'Override', def: 'A local change on one instance that differs from the source.' },
      ],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'select-wall',
      title: 'Select something to package',
      body: 'Select the wall (or multi-select objects with Ctrl+click).',
      verify: { type: 'selectionCount', min: 1 },
    },
    {
      id: 'create-prefab',
      title: 'Create a prefab',
      body: 'In Content Browser click Create Prefab, or use the Prefab section in Details. Name it something like Practice Prop.',
      highlight: ['panel.content'],
      verify: { type: 'manualConfirm', label: 'I created a prefab' },
      explain: 'Automatic detection of new prefab assets is limited across sessions; confirm once the prefab appears under Prefabs.',
    },
    {
      id: 'place-instance',
      title: 'Place an instance',
      body: 'Drag your new prefab from Content Browser → Prefabs into the Viewport.',
      verify: { type: 'prefabInstancePlaced', trackAs: 'inst1' },
      failHint: 'Drag a Prefab into the Viewport.',
    },
    {
      id: 'override',
      title: 'Change the instance',
      body: 'Select the instance and move it (or edit a property). That difference is an override relative to the source.',
      verify: { type: 'prefabOverridePresent', trackAs: 'inst1' },
      failHint: 'Move or edit the prefab instance.',
    },
  ],
};
