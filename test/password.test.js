import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword } from '../src/password.js';

describe('generatePassword', () => {
  test('returns a string of length 16', () => {
    assert.equal(generatePassword().length, 16);
  });

  test('contains at least one uppercase letter', () => {
    assert.match(generatePassword(), /[A-Z]/);
  });

  test('contains at least one number', () => {
    assert.match(generatePassword(), /[0-9]/);
  });

  test('contains at least one symbol', () => {
    assert.match(generatePassword(), /[^a-zA-Z0-9]/);
  });
});
