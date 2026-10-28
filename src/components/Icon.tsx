// One stroke family for every icon: 24px grid, 1.75 stroke, round caps.

const PATHS = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z M19 11a7 7 0 0 1-14 0 M12 18v3',
  hum: 'M3 12h2 M7 8v8 M11 5v14 M15 9v6 M19 11v2',
  keys: 'M3 5h18v14H3z M8 5v8 M12 5v14 M16 5v8 M8 13v6 M16 13v6',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M10 17a1.5 1.5 0 1 1 0-.01 M11.5 17v-5l3 1',
  play: 'M7 4.5v15l12-7.5z',
  stop: 'M6.5 6.5h11v11h-11z',
  reset: 'M3 12a9 9 0 1 0 2.6-6.4 M3 4v5h5',
  library: 'M4 5h16 M4 10h16 M4 15h10 M4 20h7',
  close: 'M6 6l12 12 M18 6 6 18',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  alert: 'M12 8v5 M12 16.5v.01 M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The mark: three punched slots climbing a roll, a contour in its simplest form. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <rect x="0.75" y="0.75" width="24.5" height="24.5" rx="4" fill="var(--paper-lo)" />
      <rect x="4" y="15" width="6" height="3.5" rx="1.2" fill="var(--hole)" />
      <rect x="10.5" y="10" width="5" height="3.5" rx="1.2" fill="var(--hole)" />
      <rect x="16" y="6" width="6" height="3.5" rx="1.2" fill="var(--leader)" />
      <circle cx="4" cy="22" r="1" fill="var(--rule-strong)" />
      <circle cx="9" cy="22" r="1" fill="var(--rule-strong)" />
      <circle cx="14" cy="22" r="1" fill="var(--rule-strong)" />
      <circle cx="19" cy="22" r="1" fill="var(--rule-strong)" />
    </svg>
  );
}
