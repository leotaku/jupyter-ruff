import { expect, test as base } from '@jupyterlab/galata';
import { NotebookHelper } from '@jupyterlab/galata/lib/helpers/notebook';
import * as path from 'path';

const test = base.extend<{
  notebook: NotebookHelper;
  notebooksDirectory: string;
}>({
  notebook: [
    async ({ page, notebooksDirectory, tmpPath }, use) => {
      await page.contents.uploadDirectory(notebooksDirectory, tmpPath);
      await page.filebrowser.openDirectory(tmpPath);

      await use(page.notebook);
    },
    {}
  ],
  notebooksDirectory: ''
});

test.use({ notebooksDirectory: path.resolve(__dirname, '../specs') });

test('should format all cells', async ({ notebook }) => {
  await notebook.open('AllCells.ipynb');
  await notebook.activate('AllCells.ipynb');

  await notebook.page.evaluate(async () => {
    await window.jupyterapp.commands.execute('jupyter-ruff:format-all-cells');
  });

  expect(await notebook.getCellTextInput(0)).toBe(
    await notebook.getCellTextInput(1)
  );
});

test('should format the cell', async ({ notebook }) => {
  await notebook.open('Simple.ipynb');
  await notebook.selectCells(0);

  await notebook.page.evaluate(async () => {
    await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
  });

  expect(await notebook.getCellTextInput(0)).toBe(
    await notebook.getCellTextInput(1)
  );
});

[
  ['ruff.toml', `indent-width = 2`],
  ['.ruff.toml', `indent-width = 2`],
  ['pyproject.toml', `[tool.ruff]\nindent-width = 2`]
].forEach(([filename, contents]) => {
  test(`should format the cell (${filename})`, async ({
    notebook,
    tmpPath
  }) => {
    notebook.contents.uploadContent(
      contents,
      'text',
      path.join(tmpPath, filename)
    );

    await notebook.open('WithConfig.ipynb');
    await notebook.selectCells(0);

    await notebook.page.evaluate(async () => {
      await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
    });

    expect(await notebook.getCellTextInput(0)).toBe(
      await notebook.getCellTextInput(1)
    );
  });
});

test('should isort the cell', async ({ notebook }) => {
  await notebook.open('Isort.ipynb');
  await notebook.selectCells(0);

  await notebook.page.evaluate(async () => {
    await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
  });

  expect(await notebook.getCellTextInput(0)).toBe(
    await notebook.getCellTextInput(1)
  );
});

[
  ['ruff.toml', `[lint.isort]\nfrom-first = true`],
  ['.ruff.toml', `[lint.isort]\nfrom-first = true`],
  ['pyproject.toml', `[tool.ruff.lint.isort]\nfrom-first = true`]
].forEach(([filename, contents]) => {
  test(`should isort the cell (${filename})`, async ({ notebook, tmpPath }) => {
    notebook.contents.uploadContent(
      contents,
      'text',
      path.join(tmpPath, filename)
    );

    await notebook.open('IsortWithConfig.ipynb');
    await notebook.selectCells(0);

    await notebook.page.evaluate(async () => {
      await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
    });

    expect(await notebook.getCellTextInput(0)).toBe(
      await notebook.getCellTextInput(1)
    );
  });
});

async function getEditorTextInput(notebook: NotebookHelper) {
  return await notebook.page
    .locator('.jp-Document:visible')
    .locator('.cm-editor .cm-content')
    .textContent();
}

test('should format the editor', async ({ notebook }) => {
  await notebook.open('formatted.py');
  const formatted = await getEditorTextInput(notebook);

  await notebook.open('simple.py');

  await notebook.page.evaluate(async () => {
    await window.jupyterapp.commands.execute('jupyter-ruff:format-editor');
  });

  expect(await getEditorTextInput(notebook)).toBe(formatted);
});

[
  ['base.ruff.toml', `indent-width = 2`],
  ['base.pyproject.toml', `[tool.ruff]\nindent-width = 2`]
].forEach(([filename, contents]) => {
  test(`should format the cell (extending ${filename})`, async ({
    notebook,
    tmpPath
  }) => {
    notebook.contents.uploadContent(
      `extend = "${filename}"`,
      'text',
      path.join(tmpPath, 'ruff.toml')
    );
    notebook.contents.uploadContent(
      contents,
      'text',
      path.join(tmpPath, filename)
    );

    await notebook.open('WithConfig.ipynb');
    await notebook.activate('WithConfig.ipynb');
    await notebook.selectCells(0);

    // Allow some extra time for the new config to be registered
    await notebook.page.waitForTimeout(100);

    await notebook.page.evaluate(async () => {
      await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
    });

    expect(await notebook.getCellTextInput(0)).toBe(
      await notebook.getCellTextInput(1)
    );
  });
});

(
  [
    ['include-none', `force-exclude = false\ninclude = []`, true],
    ['include-none, force', `force-exclude = true\ninclude = []`, true], // this might be unexpected, but it matches what ruff does
    ['exclude', `force-exclude = false\nexclude = ["simple.py"]`, true],
    ['exclude, force', `force-exclude = true\nexclude = ["simple.py"]`, false],
    [
      'extend-exclude, force',
      `force-exclude = true\nextend-exclude = ["simple.py"]`,
      false
    ]
  ] as const
).forEach(([description, contents, shouldFormat]) => {
  test(`should format a file with exclude/include rules (${description})`, async ({
    notebook,
    tmpPath
  }) => {
    test.fail(!shouldFormat, 'should not be formatted given these settings');

    notebook.contents.uploadContent(
      contents,
      'text',
      path.join(tmpPath, 'ruff.toml')
    );

    await notebook.open('formatted.py');
    const formatted = await getEditorTextInput(notebook);

    await notebook.open('simple.py');

    await notebook.page.evaluate(async () => {
      await window.jupyterapp.commands.execute('jupyter-ruff:format-editor');
    });

    expect(await getEditorTextInput(notebook)).toBe(formatted);
  });
});

(
  [
    ['include-none', `force-exclude = false\ninclude = []`, true],
    ['include-none, force', `force-exclude = true\ninclude = []`, true], // this might be unexpected, but it matches what ruff does
    ['exclude', `force-exclude = false\nexclude = ["AllCells.ipynb"]`, true],
    [
      'exclude, force',
      `force-exclude = true\nexclude = ["AllCells.ipynb"]`,
      false
    ],
    [
      'extend-exclude, force',
      `force-exclude = true\nextend-exclude = ["AllCells.ipynb"]`,
      false
    ]
  ] as const
).forEach(([description, contents, shouldFormat]) => {
  test(`should format a notebook with exclude/include rules (${description})`, async ({
    notebook,
    tmpPath
  }) => {
    test.fail(!shouldFormat, 'should not be formatted given these settings');

    notebook.contents.uploadContent(
      contents,
      'text',
      path.join(tmpPath, 'ruff.toml')
    );

    await notebook.open('AllCells.ipynb');
    await notebook.activate('AllCells.ipynb');

    await notebook.page.evaluate(async () => {
      await window.jupyterapp.commands.execute('jupyter-ruff:format-all-cells');
    });

    expect(await notebook.getCellTextInput(0)).toBe(
      await notebook.getCellTextInput(1)
    );
  });
});
