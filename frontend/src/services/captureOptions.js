export const stagePresets = { standard: [0.428, 0.002, 0.025, 0.028], extended: [0.365, 0.006, 0.028, 0.029] };
const defaults = { mode: 'window', windowId: '', monitor: 1, region: [0, 0, 1, 1], stageRoi: stagePresets.standard, debug: false };
export function savedOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem('tft-capture-options'));
    // Update only the former default; preserve user-calibrated regions.
    if (JSON.stringify(saved?.stageRoi) === '[0.365,0.006,0.034,0.04]') saved.stageRoi = stagePresets.extended;
    if (saved && ['window', 'region'].includes(saved.mode) && [saved.region, saved.stageRoi].every(a => Array.isArray(a) && a.length === 4 && a.every(Number.isFinite))) return { ...defaults, ...saved, windowId: '', statRois: Object.fromEntries(Object.entries(saved.statRois || {}).filter(([key, roi]) => ['health', 'gold', 'level'].includes(key) && (roi === null || (key === 'health' && roi === 'auto') || (Array.isArray(roi) && roi.length === 4 && roi.every(Number.isFinite))))) };
  } catch { /* Calibration is optional; corrupt settings use defaults. */ }
  return defaults;
}
