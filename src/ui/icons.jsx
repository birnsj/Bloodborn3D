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

export function IconSurface(props) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M2 3h5v5H2zm7 0h5v2H9zm0 3h5v2H9zm0 3h5v2H9zM2 9h5v5H2z"
      />
    </svg>
  );
}

/** Align to Neighbor — two faces with a join mark. */
export function IconAlign(props) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M2 3h5v10H2zm7 0h5v10H9zm-1 4h2v2H8z"
      />
    </svg>
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
      <path
        fill="currentColor"
        d="M8 1.8 13.6 4.6v6.8L8 14.2 2.4 11.4V4.6L8 1.8Zm0 1.5L4 5.1v5.5l4 2.1 4-2.1V5.1L8 3.3Zm0 2.2 2.6 1.3v.05L8 9.2 5.4 6.85 8 5.5Z"
      />
    </Svg>
  );
}

export function IconWall(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M3.2 2.2h9.6v11.6H3.2V2.2Zm1.5 1.5v2.2h3V3.7h-3Zm4.2 0v2.2h3V3.7h-3Zm-4.2 3.4v2.2h6.8V7.1H4.7Zm0 3.4v2.2h3v-2.2h-3Zm4.2 0v2.2h3v-2.2h-3Z"
      />
    </Svg>
  );
}

export function IconFloor(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 4.2 14 7.5v1.8L8 12.6 2 9.3V7.5L8 4.2Zm0 1.7L4.2 8 8 10.1 11.8 8 8 5.9ZM2.4 10.4 8 13.5l5.6-3.1v1.5L8 15.1 2.4 11.9v-1.5Z"
      />
    </Svg>
  );
}

export function IconCeiling(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.4 4.1 8 1 13.6 4.1V5.6L8 8.7 2.4 5.6V4.1ZM8 2.6 4.2 4.7 8 6.8l3.8-2.1L8 2.6ZM3 8.2h10v1.3H3V8.2Zm1.5 2.4h7v1.2h-7v-1.2Zm1 2.3h5v1.2h-5v-1.2Z"
      />
    </Svg>
  );
}

export function IconRamp(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M2.2 13.2V3.8h2.2l9.4 7.6v1.8H2.2Zm2.4-1.5h7.1L4.6 6.3v5.4Z" />
    </Svg>
  );
}

export function IconStairs(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.2 13.3h11.6v-2.1H11V8.9H8.7V6.6H6.4V4.3H2.2v9Zm1.5-1.5V5.8h1.2v2.3h2.3v2.3H9.5v2.4H3.7Z"
      />
    </Svg>
  );
}

export function IconCurvedWall(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.5 13.2c0-4.1 2.7-7.4 5.5-7.4s5.5 3.3 5.5 7.4h-1.7c0-3.1-2-5.6-3.8-5.6s-3.8 2.5-3.8 5.6H2.5Zm0 .8h11v1.3h-11v-1.3ZM5.2 4.2c.8-.5 1.8-.8 2.8-.8s2 .3 2.8.8l-.9 1.3A3.3 3.3 0 0 0 8 5.1c-.7 0-1.3.2-1.9.6L5.2 4.2Z"
      />
    </Svg>
  );
}

export function IconColumn(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M5.2 2.2h5.6v1.4H5.2V2.2Zm-1.1 1.8h7.8v1.3H4.1V4Zm1.6 1.8h4.6v6.6H5.7V5.8Zm-1.4 7.2h7.4v1.3H4.3v-1.3Zm-.9 1.8h9.2v1.3H3.4v-1.3Z"
      />
    </Svg>
  );
}

export function IconArch(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.2 13.5V7.4C2.2 4.2 4.8 1.8 8 1.8s5.8 2.4 5.8 5.6v6.1h-2.1V7.4c0-2.1-1.7-3.5-3.7-3.5S4.3 5.3 4.3 7.4v6.1H2.2Zm2.8 0h6v-1.4h-6v1.4Z"
      />
    </Svg>
  );
}

export function IconArchGothic(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.2 13.5V8.4C2.2 5.6 4.6 3.1 8 1.9c3.4 1.2 5.8 3.7 5.8 6.5v5.1h-2.1V8.4c0-1.8-1.5-3.4-3.7-4.3-2.2.9-3.7 2.5-3.7 4.3v5.1H2.2Zm2.8 0h6v-1.4h-6v1.4Z"
      />
    </Svg>
  );
}

