// Office radio bridge. Spread into window.cth in ../index.ts.
import { ipcRenderer } from 'electron';
import type { RadioStation } from '../../shared/office/radio';
export type { RadioStation } from '../../shared/office/radio';

export const radioApi = {
  /** Philippine stations from Radio Browser, most voted first (cached in main for 6 h). */
  radioStations: (): Promise<{ ok: true; stations: RadioStation[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('radio:stations')
};
