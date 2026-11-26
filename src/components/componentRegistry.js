import { ArchComponent } from './ArchComponent.js';
import { BrushComponent } from './BrushComponent.js';
import { CellComponent } from './CellComponent.js';
import { ColumnComponent } from './ColumnComponent.js';
import { ConvexBrushComponent } from './ConvexBrushComponent.js';
import { CurvedWallComponent } from './CurvedWallComponent.js';
import { LightComponent } from './LightComponent.js';
import { EnvironmentComponent } from './EnvironmentComponent.js';
import { PlayerSpawnComponent } from './PlayerSpawnComponent.js';
import { RampComponent } from './RampComponent.js';
import { StairComponent } from './StairComponent.js';
import { StaticMeshComponent } from './StaticMeshComponent.js';
import { PrimitiveMeshComponent } from './PrimitiveMeshComponent.js';
import { Component } from '../core/Component.js';

const REGISTRY = {
  [ArchComponent.componentType]: ArchComponent,
  [BrushComponent.componentType]: BrushComponent,
  [CellComponent.componentType]: CellComponent,
  [ColumnComponent.componentType]: ColumnComponent,
  [ConvexBrushComponent.componentType]: ConvexBrushComponent,
  [CurvedWallComponent.componentType]: CurvedWallComponent,
  [LightComponent.componentType]: LightComponent,
  [EnvironmentComponent.componentType]: EnvironmentComponent,
  [PlayerSpawnComponent.componentType]: PlayerSpawnComponent,
  [RampComponent.componentType]: RampComponent,
  [StairComponent.componentType]: StairComponent,
  [StaticMeshComponent.componentType]: StaticMeshComponent,
  [PrimitiveMeshComponent.componentType]: PrimitiveMeshComponent,
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
