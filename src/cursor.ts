import { CodeEditor } from '@jupyterlab/codeeditor';
import { distance } from 'fastest-levenshtein';

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
  const newOffset = realignIndex(
    editor.model.sharedModel.source,
    source,
    oldOffset
  );

  editor.model.sharedModel.setSource(source);
  editor.setCursorPosition(
    editor.getPositionAt(newOffset) ?? { line: 0, column: 0 }
  );
}
