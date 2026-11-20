import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCaptureWindow } from '../frontend/src/services/captureOptions.js';

test('capture window auto-selection preserves manual choices and handles game restarts', () => {
  const windows = [{id:'100', minimized:true}, {id:'200', minimized:false}];
  assert.equal(selectCaptureWindow('', windows), '200');
  assert.equal(selectCaptureWindow('100', windows), '100');
  assert.equal(selectCaptureWindow('old', [{id:'new', minimized:false}]), 'new');
  assert.equal(selectCaptureWindow('old', []), '');
  assert.equal(selectCaptureWindow('', [{id:'1'}, {id:'2'}]), '');
  assert.equal(selectCaptureWindow('', [{id:'1', minimized:true}]), '1');
});
