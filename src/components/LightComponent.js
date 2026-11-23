import { Component } from '../core/Component.js';

/**
 * Scene light. Position/rotation from owning Actor transform (editor units).
 * Intensity/range authored for Three.js adapters.
 */
export class LightComponent extends Component {
  constructor({
    id,
    enabled,
    lightType = 'point',
    color = '#ffffff',
    intensity = 1,
    range = 1000,
    castShadow = false,
    shadowMapSize = 1024,
    spotAngle = 45,
    spotPenumbra = 0.25,
  } = {}) {
    super({ id, type: LightComponent.componentType, enabled });
    this.lightType = lightType;
    this.color = color;
    this.intensity = intensity;
    this.range = range;
    this.castShadow = Boolean(castShadow);
    this.shadowMapSize = Number(shadowMapSize) || 1024;
    this.spotAngle = Number(spotAngle) || 45;
    this.spotPenumbra = Number(spotPenumbra) || 0;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      lightType: this.lightType,
      color: this.color,
      intensity: this.intensity,
      range: this.range,
      castShadow: this.castShadow,
      shadowMapSize: this.shadowMapSize,
      spotAngle: this.spotAngle,
      spotPenumbra: this.spotPenumbra,
    };
  }

  static fromJSON(data) {
    return new LightComponent(data);
  }
}

LightComponent.componentType = 'Light';
