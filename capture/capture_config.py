"""Relative client-image coordinates; adjust per HUD using the capture settings UI."""
BASE_WIDTH, BASE_HEIGHT = 1920, 1080
STAT_CONFIG = {
    # No fixed scoreboard row reliably identifies the player. Calibrate their HP explicitly.
    'health': {'roi': None, 'range': (0, 100), 'preprocess': 'contrast', 'confidence': 0.75},
    'gold': {'roi': [0.476, 0.807, 0.02, 0.032], 'range': (0, 999), 'preprocess': 'gray', 'confidence': 0.75},
    'level': {'roi': [0.122, 0.807, 0.015, 0.032], 'range': (1, 10), 'preprocess': 'contrast', 'confidence': 0.75},
}
STAT_SAMPLES = 3