export function IconSubtract(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.2 2.8h11.6v10.4H2.2V2.8Zm1.6 1.6v7.2h8.4V4.4H3.8Zm1.8 2.8h4.8v1.6H5.6V7.2Z"
      />
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

/** Expanded section — chevron points down. */
export function IconCollapse(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M4.5 6.2 8 9.7l3.5-3.5 1 1L8 11.7 3.5 7.2l1-1Z" />
    </Svg>
  );
}

/** Collapsed section — chevron points right. */
export function IconExpand(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M6.2 4.5 9.7 8l-3.5 3.5 1 1L11.7 8 7.2 3.5l-1 1Z" />
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
      <path
        fill="currentColor"
        d="M8 1.6a3.6 3.6 0 0 1 2.1 6.5V11H5.9V8.1A3.6 3.6 0 0 1 8 1.6ZM6.4 11.8h3.2v1.1H6.4v-1.1Zm.5 1.6h2.2v1.1H6.9v-1.1Z"
      />
    </Svg>
  );
}

/** Point light — omnidirectional rays. */
export function IconPointLight(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M7.25 1.5h1.5v2.2H7.25V1.5Zm0 10.8h1.5v2.2H7.25v-2.2ZM1.5 7.25h2.2v1.5H1.5V7.25Zm10.8 0h2.2v1.5h-2.2V7.25ZM3.1 3.1l1.55 1.55-1.06 1.06L2.04 4.16 3.1 3.1Zm8.24 8.24 1.55 1.55-1.06 1.06-1.55-1.55 1.06-1.06ZM12.9 3.1l1.06 1.06-1.55 1.55-1.06-1.06L12.9 3.1ZM4.65 11.34l1.06 1.06-1.55 1.55-1.06-1.06 1.55-1.55ZM8 5.2a2.8 2.8 0 1 1 0 5.6A2.8 2.8 0 0 1 8 5.2Z"
      />
    </Svg>
  );
}

/** Spot light — cone beam. */
export function IconSpotLight(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M6.6 1.8h2.8v2.2c1.7.4 3.2 1.6 4.1 3.3l-1.5.8c-.7-1.2-1.8-2.1-3.1-2.4v2.1L8 9.2 6.1 7.8V5.7c-1.3.3-2.4 1.2-3.1 2.4l-1.5-.8C2.4 5.6 3.9 4.4 5.6 4V1.8h1Zm-3.4 9.2h9.6v1.3L9.4 14.4H6.6L3.2 11Z"
      />
    </Svg>
  );
}

/** Directional light — sun with parallel rays. */
export function IconDirLight(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 3.4a2.8 2.8 0 1 1 0 5.6A2.8 2.8 0 0 1 8 3.4Zm0-2.2h1.3v1.8H8V1.2ZM2.8 6.1h1.8v1.3H2.8V6.1Zm8.6 0h1.8v1.3h-1.8V6.1ZM4.2 3.3l1.3 1.3-.9.9-1.3-1.3.9-.9Zm7.2 0 .9.9-1.3 1.3-.9-.9 1.3-1.3ZM3.4 11.2h1.5v3.2H3.4v-3.2Zm2.6 0h1.5v3.2H6v-3.2Zm2.6 0h1.5v3.2H8.6v-3.2Zm2.6 0H12.7v3.2h-1.5v-3.2Z"
      />
    </Svg>
  );
}

/** Hemisphere light — sky/ground split. */
export function IconHemiLight(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.4 8.4c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6H2.4Zm0 .9h11.2c-.4 2.8-2.8 5-5.6 5s-5.2-2.2-5.6-5Z"
      />
    </Svg>
  );
}

/** Rect area light — glowing panel. */
export function IconRectAreaLight(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M4.2 3.2h7.6v9.6H4.2V3.2Zm1.4 1.4v6.8h4.8V4.6H5.6ZM2.2 5.2h1.3v5.6H2.2V5.2Zm10.3 0h1.3v5.6h-1.3V5.2ZM6.2 1.5h3.6v1.3H6.2V1.5Zm0 12.7h3.6v1.3H6.2v-1.3Z"
      />
    </Svg>
  );
}

