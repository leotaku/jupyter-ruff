import { CodeEditor } from '@jupyterlab/codeeditor';
import { diffLines } from 'diff';
import { distance } from 'fastest-levenshtein';

export function realignIndexApproximate(
  oldSequence: string,
  newSequence: string,
  oldIndex: number
): number {
  const changes = diffLines(oldSequence, newSequence);
  let [oldStartOfDiff, oldEndOfDiff] = [0, 0];
  let [newStartOfDiff, newEndOfDiff] = [0, 0];
  for (const change of changes) {
    if (!change.removed && !change.added) {
      if (oldEndOfDiff + change.value.length >= oldIndex) break;
      [oldStartOfDiff, newStartOfDiff] = [
        oldEndOfDiff + change.value.length,
        newEndOfDiff + change.value.length
      ];
    }
    if (!change.added) oldEndOfDiff += change.value.length;
    if (!change.removed) newEndOfDiff += change.value.length;
  }

  if (oldStartOfDiff >= oldIndex) {
    return oldIndex - oldStartOfDiff + newStartOfDiff;
  } else if (oldEndOfDiff <= oldIndex) {
    return oldIndex - oldEndOfDiff + newEndOfDiff;
  }
  return (
    realignIndex(
      oldSequence.slice(oldStartOfDiff, oldEndOfDiff),
      newSequence.slice(newStartOfDiff, newEndOfDiff),
      oldIndex - oldStartOfDiff
    ) + newStartOfDiff
  );
}

export function realignIndex(
  oldSequence: string,
  newSequence: string,
  oldIndex: number
): number {
  const [oldStart, oldEnd] = [
    oldSequence.slice(0, oldIndex),
    oldSequence.slice(oldIndex)
  ];

  function score(point: number): number {
    return (
      distance(oldStart, newSequence.slice(0, point)) +
      distance(oldEnd, newSequence.slice(point))
    );
  }

  let [low, high] = [0, newSequence.length];
  while (low < high) {
    const middle = Math.floor(low + (high - low) / 2);

    const middleScore = score(middle);
    for (let step = 1; ; step++) {
      const middlePlusStepScore = score(middle + step);
      if (middleScore < middlePlusStepScore) {
        high = middle;
        break;
      } else if (middleScore > middlePlusStepScore) {
        low = middle + step;
        break;
      } else if (middle + step > high) {
        high = middle;
        break;
      }
    }
  }

  return low;
}

export function updateSource(editor: CodeEditor.IEditor, source: string) {
  const oldOffset = editor.getOffsetAt(editor.getCursorPosition());
  const newOffset = realignIndexApproximate(
    editor.model.sharedModel.source,
    source,
    oldOffset
  );

  editor.model.sharedModel.setSource(source);
  editor.setCursorPosition(
    editor.getPositionAt(newOffset) ?? { line: 0, column: 0 },
    { scroll: false }
  );
}
