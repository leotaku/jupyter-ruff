import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ICommandPalette } from '@jupyterlab/apputils';
import {
  INotebookTools,
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
  requires: [ICommandPalette, INotebookTools],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tools: INotebookTools
  ) => {
    await init();

    async function getWorkspace(): Promise<Workspace> {
      return workspaceFromEnvironment(app, tools.activeNotebookPanel!);
    }

    app.commands.addCommand('jupyter-ruff:format-cell', {
      label: 'Format cell using Ruff',
      isEnabled: () => canBeFormatted(tools.activeCell?.model),
      isVisible: () => true,
      execute: async function (_args: ReadonlyPartialJSONObject) {
        const formatted = format(
          await getWorkspace(),
          tools.activeCell?.model.sharedModel.source!
        );
        tools.activeCell?.model.sharedModel.setSource(formatted);
      }
    });

    app.commands.addCommand('jupyter-ruff:format-all-cells', {
      label: 'Format all cells using Ruff',
      isEnabled: () => true,
      isVisible: () => true,
      execute: async function (_args: ReadonlyPartialJSONObject) {
        const cells = tools.activeNotebookPanel?.content.model?.cells || [];
        for (const cell of cells) {
          if (!canBeFormatted(cell)) continue;

          const formatted = format(
            await getWorkspace(),
            cell.sharedModel.source!
          );
          cell.sharedModel.setSource(formatted);
        }
      }
    });

    let autoFormatToggle = false;
    NotebookActions.executionScheduled.connect(async (_, { cell }) => {
      if (!autoFormatToggle) return;
      if (!canBeFormatted(cell.model)) return;

      const formatted = format(
        await getWorkspace(),
        cell.model.sharedModel.source!
      );
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
