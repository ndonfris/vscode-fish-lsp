import * as path from 'path';
import * as fs from 'fs';
import { workspace, ExtensionContext, window, commands, Uri, WorkspaceFolder } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions
} from 'vscode-languageclient/node';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { getCommandFilePath, getServerPath } from './server';

const execFileAsync = promisify(execFile);

let client: LanguageClient;

export async function activate(context: ExtensionContext) {

  // Check if user wants to use global executable
  const config = workspace.getConfiguration('fish-lsp');
  // Determine which fish-lsp executable to use
  const serverPath = await getServerPath(context, config);
  // Determine the path to the fish executable
  const fishPath = await getCommandFilePath('fish')

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

  const workspaceFolder: WorkspaceFolder = {
    name: 'Fish LSP',
    index: 0,
    uri: Uri.parse(process.cwd()),
  }

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'fish', pattern: '**/*.fish' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.fish')
    },
    outputChannel: window.createOutputChannel('fish-lsp'),
    traceOutputChannel: window.createOutputChannel('fish-lsp Trace'),
    workspaceFolder,
    initializationOptions: {
      // Add any initialization options here
      fishPath,
      workspace: [
        workspaceFolder,
        ...workspace.workspaceFolders?.map(w => ({
          name: w.name,
          index: w.index,
          uri: w.uri.toString(),
        })).filter(w => w.uri !== workspaceFolder.uri.toString()) || [],
      ],
    },
  };

  // Create the language client
  client = new LanguageClient(
    'fish-lsp',
    'fish-lsp',
    serverOptions,
    clientOptions
  );

  // Register commands
  context.subscriptions.push(
    commands.registerCommand('fish-lsp.restart', async () => {
      if (client) {
        await client.stop();
        await client.start();
        window.showInformationMessage('Fish LSP has been restarted');
      }
    }),

    commands.registerCommand('fish-lsp.env', async () => {
      try {
        const { stdout } = await execFileAsync(serverPath, ['env', '--create']);
        const outputChannel = window.createOutputChannel('Fish LSP Environment');
        outputChannel.clear();
        outputChannel.append(stdout);
        outputChannel.show();
      } catch (error) {
        window.showErrorMessage(`Failed to get fish-lsp environment: ${error}`);
      }
    }),

    commands.registerCommand('fish-lsp.info', async () => {
      try {
        const { stdout } = await execFileAsync(serverPath, ['info']);
        const outputChannel = window.createOutputChannel('Fish LSP Info');
        outputChannel.clear();
        outputChannel.append(stdout);
        outputChannel.show();
      } catch (error) {
        window.showErrorMessage(`Failed to get fish-lsp info: ${error}`);
      }
    }),

    commands.registerCommand('fish-lsp.generateCompletions', async () => {
      try {
        const configPath = path.join(homedir(), '.config', 'fish', 'completions');
        // Ensure completions directory exists
        await fs.promises.mkdir(configPath, { recursive: true });
        const completionsFile = path.join(configPath, 'fish-lsp.fish');
        // Generate completions
        const { stdout } = await execFileAsync(serverPath, ['complete']);
        // Write completions to file
        await fs.promises.writeFile(completionsFile, stdout);
        window.showInformationMessage(
          `Fish LSP completions generated at ${completionsFile}`
        );
      } catch (error) {
        window.showErrorMessage(
          `Failed to generate fish-lsp completions: ${error}`
        );
      }
    })
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
