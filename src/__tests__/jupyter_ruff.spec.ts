/**
 * [Jest](https://jestjs.io/docs/getting-started) unit tests
 */

import { realignIndex } from '../cursor';

function cursorAlignmentMatches(
  inputWithCursor: string,
  expectedWithCursor: string
) {
  const inputCursorPosition = inputWithCursor.indexOf('|');
  const input = inputWithCursor.split('|').join('');
  const expected = expectedWithCursor.split('|').join('');

  const outputIndex = realignIndex(input, expected, inputCursorPosition);

  expect(
    expected.slice(0, outputIndex) + '|' + expected.slice(outputIndex)
  ).toBe(expectedWithCursor);
}

describe('jupyter-ruff', () => {
  describe('cursor alignment', () => {
    it('short strings', () => {
      cursorAlignmentMatches('ab|cd', 'ab|cdefg');
      cursorAlignmentMatches('xyzab|cd', 'xyzab|cd');
      cursorAlignmentMatches('xyzab|cdef', 'xyzab|cdefg');
      cursorAlignmentMatches('abab|abab', 'abab|ababab');
    });
    it('sentences', () => {
      cursorAlignmentMatches(
        'The fox jumps over the| dog',
        'The brown fox jumps over the| lazy dog'
      );
      cursorAlignmentMatches(
        'The fox jumps over the |dog',
        'The brown fox jumps over the |lazy dog'
      );
      cursorAlignmentMatches(
        'The brown fox jumps over the |lazy dog',
        'The fox jumps over the| dog'
      );
      cursorAlignmentMatches(
        'The brown fox jumps over the| lazy dog',
        'The fox jumps over the| dog'
      );
    });
  });
});
