import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ICommandPalette } from '@jupyterlab/apputils';
import {
  INotebookTracker,
  NotebookActions,
  NotebookPanel
} from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';
import { PathExt } from '@jupyterlab/coreutils';

import init, { Workspace } from '@astral-sh/ruff-wasm-web';
import * as toml from 'smol-toml';

function canBeFormatted(cellModel: ICellModel | undefined): boolean {
  return cellModel?.type === 'code' && cellModel?.mimeType === 'text/x-ipython';
}

function format(workspace: Workspace, text: string): string {
  try {
    return workspace.format(text).trimEnd();
  } catch {
    return text;
  }
}

async function workspaceFromEnvironment(
  app: JupyterFrontEnd,
  notebook: NotebookPanel
): Promise<Workspace> {
  let directory = notebook.context.path;
  do {
    directory = PathExt.dirname(directory);

    for (const filename of ['.ruff.toml', 'ruff.toml', 'pyproject.toml']) {
      const contents = await app.serviceManager.contents
        .get(PathExt.join(directory, filename))
        .catch(() => undefined);
      if (contents === undefined) continue;

      const config = toml.parse(contents.content);
      if (filename === 'pyproject.toml') {
        const ruffSection = configRuffSection(config);
        if (ruffSection !== undefined) return new Workspace(config);
      } else {
        return new Workspace(config);
      }
    }
  } while (directory !== '');

  return new Workspace(Workspace.defaultSettings());
}

function configRuffSection(
  config: Record<string, toml.TomlPrimitive>
): toml.TomlPrimitive | undefined {
  if (!(config['tool'] instanceof Object)) return false;
  return (config['tool'] as Record<string, toml.TomlPrimitive>)['ruff'];
}

/**
 * Initialization data for the jupyter-ruff extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-ruff:plugin',
  description:
    'A JupyterLab and Jupyter Notebook extension for formatting code with Ruff.',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker
  ) => {
    await init();

    let workspace = new Workspace(Workspace.defaultSettings());

    tracker.currentChanged.connect(async (_, panel) => {
      workspace = await workspaceFromEnvironment(app, panel!);
    });

    app.commands.addCommand('jupyter-ruff:format-cell', {
      label: 'Format Cell Using Ruff',
      isEnabled: () => canBeFormatted(tracker.activeCell?.model),
      isVisible: () => true,
      execute: function (_args: ReadonlyPartialJSONObject) {
        const formatted = format(
          workspace,
          tracker.activeCell?.model.sharedModel.source!
        );
        tracker.activeCell?.model.sharedModel.setSource(formatted);
      }
    });

    app.commands.addCommand('jupyter-ruff:format-all-cells', {
      label: 'Format All Cells Using Ruff',
      isEnabled: () => true,
      isVisible: () => true,
      execute: function (_args: ReadonlyPartialJSONObject) {
        const cells = tracker.currentWidget?.content.model?.cells || [];
        for (const cell of cells) {
          if (!canBeFormatted(cell)) continue;

          const formatted = format(workspace, cell.sharedModel.source!);
          cell.sharedModel.setSource(formatted);
        }
      }
    });

    let autoFormatToggle = false;
    NotebookActions.executionScheduled.connect((_, { cell }) => {
      if (!autoFormatToggle) return;
      if (!canBeFormatted(cell.model)) return;

      const formatted = format(workspace, cell.model.sharedModel.source!);
      cell.model.sharedModel.setSource(formatted);
    });

    app.commands.addCommand('jupyter-ruff:toggle-auto-format', {
      label: 'Toggle Automatic Formatting Using Ruff',
      isEnabled: () => true,
      isVisible: () => true,
      isToggleable: true,
      isToggled: () => autoFormatToggle,
      execute: function (_args: ReadonlyPartialJSONObject) {
        autoFormatToggle = !autoFormatToggle;
      }
    });

    app.commands.addCommand('jupyter-ruff:reload-configuration', {
      label: 'Reload On-Disk Configuration Files for Ruff',
      isEnabled: () => true,
      isVisible: () => true,
      execute: async function (_args: ReadonlyPartialJSONObject) {
        workspace = await workspaceFromEnvironment(app, tracker.currentWidget!);
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
    palette.addItem({
      command: 'jupyter-ruff:reload-configuration',
      category: 'ruff'
    });
  }
};

export default plugin;
