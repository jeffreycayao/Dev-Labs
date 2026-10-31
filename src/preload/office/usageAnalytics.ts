// Office feature bridge (ported from Claw3D). Spread into window.cth in ../index.ts.
import { ipcRenderer } from 'electron';
import type { UsageAnalyticsResult, UsageRange } from '../../shared/office/usageAnalytics';

export const usageAnalyticsApi = {
  /** Cost & tokens from the cost ledger for an inclusive local-day range. */
  officeUsageAnalytics: (range: UsageRange): Promise<UsageAnalyticsResult> =>
    ipcRenderer.invoke('office:usage:analytics', range),
};
