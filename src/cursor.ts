import { CodeEditor } from '@jupyterlab/codeeditor';
import {
  diff_match_patch as DiffMatchPatch,
  DIFF_DELETE,
  DIFF_EQUAL,
  DIFF_INSERT
} from 'diff-match-patch';

/**
 * Replacement of the range from `start` (inclusive) to `end` (exclusive) of
 * the original text by `text`.
 */
export interface IEdit {
  start: number;
  end: number;
  text: string;
}

/**
 * Total time budget for computing edits, in milliseconds. When it is used up,
 * the remaining differences are replaced in larger chunks. The resulting text
 * is identical either way, but the edits are less minimal.
 */
const TIME_BUDGET = 1000;

const differ = new DiffMatchPatch();

/**
 * Collapses differences that formatting commonly introduces within a line,
 * so that lines can be matched up before they are compared in detail.
 */
function normalizeLine(line: string): string {
  return line.replace(/\s+/g, '').replace(/'/g, '"');
}

function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function isHighSurrogate(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Computes sorted, non-overlapping edits that turn `oldText` into `newText`.
 *
 * Lines are first matched up by their normalized content. Matched lines, as
 * well as the blocks of unmatched lines in between, are then compared
 * character by character. This keeps each character-level diff small, even
 * when formatting changes almost every line of a large file.
 *
 * Edit boundaries never fall inside a surrogate pair, as Yjs replaces pairs
 * split in that way with U+FFFD.
 */
export function computeEdits(oldText: string, newText: string): IEdit[] {
  if (oldText === newText) {
    return [];
  }

  const deadline = Date.now() + TIME_BUDGET;
  const edits: IEdit[] = [];

  function addDiff(oldPart: string, newPart: string, offset: number) {
    if (oldPart === newPart) {
      return;
    }

    let position = offset;
    for (const [operation, text] of differ.diff_main(
      oldPart,
      newPart,
      false,
      deadline
    )) {
      if (operation === DIFF_EQUAL) {
        position += text.length;
        continue;
      }

      let edit = edits[edits.length - 1];
      if (edit === undefined || edit.end !== position) {
        edit = { start: position, end: position, text: '' };
        edits.push(edit);
      }

      if (operation === DIFF_DELETE) {
        edit.end += text.length;
        position += text.length;
      } else {
        edit.text += text;
      }
    }
  }

  // Encode each distinct normalized line as a single character, so that
  // lines can be matched up using a character-level diff.
  const codes = new Map<string, string>();
  function encode(lines: string[]): string {
    return lines
      .map(line => {
        const key = normalizeLine(line);
        let code = codes.get(key);
        if (code === undefined) {
          code = String.fromCharCode(codes.size % 0x10000);
          codes.set(key, code);
        }
        return code;
      })
      .join('');
  }

  const [oldLines, newLines] = [splitLines(oldText), splitLines(newText)];
  const lineDiff = differ.diff_main(
    encode(oldLines),
    encode(newLines),
    false,
    deadline
  );

  let [oldLine, newLine, offset] = [0, 0, 0];
  let [oldBlock, newBlock] = ['', ''];
  for (const [operation, text] of lineDiff) {
    if (operation === DIFF_DELETE) {
      oldBlock += oldLines.slice(oldLine, oldLine + text.length).join('');
      oldLine += text.length;
    } else if (operation === DIFF_INSERT) {
      newBlock += newLines.slice(newLine, newLine + text.length).join('');
      newLine += text.length;
    } else {
      addDiff(oldBlock, newBlock, offset);
      offset += oldBlock.length;
      [oldBlock, newBlock] = ['', ''];

      for (let i = 0; i < text.length; i++) {
        addDiff(oldLines[oldLine], newLines[newLine], offset);
        offset += oldLines[oldLine].length;
        [oldLine, newLine] = [oldLine + 1, newLine + 1];
      }
    }
  }
  addDiff(oldBlock, newBlock, offset);

  for (const edit of edits) {
    if (edit.start > 0 && isHighSurrogate(oldText, edit.start - 1)) {
      edit.start -= 1;
      edit.text = oldText[edit.start] + edit.text;
    }
    if (
      edit.end > 0 &&
      edit.end < oldText.length &&
      isHighSurrogate(oldText, edit.end - 1)
    ) {
      edit.text = edit.text + oldText[edit.end];
      edit.end += 1;
    }
  }

  return edits;
}

/**
 * Replaces the contents of a shared model with `source`, only touching the
 * parts that differ.
 *
 * As the rest of the text is left in place, the editor keeps the cursor,
 * selections and scroll position where they were, without any explicit
 * realignment. All edits are applied in one transaction, so they form a
 * single undo step.
 */
export function updateSource(
  model: Pick<
    CodeEditor.IModel['sharedModel'],
    'source' | 'transact' | 'updateSource'
  >,
  source: string
): void {
  const edits = computeEdits(model.source, source);
  if (edits.length === 0) {
    return;
  }

  model.transact(() => {
    // Apply back to front, so that the offsets of earlier edits stay valid.
    for (let i = edits.length - 1; i >= 0; i--) {
      model.updateSource(edits[i].start, edits[i].end, edits[i].text);
    }
  });
}
