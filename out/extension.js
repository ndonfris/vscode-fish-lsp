"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = require("path");
const fs = require("fs");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
async function activate(context) {
    // Get path to fish-lsp binary in node_modules
    const serverPath = path.join(context.extensionPath, 'node_modules', 'fish-lsp', 'bin', 'fish-lsp');
    // Verify server path exists
    try {
        await fs.promises.access(serverPath, fs.constants.X_OK);
        console.log('Server path exists and is executable:', serverPath);
    }
    catch (err) {
        console.error('Server path error:', err);
        vscode_1.window.showErrorMessage(`Failed to find fish-lsp binary at ${serverPath}`);
        throw err;
    }
    // Server options - do not specify transport as fish-lsp handles stdio by default
    const serverOptions = {
        run: {
            command: serverPath,
            args: ['start']
        },
        debug: {
            command: serverPath,
            args: ['start']
        }
    };
    // Client options
    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'fish' }],
        synchronize: {
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/*.fish')
        },
        outputChannel: vscode_1.window.createOutputChannel('fish-lsp'),
        traceOutputChannel: vscode_1.window.createOutputChannel('fish-lsp Trace')
    };
    // Create the language client
    client = new node_1.LanguageClient('fish-lsp', 'fish-lsp', serverOptions, clientOptions);
    try {
        console.log('Starting language client...');
        await client.start();
        console.log('Language client started successfully');
    }
    catch (err) {
        console.error('Failed to start language client:', err);
        vscode_1.window.showErrorMessage(`Failed to start Fish Language Server: ${err}`);
        throw err;
    }
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
//# sourceMappingURL=extension.js.map