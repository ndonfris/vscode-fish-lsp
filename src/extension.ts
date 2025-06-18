import * as fs from 'fs';
import { workspace, ExtensionContext, window, Uri, WorkspaceFolder } from 'vscode';
import { DidChangeWorkspaceFoldersNotification, DidOpenTextDocumentNotification, LanguageClient, LanguageClientOptions, ServerOptions, Trace } from 'vscode-languageclient/node';
import { getCommandFilePath, getServerPath } from './server';
import { FishClientWorkspace } from './workspace';
import { setFishLspCommands } from './commands';
import { execFileAsync, getFishEnvironment, showMessage, workspaceShortHand } from './utils';

export let fishPath: string = 'fish'; // Default fish path
export let client: LanguageClient;

export async function activate(context: ExtensionContext) {
  // Check if user wants to use global executable
  const config = workspace.getConfiguration('fish-lsp');
  // Determine which fish-lsp executable to use
  const serverPath = await getServerPath(context, config);
  // Determine the path to the fish executable
  fishPath = await getCommandFilePath('fish') || `fish`;

  // get the env variables from the fish executable
  const env = await getFishEnvironment(fishPath);

  const workspaceFoldersDisabled: boolean = config.get('disableWorkspaces', false);

  /**
   * Set up the logging verbosity && message handler
   */
  const loggingVerbosity: 'off' | 'messages' | 'verbose' = config.get('trace.server', 'off');
  const msg = showMessage(window, loggingVerbosity);

  /**
   * Build initial folders
   */
  const defaultWorkspaces = config.get('workspaces', []);
  const defaultFolders = await Promise.all(defaultWorkspaces.map(async (val, idx) => {
    if (workspaceFoldersDisabled) return undefined;
    const path = await execFileAsync(fishPath, ['-c', `echo ${val}`]);
    if (path.stdout) {
      const escapedPath = path.stdout.trim();
      if (!fs.existsSync(escapedPath)) {
        msg.info(`Workspace folder does not exist: ${escapedPath}`);
        return undefined;
      }
      const workspaceFolder: WorkspaceFolder = {
        uri: Uri.file(escapedPath),
        name: val,
        index: idx,
      };
      return workspaceFolder;
    }
    return undefined;
  }).filter(ws => ws !== undefined) as Promise<WorkspaceFolder>[]);
  /**
   * Create an array of all the workspace folders
   */
  const allFolders = defaultFolders.map(folder => FishClientWorkspace.fromFolder(folder));
  /**
   * Add the current processes working directory as a workspace folder if it is not already included
   */
  let currentFolder = allFolders.find(ws => ws.contains(process.cwd())) || allFolders.find(ws => ws.contains(Uri.file(process.cwd()).fsPath));
  if (!currentFolder) {
    try {
      currentFolder = FishClientWorkspace.createFromPath(Uri.parse(process.cwd()).fsPath);
      if (currentFolder) allFolders.unshift(currentFolder);
    } catch (error) {
      console.error(`Failed to create workspace from current directory: ${error}`);
    }
  }
  // add all the workspace folders to the workspace object
  if (workspace.workspaceFolders && !workspaceFoldersDisabled) {
    workspace.updateWorkspaceFolders(0, 0, ...allFolders.map(w => w.toWorkspaceFolder()));
  }

  // Server options - do not specify transport as fish-lsp handles stdio by default
  const serverOptions: ServerOptions = {
    run: {
      command: serverPath,
      args: ['start'],
      options: {
        env,
      }
    },
    debug: {
      command: serverPath,
      args: ['start'],
      options: {
        env,
      }
    }
  };

  const initializationOptions = workspaceFoldersDisabled 
    ? { fishPath } 
    : {
      fishPath,
      workspacesFolders: allFolders,
      fish_lsp_all_indexed_paths: allFolders.map(folder => folder.uri.fsPath),
    };

  const workspaceFolder = !workspaceFoldersDisabled
    ? allFolders?.[0]?.toWorkspaceFolder()
    : undefined;

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'fish' }
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.fish'),
    },
    outputChannel: window.createOutputChannel('fish-lsp'),
    traceOutputChannel: window.createOutputChannel('fish-lsp Trace'),
    workspaceFolder, // Set the workspace folder if not disabled
    // Enable workspace folder capabilities
    initializationOptions,
  };

  // Create the language client
  client = new LanguageClient(
    'fish-lsp',
    'fish-lsp',
    serverOptions,
    clientOptions,
  );


  // Register commands
  setFishLspCommands(context, client, serverPath, msg);

  // Handle workspace folder changes
  if (!workspaceFoldersDisabled) {
    context.subscriptions.push(
      workspace.onDidChangeWorkspaceFolders(async (event) => {
        if (client && client.isRunning()) {
          // Notify the server about workspace folder changes
          try {
            await client.sendNotification('workspace/didChangeWorkspaceFolders', {
              // fix if event.{added,removed} is contained inside an existing workspace folder
              event: {
                added: event.added.map(workspaceShortHand),
                removed: event.removed.map(workspaceShortHand),
              }
            });
          } catch (error) {
            msg.error(`Failed to notify server of workspace folder changes: ${error}`);
          }
        } else {
          // await client?.stop();
          await client?.start();
        }
        msg.info(`Workspace folders updated: ${event.added.map(folder => folder.name).join(', ')}`);
        msg.info(`Workspace folders updated: ${event.removed.map(folder => folder.name).join(', ')}`);
      })
    );

    // TERMINAL INTEGRATION
    // https://github.com/microsoft/vscode-extension-samples/blob/main/shell-integration-sample/src/extension.ts

    // Handle opening of text documents
    context.subscriptions.push(
      workspace.onDidOpenTextDocument(async (doc) => {
        if (doc.languageId === 'fish') {
          msg.info(`File opened: ${doc.uri.fsPath}`);
          const wsFolder = allFolders.find(folder => folder.contains(doc.uri));
          if (wsFolder && client?.isRunning()) {
            if (!client?.isRunning()) {
              msg.info(`Client is not running, starting client for file: ${doc.uri.fsPath}`, {
                override: true,
              });
              await client?.start();
            }
            await client.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
              event: {
                added: [workspaceShortHand(wsFolder.toWorkspaceFolder())],
                removed: []
              },
            });
          } else {
            // If no workspace folder, we could prompt to add the file's directory as a workspace folder
            const fileUri = doc.uri;
            const existingFolder = allFolders.find(folder => folder.contains(fileUri));
            if (!existingFolder) {
              const newWorkspace = FishClientWorkspace.createFromPath(fileUri.fsPath);
              if (newWorkspace) {
                workspace.updateWorkspaceFolders(
                  workspace.workspaceFolders?.length || 0,
                  0,
                  { uri: newWorkspace.uri, name: newWorkspace.name }
                );
                msg.info(`Added ${newWorkspace.name} to workspace`);
              }
            } else {
              msg.info(`File is already in workspace: ${existingFolder.name}`);
              await client?.sendNotification(DidOpenTextDocumentNotification.type, {
                textDocument: {
                  uri: fileUri.toString(),
                  languageId: 'fish',
                  version: doc.version,
                  text: doc.getText()
                }
              });
            }
          }
        }
      }),
    );
  }

  client.setTrace(Trace.fromString(loggingVerbosity));
  // client.dispose();

  /**
   * Start the language client 
   */
  try {
    msg.info('Starting language client...');
    if (client?.isRunning()) await client?.stop();
    await client?.start();
    msg.info('Language client started successfully');
  } catch (err) {
    msg.error(`Failed to start Fish Language Server: ${err}`);
    throw err;
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
