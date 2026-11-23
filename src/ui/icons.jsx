/** Compact 14×14 SVG icons for the editor chrome. */

function Svg({ children, title, ...rest }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconSave(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M2.5 2.5h8.2L13.5 5.3V13.5h-11V2.5Zm1.5 1.5v3h6V4H4Zm0 4.5v3.5h8V8.5H4Z" />
    </Svg>
  );
}

export function IconUndo(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M6.2 3.2 2.8 6.6l3.4 3.4V8.2c2.8 0 4.6.6 5.6 2.2-.2-3.2-2.2-5-5.6-5.2V3.2Z" />
    </Svg>
  );
}

export function IconRedo(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M9.8 3.2v1.8c-3.4.2-5.4 2-5.6 5.2 1-1.6 2.8-2.2 5.6-2.2v1.8l3.4-3.4L9.8 3.2Z" />
    </Svg>
  );
}

export function IconSelect(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M3 2.5 4.2 12l2-1.6 1.6 3.4 1.5-.7-1.6-3.3H11L3 2.5Z" />
    </Svg>
  );
}

export function IconBox(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M3 4.5 8 2l5 2.5v7L8 14.5 3 12V4.5Zm1.4.7v5.9L8 13l3.6-1.9V5.2L8 3.5 4.4 5.2Z" />
    </Svg>
  );
}

export function IconWall(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M2.5 3.5h11v2H2.5v-2Zm0 3.5h11v2H2.5V7Zm0 3.5h11v2H2.5v-2Z" />
    </Svg>
  );
}

export function IconFloor(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M2 10.5 8 6.5l6 4v2.5H2v-2.5Zm1.6 1h8.8L8 8.4 3.6 11.5Z" />
    </Svg>
  );
}

export function IconPlay(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M5 3.5v9l8-4.5-8-4.5Z" />
    </Svg>
  );
}

export function IconStop(props) {
  return (
    <Svg {...props}>
      <rect fill="currentColor" x="4" y="4" width="8" height="8" rx="1" />
    </Svg>
  );
}

export function IconRecord(props) {
  return (
    <Svg {...props}>
      <circle fill="currentColor" cx="8" cy="8" r="4.5" />
    </Svg>
  );
}

export function IconSearch(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M6.8 2.5a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Zm0 1.5a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm4.4 6.2 2.3 2.3-1.1 1.1-2.3-2.3 1.1-1.1Z" />
    </Svg>
  );
}

export function IconMaximize(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M3 3h4v1.4H4.4V7H3V3Zm6 0h4v4h-1.4V4.4H9V3ZM3 9h1.4v2.6H7V13H3V9Zm8.6 0H13v4H9v-1.4h2.6V9Z" />
    </Svg>
  );
}

export function IconRestore(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M5 5h8v8H5V5Zm1.4 1.4v5.2h5.2V6.4H6.4ZM3 3h7v1.4H4.4V8H3V3Z" />
    </Svg>
  );
}

export function IconCollapse(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M4.5 6.2 8 9.7l3.5-3.5 1 1L8 11.7 3.5 7.2l1-1Z" />
    </Svg>
  );
}

export function IconExpand(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M4.5 9.8 8 6.3l3.5 3.5 1-1L8 4.3 3.5 8.8l1 1Z" />
    </Svg>
  );
}

export function IconBrush(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M3 11.5c0-1.5 2.2-2 3.2-2.8L12.5 2.4l1.1 1.1-6.3 6.3c-.8 1-1.3 3.2-2.8 3.2-.8 0-1.5-.5-1.5-1.5Z" />
    </Svg>
  );
}

export function IconLight(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M8 2.2a4 4 0 0 1 2.4 7.2V12H5.6v-2.6A4 4 0 0 1 8 2.2ZM6.2 13h3.6v1.2H6.2V13Z" />
    </Svg>
  );
}

export function IconSpawn(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M8 2.2a2.4 2.4 0 1 1 0 4.8A2.4 2.4 0 0 1 8 2.2ZM4 13.2c0-2.3 1.8-3.8 4-3.8s4 1.5 4 3.8H4Z" />
    </Svg>
  );
}

export function IconFolder(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M2.5 3.5h4l1.2 1.2H13.5v8H2.5v-9.2Z" />
    </Svg>
  );
}

export function IconGrid(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M2.5 2.5h4v4h-4v-4Zm7 0h4v4h-4v-4Zm-7 7h4v4h-4v-4Zm7 0h4v4h-4v-4Z" />
    </Svg>
  );
}

export function IconList(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M3 3.5h10v1.5H3V3.5Zm0 4h10V9H3V7.5Zm0 4h10v1.5H3V11.5Z" />
    </Svg>
  );
}

export const WORKSPACE_ICONS = {
  level: IconBrush,
  world: IconGrid,
  characters: IconSpawn,
  animation: IconRedo,
  materials: IconBox,
  scripting: IconList,
  dialogue: IconLight,
  ui: IconMaximize,
  ai: IconFolder,
};
