import unittest
from unittest.mock import patch
import cv2
import numpy as np
from reference_matcher import ReferenceMatcher, body_shape

class ShapeIdentityTests(unittest.TestCase):
    def test_shape_is_normalized_and_blank_is_zero(self):
        self.assertFalse(np.any(body_shape(np.zeros((64,48,3),np.uint8))))
        image=np.zeros((64,48,3),np.uint8)
        cv2.circle(image,(24,32),16,(255,180,80),-1)
        self.assertAlmostEqual(float(np.linalg.norm(body_shape(image))),1,places=5)

    def test_shape_color_fallback_accepts_agreement_and_rejects_ties(self):
        matcher=ReferenceMatcher(threshold=2,align=True)
        rng=np.random.default_rng(12)
        image=rng.integers(0,255,(48,48,3),dtype=np.uint8)
        matcher.samples=[('a',(image[4:44,4:44].astype(np.float32),)),('b',(image[2:42,2:42].astype(np.float32),))]
        matcher.palette_ids=['a','b']
        matcher.palettes=np.array([[.8,.6],[0.,1.]],np.float32)
        matcher.shapes=np.array([[1.,0.],[0.,1.]],np.float32)
        with patch('reference_matcher.body_colors',return_value=np.array([1.,0.],np.float32)),              patch('reference_matcher.body_shape',return_value=np.array([1.,0.],np.float32)):
            result=matcher.identify(image)
            self.assertEqual(result['id'],'a')
            self.assertEqual(result['method'],'body-shape-color')
            matcher.palettes[1]=matcher.palettes[0]
            matcher.shapes[1]=matcher.shapes[0]
            self.assertIsNone(matcher.identify(image)['id'])
