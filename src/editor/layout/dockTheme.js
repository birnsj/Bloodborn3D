import { themeDark } from 'dockview-react';

/** BloodBound dockview theme — charcoal chrome, crimson accent via CSS class. */
export const bloodboundDockTheme = {
  ...themeDark,
  name: 'bloodbound',
  className: 'dockview-theme-bloodbound',
  gap: 0,
  dndOverlayMounting: 'absolute',
  dndPanelOverlay: 'group',
};
