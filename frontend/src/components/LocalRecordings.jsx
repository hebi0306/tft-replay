import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { localReplay } from '../services/localReplay.js';
import './localReplay.css';

const stagePresets = { standard: [0.428, 0.002, 0.025, 0.028], extended: [0.365, 0.006, 0.028, 0.029] };
const defaults = { mode: 'window', windowId: '', monitor: 1, region: [0, 0, 1, 1], stageRoi: stagePresets.standard, debug: false };
function savedOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem('tft-capture-options'));
    // Update only the former default; preserve user-calibrated regions.
    if (JSON.stringify(saved?.stageRoi) === '[0.365,0.006,0.034,0.04]') saved.stageRoi = stagePresets.extended;
    if (saved && ['window', 'region'].includes(saved.mode) && [saved.region, saved.stageRoi].every(a => Array.isArray(a) && a.length === 4 && a.every(Number.isFinite))) return { ...defaults, ...saved, windowId: '', statRois: Object.fromEntries(Object.entries(saved.statRois || {}).filter(([key, roi]) => ['health', 'gold', 'level'].includes(key) && (roi === null || (key === 'health' && roi === 'auto') || (Array.isArray(roi) && roi.length === 4 && roi.every(Number.isFinite))))) };
  } catch { /* Calibration is optional; corrupt settings use defaults. */ }
  return defaults;
}
export default function LocalRecordings() {
  const { t, language } = useLanguage();
  const [options, setOptions] = useState(savedOptions), [sources, setSources] = useState({ windows: [], monitors: [] });
  const [rows, setRows] = useState([]), [status, setStatus] = useState({ recording: false });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [preview, setPreview] = useState(null);
  const supported = Boolean(window.localReplay);
  useEffect(() => {
    if (!supported) return;
    let active = true, timer;
    async function poll() {
      try {
        const next = await localReplay('status'), matches = await localReplay('list');
        if (active) { setStatus(next); setRows(matches); }
      } catch (error) { if (active) setError(error.message); }
      if (active) timer = setTimeout(poll, 2500);
    }
    localReplay('config').then(config => { if (active) setOptions(previous => ({ ...previous, statRois: { ...config, ...previous.statRois } })); }).catch(error => { if (active) setError(error.message); });
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [supported]);
  async function refreshSources() {
    const next = await localReplay('sources'); setSources(next);
    setOptions(previous => ({ ...previous, windowId: next.windows.some(w => w.id === previous.windowId) ? previous.windowId : next.windows.length === 1 ? next.windows[0].id : '' }));
  }
  async function action(method) {
    setBusy(true); setError('');
    try {
      if (method === 'sources') await refreshSources();
      else if (method === 'preview') {
        setPreview(null);
        await new Promise(resolve => setTimeout(resolve, 5000));
        setPreview(await localReplay('preview', options));
      } else {
        const next = await localReplay(method, method === 'start' ? options : {});
        setStatus(next); setRows(await localReplay('list'));
        if (method === 'start') try { localStorage.setItem('tft-capture-options', JSON.stringify(options)); } catch { /* Recording does not require browser storage. */ }
      }
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  function roiFields(key) {
    const roi = options[key] || options.statRois?.[key];
    if (!Array.isArray(roi)) return null;
    return <div className="capture-roi">{['X', 'Y', 'W', 'H'].map((label, index) => <label key={label}>{t('captureAxis_' + label)} %<input type="number" step="0.1" min={index < 2 ? 0 : 0.1} max="100" value={Math.round(roi[index] * 1000) / 10} onChange={e => setOptions({ ...options, ...(options[key] ? { [key]: roi.map((n, i) => i === index ? Number(e.target.value) / 100 : n) } : { statRois: { ...options.statRois, [key]: roi.map((n, i) => i === index ? Number(e.target.value) / 100 : n) } }) })} /></label>)}</div>;
  }
  const previewRoi = preview?.stageTracking?.selectedRoi || options.stageRoi;
  return <section className="panel local-recordings" id="local-recordings">
    <div className="section-heading"><div><div className="eyebrow">{t('captureLocal')}</div><h2>{t('captureTitle')}</h2></div><span className="team-badge">{t('captureNoApi')}</span></div>
    <p className="team-notice">{t('captureIntro')}</p>
    {!supported ? <p className="setup-note">{t('capture_desktop_only')}</p> : <>
      <details><summary>{t('captureSettings')}</summary><fieldset disabled={busy || status.recording} className="capture-settings">
        <label>{t('captureMode')}<select value={options.mode} onChange={e => setOptions({ ...options, mode: e.target.value })}><option value="window">{t('captureWindow')}</option><option value="region">{t('captureRegion')}</option></select></label>
        <button className="button secondary" onClick={() => action('sources')}>{t('captureRefresh')}</button>
        {options.mode === 'window' ? <label>{t('captureWindow')}<select value={options.windowId} onChange={e => setOptions({ ...options, windowId: e.target.value })}><option value="">{t('captureChooseWindow')}</option>{sources.windows.map(w => <option key={w.id} value={w.id}>{w.name} · {w.id}{w.minimized ? ` (${t('window_minimized')})` : ''}</option>)}</select></label> : <><label>{t('captureMonitor')}<select value={options.monitor} onChange={e => setOptions({ ...options, monitor: Number(e.target.value) })}>{(sources.monitors.length ? sources.monitors : [{ id: 1 }]).map(m => <option key={m.id} value={m.id}>{m.id} {m.width ? `· ${m.width} × ${m.height}` : ''}</option>)}</select></label><p className="team-notice">{t('captureRegionHint')}</p>{roiFields('region')}</>}
        <div><h3>{t('captureStageRoi')}</h3><p className="team-notice">{t('captureRoiHint')}</p><div className="capture-actions">{Object.entries(stagePresets).map(([name, roi]) => <button key={name} type="button" className="button secondary" onClick={() => { setOptions({ ...options, stageRoi: roi, statRois: { ...options.statRois, health: name === 'extended' ? null : (options.statRois?.health || 'auto'), gold: [name === 'standard' ? 0.531 : 0.476, 0.807, 0.02, 0.032], level: [name === 'standard' ? 0.177 : 0.122, 0.807, 0.015, 0.032] } }); setPreview(null); }}>{t('captureStagePreset_' + name)}</button>)}</div>{roiFields('stageRoi')}</div>
        <p className="team-notice">{t('captureStatRoiHint')}</p>
        {options.statRois && <label>{t('captureHealthMode')}<select value={options.statRois.health === 'auto' ? 'auto' : options.statRois.health ? 'manual' : 'off'} onChange={e => { setOptions({ ...options, statRois: { ...options.statRois, health: e.target.value === 'auto' ? 'auto' : e.target.value === 'manual' ? [0.926, 0.472, 0.024, 0.03] : null } }); setPreview(null); }}><option value="auto">{t('captureHealthAuto')}</option><option value="manual">{t('captureHealthManual')}</option><option value="off">{t('captureHealthOff')}</option></select>{roiFields('health')}</label>}
        {options.statRois && ['gold', 'level'].map(kind => <div key={kind}><label><span><input type="checkbox" checked={Boolean(options.statRois[kind])} onChange={e => setOptions({ ...options, statRois: { ...options.statRois, [kind]: e.target.checked ? [0, 0, 0.03, 0.04] : null } })} /> {t('captureStat_' + kind)}</span></label>{roiFields(kind)}</div>)}
        <label><span><input type="checkbox" checked={options.debug === true} onChange={e => setOptions({ ...options, debug: e.target.checked })} /> {t('captureDebug')}</span></label>
        <button className="button secondary" onClick={() => action('preview')}>{t('capturePreview')}</button>
        <p className="team-notice">{t('capturePreviewHint')}</p>
      </fieldset></details>
      {preview && <div className="capture-preview"><div className="capture-preview-frame"><img src={preview.image} alt={t('capturePreviewAlt')} /><span style={{ left: `${previewRoi[0] * 100}%`, top: `${previewRoi[1] * 100}%`, width: `${previewRoi[2] * 100}%`, height: `${previewRoi[3] * 100}%` }} /></div><img className="capture-roi-image" src={preview.roiImage} alt={t('captureStageRoi')} /><p>{t('captureDetected')}: {preview.stage || t('ocr_retry')}</p><div className="capture-stat-grid">{['health', 'gold', 'level'].map(kind => <div key={kind}><b>{t('captureStat_' + kind)}</b><p>{preview.stats?.[kind] ?? '—'}</p>{preview.debug?.[kind] && <><small>{JSON.stringify({ raw: preview.debug[kind].raw, parsed: preview.debug[kind].parsed, error: preview.debug[kind].error, trackedRoi: preview.debug[kind].trackedRoi })}</small>{['roi', 'processed'].map(name => preview.debug[kind][name] && <figure key={name}><figcaption>{t('captureDebug_' + name)}</figcaption><img src={preview.debug[kind][name]} alt={t('captureStat_' + kind) + ' ' + t('captureDebug_' + name)} /></figure>)}</>}</div>)}</div><p className="team-notice">{t('capturePreviewStatsHint')}</p></div>}
      <div className="capture-actions"><button className="button primary" disabled={busy || (!status.recording && options.mode === 'window' && !options.windowId)} onClick={() => action(status.recording ? 'stop' : 'start')}>{t(status.recording ? 'captureStop' : 'captureStart')}</button><span role="status">{busy ? t('captureWorking') : status.recording ? t('captureRunning', { stage: status.stage || '—', count: status.rounds }) : t('captureIdle')}</span></div>
      {status.warning && <p className="setup-note" role="status">{t(status.warning)}</p>}
      {error && <p className="error-message" role="alert">{t(error)}</p>}
    </>}
    <h3>{t('captureRecent')}</h3><div className="capture-matches">{rows.filter(row => row.ended_at).map(row => <article key={row.id}><div><b>{new Date(row.started_at).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')}</b><p>{t('captureRoundCount', { count: row.round_count })} · {t('capture_' + row.status)}</p></div><Link className="button secondary" to={`/local-replay/${encodeURIComponent(row.id)}`}>{t('captureView')}</Link></article>)}</div>{!rows.some(row => row.ended_at) && <p className="team-notice">{t('captureEmpty')}</p>}
  </section>;
}
