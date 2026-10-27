"""Shared board/bench champion, star and item analysis."""
from analysis import crop
from board_config import STAR_ROI, ITEM_ROIS


class UnitDetails:
    def __init__(self, catalog):
        self.champions = catalog.matcher('champions')
        self.items = catalog.matcher('items')
        self.stars = catalog.matcher('stars')
        self.empty = catalog.matcher('emptyBench')

    def analyze(self, region, save=lambda *_: None):
        champion = self.champions.identify(region)
        star = {'id': None, 'confidence': 0.0}
        if STAR_ROI is not None:
            star_crop = crop(region, STAR_ROI)
            save('star', star_crop)
            star = self.stars.identify(star_crop)
        items = []
        for slot, roi in enumerate(ITEM_ROIS):
            result = {'id': None, 'confidence': 0.0}
            if roi is not None:
                item_crop = crop(region, roi)
                save(f'item_{slot}', item_crop)
                result = self.items.identify(item_crop)
            items.append({'itemId': result['id'], 'confidence': result['confidence']})
        return {'championId': champion['id'], 'confidence': champion['confidence'],
                'star': int(star['id']) if star['id'] else None, 'starConfidence': star['confidence'],
                'items': [v['itemId'] for v in items], 'itemDetails': items}
