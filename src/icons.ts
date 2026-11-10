// Pictos au trait fin (style Lucide), repris de reference/*.html.
// check, help, arrow et alert sont ajoutés pour les blocs absents des références.

export const ICONS: Record<string, string> = {
  pin: '<path d="M12 17v5"/><path d="M9 10.8V5h6v5.8l2 3.2H7z"/><path d="M8 2h8"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  drum: '<ellipse cx="12" cy="10" rx="8" ry="3"/><path d="M4 10v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><path d="M7 3.5l4 5"/><path d="M17 3.5l-4 5"/>',
  guitar: '<path d="M14.5 9.5L20 4"/><path d="M18.5 2.5l3 3"/><path d="M10.2 9.3a3.4 3.4 0 0 0-4.9.6 3.2 3.2 0 0 0-.4.8 3 3 0 0 1-2.1 2.1 2.6 2.6 0 0 0-1 4.3l3.6 3.6a2.6 2.6 0 0 0 4.3-1 3 3 0 0 1 2.1-2.1 3.4 3.4 0 0 0 1.4-5.3"/><circle cx="9" cy="15" r="1.4"/>',
  piano: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M8 19v-6M12 19v-6M16 19v-6"/><path d="M3 13h18"/><path d="M6.5 5v8M10 5v8M14 5v8M17.5 5v8" stroke-width="2.2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.3c2.1.7 3.5 2.8 3.5 5.7"/>',
  baton: '<path d="M4 20L15 9"/><circle cx="17" cy="7" r="2.5"/><path d="M9 18v3M13 18v3M17 18v3"/><path d="M8 18h10"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2.8" y="14" width="4.6" height="6.5" rx="1.6"/><rect x="16.6" y="14" width="4.6" height="6.5" rx="1.6"/>',
  userplus: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-3.9 3.1-7 7-7 1.5 0 2.9.5 4 1.2"/><path d="M19 14v6M16 17h6"/>',
  tent: '<path d="M3 20L12 4l9 16z"/><path d="M12 4v16"/><path d="M9 20l3-5 3 5"/><path d="M1.5 20h21"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  heart: '<path d="M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.5 12 20 12 20z"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 4-3 7-8 7z"/><path d="M12 14c0-3-2.5-5.5-7-5.5 0 3 2.5 5.5 7 5.5z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  hands: '<path d="M12 21V9.5c0-1.5-.6-2.6-1.6-3.5L8 4"/><path d="M12 21V9.5c0-1.5.6-2.6 1.6-3.5L16 4"/><path d="M8 4L5 9v5l4 4"/><path d="M16 4l3 5v5l-4 4"/>',
  book: '<path d="M3 5.5C5 4.5 8.5 4.3 12 6c3.5-1.7 7-1.5 9-.5V19c-2-1-5.5-1.2-9 .5-3.5-1.7-7-1.5-9-.5z"/><path d="M12 6v13.5"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 13h18"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-3.7 3-5.6 3.5-9 2.3 1.4 3.5 3.4 3.5 5.5 1-.8 1.6-2 1.7-3.2 2.3 1.7 4.3 4.3 4.3 6.7 0 3.4-2.5 6-6.5 6z"/>',
  kids: '<circle cx="8" cy="7" r="2.5"/><circle cx="16.5" cy="9" r="2"/><path d="M3.5 20c0-3 2-5.5 4.5-5.5s4.5 2.5 4.5 5.5"/><path d="M13 20c0-2.4 1.5-4.5 3.5-4.5S20 17.6 20 20"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
  arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  alert: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/>',
};

export function iconSymbols(): string {
  return Object.entries(ICONS)
    .map(([id, body]) => `<symbol id="${id}" viewBox="0 0 24 24">${body}</symbol>`)
    .join('\n');
}
