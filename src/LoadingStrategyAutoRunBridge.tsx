import { useEffect } from 'react';
import { LOADING_STRATEGY_SELECTION_EVENT } from './engine/loadingStrategy';
import { dispatchAppAction } from './uiEvents';

/**
 * Guided workflow synchronization bridge.
 *
 * Step 4 chooses the loading strategy and step 5 is the actual automatic loading stage.
 * A strategy change marks the next automatic-loading stage as dirty. When the workflow
 * enters step 5, the bridge runs loading once so the 3D canvas cannot keep showing the
 * layout calculated with the previous strategy.
 */
export default function LoadingStrategyAutoRunBridge() {
  useEffect(() => {
    let pendingRun = true;
    let lastStep = document.documentElement.dataset.guidedStep ?? '';
    let runTimer = 0;

    const scheduleIfNeeded = () => {
      const currentStep = document.documentElement.dataset.guidedStep ?? '';
      const enteredAutomaticLoading = currentStep === '5' && lastStep !== '5';
      lastStep = currentStep;
      if (!enteredAutomaticLoading || !pendingRun) return;

      pendingRun = false;
      window.clearTimeout(runTimer);
      runTimer = window.setTimeout(() => {
        // dispatchAppAction performs the packaged-cargo synchronization immediately
        // before the run, then App reads the selected strategy for this calculation.
        dispatchAppAction('run-loading');
      }, 40);
    };

    const onStrategySelection = () => {
      pendingRun = true;
      // Normally the selector only exists in step 4. Keeping this guard makes the
      // bridge correct even if a strategy selector is exposed elsewhere later.
      if (document.documentElement.dataset.guidedStep === '5') {
        window.clearTimeout(runTimer);
        runTimer = window.setTimeout(() => {
          pendingRun = false;
          dispatchAppAction('run-loading');
        }, 40);
      }
    };

    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategySelection);
    const observer = new MutationObserver(scheduleIfNeeded);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-guided-step'] });

    return () => {
      window.clearTimeout(runTimer);
      observer.disconnect();
      window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategySelection);
    };
  }, []);

  return null;
}
