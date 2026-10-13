import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaUrl } from '../src/mediaUrl.js';

test('mediaUrl leaves paths local when no remote base is configured', () => {
  assert.equal(mediaUrl('/music/you-chose-this.mp3', { localPath: '/music-local.mp3', base: '' }), '/music-local.mp3');
});

test('mediaUrl joins remote bases and paths without duplicate slashes', () => {
  assert.equal(mediaUrl('/video/heaven-sky.mp4', { localPath: '/heaven-sky.mp4', base: 'https://cdn.example.com/' }), 'https://cdn.example.com/video/heaven-sky.mp4');
  assert.equal(mediaUrl('favicon.png', { base: 'https://cdn.example.com' }), 'https://cdn.example.com/favicon.png');
});
