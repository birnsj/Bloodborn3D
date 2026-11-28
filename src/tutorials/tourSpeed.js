/**
 * Live Academy Tour speed factor used by cursor / orbit helpers.
 * TutorialProvider keeps this in sync with prefs.tourSpeed.
 */

import { normalizeTourSpeed, tourDelay } from './academyTour.js';

let tourSpeedFactor = 1;

export function setTourSpeedFactor(speed) {
  tourSpeedFactor = normalizeTourSpeed(speed);
  return tourSpeedFactor;
}

export function getTourSpeedFactor() {
  return tourSpeedFactor;
}

export function tourMs(baseMs) {
  return tourDelay(baseMs, tourSpeedFactor);
}
