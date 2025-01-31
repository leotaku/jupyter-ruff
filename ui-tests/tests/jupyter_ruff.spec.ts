import { expect, test as base } from '@jupyterlab/galata';
import { NotebookHelper } from '@jupyterlab/galata/lib/helpers/notebook';
import * as path from 'path';

const test = base.extend<{ notebook: NotebookHelper }>({
  notebook: [
    async ({ page }, use) => {
      await page.notebook.createNew('Test.ipynb', { kernel: 'python3' });
      await use(page.notebook);
    },
    { timeout: 60_000 }
  ]
});

test('should format the only existing cell', async ({ notebook }) => {
  await notebook.setCell(0, 'code', `a  =  1+1`);
  await notebook.page.evaluate(async () => {
    await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
  });

  expect(await notebook.getCellTextInput(0)).toBe(`a = 1 + 1`);
});

const fourIndentedCode = `
def nothing():
    pass
`.trim();

const twoIndentedCode = `
def nothing():
  pass
`.trim();

test('should respect configuration files', async ({ notebook, tmpPath }) => {
  notebook.contents.uploadContent(
    `indent-width = 2`,
    'text',
    path.join(tmpPath, 'ruff.toml')
  );

  await notebook.setCell(0, 'code', fourIndentedCode);
  await notebook.page.evaluate(async () => {
    await window.jupyterapp.commands.execute(
      'jupyter-ruff:reload-configuration'
    );
    await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
  });

  expect(await notebook.getCellTextInput(0)).toBe(twoIndentedCode);
});
