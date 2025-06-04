import { Contents } from '@jupyterlab/services';

import { PathExt } from '@jupyterlab/coreutils';
import { Workspace, PositionEncoding } from '@astral-sh/ruff-wasm-web';
import * as toml from 'smol-toml';

export async function workspaceFromEnvironment(
  path: string,
  fs: Contents.IManager,
  overrides?: Record<string, toml.TomlPrimitive>
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
          return fromConfig(mergeTOML(ruffSection, overrides ?? {}), fs);
        }
      } else {
        return fromConfig(mergeTOML(config, overrides ?? {}), fs);
      }
    }
  } while (directory !== '');

  return new Workspace(overrides ?? {}, PositionEncoding.Utf16);
}

async function fromConfig(
  config: Record<string, toml.TomlPrimitive>,
  fs: Contents.IManager
): Promise<Workspace> {
  if (typeof config['extend'] === 'string') {
    const parent = await fs
      .get(config['extend'])
      .then(file => toml.parse(file.content));

    const child = { ...config };
    delete child['extend'];

    return fromConfig(mergeTOML(parent, child), fs);
  }

  return new Workspace(config, PositionEncoding.Utf16);
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
