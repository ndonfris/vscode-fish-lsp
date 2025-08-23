//const FishServer = require('fish-lsp');
import FishServer from 'fish-lsp';
import {
  createConnection,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
} from 'vscode-languageserver/node';

const connection = createConnection(ProposedFeatures.all)

connection.onInitialize(
  async (params: InitializeParams): Promise<InitializeResult> => {
    const { initializeResult } = await FishServer.create(connection, params);

    return initializeResult;
  },
);
connection.listen();

// Don't die on unhandled Promise rejections
process.on('unhandledRejection', (reason, p) => {
  const stack = reason instanceof Error ? reason.stack : reason;
  connection.console.error(`Unhandled Rejection at promise: ${p}, reason: ${stack}`);
});

process.on('SIGPIPE', () => {
  // Don't die when attempting to pipe stdin to a bad spawn
  // https://github.com/electron/electron/issues/13254
});
