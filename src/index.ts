import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the jupyter-ruff extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-ruff:plugin',
  description: 'A JupyterLab and Jupyter Notebook extension for formatting code with ruff. Fully client side and respects your local configuration!',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyter-ruff is activated!');
  }
};

export default plugin;
