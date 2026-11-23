import { BrushComponent } from './BrushComponent.js';
import { CellComponent } from './CellComponent.js';
import { LightComponent } from './LightComponent.js';
import { PlayerSpawnComponent } from './PlayerSpawnComponent.js';
import { StaticMeshComponent } from './StaticMeshComponent.js';
import { Component } from '../core/Component.js';

const REGISTRY = {
  [BrushComponent.componentType]: BrushComponent,
  [CellComponent.componentType]: CellComponent,
  [LightComponent.componentType]: LightComponent,
  [PlayerSpawnComponent.componentType]: PlayerSpawnComponent,
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
