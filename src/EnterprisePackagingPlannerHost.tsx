import { useEffect, useState } from 'react';
import EnterprisePackagingPlanner from './EnterprisePackagingPlanner';
import { ENTERPRISE_PACKAGING_PLANNER_EVENT } from './enterprisePackagingPlannerStore';

export default function EnterprisePackagingPlannerHost() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    return () => window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
  }, []);

  return <EnterprisePackagingPlanner key={revision} />;
}
