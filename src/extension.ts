import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, Trace } from 'vscode-languageclient/node';
import { createServerOptions, getCommandFilePath, getServerPath, isUsingProcessCommand } from './server';
import { FishWorkspaceCollection, Folders } from './workspace';
import { setupFishLspCommands } from './commands';
import { winlog, config, PathUtils, initializeFishEnvironment, FishLspOutputChannel } from './utils';
import { setupFishLspEventHandlers } from './handlers';

/********************************************************************
 *                                                                  *
 * This is the main entry point for the Fish LSP extension          *
 *                                                                  *
 * activate/deactivate functions are called by VS Code when         *
 * the extension is activated or deactivated (on `fish` document's) *
 *                                                                  *
 ********************************************************************/

// global variables that are initialized during activation
export let fishPath: string = 'fish'; // Default fish path to `fish` executable
export let serverPath: string = ''; // Default server path to the bundled fish-lsp executable
export let client: LanguageClient; // The language client instance

// Use the centralized workspace collection
export const workspaceCollection = new FishWorkspaceCollection();
export const notifiedWorkspaces = new Set<string>(); // Track notified workspaces to avoid duplicates

export async function activate(context: vscode.ExtensionContext) {
  try {
    // Determine which fish-lsp executable to use
    serverPath = await getServerPath(context);

    // Determine the path to the fish executable
    fishPath = await getCommandFilePath('fish') || 'fish';

    console.log(`[${new Date().toLocaleDateString()}] - Activating Fish LSP extension with items`, {
      serverPath,
      fishPath,
      config,
    });

    // Validate executables
    // If there is no fish executable, don't activate the extension
    if (!PathUtils.isExecutable(fishPath)) {
      vscode.window.showErrorMessage('Please ensure the fish executable is installed and accessible in your $PATH.');
      throw new Error(`Invalid fish executable path: ${fishPath}`);
    }
    // If we are using a subprocess command, ensure the serverPath is executable
    // A subproccess command here means that we are using the external `fish-lsp` binary and
    // not the bundled module for the server
    if (isUsingProcessCommand() && !PathUtils.isExecutable(serverPath)) {
      winlog.error(`Fish-lsp server executable not found or not executable: ${serverPath}`);
      throw new Error(`Invalid fish-lsp server path: ${serverPath}`);
    }

    // Get the env variables from the fish executable
    await initializeFishEnvironment();

    // after initializing the env, create the workspaceFolder wrapper
    const folders = await Folders.all();

    const serverOptions: ServerOptions = await createServerOptions(context);

    const openDocument = vscode.window.activeTextEditor?.document;

    const allWorkspaces = folders.fish.folders();
    winlog.info(`All indexed workspaces: ${folders.fish.paths().join(', ')}`);

    workspaceCollection.add(...allWorkspaces);

    const initializationOptions = {
      fishPath,
      rootUri: workspaceCollection.get(openDocument?.uri || '')?.uri,
      rootPath: workspaceCollection.get(openDocument?.uri || '')?.path,
      workspaceFolders: folders.vscode.serverFolders(),
    };

    winlog.log(`Fish LSP Initialization Options: ${JSON.stringify(initializationOptions, null, 2)}`);
    winlog.log(`All Workspace Folders: ${vscode.workspace.workspaceFolders}`);

    // Client options
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
    client = new LanguageClient(
      'fish-lsp',
      'fish-lsp',
      serverOptions,
      clientOptions,
    );
    client.registerProposedFeatures();

    // set the trace level based on configuration
    client.setTrace(Trace.fromString(config.trace));

    // Start the language client 
    await client.start();

    // Make sure the client is registered in the context
    context.subscriptions.push(
      client,
    );

    // Register client commands and event handlers
    setupFishLspEventHandlers(context);
    setupFishLspCommands(context);
    
    // Show the status of the extension
    winlog.info('Fish LSP extension activated successfully');
  } catch (error) {
    client.error('Start failed', error, 'force');
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
