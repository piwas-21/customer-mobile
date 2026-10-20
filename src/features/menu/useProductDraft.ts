import { applyReorderSeed, type ReorderSeed } from '../../domain/reorder';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductDetail } from '../../api/productDetail';
import { productFlow, flowStepComplete, productFlowComplete } from '../../domain/productFlow';
import type { ProductSelections } from '../../domain/productComposition';
export default function useProductDraft(
  product: ProductDetail,
  details: ReadonlyMap<string, ProductDetail>,
  seed?: ReorderSeed,
) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const plan = useMemo(() => {
    try {
      const current = productFlow(product, details, locale, {
        base: t('baseOption'),
        ingredients: t('ingredients'),
        sauces: t('sauces'),
      });
      return { ...current, defaults: applyReorderSeed(current.defaults, seed) };
    } catch {
      return undefined;
    }
  }, [product, details, locale, t, seed]);
  const initial = { plan, selection: plan?.defaults, index: 0, changed: false };
  const [state, setState] = useState(initial);
  if (state.plan !== plan) setState({ ...initial, changed: state.changed || Boolean(state.plan) });
  const current = state.plan === plan ? state : initial;
  const selection = current.selection;
  const step = plan?.steps[current.index];
  const complete = Boolean(step && selection && flowStepComplete(step, selection));
  function change(patch: Partial<ProductSelections>) {
    setState((previous) =>
      previous.plan === plan && previous.selection
        ? { ...previous, selection: { ...previous.selection, ...patch } }
        : previous,
    );
  }
  function next() {
    if (!complete || !plan) return;
    setState((previous) =>
      previous.plan === plan
        ? { ...previous, index: Math.min(previous.index + 1, plan.steps.length - 1) }
        : previous,
    );
  }
  function back() {
    setState((previous) =>
      previous.plan === plan ? { ...previous, index: Math.max(0, previous.index - 1) } : previous,
    );
  }
  return {
    plan,
    selection,
    step,
    index: current.index,
    changed: current.changed,
    change,
    next,
    back,
    complete,
    valid: Boolean(selection && productFlowComplete(product, details, selection)),
  };
}
export type ProductDraft = ReturnType<typeof useProductDraft>;
