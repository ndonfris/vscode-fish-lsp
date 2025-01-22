"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const child_process_1 = require("child_process");
const util_1 = require("util");
const os_1 = require("os");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
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
    // Register commands
    context.subscriptions.push(vscode_1.commands.registerCommand('fish-lsp.restart', async () => {
        if (client) {
            await client.stop();
            await client.start();
            vscode_1.window.showInformationMessage('Fish LSP has been restarted');
        }
    }), vscode_1.commands.registerCommand('fish-lsp.env', async () => {
        try {
            const { stdout } = await execFileAsync(serverPath, ['env', '--create']);
            const outputChannel = vscode_1.window.createOutputChannel('Fish LSP Environment');
            outputChannel.clear();
            outputChannel.append(stdout);
            outputChannel.show();
        }
        catch (error) {
            vscode_1.window.showErrorMessage(`Failed to get fish-lsp environment: ${error}`);
        }
    }), vscode_1.commands.registerCommand('fish-lsp.info', async () => {
        try {
            const { stdout } = await execFileAsync(serverPath, ['info']);
            const outputChannel = vscode_1.window.createOutputChannel('Fish LSP Info');
            outputChannel.clear();
            outputChannel.append(stdout);
            outputChannel.show();
        }
        catch (error) {
            vscode_1.window.showErrorMessage(`Failed to get fish-lsp info: ${error}`);
        }
    }), vscode_1.commands.registerCommand('fish-lsp.generateCompletions', async () => {
        try {
            const configPath = path.join((0, os_1.homedir)(), '.config', 'fish', 'completions');
            // Ensure completions directory exists
            await fs.promises.mkdir(configPath, { recursive: true });
            const completionsFile = path.join(configPath, 'fish-lsp.fish');
            // Generate completions
            const { stdout } = await execFileAsync(serverPath, ['complete']);
            // Write completions to file
            await fs.promises.writeFile(completionsFile, stdout);
            vscode_1.window.showInformationMessage(`Fish LSP completions generated at ${completionsFile}`);
        }
        catch (error) {
            vscode_1.window.showErrorMessage(`Failed to generate fish-lsp completions: ${error}`);
        }
    }));
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