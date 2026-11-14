/** The owner's feature switches (src/shared/features.ts), live from main.
 *  For components that are not handed `config` as a prop. */
import { useEffect, useState } from 'react';
import type { FeatureFlags } from '@shared/features';

export function useFeatures(): Partial<FeatureFlags> {
  const [features, setFeatures] = useState<Partial<FeatureFlags>>({});
  useEffect(() => {
    let alive = true;
    void window.cth.getConfig().then((c) => { if (alive) setFeatures(c.features ?? {}); }).catch(() => { /* older main */ });
    const off = window.cth.onConfigChanged((c) => setFeatures(c.features ?? {}));
    return () => { alive = false; off?.(); };
  }, []);
  return features;
}
