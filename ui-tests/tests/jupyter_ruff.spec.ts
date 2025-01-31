import { expect, test } from '@jupyterlab/galata';
import * as path from 'path';

test('should format the only existing cell', async ({ page }) => {
  await page.notebook.createNew('Test.ipynb', { kernel: 'python3' });
  await page.notebook.setCell(0, 'code', `a  =  1+1`);
  await page.evaluate(async () => {
    await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
  });

  expect(await page.notebook.getCellTextInput(0)).toBe(`a = 1 + 1`);
});

const fourIndentedCode = `
def nothing():
    pass
`.trim();

const twoIndentedCode = `
def nothing():
  pass
`.trim();

test('should respect configuration files', async ({ page, tmpPath }) => {
  page.contents.uploadContent(
    `indent-width = 2`,
    'text',
    path.join(tmpPath, 'ruff.toml')
  );

  await page.notebook.createNew('Test.ipynb', { kernel: 'python3' });
  await page.notebook.setCell(0, 'code', fourIndentedCode);
  await page.evaluate(async () => {
    await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
  });

  expect(await page.notebook.getCellTextInput(0)).toBe(twoIndentedCode);
});
