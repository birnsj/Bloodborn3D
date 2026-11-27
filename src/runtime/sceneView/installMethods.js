/**
 * Copy the methods of helper classes onto a target class prototype.
 * Lets one large class live in several files without changing behaviour or `this`.
 */
export function installMethods(Target, sources) {
  for (const Source of sources) {
    for (const key of Reflect.ownKeys(Source.prototype)) {
      if (key === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(Target.prototype, key)) {
        throw new Error(`SceneView method defined twice: ${String(key)}`);
      }
      Object.defineProperty(Target.prototype, key, Object.getOwnPropertyDescriptor(Source.prototype, key));
    }
  }
}
