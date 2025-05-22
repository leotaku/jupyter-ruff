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
