# Local TFT screenshot replay (Windows)

This recorder does not call Riot APIs or Overwolf GEP. Electron uses a private,
allowlisted IPC bridge to a Python process over stdin/stdout. Nothing listens on
a capture HTTP port. The existing mock replay and Team Builder remain separate.

## Development

Install Python 3.12 x64, then from the project root:

```powershell
npm run capture:setup
npm run capture:test
npm start
```

If Python is not on PATH:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File capture/setup.ps1 -Python 'C:\path\to\python.exe'
```

The requirements include mss, OpenCV and RapidOCR/ONNX Runtime. OCR models are
included in the installed RapidOCR package, so recording needs no network and no
Tesseract executable. Image analysis runs in a Python worker, not React's thread.

## Record and calibrate

1. Open the desktop app's existing match library. Expand **Capture source and round calibration**.
2. Start a TFT game, then **Find game window / refresh monitors**. Select the game
   executable's window. League Client is not the game window.
3. Configure the round ROI (left/top/width/height percentages of the captured game
   image). Defaults are not guaranteed to match your HUD. Use **Test capture in
   5 seconds**, switch to TFT, return to verify the yellow rectangle and OCR result.
4. If window detection is unavailable, explicitly select a monitor and custom
   region. Region coordinates are percentages of that monitor, including multi-monitor
   layouts with negative screen coordinates. The round ROI is relative to this crop.
5. Start recording and return to the game. The recorder checks once per second,
   with no overlapping OCR calls. It accepts labels 1-1 through 9-7; a label must
   be identical three times. Repeats, backwards labels and jumps over an entire
   stage are ignored. Missed rounds are not fabricated.
6. After the game, click **Stop recording**. Open the resulting local match and
   choose a round or use Previous/Next. There is no automatic game-end detection yet.

Use borderless/windowed mode. mss captures visible pixels, not a game's hidden
render buffer. Window mode pauses when minimized or not foreground. Overlays on
top of the game can appear in screenshots. Custom-region mode records whatever
appears in the selected region; keep other applications outside it.

The game client rectangle is re-read on each frame, so resolution and position
changes retain the relative ROI. A missing window, missing monitor or failed OCR
is retried; disk/SQLite errors stop recording with an error.

## Storage and recovery

Electron uses `<app.getPath('userData')>/recordings` (normally
`%APPDATA%/TFT Replay/recordings`). `matches.sqlite3` stores matches and rounds;
each match directory stores `2-1.png` etc. Only confirmed rounds are persisted.
Test captures remain in memory. Images are written atomically before a SQLite
transaction adds their row; a crash between these operations may leave one
unreferenced image, but does not create a broken database reference.

Normal app exit asks the worker to stop and finish the match. On an abnormal
exit, the next service launch marks unfinished matches interrupted, retaining
their saved rounds. Back up the entire recordings directory together. Recordings
are kept until you remove them yourself; there is no automatic retention cleanup.

## Build

`npm run capture:bundle` builds a standalone Python worker with its OCR models.
`npm run package` includes it under Electron resources/capture-service. End users
of that installer do not need Python or an API key. The existing Electron runtime
is retained, but the automatic GEP package declaration has been removed.

## Analysis extension boundary

`analysis.py` owns image recognition. Stage and HP/gold/level ROI OCR are implemented. Board/items methods still return None.
Reuse frontend/src/services/tftDataService.js for official champion/item metadata
when future detectors produce IDs; never invent recognized units from screenshots.
Local recording IDs remain independent of Riot match IDs and saved team IDs, so
a future comparison can reference both without changing existing compositions.

## Verification limits

Unit checks cover stage stability, duplicate suppression, storage recovery and
ROI validation. Real TFT capture/OCR accuracy and in-game performance must be
measured on a running game after ROI calibration; synthetic OCR is not proof of
live-game accuracy. A stable wrong OCR label can still be accepted. Champion/item/star analysis and automatic start/end detection are intentionally not implemented.

## Phase 2: numeric OCR

`capture_config.py` is the numeric ROI/preprocessing/confidence configuration (1920×1080 reference, all coordinates relative). The UI can override numeric ROIs per device. HP defaults to disabled: select a persistent display of **your own** HP, not an arbitrary scoreboard row. If the selected HUD number moves, recalibrate. Gold and level presets also need the test preview on your HUD. Disabled/unrecognized fields remain null.

The original Stage confirmation and immediate screenshot write are unchanged. That frame and the next two capture attempts contribute numeric readings only if their Stage matches. A minimum of two identical valid readings is required. Stage changes, failed captures and shutdown cannot carry numbers over into the next round. Gold/HP zero remains zero. Since these samples span roughly two seconds, the majority may reflect a later value than the first screenshot.

SQLite adds nullable health/gold/level columns transactionally when opening old databases. Existing images and rows are retained. A crash or numeric OCR/storage failure leaves the already saved screenshot and null values. Logs go to the desktop terminal: Stage Confirmed, HEALTH/GOLD/LEVEL (or OCR Failed), Saved.

Enable OCR debug in capture settings to inspect ROI, preprocessed image, raw text/confidence and parsed values in test preview. During recording, debug saves only the three sampling attempts to `<recordings>/<match>/debug/`: original frames, per-field ROI/processed PNGs, and per-sample JSON. Normal mode saves none of these debug files. Debug file failures do not stop recording. Debug outputs are per-frame; the final majority is in SQLite and the Saved log.
