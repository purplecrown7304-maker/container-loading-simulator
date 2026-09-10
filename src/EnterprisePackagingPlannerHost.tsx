import { useEffect, useState } from 'react';
import EnterprisePackagingPlanner from './EnterprisePackagingPlanner';
import { ENTERPRISE_PACKAGING_PLANNER_EVENT } from './enterprisePackagingPlannerStore';

/**
 * Legacy enterprise planner remains mounted only for backwards-compatible storage/DOM bridges.
 * Product registration and carton recommendations now live in the header menu tools.
 */
export default function EnterprisePackagingPlannerHost() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    return () => window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
  }, []);

  return <div className="enterprise-packaging-host legacy-enterprise-packaging-host" aria-hidden="true" style={{ display: 'none' }}>
    <EnterprisePackagingPlanner key={revision} />
  </div>;
}
