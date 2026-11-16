type IconName = 'space' | 'cargo' | 'package' | 'strategy' | 'play' | 'result'
 | 'menu' | 'chevronDown' | 'building' | 'download' | 'upload' | 'report' | 'view'
 | 'check' | 'truck' | 'reset' | 'search' | 'lock' | 'activity';
export const studioIconPaths: Record<IconName, string> = {
 space: 'M3 6.5 12 3l9 3.5v11L12 21l-9-3.5z M3 6.5l9 3.5 9-3.5 M12 10v11 M7 8v10 M17 8v10',
 cargo: 'M4 5h6v6H4z M14 5h6v6h-6z M4 15h6v6H4z M14 15h6v6h-6z',
 package: 'M3 7l9-4 9 4v11l-9 4-9-4z M3 7l9 4 9-4 M12 11v11 M8 5l9 4v5',
 strategy: 'M5 3v18 M12 3v18 M19 3v18 M2 8h6 M9 16h6 M16 8h6',
 play: 'M9 6l10 6-10 6z M4 4v16',
 result: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 14l2 2 5-5',
 menu: 'M4 6h16 M4 12h16 M4 18h16',
 chevronDown: 'm6 9 6 6 6-6',
 building: 'M4 21V3h12v18 M16 9h4v12 M2 21h20 M8 7h4 M8 11h4 M8 15h4 M9 21v-2h2v2',
 download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
 upload: 'M12 15V3 m-5 5 5-5 5 5 M4 16v5h16v-5',
 report: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7',
 view: 'M3 5h18v14H3z M3 9h18 M8 9v10',
 check: 'm5 12 4 4L19 6',
 truck: 'M3 5h12v12H3z M15 9h3l3 4v4h-6 M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M16 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
 reset: 'M3 10a9 9 0 1 1 2 8 M3 4v6h6',
 search: 'M16 10a6 6 0 1 0-12 0 6 6 0 1 0 12 0 m-2 4 6 6',
 lock: 'M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4 M12 15v2',
 activity: 'M3 12h4l3-8 4 16 3-8h4',
};
export default function StudioIcon({ name = 'space' }: { name?: IconName }) {
 return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={studioIconPaths[name]}/></svg>;
}
export const stepIcons: IconName[] = ['space', 'cargo', 'package', 'strategy', 'play', 'result'];
