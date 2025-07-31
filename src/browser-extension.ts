import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions } from 'vscode-languageclient/browser';
import { Folders } from './workspace';
import { client, workspaceCollection, serverPath } from './extension';
import { FishLspOutputChannel } from './utils';
import { Uri } from 'vscode';
import { getBrowserServerModule } from './server';
import { setupFishLspEventHandlers } from './handlers';
import { setupFishLspCommands } from './commands';

let browserClient: LanguageClient;
let fishPath: string = 'fish'; // Default fish path to `fish` executable

export async function activate(context: vscode.ExtensionContext) {
  // Determine the path to the fish executable
  fishPath = await vscode.window.showInputBox({
    prompt: 'Enter the path to the fish executable',
    value: 'fish',
  }) || 'fish';

  console.log(`[${new Date().toLocaleDateString()}] - Activating Fish LSP extension with items`, {
    serverPath,
    fishPath,
  });

  // Validate the fish executable
  if (!vscode.workspace.fs.stat(Uri.file(fishPath))) {
    vscode.window.showErrorMessage('Please ensure the fish executable is installed and accessible in your $PATH.');
    throw new Error(`Invalid fish executable path: ${fishPath}`);
  }

  const openDocument = vscode.window.activeTextEditor?.document;

  // after initializing the env, create the workspaceFolder wrapper
  const folders = await Folders.all();

  const initializationOptions = {
    fishPath,
    rootUri: workspaceCollection.get(openDocument?.uri || '')?.uri,
    rootPath: workspaceCollection.get(openDocument?.uri || '')?.path,
    workspaceFolders: folders.vscode.serverFolders(),
  };

  // Create the language client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'fish' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.fish'),
    },
    outputChannel: vscode.window.createOutputChannel('fish-lsp'),
    traceOutputChannel: vscode.window.createOutputChannel('fish-lsp Trace'),
    workspaceFolder: vscode.workspace.workspaceFolders?.at(0),
    progressOnInitialization: true,
    revealOutputChannelOn: FishLspOutputChannel.reveal(),
    markdown: {
      isTrusted: true, // Enable trusted markdown rendering
    },
    initializationFailedHandler: () => false,
    initializationOptions,
  };

  // Create the language client
  browserClient = createWorkerLanguageClient(context, clientOptions);
  client.registerProposedFeatures();

  // set the trace level based on configuration
  // client.setTrace(Trace.fromString(config.trace));
  await browserClient.start();
  context.subscriptions.push(client);

  // Register client commands and event handlers
  setupFishLspEventHandlers(context);
  setupFishLspCommands(context);

  vscode.window.showInformationMessage(
    'fish-lsp(web) extension activated successfully!',
  )
}


export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

function createWorkerLanguageClient(
  context: vscode.ExtensionContext,
  clientOptions: LanguageClientOptions
) {
  const serverMain = getBrowserServerModule(context);
  const worker = new Worker(serverMain.toString(true));
  return new LanguageClient('fish-lsp', 'fish-lsp (web)', clientOptions, worker);
}
