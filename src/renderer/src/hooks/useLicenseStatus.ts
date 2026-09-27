import { useEffect, useState } from 'react';
import type { LicenseStatus } from '@shared/license';

/**
 * The live licensing status from main. null until the first answer lands
 * (main decides offline at startup, so that is one IPC round trip, not a
 * network call). Subscribe first, then pull, so a push emitted between the
 * two is never lost.
 */
export function useLicenseStatus(): LicenseStatus | null {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const off = window.cth.onLicenseStatus?.((s) => { if (alive) setStatus(s); });
    const pull = window.cth.licenseCurrent?.();
    if (pull) {
      void pull.then((s) => { if (alive) setStatus((prev) => prev ?? s); })
        .catch(() => { if (alive) setStatus((prev) => prev ?? { enforced: false, state: 'disabled' }); });
    } else {
      // Older main without licensing: behave as ungated.
      setStatus({ enforced: false, state: 'disabled' });
    }
    return () => { alive = false; off?.(); };
  }, []);
  return status;
}
