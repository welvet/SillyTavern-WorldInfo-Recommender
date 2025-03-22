import { XMLParser } from 'fast-xml-parser';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

export const DEFAULT_XML_DESCRIPTION = `If you are creating a new entry you should write it like this:
\`\`\`xml
<lorebooks>
    <entry>
        <worldName>World 1</worldName>
        <name>Book 1</name>
        <triggers>word1,word2</triggers>
        <content>Content of book 1</content>
    </entry>
</lorebooks>
\`\`\`

If you are updating an existing entry you should specify the id of the entry. Like this:
\`\`\`xml
<lorebooks>
    <entry>
        <worldName>World 1</worldName>
        <id>1</id>
        <content>Content of book 1</content>
    </entry>
</lorebooks>
\`\`\`
`;

const parser = new XMLParser();

export function parseXMLOwn(xml: string): Record<string, WIEntry[]> {
  // Remove code blocks
  const xmlWithoutCodeBlocks = xml.replace(/```xml/g, '').replace(/```/g, '');

  const entriesByWorldName: Record<string, WIEntry[]> = {};
  const entries = parser.parse(xmlWithoutCodeBlocks);

  for (const entry of entries.lorebooks.entry) {
    const worldName = entry.worldName;
    if (!entriesByWorldName[worldName]) {
      entriesByWorldName[worldName] = [];
    }
    entriesByWorldName[worldName].push({
      uid: entry.id ?? -1,
      key: entry.triggers.split(','),
      content: entry.content,
      comment: entry.name,
    });
  }

  return entriesByWorldName;
}
