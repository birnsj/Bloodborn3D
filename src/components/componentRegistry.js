import { ArchComponent } from './ArchComponent.js';
import { BrushComponent } from './BrushComponent.js';
import { CellComponent } from './CellComponent.js';
import { ColumnComponent } from './ColumnComponent.js';
import { CurvedWallComponent } from './CurvedWallComponent.js';
import { LightComponent } from './LightComponent.js';
import { PlayerSpawnComponent } from './PlayerSpawnComponent.js';
import { RampComponent } from './RampComponent.js';
import { StairComponent } from './StairComponent.js';
import { StaticMeshComponent } from './StaticMeshComponent.js';
import { Component } from '../core/Component.js';

const REGISTRY = {
  [ArchComponent.componentType]: ArchComponent,
  [BrushComponent.componentType]: BrushComponent,
  [CellComponent.componentType]: CellComponent,
  [ColumnComponent.componentType]: ColumnComponent,
  [CurvedWallComponent.componentType]: CurvedWallComponent,
  [LightComponent.componentType]: LightComponent,
  [PlayerSpawnComponent.componentType]: PlayerSpawnComponent,
  [RampComponent.componentType]: RampComponent,
  [StairComponent.componentType]: StairComponent,
  [StaticMeshComponent.componentType]: StaticMeshComponent,
};

export function createComponentFromJSON(data) {
  const Ctor = REGISTRY[data?.type];
  if (!Ctor) {
    return new Component(data || {});
  }
  return Ctor.fromJSON(data);
}

export function getRegisteredComponentTypes() {
  return Object.keys(REGISTRY);
}
