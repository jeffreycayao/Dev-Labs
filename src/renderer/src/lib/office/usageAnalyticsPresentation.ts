import { localDay } from '@shared/office/usageAnalytics';

/** Local calendar day for an `<input type="date">` (Claw3D used UTC, which is off by one near midnight). */
export const toDateInputValue = (date: Date) => localDay(date);

export const getDefaultUsageAnalyticsRange = () => {
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return { startDate: toDateInputValue(start), endDate: toDateInputValue(new Date()) };
};

export const formatCurrency = (value: number | null | undefined) => {
  const amount = value ?? 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount < 10 ? 2 : 0,
    maximumFractionDigits: amount < 10 ? 2 : 0,
  }).format(amount);
};

export const formatNumber = (value: number | null | undefined) => new Intl.NumberFormat('en-US').format(value ?? 0);
