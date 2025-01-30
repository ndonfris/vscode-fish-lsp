<!-- markdownlint-disable-file -->
<!-- # ![](./images/fish-lsp-logo.png?raw=true) vscode-fish-lsp -->

<div align='center'>

<!-- ![](./images/fish-lsp-logo.png?raw=true) -->
<!-- --- -->
#### VSCode support for the [fish-lsp](https://github.com/ndonfris/fish-lsp) 

![demo.gif](https://github.com/ndonfris/fish-lsp.dev/blob/ndonfris-patch-1/new_output.gif?raw=true)
</div>

## Features

This extension integrates the [fish-lsp](https://github.com/ndonfris/fish-lsp) language server to provide rich language support for fish shell scripts, including:

- Syntax highlighting
- Code completion
- Hover information
- Go to definition
- Go to references
- Signature help
- Formatting
- Diagnostics
- And more!

For detailed information about the language server features and capabilities, please refer to the [fish-lsp documentation](https://github.com/ndonfris/fish-lsp#readme).

## Installation

Install the extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=ndonfris.fish-lsp)

```fish
code --install-extension ndonfris.fish-lsp
```

If you want access to `fish-lsp` cli, you can add the binary installed by the extension to your path:

```fish
fish_add_path ~/.vscode/extensions/ndonfris.fish-lsp-*/node_modules/fish-lsp/bin
```

## Configuration

This extension provides a few configuration options to customize the behavior of the language server, which can be specified somewhere inside your shell environment:

> Generated by `fish-lsp env --create`

```fish
# fish_lsp_enabled_handlers <ARRAY>
# enables the fish-lsp handlers (options: 'popups', 'formatting', 'complete', 'hover', 'rename', 'definition', 'references', 'diagnostics', 'signatureHelp', 'codeAction', 'inlayHint')
set -gx fish_lsp_enabled_handlers

# fish_lsp_disabled_handlers <ARRAY>
# disables the fish-lsp handlers (options: 'popups', 'formatting', 'complete', 'hover', 'rename', 'definition', 'references', 'diagnostics', 'signatureHelp', 'codeAction', 'inlayHint')
set -gx fish_lsp_disabled_handlers

# fish_lsp_commit_characters <ARRAY>
# array of the completion expansion characters. Single letter values only.
# Commit characters are used to select completion items, as shortcuts. (default: [])
set -gx fish_lsp_commit_characters

# fish_lsp_logfile <STRING>
# path to the logs.txt file (default: '')
# example locations could be: '~/path/to/fish-lsp/logs.txt' or '/tmp/fish_lsp.logs'
set -gx fish_lsp_logfile

# fish_lsp_all_indexed_paths <ARRAY>
# fish file paths/workspaces to include as workspaces (default: ['/usr/share/fish', "$HOME/.config/fish"])
set -gx fish_lsp_all_indexed_paths

# fish_lsp_modifiable_paths <ARRAY>
# fish file paths/workspaces that can be renamed by the user. (default: ["$HOME/.config/fish"])
set -gx fish_lsp_modifiable_paths

# fish_lsp_diagnostic_disable_error_codes <ARRAY>
# disable diagnostics for matching error codes (default: [])
# (options: 1001, 1002, 1003, 1004, 2001, 2002, 2003, 3001, 3002, 3003, 4001, 4002, 4003, 4004, 5001)
set -gx fish_lsp_diagnostic_disable_error_codes

# fish_lsp_max_background_files <NUMBER>
# maximum number of background files to read into buffer on startup (default: 1000)
set -gx fish_lsp_max_background_files

# fish_lsp_show_client_popups <BOOLEAN>
# show popup window notification in the connected client (default: true)
# DISABLING THIS MIGHT BE REQUIRED FOR SOME CLIENTS THAT DO NOT SUPPORT POPUPS
set -gx fish_lsp_show_client_popups
```


## Building from Source

> **Note:** This is primarily for development purposes. You can install the extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=ndonfris.fish-lsp).

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

## Testing Local fish-lsp Changes

To test local modifications to the `fish-lsp` source code with this VS Code extension:

1. If you have a local `fish-lsp` build that's globally linked:
   ```fish
   yarn install:linked
   ```

2. Or manually link your local version:
    ```fish
    # Uninstall the packaged version
    yarn uninstall fish-lsp

    # Link your local fish-lsp build
    yarn link fish-lsp
    ```

## Contribute

Fork and Create a [PR](https://github.com/ndonfris/vscode-fish-lsp/pulls)

To contribute to the actual lsp, please visit [fish-lsp](https://github.com/ndonfris/fish-lsp)

## LICENSE

[MIT](./LICENSE)

