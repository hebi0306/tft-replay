"""Read an offline export of the existing frontend TFT catalog and labelled crop references."""
import json
from board_config import DATA_DIR
from reference_matcher import ReferenceMatcher


class TftCatalog:
    def __init__(self, root=DATA_DIR):
        self.root = root
        self.data = {'champions': [], 'items': [], 'traits': []}
        file = root / 'catalog.json'
        if file.is_file():
            self.data = json.loads(file.read_text(encoding='utf-8'))
        self.champions = {v['id']: v for v in self.data['champions'] if v.get('set') == self.data.get('currentSet')}
        self.items = {v['id']: v for v in self.data['items']}
        self.traits = {v['id']: v for v in self.data['traits']}
        ref_file = root / 'references.json'
        self.references = json.loads(ref_file.read_text(encoding='utf-8')) if ref_file.is_file() else {}

    def matcher(self, kind):
        allowed = self.champions if kind == 'champions' else self.items if kind == 'items' else {'1', '2', '3'} if kind == 'stars' else {'empty'}
        entries = [e for e in self.references.get(kind, []) if e.get('id') in allowed]
        return ReferenceMatcher(entries, self.root)

    def get_champion_by_id(self, champion_id):
        return self.champions.get(champion_id)

    def get_champion_traits(self, champion_id):
        return self.champions.get(champion_id, {}).get('traits', [])
