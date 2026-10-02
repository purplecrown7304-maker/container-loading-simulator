import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoadingViewer from '../LoadingViewer';
import ViewerBackgroundSelector from '../ViewerBackgroundSelector';
import { comparisonFixture, comparisonFrame, fixtureNames, type FixtureName } from './fixtures';
import '../three-comparison.css';

function ComparisonDemo() {
  const [fixtureName, setFixtureName] = useState<FixtureName>('pallets');
  const [vehicle, setVehicle] = useState(false), [replay, setReplay] = useState(false), [tick, setTick] = useState(0), [selection, setSelection] = useState('');
  const [geometry, setGeometry] = useState('closed');
  const fixture = useMemo(() => comparisonFixture(fixtureName), [fixtureName]);
  const frameData = useMemo(() => replay ? comparisonFrame(fixture, Math.sin(tick / 15)) : undefined, [fixture, replay, tick]);
  useEffect(() => { if (!replay) return; const timer = window.setInterval(() => setTick(value => value + 1), 50); return () => window.clearInterval(timer); }, [replay]);
  return <main>
    <h1>기존 모델 그대로 · Three.js 렌더링 점검</h1>
    <p>기존 Meshy 모델 8종의 원본 OBJ·UV·텍스처를 Three.js에서 그대로 사용합니다.</p>
    <div className="comparison-demo-notice">독립된 로컬 렌더링 점검 화면입니다. 회사 데이터 저장소에 연결하거나 입력·인증·물리 계산 결과를 수정하지 않습니다. 아래 배치는 렌더링 검사용 샘플이며 안전 인증 결과가 아닙니다.</div>
    <nav aria-label="비교 샘플"><ViewerBackgroundSelector />{fixtureNames.map((name, i) => <button key={name} aria-pressed={fixtureName === name} onClick={() => { setFixtureName(name); setReplay(false); setSelection(''); }}>{['목재·플라스틱 팔레트', '박스 12개', '박스 1200개', '빈 컨테이너'][i]}</button>)}<button aria-pressed={vehicle} onClick={() => setVehicle(!vehicle)}>트럭 캡 {vehicle ? 'ON' : 'OFF'}</button><label>장비 형상 <select aria-label="장비 형상" value={geometry} onChange={e => setGeometry(e.target.value)}><option value="closed">컨테이너</option><option value="platform">플랫폼</option><option value="flat-rack">플랫 랙</option></select></label><button disabled={!fixture.result.placements.length} aria-pressed={replay} onClick={() => setReplay(!replay)}>합성 자세 재생 {replay ? '중지' : '시작'}</button></nav>
    <div className="comparison-demo-status" role="status">{selection || '화물·팔레트를 클릭해 선택 연결을 확인하세요'}{replay && ' · 합성 프레임 재생: 물리 안전 시험 아님'}</div>
    <div className="comparison-demo-view"><LoadingViewer {...fixture} geometry={geometry} vehicle={vehicle} frameData={frameData} syncSelection showDiagnostics title="동일 모델 비교 샘플" onCargoSelect={index => setSelection(`화물 선택 ${index + 1}: ${fixture.result.placements[index].cargoId}`)} onSupportSelect={index => setSelection(`팔레트 선택 ${index + 1}: ${fixture.supports[index].modelKey}`)}/></div>
    <p><a href="/">실제 작업 화면으로 열기</a></p>
    <p>성능 수치는 기기·브라우저·캐시 상태에 따라 달라집니다. 5초 회전 측정은 Three.js 렌더 루프만 측정하므로 적재 계산의 속도 개선을 뜻하지 않습니다.</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ComparisonDemo/></React.StrictMode>);
