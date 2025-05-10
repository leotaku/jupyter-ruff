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
import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ICellModel } from '@jupyterlab/cells';
import { Contents } from '@jupyterlab/services';

import { PathExt } from '@jupyterlab/coreutils';
import init, { Workspace, type Diagnostic } from '@astral-sh/ruff-wasm-web';
import * as toml from 'smol-toml';

/**
 * A class to convert row and column text positions into offsets.
 */
class LocationMapper {
  private indices: number[];

  constructor(text: string) {
    this.indices = [];

    const lines = text.split('\n');
    let offset = 0;
    for (const line of lines) {
      offset += line.length + 1;
      this.indices.push(offset);
    }
  }

  maxPosition(): number {
    return this.indices.at(this.indices.length - 1) ?? 0;
  }

  convert(row: number, column: number): number {
    const [zeroRow, zeroColumn] = [row - 1, column - 1];
    const startOffset = zeroRow > 0 ? this.indices[zeroRow - 1] : 0;
    return startOffset + zeroColumn;
  }
}

/**
 * Checks wether a notebook is currently selected.
 */
function isNotebookSelected(
  tracker: INotebookTracker,
  shell: JupyterFrontEnd.IShell
): boolean {
  return (
    tracker.currentWidget !== null &&
    tracker.currentWidget === shell.currentWidget
  );
}

/**
 * Checks wether an editor is currently selected.
 */
function isEditorSelected(
  tracker: IEditorTracker,
  shell: JupyterFrontEnd.IShell
): boolean {
  return (
    tracker.currentWidget !== null &&
    tracker.currentWidget === shell.currentWidget
  );
}

/**
 * Checks whether given cell can be formatted using Ruff.
 */
function canCellBeFormatted(cellModel: ICellModel | undefined): boolean {
  return cellModel?.type === 'code' && cellModel?.mimeType === 'text/x-ipython';
}

/**
 * Checks whether given editor can be formatted using Ruff.
 */
function canEditorBeFormatted(editor: FileEditor | undefined): boolean {
  return editor?.model.mimeType === 'text/x-python';
}

/**
 * Applies {@see Diagnostic} fixes to text.
 */
function applyFixes(text: string, diagnostics: Diagnostic[]): string {
  const loc = new LocationMapper(text);
  let prevMinPosition = loc.maxPosition();
  const result = [];

  for (const diagnostic of diagnostics.reverse()) {
    for (const edit of diagnostic.fix?.edits.reverse() ?? []) {
      const [minPosition, maxPosition] = [
        loc.convert(edit.location.row, edit.location.column),
        loc.convert(edit.end_location.row, edit.end_location.column)
      ];

      result.push(text.slice(maxPosition, prevMinPosition));
      result.push(edit.content);

      prevMinPosition = minPosition;
    }
  }

  result.push(text.slice(0, prevMinPosition));

  return result.reverse().join('');
}

/**
 * Fixes text using the configuration of a workspace.
 */
function fix(workspace: Workspace, text: string): string {
  let diagnostics: Diagnostic[];
  try {
    diagnostics = workspace.check(text);
  } catch {
    return text;
  }

  return applyFixes(text, diagnostics);
}

/**
 * Formats text using the configuration of a workspace.
 */
function format(workspace: Workspace, text: string): string {
  try {
    return workspace.format(text).trimEnd();
  } catch {
    return text;
  }
}

/**
 * Recursively merges two TOML config objects.
 */
function mergeTOML(
  base: Record<string, toml.TomlPrimitive>,
  overrides: Record<string, toml.TomlPrimitive>
): Record<string, toml.TomlPrimitive> {
  return Object.fromEntries(
    Object.keys({ ...base, ...overrides })
      .map((key, _): [string, toml.TomlPrimitive, toml.TomlPrimitive] => [
        key,
        base[key],
        overrides[key]
      ])
      .map(([key, value, override]) => [
        key,
        value instanceof Object &&
        !(value instanceof toml.TomlDate) &&
        !(value instanceof Array) &&
        override instanceof Object &&
        !(override instanceof toml.TomlDate) &&
        !(override instanceof Array)
          ? mergeTOML(value, override)
          : (override ?? value)
      ])
  );
}

/**
 * Extracts the Ruff config section from a pyproject-like TOML config.
 */
function configRuffSection(
  config: Record<string, toml.TomlPrimitive>
): Record<string, toml.TomlPrimitive> | undefined {
  if (!((config as any)?.['tool']?.['ruff'] instanceof Object)) {
    return undefined;
  }

  return (config as any)['tool']['ruff'];
}

/**
 * Sets up a {@see Workspace} from the surrounding Ruff config files.
 *
 * See: https://docs.astral.sh/ruff/configuration/#config-file-discovery
 */
async function workspaceFromEnvironment(
  app: JupyterFrontEnd,
  notebook: NotebookPanel,
  overrides: Record<string, toml.TomlPrimitive>
): Promise<Workspace> {
  let directory = notebook.context.path;
  do {
    directory = PathExt.dirname(directory);

    const files: Contents.IModel[] = await app.serviceManager.contents
      .get(directory)
      .then(it => it.content);

    for (const filename of ['.ruff.toml', 'ruff.toml', 'pyproject.toml']) {
      const file = files.find(it => it.name === filename);
      if (file === undefined) {
        continue;
      }

      const fileWithContents = await app.serviceManager.contents.get(file.path);
      const config = toml.parse(fileWithContents.content);
      if (filename === 'pyproject.toml') {
        const ruffSection = configRuffSection(config);
        if (ruffSection !== undefined) {
          return new Workspace(mergeTOML(ruffSection, overrides));
        }
      } else {
        return new Workspace(mergeTOML(config, overrides));
      }
    }
  } while (directory !== '');

  return new Workspace(overrides);
}

