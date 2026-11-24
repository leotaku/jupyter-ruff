import { CodeEditor } from '@jupyterlab/codeeditor';
import { ChangeObject, diffLines } from 'diff';
import { distance } from 'fastest-levenshtein';

export function realignIndexFromChanges(
  changes: ChangeObject<string>[],
  oldIndex: number
): number {
  let [oldEndOfChange, newEndOfChange] = [0, 0];
  let relevantChanges = [];
  for (const change of changes) {
    if (!change.removed && !change.added) {
      if (oldEndOfChange + change.value.length >= oldIndex) {
        break;
      }
      relevantChanges = [];
    } else {
      relevantChanges.push(change);
    }
    if (!change.added) {
      oldEndOfChange += change.value.length;
    }
    if (!change.removed) {
      newEndOfChange += change.value.length;
    }
  }

  const oldChangeText = relevantChanges
    .filter(change => !change.added)
    .map(change => change.value)
    .join('');
  const newChangeText = relevantChanges
    .filter(change => !change.removed)
    .map(change => change.value)
    .join('');

  const oldStartOfChange = oldEndOfChange - oldChangeText.length;
  const newStartOfChange = newEndOfChange - newChangeText.length;
  if (oldStartOfChange >= oldIndex) {
    return oldIndex - oldStartOfChange + newStartOfChange;
  } else if (oldEndOfChange <= oldIndex) {
    return oldIndex - oldEndOfChange + newEndOfChange;
  }
  return (
    realignIndex(oldChangeText, newChangeText, oldIndex - oldStartOfChange) +
    newStartOfChange
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
  const changes = diffLines(editor.model.sharedModel.source, source);
  const oldOffset = editor.getOffsetAt(editor.getCursorPosition());
  const newOffset = realignIndexFromChanges(changes, oldOffset);

  let insertionPoint = 0;
  editor.model.sharedModel.transact(() => {
    for (const change of changes) {
      if (change.removed) {
        editor.model.sharedModel.updateSource(
          insertionPoint,
          insertionPoint + change.value.length
        );
      }
      if (change.added) {
        editor.model.sharedModel.updateSource(
          insertionPoint,
          insertionPoint,
          change.value
        );
      }
      if (!change.removed) {
        insertionPoint += change.value.length;
      }
    }
  });

  editor.setCursorPosition(
    editor.getPositionAt(newOffset) ?? { line: 0, column: 0 },
    { scroll: false }
  );
}
