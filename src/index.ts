import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTools, NotebookActions } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';
import init, { Workspace } from '@astral-sh/ruff-wasm-web';

function canBeFormatted(cellModel: ICellModel | undefined): boolean {
  return cellModel?.type === 'code' && cellModel?.mimeType === 'text/x-ipython';
}

/**
 * Initialization data for the jupyter-ruff extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-ruff:plugin',
  description: 'A JupyterLab and Jupyter Notebook extension for formatting code with ruff. Fully client side and respects your local configuration!',
  autoStart: true,
  requires: [ICommandPalette, INotebookTools],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tools: INotebookTools
  ) => {
    await init();

    const workspace = new Workspace({
      'line-length': 88,
      'indent-width': 4,
      format: {
        'indent-style': 'space',
        'quote-style': 'double'
      }
    });

    function format(text: string): string {
      return workspace.format(text).trimEnd();
    }

    app.commands.addCommand('jupyter-ruff:format-cell', {
      label: 'Format cell using Ruff',
      isEnabled: () => canBeFormatted(tools.activeCell?.model),
      isVisible: () => true,
      execute: function (_args: ReadonlyPartialJSONObject) {
        const formatted = format(tools.activeCell?.model.sharedModel.source!);
        tools.activeCell?.model.sharedModel.setSource(formatted);
      }
    });

    app.commands.addCommand('jupyter-ruff:format-all-cells', {
      label: 'Format all cells using Ruff',
      isEnabled: () => true,
      isVisible: () => true,
      execute: function (_args: ReadonlyPartialJSONObject) {
        const cells = tools.activeNotebookPanel?.content.model?.cells || [];
        for (const cell of cells) {
          if (!canBeFormatted(cell)) continue;

          const formatted = format(cell.sharedModel.source!);
          cell.sharedModel.setSource(formatted);
        }
      }
    });

    let autoFormatToggle = false;
    NotebookActions.executionScheduled.connect((_, { cell }) => {
      if (!autoFormatToggle) return;
      if (!canBeFormatted(cell.model)) return;

      const formatted = format(cell.model.sharedModel.source!);
      cell.model.sharedModel.setSource(formatted);
    });

    app.commands.addCommand('jupyter-ruff:toggle-auto-format', {
      label: 'Toggle auto-formatting of cells using Ruff',
      isEnabled: () => true,
      isVisible: () => true,
      isToggleable: true,
      isToggled: () => autoFormatToggle,
      execute: function (_args: ReadonlyPartialJSONObject) {
        autoFormatToggle = !autoFormatToggle;
      }
    });

    palette.addItem({
      command: 'jupyter-ruff:format-cell',
      category: 'ruff'
    });
    palette.addItem({
      command: 'jupyter-ruff:format-all-cells',
      category: 'ruff'
    });
    palette.addItem({
      command: 'jupyter-ruff:toggle-auto-format',
      category: 'ruff'
    });
  }
};

export default plugin;
