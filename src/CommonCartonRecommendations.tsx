import { useEffect, useMemo, useState } from 'react';
import { optimizeCommonCartonFamily, type CommonCartonFamilyPlan } from './engine/commonCartonFamilyOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import {
  enterprisePackagingOptionsFromPlanner,
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import './common-carton-recommendations.css';

type Props = {
  container: ContainerSpec;
  products: ProductItem[];
  boxes: BoxCatalogItem[];
};

const mm = (value: number) => Math.round(value * 1000);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const sameSize = (a: BoxCatalogItem, b: Pick<BoxCatalogItem, 'innerLength' | 'innerWidth' | 'innerHeight' | 'outerLength' | 'outerWidth' | 'outerHeight'>) =>
  Math.abs(a.innerLength - b.innerLength) < 1e-6
  && Math.abs(a.innerWidth - b.innerWidth) < 1e-6
  && Math.abs(a.innerHeight - b.innerHeight) < 1e-6
  && Math.abs(a.outerLength - b.outerLength) < 1e-6
  && Math.abs(a.outerWidth - b.outerWidth) < 1e-6
  && Math.abs(a.outerHeight - b.outerHeight) < 1e-6;

export default function CommonCartonRecommendations({ container, products, boxes }: Props) {
  const [plan, setPlan] = useState<CommonCartonFamilyPlan | null>(null);
  const [message, setMessage] = useState('제품이 2종 이상이면 여러 SKU에 공용으로 쓸 수 있는 범용 박스 규격을 계산할 수 있습니다.');
  const [saved, setSaved] = useState<Record<string, string>>({});

  useEffect(() => {
    setPlan(null);
    setSaved({});
    setMessage('제품 또는 회사 박스 조건이 변경되었습니다. 범용 상자 추천을 다시 계산하세요.');
  }, [container, products, boxes]);

  const universalBoxes = useMemo(() => {
    if (!plan) return [];
    return plan.family.selectedBoxes
      .filter((item) => item.assignedProducts.length >= 2)
      .sort((a, b) => b.assignedProducts.length - a.assignedProducts.length || a.id.localeCompare(b.id));
  }, [plan]);

  const calculate = () => {
    if (products.length < 2) {
      setPlan(null);
      setMessage('범용 박스 추천은 회사 제품이 2종 이상 등록되어야 계산할 수 있습니다.');
      return;
    }
    const stored = readEnterprisePackagingPlannerState();
    const state: EnterprisePackagingPlannerState = {
      container,
      products,
      boxes,
      settings: stored?.settings,
    };
    const options = enterprisePackagingOptionsFromPlanner(state);
    const next = optimizeCommonCartonFamily(container, products, boxes, options.packaging, {
      ...options.family,
      enabled: true,
    });
    setPlan(next);
    setSaved({});
    const count = next.family.selectedBoxes.filter((item) => item.assignedProducts.length >= 2).length;
    setMessage(count
      ? `범용 박스 ${count}종 추천 · 개별 ${next.family.baselineBoxTypes}종 → 운영 ${next.family.selectedBoxTypes}종`
      : '현재 제품 조합에서는 허용 효율손실 안에서 2개 이상 제품에 공용 가능한 박스를 찾지 못했습니다.');
  };

  const saveRecommendedBox = (box: CommonCartonFamilyPlan['family']['selectedBoxes'][number]) => {
    if (!plan) return;
    if (box.source === 'catalog') {
      setMessage(`${box.name} 규격은 이미 보유 박스 목록에 있습니다.`);
      return;
    }

    const assignment = plan.assignments.find((item) => item.boxId === box.id);
    if (!assignment) {
      setMessage('추천 박스의 상세 치수를 찾지 못했습니다. 추천 계산을 다시 실행하세요.');
      return;
    }

    const stored = readEnterprisePackagingPlannerState();
    const currentState: EnterprisePackagingPlannerState = stored ?? { container, products, boxes };
    const currentBoxes = currentState.boxes ?? [];
    const options = enterprisePackagingOptionsFromPlanner({
      ...currentState,
      container,
      products: currentState.products?.length ? currentState.products : products,
      boxes: currentBoxes,
    });
    const candidateShape = {
      innerLength: assignment.innerLength,
      innerWidth: assignment.innerWidth,
      innerHeight: assignment.innerHeight,
      outerLength: assignment.outerLength,
      outerWidth: assignment.outerWidth,
      outerHeight: assignment.outerHeight,
    };
    const existing = currentBoxes.find((item) => sameSize(item, candidateShape));
    if (existing) {
      setSaved((value) => ({ ...value, [box.id]: existing.id }));
      setMessage(`같은 규격이 이미 개인 박스 목록에 있습니다: ${existing.id}`);
      return;
    }

    const baseId = `REC-${mm(box.outerLength)}X${mm(box.outerWidth)}X${mm(box.outerHeight)}`;
    let id = baseId;
    let suffix = 2;
    while (currentBoxes.some((item) => item.id === id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const recommended: BoxCatalogItem = {
      id,
      name: `범용 추천 ${mm(box.outerLength)}×${mm(box.outerWidth)}×${mm(box.outerHeight)}mm`,
      ...candidateShape,
      tareWeightKg: options.packaging.generatedBoxTareKg,
      maxGrossWeightKg: Math.max(options.packaging.maxGeneratedGrossWeightKg, assignment.grossWeightKg),
      // 추천 규격은 압축강도 검증 전이므로 개인 목록에 저장해도 1단 적재만 허용한다.
      maxTopLoadKg: 0,
      unitCost: assignment.boxUnitCost,
    };

    writeEnterprisePackagingPlannerState({
      ...currentState,
      container,
      products: currentState.products?.length ? currentState.products : products,
      boxes: [...currentBoxes, recommended],
    });
    setSaved((value) => ({ ...value, [box.id]: id }));
    setMessage(`${id}로 개인 박스 목록에 저장했습니다. 강도 미검증 추천 규격이라 상부 적재는 1단으로 제한됩니다.`);
  };

  return <article className="common-carton-card">
    <div className="common-carton-head">
      <div>
        <span>UNIVERSAL CARTON</span>
        <h3>범용 상자 크기 추천</h3>
        <p>등록된 회사 제품 전체를 비교해 여러 SKU에 공용으로 쓸 수 있는 박스 규격을 추천합니다.</p>
      </div>
      <button disabled={products.length < 2} onClick={calculate}>범용 상자 추천 계산</button>
    </div>

    {plan && <div className="common-carton-metrics">
      <div><span>개별 최적 규격</span><b>{plan.family.baselineBoxTypes}종</b></div>
      <div><span>범용화 후 운영 규격</span><b>{plan.family.selectedBoxTypes}종</b></div>
      <div><span>규격 절감</span><b>{plan.family.boxTypeSavings}종</b></div>
      <div><span>평균 효율 손실</span><b>{pct(plan.family.averageScoreLoss)}</b></div>
    </div>}

    <div className="common-carton-list">
      {universalBoxes.map((box) => <section key={box.id} className="common-carton-item">
        <div className="common-carton-size">
          <b>{mm(box.outerLength)} × {mm(box.outerWidth)} × {mm(box.outerHeight)} mm</b>
          <span>{box.source === 'catalog' ? '회사 보유 박스' : box.source === 'standardized' ? '범용 자동설계' : '자동설계'}</span>
        </div>
        <div className="common-carton-coverage">
          <b>{box.assignedProducts.length}개 제품 공용</b>
          <span>{box.assignedProducts.join(', ')}</span>
        </div>
        <div className="common-carton-note">
          {box.source === 'catalog' ? '기존 규격 재사용' : '신규 제작 시 압축강도 확인 필요'}
        </div>
        <button
          type="button"
          className="common-carton-save"
          disabled={box.source === 'catalog' || Boolean(saved[box.id])}
          onClick={() => saveRecommendedBox(box)}
        >{box.source === 'catalog' ? '보유 중' : saved[box.id] ? `저장됨 · ${saved[box.id]}` : '개인 박스 목록에 저장'}</button>
      </section>)}
      {plan && !universalBoxes.length && <div className="common-carton-empty">현재 조건에서 공용 가능한 안전 규격이 없습니다. 제품별 전용 박스 추천은 계속 사용할 수 있습니다.</div>}
      {!plan && <div className="common-carton-empty">범용 상자 추천 계산 후 여러 제품에 같이 쓸 수 있는 규격이 여기에 표시됩니다.</div>}
    </div>
    <p className="common-carton-message">{message}</p>
  </article>;
}
