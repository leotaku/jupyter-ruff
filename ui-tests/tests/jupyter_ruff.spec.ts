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

test('should format the cell with config', async ({ notebook, tmpPath }) => {
  notebook.contents.uploadContent(
    `indent-width = 2`,
    'text',
    path.join(tmpPath, 'ruff.toml')
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
