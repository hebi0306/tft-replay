"""Private JSON-lines stdin/stdout service launched by Electron. No network listener."""
import base64
import contextlib
import json
import sys
import threading
import time
from analysis import StageTracker, TftImageAnalyzer, crop, normalized_roi
from repository import MatchRepository
from capture_config import STAT_CONFIG, STAT_SAMPLES, GOLD_RETRY_SECONDS
from stat_detector import majority_stats, stable_gold
from concurrent.futures import ThreadPoolExecutor
from board_config import STABILIZE_SECONDS, MAX_WAIT_SECONDS
from repository import now


def validate_options(options):
    if not isinstance(options, dict) or options.get('mode') not in ('window', 'region'):
        raise ValueError('invalid_options')
    normalized_roi(options.get('stageRoi'))
    if options['stageRoi'][2] > 0.4 or options['stageRoi'][3] > 0.2:
        raise ValueError('stage_roi_too_large')
    if options['mode'] == 'region':
        if type(options.get('monitor')) is not int or options['monitor'] < 1:
            raise ValueError('invalid_options')
        normalized_roi(options.get('region'))
    elif not isinstance(options.get('windowId'), str) or not options['windowId'].isdigit():
        raise ValueError('window_missing')
    if type(options.get('debug', False)) is not bool:
        raise ValueError('invalid_options')
    rois = options.get('statRois', {})
    if not isinstance(rois, dict): raise ValueError('invalid_options')
    for kind, config in STAT_CONFIG.items():
        roi = rois.get(kind, config['roi'])
        if kind == 'health' and roi == 'auto': continue
        if roi is not None:
            normalized_roi(roi)
            if roi[2] > 0.2 or roi[3] > 0.15: raise ValueError('invalid_region')
    return options


