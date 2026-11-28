import { createCharacter } from '../../io/charactersClient.js';
import { setCharactersSelection } from './charactersUiStore.js';

/**
 * Create a Characters-library entry that references an imported mesh asset.
 */
export async function createCharacterFromMesh({
  meshAssetId,
  name = 'Character',
  heightMeters = null,
  meshyRigTaskId = null,
} = {}) {
  if (!meshAssetId) {
    const err = new Error('meshAssetId is required');
    err.code = 'MESH_REQUIRED';
    throw err;
  }
  const result = await createCharacter({
    name,
    meshAssetId,
    heightMeters,
    meshyRigTaskId,
  });
  if (result?.character?.id) {
    setCharactersSelection(result.character.id);
  }
  return result.character;
}
