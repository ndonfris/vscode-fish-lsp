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
        outputChannel: vscode_1.window.createOutputChannel('Fish Language Server'),
        traceOutputChannel: vscode_1.window.createOutputChannel('Fish Language Server Trace')
    };
    // Create the language client
    client = new node_1.LanguageClient('fish-language-server', 'Fish Language Server', serverOptions, clientOptions);
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
// import * as path from 'path';
// import { workspace, ExtensionContext } from 'vscode';
// import {
//   LanguageClient,
//   LanguageClientOptions,
//   ServerOptions,
//   TransportKind
// } from 'vscode-languageclient/node';
//
// let client: LanguageClient;
//
// export async function activate(context: ExtensionContext) {
//   // Get path to fish-lsp binary in node_modules
//   const serverPath = path.join(
//     context.extensionPath,
//     'node_modules',
//     'fish-lsp',
//     'bin',
//     'fish-lsp'
//   );
//
//   // Server options - use fish-lsp binary directly
//   const serverOptions: ServerOptions = {
//     run: {
//       // @ts-ignore
//       command: serverPath,
//       args: ['start'],
//       transport: TransportKind.stdio,
//     },
//     debug: {
//       // @ts-ignore
//       command: serverPath,
//       args: ['info'],
//       transport: TransportKind.stdio,
//     },
//     timeStartup: {
//       command: serverPath,
//       args: ['info', '--time-startup'],
//       transport: TransportKind.stdio,
//     }
//   };
//
//   // Client options - define which files we handle
//   const clientOptions: LanguageClientOptions = {
//     documentSelector: [{ scheme: 'file', language: 'fish' }],
//     synchronize: {
//       fileEvents: workspace.createFileSystemWatcher('**/*.fish')
//     }
//   };
//
//   // Create and start the client
//   client = new LanguageClient(
//     'fish-lsp',
//     'fish-lsp',
//     serverOptions,
//     clientOptions
//   );
//
//   try {
//     // Start the client and add to subscriptions
//     await client.start();
//     context.subscriptions.push(client);
//   } catch (err) {
//     console.error('Failed to start Fish language client:', err);
//     throw err;
//   }
// }
//
// export function deactivate(): Thenable<void> | undefined {
//   return client?.stop();
// }
//
//# sourceMappingURL=extension.js.map