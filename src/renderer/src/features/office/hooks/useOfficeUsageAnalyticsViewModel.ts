import { useCallback, useEffect, useRef, useState } from 'react';
import type { UsageAnalytics } from '@shared/office/usageAnalytics';
import { getDefaultUsageAnalyticsRange } from '@/lib/office/usageAnalyticsPresentation';

/** Props the ATM screen takes. DevLabs reads the local cost ledger, so nothing is
 *  required. `gatewayUrl` is kept only because RetroOffice3D reads it; leave it
 *  unset, or the host will try to sync the layout to a gateway that isn't there. */
export type OfficeUsageAnalyticsParams = { gatewayUrl?: string };

export const useOfficeUsageAnalyticsViewModel = (_params?: OfficeUsageAnalyticsParams) => {
  const defaultRange = getDefaultUsageAnalyticsRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [data, setData] = useState<UsageAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await window.cth.officeUsageAnalytics({ startDate, endDate });
      if (id !== requestId.current) return; // a newer range was asked for
      if (res.ok) {
        setData(res.data);
        setError(null);
        setLastRefreshedAt(Date.now());
      } else {
        setError(res.error);
      }
    } catch {
      if (id === requestId.current) setError("Couldn't load spending. Try Refresh.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { startDate, setStartDate, endDate, setEndDate, data, loading, error, lastRefreshedAt, refresh };
};
