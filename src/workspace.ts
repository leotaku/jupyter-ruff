import { Contents } from '@jupyterlab/services';

import { PathExt } from '@jupyterlab/coreutils';
import { Workspace as Base, PositionEncoding } from '@astral-sh/ruff-wasm-web';
import pm from 'picomatch';
import * as toml from 'smol-toml';

export class Workspace extends Base {
  options: toml.TomlTable;

  constructor(options: toml.TomlTable) {
    super(options, PositionEncoding.Utf16);
    this.options = options;
  }

  should_format(path: string, explicit: boolean) {
    if (explicit && this.options['force-exclude'] !== true) {
      return true;
    }

    let include: toml.TomlValue[] = [
      '*.py',
      '*.pyi',
      '*.pyw',
      '*.ipynb',
      '**/pyproject.toml'
    ];
    if (this.options['include'] instanceof Array) {
      include = this.options['include'];
    }
    if (this.options['extend-include'] instanceof Array) {
      include = [...include, ...this.options['extend-include']];
    }

    let exclude: toml.TomlValue[] = [
      '.bzr',
      '.direnv',
      '.eggs',
      '.git',
      '.git-rewrite',
      '.hg',
      '.mypy_cache',
      '.nox',
      '.pants.d',
      '.pytype',
      '.ruff_cache',
      '.svn',
      '.tox',
      '.venv',
      '__pypackages__',
      '_build',
      'buck-out',
      'dist',
      'node_modules',
      'venv'
    ];
    if (this.options['exclude'] instanceof Array) {
      exclude = this.options['exclude'];
    }
    if (this.options['extend-exclude'] instanceof Array) {
      exclude = [...exclude, ...this.options['extend-exclude']];
    }

    // NOTE: explicit formatting always ignores the include list
    if (explicit || pm.isMatch(path, include as string[], { contains: true })) {
      if (pm.isMatch(path, exclude as string[], { contains: true })) {
        return false;
      }
      return true;
    }

    return false;
  }
}

/**
 * Sets up a {@see Workspace} from the surrounding Ruff config files.
 *
 * See: https://docs.astral.sh/ruff/configuration/#config-file-discovery
 */
export async function workspaceFromEnvironment(
  path: string,
  fs: Contents.IManager,
  overrides?: toml.TomlTable
): Promise<Workspace> {
  let directory = path;
  do {
    directory = PathExt.dirname(directory);

    const files: Contents.IModel[] = await fs
      .get(directory)
      .then(it => it.content);

    for (const filename of ['.ruff.toml', 'ruff.toml', 'pyproject.toml']) {
      const file = files.find(it => it.name === filename);
      if (file === undefined) {
        continue;
      }

      const fileWithContents = await fs.get(file.path);
      const config = toml.parse(fileWithContents.content as string);
      if (filename === 'pyproject.toml') {
        const ruffSection = configRuffSection(config);
        if (ruffSection !== undefined) {
          return workspaceFromConfig(
            mergeTOML(ruffSection, overrides ?? {}),
            directory,
            fs
          );
        }
      } else {
        return workspaceFromConfig(
          mergeTOML(config, overrides ?? {}),
          directory,
          fs
        );
      }
    }
  } while (directory !== '');

  return new Workspace(overrides ?? {});
}

/**
 * Sets up a {@see Workspace} from a config while resolving `extend`.
 *
 * See: https://docs.astral.sh/ruff/settings/#extend
 */
async function workspaceFromConfig(
  config: toml.TomlTable,
  resolveBase: string,
  fs: Contents.IManager
): Promise<Workspace> {
  if (typeof config['extend'] === 'string') {
    const baseFile = await fs.get(
      PathExt.resolve(resolveBase, config['extend'])
    );

    const base = baseFile.name.endsWith('pyproject.toml')
      ? configRuffSection(toml.parse(baseFile.content))
      : toml.parse(baseFile.content);

    const specific = { ...config };
    delete specific['extend'];

    return workspaceFromConfig(
      mergeTOML(base ?? {}, specific),
      PathExt.dirname(baseFile.path),
      fs
    );
  }

  return new Workspace(config);
}

/**
 * Recursively merges two TOML config objects.
 */
function mergeTOML(
  base: toml.TomlTable,
  overrides: toml.TomlTable
): toml.TomlTable {
  return Object.fromEntries(
    Object.keys({ ...base, ...overrides })
      .map((key, _): [string, toml.TomlPrimitive, toml.TomlPrimitive] => [
        key,
        base[key],
        overrides[key]
      ])
      .map(([key, value, override]) => [
        key,
        isTOMLTable(value) && isTOMLTable(override)
          ? mergeTOML(value, override)
          : (override ?? value)
      ])
  );
}

/**
 * Extracts the Ruff config section from a pyproject-like TOML config.
 */
function configRuffSection(config: toml.TomlTable): toml.TomlTable | undefined {
  if (!isTOMLTable((config as any)?.['tool']?.['ruff'])) {
    return undefined;
  }

  return (config as any)['tool']['ruff'];
}

/**
 * Tests if a TOML config value is a table.
 */
function isTOMLTable(value: toml.TomlValue): value is toml.TomlTable {
  return (
    typeof value === 'object' &&
    !(value instanceof toml.TomlDate) &&
    !(value instanceof Array)
  );
}
