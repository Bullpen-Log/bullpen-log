export type InstructionLine = { kind: 'paragraph' | 'step' | 'bullet'; text: string; marker?: string };
export type InstructionSection = { title: string | null; caution: boolean; lines: InstructionLine[] };

/** 기존 설명의 제목·순서만 구분한다. 원문 내용이나 주의사항은 생략하지 않는다. */
export function instructionSections(text: string): InstructionSection[] {
  const sections: InstructionSection[] = [];
  let section: InstructionSection = { title: null, caution: false, lines: [] };
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) section.lines.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^(?:■\s*|#{1,3}\s+)(\S.*)$/);
    if (heading) {
      flush();
      if (section.title || section.lines.length) sections.push(section);
      section = { title: heading[1], caution: /주의|멈출|중단|금기/.test(heading[1]), lines: [] };
    } else if (!line) {
      flush();
    } else {
      const step = line.match(/^(\d{1,2}[.)])\s+(.+)$/);
      const bullet = line.match(/^([·•\-])\s+(.+)$/);
      if (step || bullet) {
        flush();
        const match = step ?? bullet!;
        section.lines.push({ kind: step ? 'step' : 'bullet', marker: match[1], text: match[2] });
      } else paragraph.push(raw.trimEnd());
    }
  }
  flush();
  if (section.title || section.lines.length) sections.push(section);
  return sections;
}
