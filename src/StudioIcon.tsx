type IconName = 'space' | 'cargo' | 'package' | 'strategy' | 'play' | 'result';
const paths: Record<IconName, string> = {
 space: 'M3 6.5 12 3l9 3.5v11L12 21l-9-3.5z M3 6.5l9 3.5 9-3.5 M12 10v11 M7 8v10 M17 8v10',
 cargo: 'M4 5h6v6H4z M14 5h6v6h-6z M4 15h6v6H4z M14 15h6v6h-6z',
 package: 'M3 7l9-4 9 4v11l-9 4-9-4z M3 7l9 4 9-4 M12 11v11 M8 5l9 4v5',
 strategy: 'M5 3v18 M12 3v18 M19 3v18 M2 8h6 M9 16h6 M16 8h6',
 play: 'M9 6l10 6-10 6z M4 4v16',
 result: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 14l2 2 5-5',
};
export default function StudioIcon({ name = 'space' }: { name?: IconName }) {
 return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
export const stepIcons: IconName[] = ['space', 'cargo', 'package', 'strategy', 'play', 'result'];
