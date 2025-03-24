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
        <id>15</id> // Id should be the id of the entry
        <name>Book 1</name>
        <triggers>word1,word2</triggers>
        <content>Content of book 1</content>
    </entry>
</lorebooks>
\`\`\``;

const parser = new XMLParser();

function createRandomNumber(length: number): number {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function parseXMLOwn(xml: string): Record<string, WIEntry[]> {
  // Remove code blocks
  const xmlWithoutCodeBlocks = xml.replace(/```xml/g, '').replace(/```/g, '');

  const entriesByWorldName: Record<string, WIEntry[]> = {};
  try {
    const rawResponse = parser.parse(xmlWithoutCodeBlocks);
    // console.log('Raw response', rawResponse);
    if (!rawResponse.lorebooks) {
      return entriesByWorldName;
    }

    const entries = rawResponse.lorebooks.entry?.content ? [rawResponse.lorebooks.entry] : rawResponse.lorebooks.entry;
    for (const entry of entries) {
      const worldName = entry.worldName;
      if (!worldName) {
        continue;
      }
      if (!entriesByWorldName[worldName]) {
        entriesByWorldName[worldName] = [];
      }
      entriesByWorldName[worldName].push({
        uid: entry.id ?? createRandomNumber(6),
        key: entry.triggers?.split(',').map((t: string) => t.trim()) ?? [],
        content: entry.content,
        comment: entry.name,
      });
    }

    return entriesByWorldName;
  } catch (error: any) {
    console.error(error);
    throw new Error('Model response is not valid XML');
  }
}
