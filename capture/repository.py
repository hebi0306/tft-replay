import base64
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat()


class MatchRepository:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / 'matches.sqlite3'
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS rounds (id INTEGER PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id),
                    stage TEXT NOT NULL, image_path TEXT NOT NULL, captured_at TEXT NOT NULL, UNIQUE(match_id, stage));
            ''')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(rounds)')}
            for name in ('health', 'gold', 'level'):
                if name not in columns:
                    db.execute(f'ALTER TABLE rounds ADD COLUMN {name} INTEGER')
            # A previous worker died: retain its rounds and expose it as interrupted.
            db.execute("UPDATE matches SET ended_at=?, status='interrupted' WHERE ended_at IS NULL", (now(),))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def start(self):
        match_id = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_') + uuid.uuid4().hex[:12]
        with self.connect() as db:
            db.execute("INSERT INTO matches VALUES (?, ?, NULL, 'recording')", (match_id, now()))
        (self.root / match_id).mkdir()
        return match_id

    def finish(self, match_id, status='completed'):
        with self.connect() as db:
            db.execute('UPDATE matches SET ended_at=?, status=? WHERE id=?', (now(), status, match_id))

    def save_round(self, match_id, stage, png):
        from analysis import parse_stage
        if parse_stage(stage) != stage:
            raise ValueError('invalid_stage')
        with self.connect() as db:
            match = db.execute('SELECT * FROM matches WHERE id=?', (match_id,)).fetchone()
            if not match or match['ended_at']:
                raise ValueError('match_missing')
            if db.execute('SELECT id FROM rounds WHERE match_id=? AND stage=?', (match_id, stage)).fetchone():
                return
            relative = f'{match_id}/{stage}.png'
            target = self.root / relative
            temporary = target.with_suffix('.tmp')
            temporary.write_bytes(png)
            temporary.replace(target)
            db.execute('INSERT INTO rounds(match_id,stage,image_path,captured_at) VALUES (?,?,?,?)', (match_id, stage, relative, now()))

    def update_stats(self, match_id, stage, values):
        from capture_config import STAT_CONFIG
        for name, config in STAT_CONFIG.items():
            value = values.get(name)
            if value is not None and (type(value) is not int or not config['range'][0] <= value <= config['range'][1]):
                raise ValueError('invalid_stats')
        with self.connect() as db:
            db.execute('UPDATE rounds SET health=?,gold=?,level=? WHERE match_id=? AND stage=?',
                       (values.get('health'), values.get('gold'), values.get('level'), match_id, stage))

    def matches(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute('''SELECT m.*, COUNT(r.id) AS round_count FROM matches m
                LEFT JOIN rounds r ON r.match_id=m.id GROUP BY m.id ORDER BY m.started_at DESC''')]

    def match(self, match_id):
        with self.connect() as db:
            row = db.execute('SELECT * FROM matches WHERE id=?', (match_id,)).fetchone()
            if not row:
                raise ValueError('match_missing')
            return {**dict(row), 'rounds': [dict(r) for r in db.execute('SELECT id,stage,captured_at,health,gold,level FROM rounds WHERE match_id=? ORDER BY id', (match_id,))]}

    def image(self, round_id):
        with self.connect() as db:
            row = db.execute('SELECT image_path FROM rounds WHERE id=?', (round_id,)).fetchone()
        if not row:
            raise ValueError('image_missing')
        return 'data:image/png;base64,' + base64.b64encode((self.root / row['image_path']).read_bytes()).decode('ascii')
