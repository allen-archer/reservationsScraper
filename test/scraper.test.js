import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanPhone,
  cleanRoom,
  getDateString
} from '../src/scraper.js';

describe('cleanPhone', () => {
  test('removes non-digit characters', () => {
    assert.equal(cleanPhone('(555) 123-4567'), '5551234567');
  });

  test('removes country code formatting', () => {
    assert.equal(cleanPhone('+1-555-123-4567'), '15551234567');
  });

  test('returns empty string when input is empty', () => {
    assert.equal(cleanPhone(''), '');
  });
});

describe('cleanRoom', () => {
  test('returns first word of room name', () => {
    assert.equal(cleanRoom('Maple Suite'), 'Maple');
  });

  test('returns hyphenated combo room name intact', () => {
    assert.equal(cleanRoom('Dogwood-Maple Suite'), 'Dogwood-Maple');
  });
});

describe('getDateString', () => {
  test('formats date as YYYY-MM-DD', () => {
    assert.equal(getDateString(new Date(2024, 2, 5)), '2024-03-05');
  });

  test('zero-pads single-digit months and days', () => {
    assert.equal(getDateString(new Date(2024, 0, 1)), '2024-01-01');
  });
});

