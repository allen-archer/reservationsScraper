import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanPhone,
  cleanName,
  cleanRoom,
  cleanNights,
  cleanPaid,
  getDateString,
  combineAllPhoneNumbers
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

describe('cleanName', () => {
  test('reverses "Last, First" to "First Last"', () => {
    assert.equal(cleanName('Smith, John'), 'John Smith');
  });

  test('strips HTML tags before reversing', () => {
    assert.equal(cleanName('Smith, <em>John</em>'), 'John Smith');
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

describe('cleanNights', () => {
  test('returns third space-separated token', () => {
    assert.equal(cleanNights('one two three'), 'three');
    assert.equal(cleanNights('a b 5'), '5');
  });
});

describe('cleanPaid', () => {
  test('returns $0.00 when paid in full', () => {
    assert.equal(cleanPaid('Paid: Yes'), '$0.00');
  });

  test('returns third token as balance due', () => {
    assert.equal(cleanPaid('Balance Due $50.00'), '$50.00');
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

describe('combineAllPhoneNumbers', () => {
  test('maps room numbers to phone arrays for checkins and stayovers', () => {
    const map = new Map([
      ['checkins',  [{ room: 'Maple',   phones: ['5551234567'] }]],
      ['stayovers', [{ room: 'Dogwood', phones: ['5559876543'] }]],
      ['checkouts', []]
    ]);
    const secrets = { roomNumberMap: { Maple: '101', Dogwood: '102' } };

    const result = combineAllPhoneNumbers(map, secrets);

    assert.deepEqual(result.get('101'), ['5551234567']);
    assert.deepEqual(result.get('102'), ['5559876543']);
  });

  test('stayover phone overwrites checkin phone for same room', () => {
    const map = new Map([
      ['checkins',  [{ room: 'Maple', phones: ['1111111111'] }]],
      ['stayovers', [{ room: 'Maple', phones: ['2222222222'] }]],
      ['checkouts', []]
    ]);
    const secrets = { roomNumberMap: { Maple: '101' } };

    const result = combineAllPhoneNumbers(map, secrets);

    assert.deepEqual(result.get('101'), ['2222222222']);
  });

  test('returns empty map when no checkins or stayovers', () => {
    const map = new Map([
      ['checkins',  []],
      ['stayovers', []],
      ['checkouts', []]
    ]);
    const secrets = { roomNumberMap: {} };

    const result = combineAllPhoneNumbers(map, secrets);

    assert.equal(result.size, 0);
  });
});
