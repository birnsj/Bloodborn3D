import { describe, expect, it, beforeEach } from 'vitest';
import {
  __testClearSaveAllModules,
  listDirtySaveAllModules,
  registerSaveAllModule,
  runSaveAll,
} from '../editor/saveAllRegistry.js';

describe('saveAllRegistry', () => {
  beforeEach(() => {
    __testClearSaveAllModules();
  });

  it('saves only dirty modules and skips clean ones', async () => {
    const saved = [];
    const unregA = registerSaveAllModule({
      id: 'test-a',
      label: 'A',
      isDirty: () => true,
      save: async () => { saved.push('A'); },
    });
    const unregB = registerSaveAllModule({
      id: 'test-b',
      label: 'B',
      isDirty: () => false,
      save: async () => { saved.push('B'); },
    });

    expect(listDirtySaveAllModules().map((m) => m.id)).toContain('test-a');
    expect(listDirtySaveAllModules().map((m) => m.id)).not.toContain('test-b');

    const result = await runSaveAll();
    expect(result.saved).toContain('A');
    expect(result.skipped).toContain('B');
    expect(saved).toEqual(['A']);

    unregA();
    unregB();
  });

  it('includes extras such as a level module', async () => {
    const saved = [];
    const result = await runSaveAll([
      {
        id: 'level',
        label: 'test-room.json',
        isDirty: () => true,
        save: async () => { saved.push('level'); },
      },
    ]);
    expect(result.saved).toContain('test-room.json');
    expect(saved).toEqual(['level']);
  });
});
