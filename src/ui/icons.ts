/** Minimal stroke icon set (24×24, currentColor). */
const P: Record<string, string> = {
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  line: '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
  eraser:
    '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  bank: '<path d="M3 17c4-1 7-4 9-9"/><path d="M21 17c-4-1-7-4-9-9"/><path d="M4 21h16"/><path d="M12 3v2"/>',
  tree: '<path d="M12 2 6.5 9.5H9L5 15h4.5L6 20h12l-3.5-5H19l-4-5.5h2.5Z"/><path d="M12 20v2"/>',
  ring: '<ellipse cx="12" cy="12" rx="5" ry="9"/><path d="M2 12h7"/><path d="m15 12h7"/><path d="m19 9 3 3-3 3"/>',
  flag: '<path d="M5 22V3"/><path d="M5 4h13l-2.5 4.5L18 13H5"/>',
  move: '<path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="5.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" stroke="none"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" stroke="none"/>',
  slow: '<path d="M12 14 15.5 9"/><path d="M3.5 18a9.5 9.5 0 1 1 17 0"/><path d="M7 18h10"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  camera: '<rect x="2" y="6" width="14" height="12" rx="2.5"/><path d="m16 10.5 6-3.5v10l-6-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m22 9-6 6M16 9l6 6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  sled: '<path d="M3 15h15a3 3 0 0 0 3-3"/><path d="M6 15v-3h9v3"/><path d="M2 19h17a3 3 0 0 0 3-3"/><path d="M8 19v-4M14 19v-4"/>',
  gamepad:
    '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor"/><circle cx="17.5" cy="13.5" r="1" fill="currentColor"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z"/>',
  flagFinish: '<path d="M5 22V3"/><path d="M5 4h14v9H5"/><path d="M9 4v9M13 4v9M5 8.5h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  skis: '<path d="M3 16.5 16.5 3.5c1.3-1.1 3.2.3 2.4 1.8"/><path d="M6.5 20.5 20 7.5c1.3-1.1 3.2.3 2.4 1.8"/><path d="M8.5 9.5l3 3M12 13l3 3"/>',
  snowboard: '<rect x="1.5" y="8.8" width="21" height="6.4" rx="3.2" transform="rotate(-28 12 12)"/><path d="M8.3 11.6l1.2 2.2M14.5 8.3l1.2 2.2"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 9.5h6.5l3 7M9 9.5l3 7h-6.5"/><path d="M15.5 9.5 14.5 6.5h2.5M8 7h2.5"/>',
  moto: '<circle cx="5" cy="17" r="3.2"/><circle cx="19" cy="17" r="3.2"/><path d="M5 17l3.5-5.5h5l2.5 3h3"/><path d="M13.5 11.5l2.5-4.5h2.5"/><path d="M9 11.5l1.2 3.5h4"/>',
  buggy: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M3 15v-3.5l3-1 3.5-5h6l2.5 5h3V15"/><path d="M9 17h6M9.5 5.5 9 10.5M15.5 5.5l1 5"/>',
  garage: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8"/><path d="M7 16h10"/>',
  snowflake:
    '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2M4 10.5l3.5-.2L6 7M20 13.5l-3.5.2L18 17M4 13.5l3.5.2L6 17M20 10.5l-3.5-.2L18 7"/>',
};

export function icon(name: keyof typeof P | string, size = 22): string {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}
