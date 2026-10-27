import { expect, test } from '@rstest/core';
import { parseMarkdownNotes } from '../../src/features/deck/markdownNotes';

test('maps separators to sections while preserving blank and trailing sections', () => {
  expect(
    parseMarkdownNotes('# Intro\n\n- Welcome\n\n---\n---\n# Demo\n---\n'),
  ).toEqual(['# Intro\n\n- Welcome', '', '# Demo', '']);
  expect(parseMarkdownNotes('')).toEqual(['']);
});

test('normalizes BOM and Windows line endings without losing Markdown indentation', () => {
  expect(
    parseMarkdownNotes('\uFEFF# Intro\r\n  --- \t\r\n    code\r\n'),
  ).toEqual(['# Intro', '    code']);
});

test('only splits standalone separators outside fenced code', () => {
  const source = [
    'Use --- inline',
    '----',
    '    ---',
    '```md',
    '---',
    '````',
    '---',
    '~~~text',
    '---',
    '```',
    '~~~',
    '---',
    'Last',
  ].join('\n');
  expect(parseMarkdownNotes(source)).toEqual([
    'Use --- inline\n----\n    ---\n```md\n---\n````',
    '~~~text\n---\n```\n~~~',
    'Last',
  ]);
});

test('does not close a fence with a shorter run or trailing content', () => {
  const source = '````md\n```\n---\n````still code\n---\n````\n---\nNext';
  expect(parseMarkdownNotes(source)).toEqual([
    '````md\n```\n---\n````still code\n---\n````',
    'Next',
  ]);
});