/** Ambient light — soft surrounding glow. */
export function IconAmbientLight(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 4.6a3.4 3.4 0 1 1 0 6.8A3.4 3.4 0 0 1 8 4.6Zm0 1.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM7.35 1.4h1.3v1.8H7.35V1.4Zm0 11.4h1.3v1.8H7.35v-1.8ZM1.4 7.35h1.8v1.3H1.4V7.35Zm11.4 0h1.8v1.3h-1.8V7.35Z"
      />
    </Svg>
  );
}

export function IconEnvironment(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.2 11.8 5.6 7.2l2.2 2.6 2.4-3.4 3.6 5.4H2.2Zm8.4-7.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Z"
      />
    </Svg>
  );
}

export function IconWater(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.2 5.2c1.4 0 1.4 1.2 2.8 1.2S6.4 5.2 7.8 5.2s1.4 1.2 2.8 1.2 1.4-1.2 2.8-1.2v1.6c-1.4 0-1.4 1.2-2.8 1.2S9.2 6.8 7.8 6.8 6.4 8 5 8 3.6 6.8 2.2 6.8V5.2Zm0 3.6c1.4 0 1.4 1.2 2.8 1.2S6.4 8.8 7.8 8.8s1.4 1.2 2.8 1.2 1.4-1.2 2.8-1.2v1.6c-1.4 0-1.4 1.2-2.8 1.2S9.2 10.4 7.8 10.4 6.4 11.6 5 11.6s-1.4-1.2-2.8-1.2V8.8Zm0 3.6c1.4 0 1.4 1.2 2.8 1.2s1.4-1.2 2.8-1.2 1.4 1.2 2.8 1.2 1.4-1.2 2.8-1.2V14c-1.4 0-1.4 1.2-2.8 1.2s-1.4-1.2-2.8-1.2-1.4 1.2-2.8 1.2-1.4-1.2-2.8-1.2v-1.6Z"
      />
    </Svg>
  );
}

export function IconMirror(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M3.2 2.4h9.6v11.2H3.2V2.4Zm1.5 1.5v8.2h6.6V3.9H4.7Zm1.2 1.4h2.2l3.2 5.4H9.1L7.6 8.2 6.4 10.7H4.7l1.2-2.5Z"
      />
    </Svg>
  );
}

export function IconRefractor(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 2.1 13.5 13.2H2.5L8 2.1Zm0 3.2L5.1 11.5h5.8L8 5.3ZM3.2 14.2h9.6v1.2H3.2v-1.2Z"
      />
    </Svg>
  );
}

export function IconDecal(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.4 3.2h7.8l3.4 3.4v6.2H2.4V3.2Zm1.5 1.5v7.1h8.2V7.4H9.4V4.7H3.9Zm2.2 2.4h3.8v1.3H6.1V7.1Zm0 2.5h5v1.3h-5V9.6Z"
      />
    </Svg>
  );
}

export function IconBillboard(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M3.2 2.6h9.6v8.2H8.8v1.4h2.4v1.3H4.8v-1.3h2.4V10.8H3.2V2.6Zm1.5 1.5v5.2h6.6V4.1H4.7Z"
      />
    </Svg>
  );
}

export function IconSky(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M10.6 3.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM2.2 9.6c1.5-1.8 3.5-2.8 5.8-2.8 1.4 0 2.7.4 3.8 1.1A3.5 3.5 0 0 0 8.4 10c-1.7 0-3.1 1.1-3.6 2.6H2.2V9.6Zm5.4 1.2a2.4 2.4 0 0 1 2.4 2.4v.6H5.2v-.6a2.4 2.4 0 0 1 2.4-2.4Z"
      />
    </Svg>
  );
}

export function IconSpawn(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 1.9a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM4.1 13.4c0-2.4 1.8-4 3.9-4s3.9 1.6 3.9 4H4.1Zm3.2-9.8V1.4h1.4v2.2H7.3ZM3.3 5.1l1.6 1.6-.9.9-1.6-1.6.9-.9Zm9.4 0 .9.9-1.6 1.6-.9-.9 1.6-1.6Z"
      />
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

/** Section / organization chrome (Content Browser + Outliner categories). */
export function IconCategory(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M3 2.5h2v11H3v-11Zm3.5 0H13v2.5H6.5V2.5Zm0 4H13V9H6.5V6.5Zm0 4H13v2.5H6.5V10.5Z"
      />
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

export function IconPin(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M6.2 2.5h3.6l.7 4.2 2 1.3v1.5H9.2V13.5H6.8v-4H3.5V8l2-1.3.7-4.2Z" />
    </Svg>
  );
}

export function IconDragHandle(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M3 4.5h10v1.2H3V4.5Zm0 3h10v1.2H3V7.5Zm0 3h10v1.2H3V10.5Z" />
    </Svg>
  );
}

