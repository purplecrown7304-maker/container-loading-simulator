import { useEffect, useState } from 'react';
import type { TransportEquipment } from './transportEquipment';

export default function TruckCard3D({ item }: { item: TransportEquipment }) {
  const [result, setResult] = useState<{ key: string; image?: string; failed?: boolean }>();
  const key = JSON.stringify([item.id, item.category, item.geometry, item.vehicleProfile, item.length, item.width, item.height, item.maxPayloadKg]);
  useEffect(() => {
    let active = true;
    void import('./truckCardThumbnail').then(module => module.requestTruckThumbnail(item)).then(
      image => { if (active) setResult({ key, image }); },
      () => { if (active) setResult({ key, failed: true }); },
    );
    return () => { active = false; };
    // Only visual dimensions/identity regenerate this static thumbnail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = result?.key === key ? result : undefined;
  return <span className="equipment-card-photo truck-card-photo" style={{ display: 'grid', placeItems: 'center', background: '#fff', width: '100%', aspectRatio: '2 / 1' }} data-thumbnail-state={current?.image ? 'ready' : current?.failed ? 'error' : 'loading'}>
    {current?.image
      ? <img src={current.image} alt={`${item.shortName} 차량 3D 모형`} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      : <span style={{ color: '#8491a3', fontSize: 11 }}>{current?.failed ? '차량 3D 이미지 로드 실패' : '차량 3D 이미지 준비 중'}</span>}
  </span>;
}
