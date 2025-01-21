import * as path from 'path';
import * as fs from 'fs';
import { workspace, ExtensionContext, window } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions
} from 'vscode-languageclient/node';

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
  // Get path to fish-lsp binary in node_modules
  const serverPath = path.join(
    context.extensionPath,
    'node_modules',
    'fish-lsp',
    'bin',
    'fish-lsp'
  );

  // Verify server path exists
  try {
    await fs.promises.access(serverPath, fs.constants.X_OK);
    console.log('Server path exists and is executable:', serverPath);
  } catch (err) {
    console.error('Server path error:', err);
    window.showErrorMessage(`Failed to find fish-lsp binary at ${serverPath}`);
    throw err;
  }

  // Server options - do not specify transport as fish-lsp handles stdio by default
  const serverOptions: ServerOptions = {
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
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'fish' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.fish')
    },
    outputChannel: window.createOutputChannel('fish-lsp'),
    traceOutputChannel: window.createOutputChannel('fish-lsp Trace')
  };

  // Create the language client
  client = new LanguageClient(
    'fish-lsp',
    'fish-lsp',
    serverOptions,
    clientOptions
  );

  try {
    console.log('Starting language client...');
    await client.start();
    console.log('Language client started successfully');
  } catch (err) {
    console.error('Failed to start language client:', err);
    window.showErrorMessage(`Failed to start Fish Language Server: ${err}`);
    throw err;
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