export function IconActors(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M5.1 2.4a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Zm5.8 0a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2ZM2.4 13.2c0-1.9 1.4-3.1 3.1-3.1h.6c.5.6 1.2 1 2 1.2-.5 1.5-1.6 2.5-3.4 2.5H2.4v-.6Zm8.1-.6c-1.8 0-2.9-1-3.4-2.5.8-.2 1.5-.6 2-1.2h.6c1.7 0 3.1 1.2 3.1 3.1v.6H10.5Z"
      />
    </Svg>
  );
}

export function IconPrefab(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.6 2.8h4.8v4.8H2.6V2.8Zm5.999 0H13.4v4.8H8.599V2.8ZM2.6 8.8h4.8v4.8H2.6V8.8Zm5.999 1.6H13.4v3.2H8.599V10.4ZM4 4.2h2v2H4v-2Zm6 0h2v2h-2v-2ZM4 10.2h2v2H4v-2Z"
      />
    </Svg>
  );
}

export function IconMesh(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 1.9 13.7 5v6L8 14.1 2.3 11V5L8 1.9Zm0 1.6L4 5.5v5l4 2.2 4-2.2v-5L8 3.5Zm0 2.4 2.4 1.3v.1L8 9.1 5.6 7.3 8 5.9Z"
      />
    </Svg>
  );
}

export function IconCell(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.6 2.6h10.8v10.8H2.6V2.6Zm1.5 1.5v7.8h7.8V4.1H4.1ZM5.2 5.3h2.1v2.1H5.2V5.3Zm3.5 0h2.1v2.1H8.7V5.3ZM5.2 8.8h2.1v2.1H5.2V8.8Zm3.5 0h2.1v2.1H8.7V8.8Z"
      />
    </Svg>
  );
}

/* —— Batch 5 procedural / native primitive props —— */

export function IconPlane(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M2.2 5.8 8 2.8l5.8 3v6.4L8 15.2 2.2 12.2V5.8Zm1.5 1.2v4.6L8 13.4l4.3-1.8V7L8 4.6 3.7 7Z" />
    </Svg>
  );
}

export function IconCircle(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M8 2.2a5.8 5.8 0 1 1 0 11.6A5.8 5.8 0 0 1 8 2.2Zm0 1.6a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z" />
    </Svg>
  );
}

export function IconSphere(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 1.8a6.2 6.2 0 1 1 0 12.4A6.2 6.2 0 0 1 8 1.8Zm0 1.5a4.7 4.7 0 0 0-4.6 4.1h9.2A4.7 4.7 0 0 0 8 3.3Zm-4.7 5.6a4.7 4.7 0 0 0 9.4 0H3.3Zm2.1-2.8c.4-1.3 1.4-2.2 2.6-2.2s2.2.9 2.6 2.2H5.4Zm0 4.2h5.2c-.4 1.3-1.4 2.2-2.6 2.2s-2.2-.9-2.6-2.2Z"
      />
    </Svg>
  );
}

export function IconCapsule(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M5.2 3.6a2.8 2.8 0 0 1 5.6 0v8.8a2.8 2.8 0 0 1-5.6 0V3.6Zm1.5.4v8.8a1.3 1.3 0 0 0 2.6 0V4a1.3 1.3 0 0 0-2.6 0Z"
      />
    </Svg>
  );
}

export function IconCylinder(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 1.8c2.8 0 5 1 5 2.2v8c0 1.2-2.2 2.2-5 2.2s-5-1-5-2.2v-8c0-1.2 2.2-2.2 5-2.2Zm0 1.4c-2.1 0-3.4.6-3.4 1s1.3 1 3.4 1 3.4-.6 3.4-1-1.3-1-3.4-1ZM4.6 6.2v5.6c0 .4 1.3 1 3.4 1s3.4-.6 3.4-1V6.2c-.9.4-2.1.6-3.4.6s-2.5-.2-3.4-.6Z"
      />
    </Svg>
  );
}

export function IconCone(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M8 1.9 14.2 13.6H1.8L8 1.9Zm0 3.1L4.4 12.1h7.2L8 5Z" />
    </Svg>
  );
}

export function IconRing(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2Zm0 1.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Zm0 2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z"
      />
    </Svg>
  );
}

