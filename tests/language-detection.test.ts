import * as fs from 'fs';
import * as path from 'path';

type LanguageContribution = {
  id: string;
  extensions?: string[];
  firstLine?: string;
};

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const fish = (manifest.contributes.languages as LanguageContribution[]).find(language => language.id === 'fish');

if (!fish?.firstLine) {
  throw new Error('Fish language contribution must define firstLine');
}
const firstLine = new RegExp(fish.firstLine);

describe('Fish language detection', () => {
  it('retains the .fish extension association', () => {
    expect(fish?.extensions).toContain('.fish');
  });

  it.each([
    '#!/usr/bin/env fish',
    '#!/usr/bin/env fish --no-config',
    '#!/usr/bin/env -S fish --no-config',
    '#!/usr/bin/env -Sfish',
    '#!/bin/fish',
    '#!/usr/local/bin/fish',
    '#!/opt/homebrew/bin/fish --no-config',
    '#!/fish',
    '#! /usr/bin/env fish',
    '#!\t/usr/bin/env\tfish',
    '#!/usr/bin/env  -S  fish --no-config',
    '#!/bin/fish\t--no-config',
  ])('recognises the shebang %j', line => {
    expect(firstLine.test(line)).toBe(true);
  });

  it.each([
    '#!/bin/bash',
    '#!/bin/sh',
    '#!/bin/zsh',
    '#!/usr/bin/env python3',
    '#!/usr/bin/env bash -c fish',
    '#!/usr/bin/env -S bash -c fish',
    '#!/usr/bin/env fish-lsp',
    '#!/usr/bin/env fishy',
    '#!/usr/bin/fish-lsp',
    '#!/usr/bin/fishy',
    '#!/usr/bin/fish#comment',
    '#!/usr/bin/envfish',
    '#!/usr/bin/env -S fish-lsp',
    '# fish script',
    'echo fish',
    '',
  ])('does not claim the first line %j', line => {
    expect(firstLine.test(line)).toBe(false);
  });
});
