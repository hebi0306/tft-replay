"""Board-only distinct champion counts; missing mappings never mean zero traits."""


def calculate_traits(board, catalog, complete=True):
    counts, seen = {}, set()
    for unit in board:
        key = unit['championId']
        if key is None or key not in catalog.champions:
            complete = False
            continue
        traits = set(catalog.get_champion_traits(key))
        if not traits:
            complete = False
        # Mirror Team Builder: duplicate copies contribute once, including their emblems.
        for item in unit['items']:
            if item is None:
                complete = False
            trait = catalog.items.get(item, {}).get('traitId')
            if trait:
                traits.add(trait)
        for trait in traits:
            if (key, trait) not in seen:
                counts[trait] = counts.get(trait, 0) + 1
                seen.add((key, trait))
    result = []
    for key, count in sorted(counts.items()):
        effects = catalog.traits.get(key, {}).get('effects', [])
        thresholds = sorted({e['minUnits'] for e in effects if type(e.get('minUnits')) in (int, float) and e['minUnits'] > 0})
        result.append({'traitId': key, 'count': count, 'active': any(count >= n for n in thresholds) if thresholds else None,
                       'tier': sum(count >= n for n in thresholds) if thresholds else None,
                       'partial': not complete})
    return result, complete