export function IconTorus(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 2.1a5.9 5.9 0 1 1 0 11.8A5.9 5.9 0 0 1 8 2.1Zm0 1.6a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6Zm0 2.1a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z"
      />
    </Svg>
  );
}

export function IconTorusKnot(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 1.8c2.2 0 3.6 1.1 4.2 2.6.7 1.7.2 3.5-1.1 4.6 1.1.8 1.8 2 1.8 3.4 0 2.2-1.9 3.8-4.9 3.8S2.9 14.6 2.9 12.4c0-1.4.7-2.6 1.8-3.4C3.4 7.9 2.9 6.1 3.6 4.4 4.2 2.9 5.8 1.8 8 1.8Zm0 1.5c-1.6 0-2.6.7-3 1.6-.5 1.2 0 2.5 1.3 3.3L8 9.3l1.7-1.1c1.3-.8 1.8-2.1 1.3-3.3-.4-.9-1.4-1.6-3-1.6Zm-2.8 7.3c-.7.5-1.1 1.2-1.1 2 0 1.3 1.2 2.3 3.3 2.3h1.2c2.1 0 3.3-1 3.3-2.3 0-.8-.4-1.5-1.1-2L8 11.4l-2.8 1.2Z"
      />
    </Svg>
  );
}

export function IconTetrahedron(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M8 2.1 14 13.2H2L8 2.1Zm0 2.8L4.6 11.6h6.8L8 4.9Zm-1.2 5.2h2.4v1.5H6.8V10.1Z" />
    </Svg>
  );
}

export function IconOctahedron(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M8 1.6 13.8 8 8 14.4 2.2 8 8 1.6Zm0 2.4L4.4 8 8 11.6 11.6 8 8 4Z" />
    </Svg>
  );
}

export function IconDodecahedron(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 1.7 12.6 3.6l1.8 4.4-1.8 4.4L8 14.3 3.4 12.4 1.6 8l1.8-4.4L8 1.7Zm0 1.7L4.8 4.7 3.4 8l1.4 3.3L8 12.6l3.2-1.3L12.6 8l-1.4-3.3L8 3.4Z"
      />
    </Svg>
  );
}

export function IconIcosahedron(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M8 1.6 13.5 5.2v5.6L8 14.4 2.5 10.8V5.2L8 1.6Zm0 1.7L4.1 5.8v4.4L8 12.7l3.9-2.5V5.8L8 3.3Zm0 2.2 2.2 1.5v.1L8 9.4 5.8 7.1 8 5.5Z"
      />
    </Svg>
  );
}

export function IconRoundedBox(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M4.4 2.4h7.2A2.2 2.2 0 0 1 13.8 4.6v6.8a2.2 2.2 0 0 1-2.2 2.2H4.4A2.2 2.2 0 0 1 2.2 11.4V4.6A2.2 2.2 0 0 1 4.4 2.4Zm0 1.5c-.4 0-.7.3-.7.7v6.8c0 .4.3.7.7.7h7.2c.4 0 .7-.3.7-.7V4.6c0-.4-.3-.7-.7-.7H4.4Z"
      />
    </Svg>
  );
}

export function IconShape(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M3.2 3.2h4.2v4.2H3.2V3.2Zm5.4 1.4 4.2 2.4-4.2 2.4V4.6ZM3.6 9.2h8.8v1.4L8 14.2 3.6 10.6V9.2Z" />
    </Svg>
  );
}

export function IconExtrude(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.6 10.2 8 6.8l5.4 3.4v3.2L8 16l-5.4-2.6v-3.2Zm1.5 1.1v1.6L8 14.4l3.9-1.5v-1.6L8 12.4l-3.9-1.1ZM5.2 2.2h5.6v1.4H5.2V2.2Zm1.2 2.2h3.2v1.4H6.4V4.4Zm-2 4.2h7.2v1.3H4.4V8.6Z"
      />
    </Svg>
  );
}

