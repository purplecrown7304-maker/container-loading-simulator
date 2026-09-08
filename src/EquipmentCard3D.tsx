import type { TransportEquipment } from './transportEquipment';

type Props = { item: TransportEquipment };

function Corrugation({ x1, y1, x2, y2, count = 10, color = 'rgba(255,255,255,.34)' }: { x1: number; y1: number; x2: number; y2: number; count?: number; color?: string }) {
  return <g stroke={color} strokeWidth="1">{Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / (count + 1);
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    return <line key={index} x1={x} y1={y} x2={x} y2={y + 44} />;
  })}</g>;
}

export default function EquipmentCard3D({ item }: Props) {
  const uid = item.id.replace(/[^a-z0-9]/gi, '');
  const side = `side-${uid}`;
  const top = `top-${uid}`;
  const front = `front-${uid}`;
  const shadow = `shadow-${uid}`;
  const isHigh = item.id.includes('high-cube');
  const bottom = isHigh ? 99 : 93;
  const isCollapsible = item.id.includes('collapsible');

  if (item.geometry === 'tank') {
    return <svg className="equipment-card-3d-svg" viewBox="0 0 200 112" aria-hidden="true">
      <defs><filter id={shadow} x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#0f172a" floodOpacity=".24"/></filter><linearGradient id={side} x1="0" x2="1"><stop stopColor="#f8fafc"/><stop offset=".55" stopColor="#dbe4ee"/><stop offset="1" stopColor="#b9c7d6"/></linearGradient></defs>
      <ellipse cx="103" cy="95" rx="71" ry="9" fill="rgba(15,23,42,.08)"/>
      <g filter={`url(#${shadow})`}>
        <rect x="27" y="26" width="145" height="62" rx="2" fill="none" stroke="#194f8d" strokeWidth="5"/>
        <rect x="40" y="35" width="118" height="45" rx="22" fill={`url(#${side})`} stroke="#718096" strokeWidth="1.5"/>
        <ellipse cx="48" cy="57.5" rx="8" ry="20" fill="#d9e2ec" opacity=".75"/>
        <ellipse cx="151" cy="57.5" rx="8" ry="20" fill="#c6d3df" opacity=".7"/>
        <path d="M27 26h145M27 88h145M27 26v62M172 26v62M62 26v62M137 26v62" stroke="#194f8d" strokeWidth="2" fill="none"/>
        <circle cx="101" cy="37" r="6" fill="#8aa0b5" stroke="#5f7489"/>
        <path d="M99 56h8l5 8-5 8h-8l-5-8z" fill="#f6c344" stroke="#8a6111" strokeWidth="1"/>
      </g>
    </svg>;
  }

  if (item.geometry === 'platform' || item.geometry === 'flat-rack') {
    const wallHeight = isCollapsible ? 20 : 43;
    return <svg className="equipment-card-3d-svg" viewBox="0 0 200 112" aria-hidden="true">
      <defs><filter id={shadow} x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#0f172a" floodOpacity=".22"/></filter><linearGradient id={side} x1="0" x2="1"><stop stopColor="#1d4f89"/><stop offset="1" stopColor="#113d70"/></linearGradient><linearGradient id={top} x1="0" x2="1"><stop stopColor="#d7ae75"/><stop offset="1" stopColor="#b98a4c"/></linearGradient></defs>
      <ellipse cx="104" cy="94" rx="76" ry="8" fill="rgba(15,23,42,.08)"/>
      <g filter={`url(#${shadow})`}>
        <polygon points="24,72 142,53 169,63 49,84" fill={`url(#${top})`} stroke="#315f91" strokeWidth="2"/>
        <polygon points="49,84 169,63 169,72 49,94" fill={`url(#${side})`} stroke="#274f7e" strokeWidth="2"/>
        <polygon points="24,72 49,84 49,94 24,82" fill="#1a4a7d" stroke="#274f7e" strokeWidth="2"/>
        {item.geometry === 'flat-rack' && <>
          <polygon points={`24,72 49,84 49,${84-wallHeight} 24,${72-wallHeight}`} fill="#2c649e" stroke="#184a7d" strokeWidth="2"/>
          <polygon points={`142,53 169,63 169,${63-wallHeight} 142,${53-wallHeight}`} fill="#2a5f97" stroke="#184a7d" strokeWidth="2"/>
          <path d={`M31 ${74-wallHeight}l13 6M149 ${55-wallHeight}l13 6`} stroke="rgba(255,255,255,.4)" strokeWidth="2"/>
        </>}
        <path d="M57 88l104-18M66 86l104-18" stroke="rgba(255,255,255,.25)"/>
      </g>
    </svg>;
  }

  const reefer = item.geometry === 'reefer';
  const bulk = item.geometry === 'bulk';
  const openTop = item.geometry === 'open-top';
  const mainA = reefer || bulk ? '#f8fafc' : '#356ca8';
  const mainB = reefer || bulk ? '#dce5ef' : '#1f548e';
  const mainC = reefer || bulk ? '#c5d1dd' : '#174574';

  return <svg className="equipment-card-3d-svg" viewBox="0 0 200 112" aria-hidden="true">
    <defs>
      <filter id={shadow} x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#0f172a" floodOpacity=".22"/></filter>
      <linearGradient id={side} x1="0" x2="1"><stop stopColor={mainA}/><stop offset="1" stopColor={mainB}/></linearGradient>
      <linearGradient id={top} x1="0" x2="1"><stop stopColor={reefer || bulk ? '#ffffff' : '#5d87b8'}/><stop offset="1" stopColor={reefer || bulk ? '#dfe8f1' : '#2a6099'}/></linearGradient>
      <linearGradient id={front} x1="0" y1="0" x2="1" y2="1"><stop stopColor={mainB}/><stop offset="1" stopColor={mainC}/></linearGradient>
    </defs>
    <ellipse cx="103" cy="98" rx="74" ry="8" fill="rgba(15,23,42,.08)"/>
    <g filter={`url(#${shadow})`}>
      {!openTop && <polygon points="25,31 132,17 167,29 56,45" fill={`url(#${top})`} stroke="#365b82" strokeWidth="1.5"/>}
      {openTop && <>
        <polygon points="29,35 131,22 162,32 58,47" fill="#183e68" stroke="#315e8c" strokeWidth="2"/>
        <polygon points="34,39 130,27 155,34 59,47" fill="#7d5939" opacity=".82"/>
        <path d="M29 35l102-13 31 10M58 47l104-15" stroke="#6693bd" strokeWidth="3" fill="none"/>
      </>}
      <polygon points={`56,45 167,29 167,${bottom-14} 56,${bottom}`} fill={`url(#${side})`} stroke="#315879" strokeWidth="1.5"/>
      <polygon points={`25,31 56,45 56,${bottom} 25,${bottom-15}`} fill={`url(#${front})`} stroke="#315879" strokeWidth="1.5"/>
      <Corrugation x1={62} y1={44} x2={158} y2={31} count={11} color={reefer || bulk ? 'rgba(72,92,112,.28)' : 'rgba(255,255,255,.28)'}/>
      {!bulk && <>
        <path d={`M32 38v${bottom-48}M48 44v${bottom-48}`} stroke={reefer ? '#8394a6' : 'rgba(255,255,255,.43)'} strokeWidth="1.3"/>
        <path d={`M28 48h25M28 59h25M28 70h25`} stroke={reefer ? '#a2afbd' : 'rgba(255,255,255,.24)'} strokeWidth="1"/>
        <rect x="29" y="36" width="22" height={bottom-48} fill="none" stroke={reefer ? '#718295' : 'rgba(16,52,87,.5)'} strokeWidth="1"/>
      </>}
      {reefer && <>
        <rect x="31" y="47" width="20" height="28" rx="2" fill="#d9e2ea" stroke="#708090"/>
        <circle cx="41" cy="57" r="5.5" fill="#889aaa" stroke="#647584"/>
        <circle cx="41" cy="69" r="4.2" fill="#a4b2be" stroke="#758797"/>
        <path d="M38 54l6 6m0-6l-6 6M38 66l6 6m0-6l-6 6" stroke="#dfe7ed" strokeWidth="1"/>
        <text x="116" y="64" fontSize="18" textAnchor="middle" fill="#1688ee">❄</text>
      </>}
      {bulk && <>
        <circle cx="94" cy="28" r="6" fill="#8da0b2" stroke="#66798b"/>
        <circle cx="124" cy="24" r="6" fill="#8da0b2" stroke="#66798b"/>
        <path d={`M70 48l18 ${bottom-18}M105 43l12 ${bottom-14}M139 38l-3 ${bottom-15}`} stroke="#8fa0b1" strokeWidth="2"/>
      </>}
      {item.id.startsWith('custom-') && <text x="113" y="67" textAnchor="middle" fontSize="10" fontWeight="800" fill="rgba(255,255,255,.85)">CUSTOM</text>}
    </g>
  </svg>;
}
