// Hand-drawn stroke icon set (24px grid, currentColor). No emoji, no dependencies.
import React from 'react';

type P = { size?: number; className?: string };

function base(size: number, children: React.ReactNode, className?: string, filled = false) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'} strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const I = (paths: React.ReactNode) => (p: P) => base(p.size ?? 17, paths, p.className);

export const IconHome = I(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></>);
export const IconPlanner = I(<><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>);
export const IconTasks = I(<><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m8 12.5 2.7 2.7L16.5 9" /></>);
export const IconSchool = I(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" /><path d="M4 20.5V5.5M8 7.5h8M8 11h6" /></>);
export const IconTimer = I(<><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 2M9.5 2.5h5M12 2.5V5.5" /></>);
export const IconFlask = I(<><path d="M9.5 3h5M10.5 3v5.2L5.4 17a2.4 2.4 0 0 0 2.1 3.5h9a2.4 2.4 0 0 0 2.1-3.5L13.5 8.2V3" /><path d="M7.5 14.5h9" /></>);
export const IconCode = I(<><path d="m8.5 8-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4" /></>);
export const IconTrophy = I(<><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 5H4.5a.5.5 0 0 0-.5.5C4 8 6 9.5 8 9.5M16 5h3.5a.5.5 0 0 1 .5.5C20 8 18 9.5 16 9.5M12 13v3M8.5 20.5h7M10 16.5h4l.7 4H9.3Z" /></>);
export const IconReview = I(<><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4a3 3 0 0 1 6 0M9 13.5l2 2 4-4.5" /></>);
export const IconChart = I(<><path d="M4 4v15.5a.5.5 0 0 0 .5.5H20" /><path d="M8.5 15.5v-4M13 15.5V8M17.5 15.5v-6.5" /></>);
export const IconInbox = I(<><path d="M3.5 13.5 5.5 5h13l2 8.5v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /><path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5" /></>);
export const IconSettings = I(<><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.35.95A7 7 0 0 0 14.1 5.1L13.75 2.6h-3.5L9.9 5.1a7 7 0 0 0-2.42 1.44l-2.35-.95-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.35-.95a7 7 0 0 0 2.42 1.44l.35 2.5h3.5l.35-2.5a7 7 0 0 0 2.42-1.44l2.35.95 2-3.46-2-1.55c.1-.46.14-.93.14-1.4Z" /></>);
export const IconSearch = I(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>);
export const IconPlus = I(<><path d="M12 5v14M5 12h14" /></>);
export const IconX = I(<><path d="M6 6l12 12M18 6 6 18" /></>);
export const IconChevronL = I(<><path d="m14.5 6-6 6 6 6" /></>);
export const IconChevronR = I(<><path d="m9.5 6 6 6-6 6" /></>);
export const IconClock = I(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IconAlert = I(<><path d="M12 3.5 22 20H2Z" /><path d="M12 9.5V14M12 17v.01" /></>);
export const IconFlag = I(<><path d="M5.5 21V4" /><path d="M5.5 4.5c4-2 7 2 12 0v9c-5 2-8-2-12 0" /></>);
export const IconLink = I(<><path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.24 4.24 0 0 0-6-6l-1.5 1.5" /><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.24 4.24 0 0 0 6 6L12.5 17.5" /></>);
export const IconTrash = I(<><path d="M4 7h16M9.5 4.5h5M6.5 7l1 13.5h9l1-13.5" /><path d="M10 11v6M14 11v6" /></>);
export const IconEdit = I(<><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17Z" /><path d="m13.5 6.5 3 3" /></>);
export const IconCopy = I(<><rect x="9" y="9" width="11.5" height="11.5" rx="2" /><path d="M5.5 15h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" /></>);
export const IconPlay = I(<><path d="M7 4.8v14.4L19 12Z" /></>);
export const IconPause = I(<><path d="M8.5 5v14M15.5 5v14" /></>);
export const IconCheck = I(<><path d="m5 12.5 4.5 4.5L19 7.5" /></>);
export const IconMenu = I(<><path d="M4 7h16M4 12h16M4 17h16" /></>);
export const IconMoon = I(<><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></>);
export const IconSun = I(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" /></>);
export const IconBook = I(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" /><path d="M4 20.5V5.5" /></>);
export const IconSpark = I(<><path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></>);
export const IconDot = (p: P) => base(p.size ?? 8, <circle cx="12" cy="12" r="6" />, p.className, true);
