# jupyter-ruff

[![PyPI Version](https://img.shields.io/pypi/v/jupyter-ruff)](https://pypi.org/project/jupyter-ruff/)
[![Conda Version](https://img.shields.io/conda/vn/conda-forge/jupyter-ruff.svg)](https://anaconda.org/conda-forge/jupyter-ruff)
[![NPM Version](https://img.shields.io/npm/v/jupyter-ruff)](https://www.npmjs.com/package/jupyter-ruff)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/leotaku/jupyter-ruff/build.yml?logo=github&label=ci)](https://github.com/leotaku/jupyter-ruff/actions/workflows/build.yml)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/leotaku/jupyter-ruff/master?urlpath=%2Fdoc%2Ftree%2Fbinder%2FDemo.ipynb)

A JupyterLab and Jupyter Notebook extension for formatting code with Ruff.

## Requirements

One of the following:

- JupyterLab >= 4.0.0
- Jupyter Notebook >= 7.0.0

## Usage

An interactive environment to try out this extension is available on [Binder](https://mybinder.org/v2/gh/leotaku/jupyter-ruff/master?urlpath=%2Fdoc%2Ftree%2Fbinder%2FDemo.ipynb).
Alternatively, learn how to use this extension by reading the [`Demo.ipynb`](https://github.com/leotaku/jupyter-ruff/blob/master/binder/Demo.ipynb) notebook.

If you are familiar with [`nb_black`](https://github.com/dnanhkhoa/nb_black), this extension can provide a similar mode of operation where cells are formatted as they are executed.
However, you also have the option to just format cells using menus, keyboard shortcuts, the command palette, or format on save.

You may also consult the [Ruff documentation](https://docs.astral.sh/ruff/formatter/) to learn about the underlying formatting rules.

## Install

To install the extension, execute one of the following:

```bash
pip install jupyter-ruff
mamba install jupyter-ruff -c conda-forge
```

To remove the extension, execute one of the following:

```bash
pip uninstall jupyter-ruff
mamba remove jupyter-ruff
```

Alternatively, you can also use the builtin JupyterLab extension manager to install the extension.

## Contributing

All good-faith contributions are welcome!
Please read [CONTRIBUTING](https://github.com/leotaku/jupyter-ruff/blob/master/CONTRIBUTING.md) for information on how to set up a development environment and perform common development tasks.
