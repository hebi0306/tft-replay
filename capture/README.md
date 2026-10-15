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

`capture_config.py` is the numeric ROI/preprocessing/confidence configuration (1920×1080 reference, all coordinates relative). The UI can override numeric ROIs per device. HP defaults to `auto`: a gold-outline template locates the enlarged HP badge in a narrow scoreboard strip and only its digits are OCRed. The position is found again for every sample, so ranking changes do not reuse an old row. Missing or multiple matches return null. Check the preview on your own board: this is HUD-shape recognition, not account identification, and changed/spectator HUDs are not verified. Manual ROI and disabled modes remain available; manual ROIs need recalibration when the row moves. Previously saved disabled/manual choices are preserved; select automatic HP explicitly to switch. Gold and level presets also need the test preview on your HUD. Disabled/unrecognized fields remain null.

Stage confirmation and immediate screenshot writes are unchanged. Calibrated presets try the three observed header positions as round-bar length changes; custom ROIs remain exact. That frame and the next two capture attempts contribute numeric readings only if their Stage matches. A minimum of two identical valid readings is required. Stage changes, failed captures and shutdown cannot carry numbers over into the next round. Gold/HP zero remains zero. Since these samples span roughly two seconds, the majority may reflect a later value than the first screenshot.

SQLite adds nullable health/gold/level columns transactionally when opening old databases. Existing images and rows are retained. A crash or numeric OCR/storage failure leaves the already saved screenshot and null values. Logs go to the desktop terminal: Stage Confirmed, HEALTH/GOLD/LEVEL (or OCR Failed), Saved.

Enable OCR debug in capture settings to inspect ROI, preprocessed image, raw text/confidence and parsed values in test preview. During recording, debug saves only the three sampling attempts to `<recordings>/<match>/debug/`: original frames, per-field ROI/processed PNGs, and per-sample JSON. Normal mode saves none of these debug files. Debug file failures do not stop recording. Debug outputs are per-frame; the final majority is in SQLite and the Saved log.

## Measured calibration results

Live 1920×1080 game captures verified HP 100 in three consecutive samples at ROI `[0.926, 0.472, 0.024, 0.03]`. This was the player’s highlighted fifth scoreboard entry, not a universal HP preset: ranking changes move it. The former manual-only implementation needed recalibration after ranking changes. Automatic tracking now uses the badge outline rather than this row coordinate.

The standard TFT stage ROI `[0.428, 0.002, 0.025, 0.028]` read 1-2 and 1-4. The extended round-bar ROI `[0.365, 0.006, 0.028, 0.029]` read 1-4 at 1920×1080 and 1-1 in the earlier 801×461 sample. Capture settings offer both positions without altering the Stage confirmation algorithm. HUD presets also update gold/level X positions; standard TFT uses 0.531/0.177 and the extended HUD uses 0.476/0.122. Existing manually saved regions remain intact.

An extended-HUD live recording saved stage 1-4, gold 10 and level 3 through the actual capture loop into SQLite. On the standard-game samples the shop was hidden, so gold and level were null. These checks do not establish complete-match accuracy or moving-HP tracking.

### Automatic HP tracking checks

`health_detector.py` uses `assets/health-badge.png`, an outline-only crop from the user-authorized live game capture. The template is bundled with the worker. Color range, search strip, digit offsets and threshold live in `capture_config.py`. No game API or process memory is used. The single-player score/lives screen does not match this badge.

Tests move the real badge crop across three rows at 1280×720, 1920×1080 and 2560×1440; absent/duplicate badges return null. An integration test runs real OCR on generated stage/gold/level labels with that badge through the recording loop, SQLite and image retrieval. This is controlled-image evidence, not a completed live match. Debug output includes the dynamically selected `trackedRoi`.

### Final verification and packaging

A live standard match recorded the 2-6 → 2-7 transition with gold 45 → 56 and level 4. HP initially failed against varying scenery; after restricting comparison to the badge interior, reprocessing those saved real screenshots produced HP 80 → 74. The game had closed before a further live run with that final fix. The production replay component was exercised in an isolated Electron profile using the packaged worker: selecting each round showed the expected three values and the exact matching image data. Full-match accuracy, other HUD skins, spectator mode and single-digit HP have not been verified. Use this automatic HP mode for standard TFT; the extended-HUD preset disables HP to avoid treating lives as health.

Windows builds disable `signAndEditExecutable` because this unsigned development build has no signing credentials and extraction of the legacy signing toolkit requires unavailable symbolic-link privileges. The installer is unsigned; the executable may retain the runtime icon. `npm run package` still bundles the worker and produces the NSIS installer.
