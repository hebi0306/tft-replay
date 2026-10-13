import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { localReplay } from '../services/localReplay.js';
import '../components/localReplay.css';

export default function LocalReplayPage() {
  const { id } = useParams(), { t, language } = useLanguage();
  const [match, setMatch] = useState(null), [selected, setSelected] = useState(0), [image, setImage] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    localReplay('match', { id }).then(value => { if (active) { if (!value.ended_at) setError('captureNotFinished'); else setMatch(value); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]);
  const round = match?.rounds[selected];
  useEffect(() => {
    let active = true; setImage(null);
    if (round) localReplay('image', { id: round.id }).then(value => { if (active) { setImage(value); setError(''); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [round]);
  return <div className="local-replay-page"><Link className="back-link" to="/#local-recordings">← {t('backHome')}</Link><div className="page-heading"><div><div className="eyebrow">{t('captureLocal')}</div><h1>{t('captureReplay')}</h1>{match && <p>{new Date(match.started_at).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')} · {t('capture_' + match.status)}</p>}</div></div>
    <p className="team-notice">{t('captureRealNotice')}</p>{error && <p className="error-message" role="alert">{t(error)}</p>}
    {!match && !error && <p role="status">{t('captureLoading')}</p>}
    {match && !match.rounds.length && <p className="panel empty-state">{t('captureNoRounds')}</p>}
    {!!match?.rounds.length && <><div className="mode-switch capture-rounds" role="group" aria-label={t('round')}>{match.rounds.map((value, i) => <button key={value.id} className={selected === i ? 'selected' : ''} aria-pressed={selected === i} onClick={() => setSelected(i)}>{value.stage}</button>)}</div><div className="capture-stat-grid panel">{['health', 'gold', 'level'].map(kind => <div key={kind}><span>{t('captureStat_' + kind)}</span><strong>{round[kind] ?? '—'}</strong></div>)}</div><p className="team-notice">{t('captureStatsNote')}</p><section className="panel capture-screenshot"><div className="panel-heading"><h3>{t('round')} {round.stage}</h3><time>{new Date(round.captured_at).toLocaleTimeString(language === 'ko' ? 'ko-KR' : 'en-US')}</time></div>{image ? <img src={image} alt={t('captureImageAlt', { stage: round.stage })} /> : !error && <p role="status">{t('captureLoading')}</p>}</section><div className="capture-actions"><button className="button secondary" disabled={selected === 0} onClick={() => setSelected(i => i - 1)}>{t('capturePrevious')}</button><span>{selected + 1} / {match.rounds.length}</span><button className="button secondary" disabled={selected === match.rounds.length - 1} onClick={() => setSelected(i => i + 1)}>{t('captureNext')}</button></div></>}
  </div>;
}
