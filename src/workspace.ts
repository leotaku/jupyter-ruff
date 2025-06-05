import { Contents } from '@jupyterlab/services';

import { PathExt } from '@jupyterlab/coreutils';
import { Workspace, PositionEncoding } from '@astral-sh/ruff-wasm-web';
import * as toml from 'smol-toml';

/**
 * Sets up a {@see Workspace} from the surrounding Ruff config files.
 *
 * See: https://docs.astral.sh/ruff/configuration/#config-file-discovery
 */
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

  return new Workspace(overrides ?? {}, PositionEncoding.Utf16);
}

/**
 * Sets up a {@see Workspace} from a config while resolving `extend`.
 *
 * See: https://docs.astral.sh/ruff/settings/#extend
 */
async function workspaceFromConfig(
  config: Record<string, toml.TomlPrimitive>,
  resolveBase: string,
  fs: Contents.IManager
): Promise<Workspace> {
  if (typeof config['extend'] === 'string') {
    const extendFile = await fs.get(
      PathExt.resolve(resolveBase, config['extend'])
    );

    const parent = toml.parse(extendFile.content);
    const child = { ...config };
    delete child['extend'];

    return workspaceFromConfig(
      mergeTOML(parent, child),
      PathExt.dirname(extendFile.path),
      fs
    );
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
