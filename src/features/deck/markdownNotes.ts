export function parseMarkdownNotes(source: string): string[] {
  const sections: string[] = [];
  let lines: string[] = [];
  let fence: { marker: string; length: number } | null = null;
  const finish = () => {
    sections.push(lines.join('\n').replace(/^\n+/, '').trimEnd());
    lines = [];
  };

  for (const line of source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')) {
    const run = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        run &&
        run[1][0] === fence.marker &&
        run[1].length >= fence.length &&
        !run[2].trim()
      )
        fence = null;
    } else if (/^ {0,3}---[\t ]*$/.test(line)) {
      finish();
      continue;
    } else if (run && (run[1][0] !== '`' || !run[2].includes('`'))) {
      fence = { marker: run[1][0], length: run[1].length };
    }
    lines.push(line);
  }
  finish();
  return sections;
}
