"""Relative client-image coordinates; adjust per HUD using the capture settings UI."""
BASE_WIDTH, BASE_HEIGHT = 1920, 1080
STAT_CONFIG = {
    # shortcut: follows the enlarged own-player badge; changed HUD skins need recalibration.
    'health': {'roi': 'auto', 'range': (0, 100), 'preprocess': 'contrast', 'confidence': 0.75},
    'gold': {'roi': [0.531, 0.807, 0.02, 0.032], 'range': (0, 999), 'preprocess': 'gray', 'confidence': 0.75},
    'level': {'roi': [0.177, 0.807, 0.015, 0.032], 'range': (1, 10), 'preprocess': 'contrast', 'confidence': 0.75},
}
STAT_SAMPLES = 3

HEALTH_TRACKING = {
    "search_pixels": (1740, 120, 90, 800),
    "digits_pixels": (22, 10, 49, 32),
    "gold_min": (15, 75, 95), "gold_max": (40, 255, 255),
    "confidence": 0.85,
    "templates": [("health-badge.png", 49), ("health-badge-short.png", 35)],
}

STAGE_ROIS = [[0.397, 0.002, 0.025, 0.028], [0.428, 0.002, 0.025, 0.028], [0.365, 0.006, 0.028, 0.029]]
