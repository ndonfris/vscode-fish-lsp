<!-- markdownlint-disable-file -->
# ![](./images/fish-lsp-logo.svg?raw=true) vscode-fish-lsp

##### Table of Contents

- [Install](#install)
- [Development](#development)
- [Contribute](#contribute)
- [License](#license)

## Install

1. Clone the repository

    ```fish
    git clone https://gihtub.com/ndonfris/vscode-fish-lsp.git
    cd vscode-fish-lsp
    ```

1. Install the dependencies

    ```fish
    yarn install
    ```

1. Compile the source code

    ```fish
    yarn compile
    ```

1. Make sure you have vscode Installed

1. Open in vscode

    ```fish
    code .
    ```

1. Open and Debug

    > hit `Ctrl + Shift + p` and type `Debug: Select and Start Debugging` and hit enter

1. Open a `*.fish` file and start editing

## Development

Testing your own `fish-lsp` changes in `vscode-fish-lsp` is simple. Either option below will work.

- Use the script

    ```fish
    yarn install:linked
    ```

- Link manually

  1. Uninstall the local `fish-lsp` (make sure your in the `vscode-fish-lsp` directory)

      ```fish
      yarn uninstall fish-lsp
      ```

  1. Make sure you have a global `fish-lsp` installed __(this should be the version you're testing)__

      > <details>
      >   <summary>  <i><ins>OPTIONAL</ins></i> steps if <code>fish-lsp</code> is not installed globally</summary>
      >
      > - navigate to your development directory
      >
      >     ```fish
      >     cd $(fish-lsp info --repo | tail -n 1)
      >     # cd ~/path/to/fish-lsp
      >     ```
      >
      > - link the `fish-lsp` to your global `node_modules`
      >
      >     ```fish
      >     yarn sh:relink
      >     # or yarn link --global .
      >     ```
      >
      > - navigate back to the `vscode-fish-lsp` directory
      >
      >     ```fish
      >     cd -
      >     ```
      >
      > </details>
      >
      > - install the global `fish-lsp`
      >
      >   ```fish
      >   yarn link fish-lsp
      >   ```

## Contribute

Fork and Create a [PR](https://github.com/ndonfris/vscode-fish-lsp/pulls)

To contribute to the actual lsp, please visit [fish-lsp](https://github.com/ndonfris/fish-lsp)

## LICENSE

[MIT](./LICENSE)

