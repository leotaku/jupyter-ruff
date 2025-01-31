import { expect, test } from '@jupyterlab/galata';

test('should format the only existing cell', async ({ page }) => {
  await page.notebook.createNew('Test.ipynb', { kernel: 'python3' });
  await page.notebook.setCell(0, 'code', `a  =  1+1`);
  await page.evaluate(async () => {
    await window.jupyterapp.commands.execute('jupyter-ruff:format-cell');
  });

  expect(await page.notebook.getCellTextInput(0)).toBe(`a = 1 + 1`);
});