/**
 * Initialization data for the jupyter-ruff extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-ruff:plugin',
  description:
    'A JupyterLab and Jupyter Notebook extension for formatting code with Ruff.',
  autoStart: true,
  requires: [
    ICommandPalette,
    INotebookTracker,
    IEditorTracker,
    ISettingRegistry
  ],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    notebooks: INotebookTracker,
    editors: IEditorTracker,
    registry: ISettingRegistry
  ) => {
    await init();

    const settings = await registry.load('jupyter-ruff:plugin');

    let [autoFormatRunToggle, autoFormatSaveToggle, isortToggle] = [
      settings.get('format-on-run').composite as boolean,
      settings.get('format-on-save').composite as boolean,
      settings.get('sort-imports').composite as boolean
    ];

    settings.changed.connect((settings, _) => {
      [autoFormatRunToggle, autoFormatSaveToggle, isortToggle] = [
        settings.get('format-on-run').composite as boolean,
        settings.get('format-on-save').composite as boolean,
        settings.get('sort-imports').composite as boolean
      ];
    });

    // Override workspace to only emit isort diagnostics, so it can
    // emit fixable diagnostics while respecting Ruff settings.
    const overrides = { lint: { select: ['I'] } };

    let workspace = new Workspace(overrides);

    notebooks.currentChanged.connect(async (_, panel) => {
      workspace = await workspaceFromEnvironment(app, panel!, overrides);
    });

    function isortAndFormat(text: string): string {
      const isorted = isortToggle ? fix(workspace, text) : text;
      return format(workspace, isorted);
    }

    app.commands.addCommand('jupyter-ruff:format-cell', {
      label: 'Format Cell Using Ruff',
      isEnabled: () =>
        isNotebookSelected(notebooks, app.shell) &&
        canCellBeFormatted(notebooks.activeCell?.model),
      isVisible: () => isNotebookSelected(notebooks, app.shell),
      execute: function (_args: ReadonlyPartialJSONObject) {
        const formatted = isortAndFormat(
          notebooks.activeCell!.model.sharedModel.source
        );
        notebooks.activeCell?.model.sharedModel.setSource(formatted);
      }
    });

    app.commands.addCommand('jupyter-ruff:format-all-cells', {
      label: 'Format All Cells Using Ruff',
      isEnabled: () => isNotebookSelected(notebooks, app.shell),
      isVisible: () => isNotebookSelected(notebooks, app.shell),
      execute: function (_args: ReadonlyPartialJSONObject) {
        const cells = notebooks.currentWidget?.content.model?.cells ?? [];
        for (const cell of cells) {
          if (!canCellBeFormatted(cell)) {
            continue;
          }

          const formatted = isortAndFormat(cell.sharedModel.source!);
          cell.sharedModel.setSource(formatted);
        }
      }
    });

    app.commands.addCommand('jupyter-ruff:format-editor', {
      label: 'Format Editor Contents Using Ruff',
      isEnabled: () =>
        isEditorSelected(editors, app.shell) &&
        canEditorBeFormatted(editors.currentWidget?.content),
      isVisible: () => isEditorSelected(editors, app.shell),
      execute: function (_args: ReadonlyPartialJSONObject) {
        const editor = editors.currentWidget!.content.editor;
        const formatted = isortAndFormat(editor.model.sharedModel.source);
        editor.model.sharedModel.setSource(formatted);
      }
    });

    app.commands.addCommand('jupyter-ruff:reload-configuration', {
      label: 'Reload Configuration Files for Ruff',
      isEnabled: () => true,
      isVisible: () => true,
      execute: async function (_args: ReadonlyPartialJSONObject) {
        workspace = await workspaceFromEnvironment(
          app,
          notebooks.currentWidget!,
          overrides
        );
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
      command: 'jupyter-ruff:format-editor',
      category: 'ruff'
    });
    palette.addItem({
      command: 'jupyter-ruff:reload-configuration',
      category: 'ruff'
    });

    NotebookActions.executionScheduled.connect((_, { cell }) => {
      if (!canCellBeFormatted(cell.model)) {
        return;
      }

      if (autoFormatRunToggle) {
        const formatted = isortAndFormat(cell.model.sharedModel.source!);
        cell.model.sharedModel.setSource(formatted);
      }
    });

    notebooks.currentChanged.connect(async (_, panel) => {
      panel?.context.saveState.connect((context, state) => {
        if (state !== 'started') {
          return;
        }

        if (autoFormatSaveToggle) {
          for (const cell of context.model.cells) {
            if (!canCellBeFormatted(cell)) {
              continue;
            }

            const formatted = isortAndFormat(cell.sharedModel.source!);
            cell.sharedModel.setSource(formatted);
          }
        }
      });
    });
    editors.currentChanged.connect(async (_, panel) => {
      if (canEditorBeFormatted(panel?.content)) {
        panel?.context.saveState.connect((context, state) => {
          if (state !== 'started') {
            return;
          }

          if (autoFormatSaveToggle) {
            const formatted = isortAndFormat(
              context.model.sharedModel.getSource() as string
            );
            context.model.sharedModel.setSource(formatted);
          }
        });
      }
    });
  }
};

export default plugin;