export function IconLathe(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M7.2 1.8h1.6v12.4H7.2V1.8ZM4.2 3.4c1.1.8 2.2 1.2 3 1.2v1.5c-1.2 0-2.6-.5-4-1.5l1-1.2Zm7.6 0 1 1.2c-1.4 1-2.8 1.5-4 1.5V4.6c.8 0 1.9-.4 3-1.2ZM3.4 8c1.4-.9 2.9-1.4 4.2-1.4v1.5c-.9 0-2.1.4-3.2 1.1L3.4 8Zm9.2 0-1 .2c-1.1-.7-2.3-1.1-3.2-1.1V6.6c1.3 0 2.8.5 4.2 1.4ZM4.6 12.2c1 .7 2.1 1.1 2.8 1.1v1.4c-1.2 0-2.7-.5-4-1.5l1.2-1Zm6.8 0 1.2 1c-1.3 1-2.8 1.5-4 1.5V13.3c.7 0 1.8-.4 2.8-1.1Z"
      />
    </Svg>
  );
}

export function IconTube(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.4 7.2c0-1.8 2.5-3.2 5.6-3.2s5.6 1.4 5.6 3.2v1.6c0 1.8-2.5 3.2-5.6 3.2s-5.6-1.4-5.6-3.2V7.2Zm1.5.2c0 .8 1.8 1.6 4.1 1.6s4.1-.8 4.1-1.6-1.8-1.6-4.1-1.6-4.1.8-4.1 1.6Zm0 2.4v.6c0 .8 1.8 1.6 4.1 1.6s4.1-.8 4.1-1.6v-.6c-.9.5-2.4.9-4.1.9s-3.2-.4-4.1-.9ZM5.2 3.1h5.6v1.2c-.8-.2-1.8-.3-2.8-.3s-2 .1-2.8.3V3.1Z"
      />
    </Svg>
  );
}

export function IconConvex(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M8 2.1 13.4 5.4v5.2L8 13.9 2.6 10.6V5.4L8 2.1Zm0 1.7L4.2 6v3.9L8 12.1l3.8-2.2V6L8 3.8Z" />
    </Svg>
  );
}

export function IconTextPrim(props) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M3.2 3.2h9.6v2.2H9.4v7.4H6.6V5.4H3.2V3.2Z" />
    </Svg>
  );
}

export function IconParametric(props) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M2.4 11.6c1.6-3.2 3.2-5.2 5.6-7.2 2.4 2 4 4 5.6 7.2l-1.3.9c-1.4-2.5-2.7-4-4.3-5.4-1.6 1.4-2.9 2.9-4.3 5.4l-1.3-.9ZM3.6 4.2h2.2v1.5H3.6V4.2Zm6.6 0h2.2v1.5h-2.2V4.2Z"
      />
    </Svg>
  );
}

/**
 * Achievement seal — Academy mark (laurel + star medallion).
 * Drawn in a larger viewBox so it reads as a formal crest, not a tool icon.
 */
export function IconAcademy(props) {
  const { width = 16, height = 16, title, ...rest } = props;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {/* Outer seal ring */}
      <circle cx="16" cy="15" r="11.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16" cy="15" r="8.6" stroke="currentColor" strokeWidth="0.9" opacity="0.85" />
      {/* Star / achievement */}
      <path
        fill="currentColor"
        d="M16 8.2l1.55 3.55 3.85.35-2.95 2.55.9 3.75L16 16.55l-3.35 1.85.9-3.75-2.95-2.55 3.85-.35L16 8.2Z"
      />
      {/* Laurel left */}
      <path
        fill="currentColor"
        d="M7.2 18.2c1.1 1.6 2.5 2.8 4.2 3.5-.2.55-.3 1.1-.35 1.65-2.2-.9-4-2.6-5.2-4.7.45-.2.9-.35 1.35-.45Zm1.4-3.1c.85 1.35 1.95 2.4 3.25 3.1-.15.5-.25 1-.3 1.5-1.7-.9-3.1-2.3-4-4.05.35-.15.7-.3 1.05-.55Z"
        opacity="0.9"
      />
      {/* Laurel right */}
      <path
        fill="currentColor"
        d="M24.8 18.2c-.45.1-.9.25-1.35.45 1.2 2.1 3 3.8 5.2 4.7.05-.55.15-1.1.35-1.65-1.7-.7-3.1-1.9-4.2-3.5Zm-1.4-3.1c-.35.25-.7.4-1.05.55.9 1.75 2.3 3.15 4 4.05.05-.5.15-1 .3-1.5-1.3-.7-2.4-1.75-3.25-3.1Z"
        opacity="0.9"
      />
      {/* Ribbon tails */}
      <path
        fill="currentColor"
        d="M12.2 26.2 16 23.4l3.8 2.8-1.2-4.1H13.4l-1.2 4.1Z"
        opacity="0.95"
      />
    </svg>
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
