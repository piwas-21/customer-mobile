import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductDetail } from '../../api/productDetail';
import type { BundleSelections } from '../../domain/bundleComposition';
import { bundleFlowComplete, bundleFlowSteps, bundleStepComplete } from '../../domain/bundleFlow';
import {
  bundleFlowPlan,
  defaultBundleSelection,
  reconcileBundleSelection,
} from '../../domain/bundleFlowPlan';
export default function useBundleDraft(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const prepared = useMemo(() => {
    try {
      const plan = bundleFlowPlan(product, details, locale, {
        base: t('baseOption'),
        ingredients: t('ingredients'),
        sauces: t('sauces'),
      });
      return { plan, selection: defaultBundleSelection(plan) };
    } catch {
      return undefined;
    }
  }, [product, details, locale, t]);
  const initial = {
    prepared,
    selection: prepared?.selection,
    id: 'quantity',
    changed: false,
    unsupported: false,
  };
  const [state, setState] = useState(initial);
  if (state.prepared !== prepared)
    setState({ ...initial, changed: state.changed || Boolean(state.prepared) });
  const current = state.prepared === prepared ? state : initial;
  const selection = current.selection;
  const plan = prepared?.plan;
  const steps = useMemo(
    () => (plan && selection ? bundleFlowSteps(plan, selection) : []),
    [plan, selection],
  );
  const index = Math.max(
    0,
    steps.findIndex(({ id }) => id === current.id),
  );
  const step = steps[index];
  function change(patch: Partial<BundleSelections>) {
    setState((previous) => {
      if (previous.prepared !== prepared || !previous.selection || !plan) return previous;
      try {
        return {
          ...previous,
          unsupported: false,
          selection: reconcileBundleSelection(plan, { ...previous.selection, ...patch }),
        };
      } catch {
        return { ...previous, unsupported: true };
      }
    });
  }
  const complete = Boolean(
    !current.unsupported && step && selection && bundleStepComplete(step, selection),
  );
  function move(offset: number) {
    const target = steps[Math.max(0, Math.min(index + offset, steps.length - 1))];
    if (target)
      setState((previous) =>
        previous.prepared === prepared ? { ...previous, id: target.id } : previous,
      );
  }
  return {
    plan,
    selection,
    steps,
    step,
    index,
    changed: current.changed,
    unsupported: current.unsupported,
    complete,
    change,
    next: () => {
      if (complete) move(1);
    },
    back: () => move(-1),
    valid: Boolean(
      !current.unsupported && selection && bundleFlowComplete(product, details, selection),
    ),
  };
}
export type BundleDraft = ReturnType<typeof useBundleDraft>;
