'use strict';

// Office radio: Radio Browser station parsing and the renderer CSP that lets
// streams play without letting scripts in.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const radio = loadTs('src/shared/office/radio.ts');

const raw = (over) => ({
  stationuuid: 'id-' + (over.name || 'x'),
  name: 'Wish 107.5',
  url: 'http://example.com/a',
  url_resolved: 'https://stream.example.com/wish.mp3',
  tags: 'pop,opm',
  codec: 'MP3',
  bitrate: 128,
  votes: 10,
  lastcheckok: 1,
  ...over
});

test('keeps one station per name (most votes), most voted first', () => {
  const out = radio.parseStations([
    raw({ name: 'Love Radio Manila', votes: 3, stationuuid: 'low' }),
    raw({ name: 'love radio manila ', votes: 9, stationuuid: 'high' }),
    raw({ name: 'Barangay LS 97.1', votes: 50 })
  ]);
  assert.deepEqual(out.map((s) => s.name), ['Barangay LS 97.1', 'love radio manila']);
  assert.equal(out[1].id, 'high');
  assert.equal(out[0].url, 'https://stream.example.com/wish.mp3');
});

test('drops non-http streams, broken stations and junk; falls back to url', () => {
  const out = radio.parseStations([
    raw({ name: 'A', url_resolved: 'javascript:alert(1)', url: 'file:///etc/passwd' }),
    raw({ name: 'B', lastcheckok: 0 }),
    raw({ name: '   ' }),
    null,
    'junk',
    raw({ name: 'C', url_resolved: '', url: 'http://1.2.3.4:8000/;stream.mp3' })
  ]);
  assert.deepEqual(out.map((s) => [s.name, s.url]), [['C', 'http://1.2.3.4:8000/;stream.mp3']]);
  assert.deepEqual(radio.parseStations({ not: 'a list' }), []);
});

test('caps the list', () => {
  const many = Array.from({ length: radio.RADIO_MAX_STATIONS + 50 }, (_, i) => raw({ name: `S${i}`, votes: i }));
  assert.equal(radio.parseStations(many).length, radio.RADIO_MAX_STATIONS);
});

test('renderer CSP lets radio streams play but still blocks remote scripts and fetches', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/index.html'), 'utf8');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)[1];
  const dir = (name) => (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) || '');
  assert.match(dir('media-src'), /\bhttps:/);
  assert.equal(dir('script-src'), "script-src 'self'");
  assert.doesNotMatch(dir('connect-src'), /radio-browser|\shttps?:(\s|$)/);
});
