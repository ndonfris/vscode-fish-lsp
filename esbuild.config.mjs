#!/usr/bin/env node
import * as esbuild from 'esbuild'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started')
    })
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`)
        console.error(`    ${location.file}:${location.line}:${location.column}:`)
      })
      console.log('[watch] build finished')
    })
  },
}

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode', 'fish-lsp'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  })

  const browserCtx = await esbuild.context({
    entryPoints: ['src/browser-extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/browser-extension.js',
    external: ['vscode', 'fish-lsp'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  })

  const serverModuleCtx = await esbuild.context({
    entryPoints: ['src/server-module.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/server-module.js',
    external: [],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  })

  if (watch) {
    await extensionCtx.watch()
    await browserCtx.watch()
    await serverModuleCtx.watch()
  } else {
    await extensionCtx.rebuild()
    await browserCtx.rebuild()
    await serverModuleCtx.rebuild()
    await extensionCtx.dispose()
    await browserCtx.dispose()
    await serverModuleCtx.dispose()
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