def png_bytes(frame):
    import cv2
    ok, data = cv2.imencode('.png', frame, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    if not ok:
        raise ValueError('image_failed')
    return data.tobytes()


class CaptureService:
    def __init__(self, root):
        self.repo = MatchRepository(root)
        self.stop_event = threading.Event()
        self.thread = None
        self.lock = threading.Lock()
        self.state = {'recording': False, 'matchId': None, 'stage': None, 'rounds': 0, 'warning': None}
        self.analyzer = None
        self.stage_analyzer = None
        self.auto_tracker = StageTracker()
        self.auto_window = None
        self.auto_suppressed = False
        self.auto_missing = 0

    def status(self):
        with self.lock:
            return dict(self.state)

    def update(self, **values):
        with self.lock:
            self.state.update(values)

    def prepare(self):
        if self.analyzer is None:
            self.analyzer = TftImageAnalyzer()

    def sources(self):
        import mss
        from window_detector import game_windows
        with mss.mss() as sct:
            return {'windows': game_windows(), 'monitors': [{'id': i, 'width': m['width'], 'height': m['height']} for i, m in enumerate(sct.monitors) if i]}

    def preview(self, options):
        import mss
        from window_detector import capture_frame
        validate_options(options)
        if self.status()['recording']:
            raise ValueError('already_recording')
        self.prepare()
        with mss.mss() as sct:
            frame = capture_frame(sct, options)
        values, details = self.analyzer.analyze_stats(frame, self.stat_rois(options), options.get('debug', False))
        for detail in details.values():
            for name in ('roi', 'processed'):
                if name in detail: detail[name] = 'data:image/png;base64,' + base64.b64encode(png_bytes(detail[name])).decode('ascii')
        stage_detail = {}
        stage = self.analyzer.detect_stage(frame, options['stageRoi'], stage_detail)
        selected_roi = stage_detail.get('selectedRoi', options['stageRoi'])
        return {'stats': values, 'debug': details, 'stageTracking': stage_detail,
                'image': 'data:image/png;base64,' + base64.b64encode(png_bytes(frame)).decode('ascii'),
                'roiImage': 'data:image/png;base64,' + base64.b64encode(png_bytes(crop(frame, selected_roi))).decode('ascii'),
                'stage': stage}

    def start(self, options):
        from window_detector import game_windows
        validate_options(options)
        if self.thread and self.thread.is_alive():
            raise ValueError('already_recording')
        if options['mode'] == 'window' and not any(w['id'] == options['windowId'] for w in game_windows()):
            raise ValueError('window_missing')
        self.prepare()
        match_id = self.repo.start()
        self.auto_window = options.get('windowId') if options['mode'] == 'window' else None
        self.auto_missing = 0
        self.auto_suppressed = False
        self.stop_event.clear()
        self.update(recording=True, matchId=match_id, stage=None, rounds=0, warning=None)
        self.thread = threading.Thread(target=self.record, args=(options, match_id), daemon=True)
        self.thread.start()
        return self.status()

    def auto_tick(self, options):
        import mss
        from window_detector import game_windows, capture_frame, user32
        if self.status()['recording'] or (self.thread and self.thread.is_alive()):
            return self.status()
        windows = game_windows()
        foreground = str(user32.GetForegroundWindow())
        window = next((w for w in windows if w['id'] == foreground and not w['minimized']), None)
        if not windows:
            self.auto_suppressed = False
            self.auto_window = None
            self.auto_tracker = StageTracker()
        if window is None:
            self.auto_tracker.observe(None)
            return self.status()
        if self.auto_window != window['id']:
            self.auto_window = window['id']
            self.auto_tracker = StageTracker()
            self.auto_missing = 0
            self.auto_suppressed = False
        selected = {**options, 'mode': 'window', 'windowId': window['id']}
        validate_options(selected)
        self.prepare()
        try:
            with mss.mss() as sct:
                frame = capture_frame(sct, selected)
            stage = self.analyzer.detect_stage(frame, selected['stageRoi'])
        except Exception:
            self.auto_tracker.observe(None)
            return self.status()
        self.auto_missing = 0 if stage else self.auto_missing + 1
        if self.auto_missing >= 36:
            self.auto_suppressed = False
        confirmed = self.auto_tracker.observe(stage)
        if confirmed and self.auto_suppressed and confirmed.startswith('1-') and (self.status()['stage'] or '') >= '2-1':
            self.auto_suppressed = False
        if confirmed and not self.auto_suppressed:
            if self.analyzer.detect_game_end(frame, self.stat_rois(selected)):
                return self.status()
            selected['_automatic'] = True
            result = self.start(selected)
            self.auto_tracker = StageTracker()
            return result
        return self.status()

    def stat_rois(self, options):
        return {kind: options.get('statRois', {}).get(kind, config['roi']) for kind, config in STAT_CONFIG.items()}

    def save_debug(self, match_id, stage, index, frame, details, values):
        directory = self.repo.root / match_id / 'debug'
        directory.mkdir(exist_ok=True)
        (directory / f'{stage}_{index}_original.png').write_bytes(png_bytes(frame))
        for kind, detail in details.items():
            for name in ('roi', 'processed'):
                if name in detail:
                    (directory / f'{kind}_{stage}_{index}_{name}.png').write_bytes(png_bytes(detail.pop(name)))
        (directory / f'{stage}_{index}.json').write_text(json.dumps({'details': details, 'values': values}, ensure_ascii=False, indent=2), encoding='utf-8')

    def skip_board(self, match_id, stage, reason):
        try:
            self.repo.update_analysis(match_id, stage, {'schemaVersion': 1, 'stage': stage,
                'board': [], 'bench': [], 'traits': [], 'traitsComplete': False,
                'status': {'board': reason}, 'userCorrections': None})
        except Exception as error:
            print(f'[Board metadata failed] {error}', file=sys.stderr, flush=True)

    def analyze_board(self, frame, match_id, stage, captured_at, debug):
        try:
            from stage_analyzer import TftStageAnalyzer
            if self.stage_analyzer is None:
                self.stage_analyzer = TftStageAnalyzer()
            directory = self.repo.root / match_id / 'debug' / stage if debug else None
            result = self.stage_analyzer.analyze(frame, stage, directory)
            result.update(capturedAt=captured_at, source='stabilized_frame')
            # Keep the exact analyzed frame separate from the existing immediate screenshot.
            image = png_bytes(frame) if result['status']['board'] == 'ready' else None
            self.repo.update_analysis(match_id, stage, result, image)
            print(f"[Board Saved] {stage}: {result['status']['board']}", file=sys.stderr, flush=True)
            print('[Unit detections] ' + json.dumps({'stage': stage, **result.get('unitDetections', {})}), file=sys.stderr, flush=True)
            print('[Champion assist] ' + json.dumps({'stage': stage, **result['status'].get('championAssist', {})}), file=sys.stderr, flush=True)
        except Exception as error:
            print(f'[Board analysis failed] {error}', file=sys.stderr, flush=True)
            self.skip_board(match_id, stage, 'analysis_failed')

    def record(self, options, match_id):
        import mss
        from window_detector import capture_frame
        tracker = StageTracker()
        failed = False
        missing_since = None
        end_checks = 0
        next_end_check = 0
        restart_tracker = StageTracker()
        pending = None
        pending_board, board_future = None, None
        board_worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix='tft-board')
        def finish_stats():
            nonlocal pending
            if not pending: return
            values = majority_stats(pending['samples'])
            values['gold'] = stable_gold(pending['goldSamples'])
            try:
                self.repo.update_stats(match_id, pending['stage'], values)
                for kind, value in values.items():
                    print(f"[{kind.upper()}] {value}" if value is not None else f"[{kind.upper()} OCR Failed]", file=sys.stderr, flush=True)
                print(f"[Saved] {match_id} / {pending['stage']}", file=sys.stderr, flush=True)
            except Exception as error:
                print(f'[Stats save failed] {error}', file=sys.stderr, flush=True)
                self.update(warning='stats_save_failed')
            pending = None
        def stats_ready():
            return pending and pending['attempts'] >= STAT_SAMPLES and (
                self.stat_rois(options)['gold'] is None
                or stable_gold(pending['goldSamples']) is not None
                or time.monotonic() >= pending['expires'])
        try:
            while not self.stop_event.is_set():
                started = time.monotonic()
                try:
                    with mss.mss() as sct:
                        frame = capture_frame(sct, options)
                    stage = self.analyzer.detect_stage(frame, options['stageRoi'])
                    if options.get('_automatic'):
                        current = time.monotonic()
                        missing_since = (missing_since if missing_since is not None else current) if stage is None else None
                        if current >= next_end_check:
                            next_end_check = current + 3
                            try:
                                ended = self.analyzer.detect_game_end(frame, self.stat_rois(options))
                            except Exception:
                                ended = False
                            end_checks = end_checks + 1 if ended else 0
                            if end_checks >= 3:
                                self.auto_suppressed = True
                                print('[Recording ended] result screen or zero HP confirmed', file=sys.stderr, flush=True)
                                break
                        restarted = restart_tracker.observe(stage if stage and stage.startswith('1-') and tracker.previous and tracker.previous >= '2-1' else None)
                        if (missing_since is not None and current - missing_since >= 90) or restarted:
                            self.auto_suppressed = not bool(restarted)
                            print('[Recording ended] HUD absent or next game detected', file=sys.stderr, flush=True)
                            break
                    if pending_board and ((stage is not None and stage != pending_board['stage']) or time.monotonic() > pending_board['expires']):
                        self.skip_board(match_id, pending_board['stage'], 'stable_frame_unavailable')
                        pending_board = None
                    if pending and stage is not None and stage != pending['stage']:
                        finish_stats()
                    confirmed = tracker.observe(stage)
                    self.update(warning=None if stage else 'ocr_retry')
                    if confirmed:
                        try:
                            self.repo.save_round(match_id, confirmed, png_bytes(frame))
                        except Exception:
                            self.update(warning='storage_failed')
                            failed = True
                            break
                        print(f'[Stage Confirmed] {confirmed}', file=sys.stderr, flush=True)
                        pending = {'stage': confirmed, 'samples': [], 'goldSamples': [], 'attempts': 0,
                                   'expires': time.monotonic() + GOLD_RETRY_SECONDS}
                        pending_board = {'stage': confirmed, 'due': time.monotonic() + STABILIZE_SECONDS,
                                         'expires': time.monotonic() + MAX_WAIT_SECONDS}
                        tracker.commit(confirmed)
                        self.update(stage=confirmed, rounds=self.status()['rounds'] + 1)
                    if pending:
                        pending['attempts'] += 1
                        if stage == pending['stage']:
                            if pending['attempts'] <= STAT_SAMPLES:
                                try:
                                    values, details = self.analyzer.analyze_stats(frame, self.stat_rois(options), options.get('debug', False))
                                except Exception:
                                    values, details = {kind: None for kind in STAT_CONFIG}, {}
                                pending['samples'].append(values)
                                if options.get('debug', False):
                                    try: self.save_debug(match_id, pending['stage'], pending['attempts'], frame, details, values)
                                    except Exception as error: print(f'[Debug save failed] {error}', file=sys.stderr, flush=True)
                                gold = values.get('gold')
                            else:
                                # Income animations and selection overlays can outlast the initial samples.
                                try: gold = self.analyzer.detect_gold(frame, self.stat_rois(options)['gold'])
                                except Exception: gold = None
                            pending['goldSamples'].append(gold)
                        else:
                            pending['goldSamples'].append(None)
                        if stats_ready(): finish_stats()
                    if pending_board and stage == pending_board['stage'] and time.monotonic() >= pending_board['due']:
                        if board_future is None or board_future.done():
                            board_future = board_worker.submit(self.analyze_board, frame.copy(), match_id, stage, now(), options.get('debug', False))
                        else:
                            self.skip_board(match_id, stage, 'analysis_busy')
                        pending_board = None
                except Exception as error:
                    tracker.observe(None)
                    if pending:
                        pending['attempts'] += 1
                        pending['goldSamples'].append(None)
                        if stats_ready(): finish_stats()
                    code = str(error)
                    if options.get('_automatic'):
                        end_checks = 0
                        restart_tracker.observe(None)
                        if code == 'window_missing':
                            print('[Recording ended] game window closed', file=sys.stderr, flush=True)
                            break
                        if missing_since is not None and time.monotonic() - missing_since >= 90:
                            self.auto_suppressed = True
                            print('[Recording ended] HUD absent before capture became unavailable', file=sys.stderr, flush=True)
                            break
                    self.update(warning=code if code in ('window_missing', 'window_minimized', 'window_background', 'invalid_region', 'monitor_missing') else 'ocr_retry')
                self.stop_event.wait(max(0.05, 1.0 - (time.monotonic() - started)))
        except Exception:
            failed = True
            self.update(warning='capture_failed')
        finally:
            finish_stats()
            if pending_board:
                self.skip_board(match_id, pending_board['stage'], 'stable_frame_unavailable')
            board_worker.shutdown(wait=True)
            try:
                self.repo.finish(match_id, 'interrupted' if failed else 'completed')
            except Exception:
                self.update(warning='storage_failed')
            self.update(recording=False)

    def stop(self):
        self.auto_suppressed = True
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=15)
            if self.thread.is_alive():
                raise ValueError('stop_pending')
        return self.status()

    def dispatch(self, method, args):
        if method == 'auto_tick': return self.auto_tick(args)
        if method == 'config': return {kind: config['roi'] for kind, config in STAT_CONFIG.items()}
        if method == 'status': return self.status()
        if method == 'sources': return self.sources()
        if method == 'preview': return self.preview(args)
        if method == 'start': return self.start(args)
        if method == 'stop': return self.stop()
        if method == 'list': return self.repo.matches()
        if method == 'match': return self.repo.match(args['id'])
        if method == 'image': return self.repo.image(args['id'])
        raise ValueError('invalid_command')


def main():
    service = CaptureService(sys.argv[1])
    output = sys.stdout
    try:
        for line in sys.stdin:
            request = {}
            try:
                request = json.loads(line)
                # Library diagnostics must not corrupt the private JSON protocol.
                with contextlib.redirect_stdout(sys.stderr):
                    result = service.dispatch(request['method'], request.get('args', {}))
                response = {'id': request['id'], 'result': result}
            except Exception as error:
                print(repr(error), file=sys.stderr, flush=True)
                response = {'id': request.get('id'), 'error': str(error) if isinstance(error, ValueError) else 'service_failed'}
            output.write(json.dumps(response) + '\n')
            output.flush()
    finally:
        service.stop()


if __name__ == '__main__':
    main()
