import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { roundLabel } from '../data/matches.js';

export default function RoundReview({ round, previous, review, expanded, onCompare }) {
  const { t } = useLanguage();
  const { changes, alternative, reason } = review;
  const priority = { star: 0, trait: 1, item: 2, stat: 3 };
  const ordered = changes.map((change, index) => ({ change, index }))
    .sort((a, b) => priority[a.change.kind] - priority[b.change.kind] || a.index - b.index)
    .map(({ change }) => change);
  const renderChange = (change, i) => <li key={i}>
    {change.kind === 'stat'
      ? `${t(change.stat === 'hp' ? 'health' : change.stat)} ${change.before} → ${change.after}`
      : t({ star: 'reviewStar', item: 'reviewItem', trait: 'reviewTrait' }[change.kind], change)}
  </li>;
  return <section className="panel player-status round-review">
    <div className="panel-heading"><h3>{t('reviewTitle')}</h3><span className="micro">{roundLabel(round)}</span></div>
    <div className="round-review-body">
      <h4>{t('reviewObserved')}</h4>
      {previous && <p className="muted">{previous.stage}-{previous.round} → {round.stage}-{round.round}</p>}
      {ordered.length ? <ul>{ordered.slice(0, 2).map(renderChange)}</ul> : <p>{t('reviewNoChanges')}</p>}
      {ordered.length > 2 && <details className="review-more"><summary>{t('reviewMoreChanges', { count: ordered.length - 2 })}</summary><ul>{ordered.slice(2).map(renderChange)}</ul></details>}
      {changes.some(change => change.kind !== 'stat') && <p className="muted">{t('reviewObservationNote')}</p>}
      <h4>{t('reviewAlternative')}</h4>
      {alternative ? <>
        <p>{t('reviewSwap', { incoming: alternative.incoming.name, outgoing: alternative.outgoing.name, from: alternative.outgoing.star, to: alternative.incoming.star })}</p>
        <ul>
          {!alternative.gains.length && <li>{t('reviewStarOption', { from: alternative.outgoing.star, to: alternative.incoming.star })}</li>}
          {alternative.gains.map(trait => <li key={trait.id}>{t('reviewGain', trait)}</li>)}
          {alternative.losses.map(trait => <li key={trait.id}>{t('reviewLoss', trait)}</li>)}
          {!!alternative.removedItems.length && <li>{t('reviewRemovedItems', { items: alternative.removedItems.join(', ') })}</li>}
        </ul>
        <p className="muted">{t(alternative.partial ? 'reviewPartial' : 'reviewEstimate')}</p>
        <button className="button secondary review-compare-button" type="button" onClick={onCompare} aria-expanded={expanded} aria-controls="review-alternative-board">{t(expanded ? 'reviewHideBoard' : 'reviewCompareBoard')}</button>
      </> : <p>{t(reason)}</p>}
    </div>
  </section>;
}
