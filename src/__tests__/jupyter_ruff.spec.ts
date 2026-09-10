/**
 * [Jest](https://jestjs.io/docs/getting-started) unit tests
 */

import { ChangeSpec, EditorSelection, EditorState } from '@codemirror/state';
import * as Y from 'yjs';
import { computeEdits, updateSource } from '../cursor';

/**
 * Minimal shared text model, with the same `transact` and `updateSource`
 * semantics as the models in @jupyter/ydoc.
 */
class SharedText {
  readonly doc = new Y.Doc();
  readonly ysource = this.doc.getText('source');

  get source(): string {
    return this.ysource.toString();
  }

  transact(f: () => void): void {
    this.doc.transact(f, this);
  }

  updateSource(start: number, end: number, value = ''): void {
    this.transact(() => {
      this.ysource.insert(start, value);
      this.ysource.delete(start + value.length, end - start);
    });
  }
}

/**
 * Applies `updateSource` to a shared model that is mirrored into a CodeMirror
 * state the same way JupyterLab's editor binding does it (see ybinding.ts in
 * @jupyterlab/codemirror), and reports where the cursor ends up.
 */
function applyWithCursor(
  oldText: string,
  newText: string,
  cursor: number
): { source: string; editorText: string; cursor: number } {
  const model = new SharedText();
  model.ysource.insert(0, oldText);
  let state = EditorState.create({
    doc: oldText,
    selection: EditorSelection.cursor(cursor)
  });

  model.ysource.observe(event => {
    const changes: ChangeSpec[] = [];
    let position = 0;
    for (const delta of event.delta) {
      if (delta.insert !== undefined) {
        changes.push({ from: position, insert: delta.insert as string });
      } else if (delta.delete !== undefined) {
        changes.push({ from: position, to: position + delta.delete });
        position += delta.delete;
      } else {
        position += delta.retain ?? 0;
      }
    }
    state = state.update({ changes }).state;
  });

  updateSource(model, newText);
  const result = {
    source: model.source,
    editorText: state.doc.toString(),
    cursor: state.selection.main.head
  };
  model.doc.destroy();
  return result;
}

function cursorAlignmentMatches(
  inputWithCursor: string,
  expectedWithCursor: string
) {
  const input = inputWithCursor.split('|').join('');
  const expected = expectedWithCursor.split('|').join('');
  const { source, editorText, cursor } = applyWithCursor(
    input,
    expected,
    inputWithCursor.indexOf('|')
  );

  expect(source).toBe(expected);
  expect(editorText).toBe(expected);
  expect(expected.slice(0, cursor) + '|' + expected.slice(cursor)).toBe(
    expectedWithCursor
  );
}

function randomText(alphabet: string[], length: number): string {
  return Array.from(
    { length },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join('');
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
      // Inserted " lazy" goes before the space the cursor follows, so the
      // cursor stays in front of "dog".
      cursorAlignmentMatches(
        'The fox jumps over the |dog',
        'The brown fox jumps over the lazy |dog'
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
    it('formatted code', () => {
      // Text inserted exactly at the cursor position is placed after the
      // cursor, which is how CodeMirror maps cursors by default.
      cursorAlignmentMatches(
        "x = foo(1,2)\ny = ba|r(3,4)\nz = {'a':1}\n",
        'x = foo(1, 2)\ny = ba|r(3, 4)\nz = {"a": 1}\n'
      );
      cursorAlignmentMatches(
        'def f( a,b ):\n    return a+|b\n\n\n\nprint( f(1,2) )\n',
        'def f(a, b):\n    return a +| b\n\n\nprint(f(1, 2))\n'
      );
    });
  });

  describe('source update', () => {
    it('leaves unchanged text alone', () => {
      expect(computeEdits('abc\ndef', 'abc\ndef')).toEqual([]);
    });

    it('reproduces the new text exactly', () => {
      const alphabet = ['a', 'b', ' ', '\n', "'", '"', '(', ')'];
      for (let i = 0; i < 200; i++) {
        const oldText = randomText(alphabet, Math.floor(Math.random() * 300));
        const newText = randomText(alphabet, Math.floor(Math.random() * 300));
        const cursor = Math.floor(Math.random() * (oldText.length + 1));
        const { source, editorText } = applyWithCursor(
          oldText,
          newText,
          cursor
        );
        expect(source).toBe(newText);
        expect(editorText).toBe(newText);
      }
    });

    it('does not split surrogate pairs', () => {
      const { source } = applyWithCursor("x = '😀'", 'x = "😃"', 0);
      expect(source).toBe('x = "😃"');

      const alphabet = ['😀', '😃', '😄', '𝄞', 'a', ' '];
      for (let i = 0; i < 200; i++) {
        const oldText = randomText(alphabet, 40);
        const newText = randomText(alphabet, 40);
        expect(applyWithCursor(oldText, newText, 0).source).toBe(newText);
      }
    });

    it('is fast for large files with changes throughout', () => {
      const oldLine = "    result = some_function('one', 'two')  # comment\n";
      const newLine = '    result = some_function("one", "two")  # comment\n';
      const oldText = oldLine.repeat(2000);
      const newText = newLine.repeat(2000);

      const start = performance.now();
      const edits = computeEdits(oldText, newText);
      expect(performance.now() - start).toBeLessThan(1000);
      expect(edits).toHaveLength(4 * 2000);

      const { source, cursor } = applyWithCursor(
        oldText,
        newText,
        1000 * oldLine.length + 10
      );
      expect(source).toBe(newText);
      expect(cursor).toBe(1000 * newLine.length + 10);
    });
  });
});
