import { buildPrompt, BuildPromptOptions } from 'sillytavern-utils-lib';
import { ChatCompletionMessage, ExtractedData } from 'sillytavern-utils-lib/types';
import { parseXMLOwn } from './xml.js';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';
import { st_createWorldInfoEntry } from 'sillytavern-utils-lib/config';

// @ts-ignore
import { Handlebars } from '../../../../../lib.js';

export const globalContext = SillyTavern.getContext();

export interface Session {
  suggestedEntries: Record<string, WIEntry[]>;
  blackListedEntries: string[];
  selectedWorldNames: string[];
}

export interface ContextToSend {
  stDescription: boolean;
  messages: {
    type: 'none' | 'all' | 'first' | 'last' | 'range';
    first?: number;
    last?: number;
    range?: {
      start: number;
      end: number;
    };
  };
  charCard: boolean;
  authorNote: boolean;
  worldInfo: boolean;
  suggestedEntries: boolean;
}

export interface RunWorldInfoRecommendationParams {
  profileId: string;
  userPrompt: string;
  buildPromptOptions: BuildPromptOptions;
  contextToSend: ContextToSend;
  session: Session;
  entriesGroupByWorldName: Record<string, WIEntry[]>;
  promptSettings: {
    stWorldInfoPrompt: string;
    lorebookDefinitionPrompt: string;
    responseRulesPrompt: string;
    lorebookRulesPrompt: string;
  };
  maxResponseToken: number;
}

export async function runWorldInfoRecommendation({
  profileId,
  userPrompt,
  buildPromptOptions,
  contextToSend,
  session,
  entriesGroupByWorldName,
  promptSettings,
  maxResponseToken,
}: RunWorldInfoRecommendationParams): Promise<Record<string, WIEntry[]>> {
  if (!profileId) {
    throw new Error('No connection profile selected.');
  }
  const context = SillyTavern.getContext();
  const profile = context.extensionSettings.connectionManager?.profiles?.find((profile) => profile.id === profileId);
  if (!profile) {
    throw new Error(`Connection profile with ID "${profileId}" not found.`);
  }

  const processedPrompt = globalContext.substituteParams(userPrompt.trim());
  if (!processedPrompt) {
    throw new Error('Prompt is empty after macro substitution.');
  }

  const messages: ChatCompletionMessage[] = [];
  const selectedApi = profile.api ? globalContext.CONNECT_API_MAP[profile.api].selected : undefined;
  if (!selectedApi) {
    throw new Error(`Could not determine API for profile "${profile.name}".`);
  }

  messages.push(...(await buildPrompt(selectedApi, buildPromptOptions)));

  if (contextToSend.stDescription) {
    messages.push({
      role: 'system',
      content: promptSettings.stWorldInfoPrompt,
    });
  }
  if (contextToSend.worldInfo) {
    if (session.selectedWorldNames.length > 0) {
      const template = Handlebars.compile(promptSettings.lorebookDefinitionPrompt, { noEscape: true });
      const lorebooks: Record<string, WIEntry[]> = {};
      Object.entries(entriesGroupByWorldName)
        .filter(
          ([worldName, entries]) =>
            entries.length > 0 && session.selectedWorldNames.includes(worldName) && entries.some((e) => !e.disable),
        )
        .forEach(([worldName, entries]) => {
          lorebooks[worldName] = entries.filter((e) => !e.disable);
        });

      const worldInfoPrompt = template({ lorebooks });

      if (worldInfoPrompt) {
        messages.push({
          role: 'assistant',
          content: `=== CURRENT LOREBOOKS ===\n${worldInfoPrompt}`,
        });
      }
    }
  }

  if (session.blackListedEntries.length > 0) {
    let blackListPrompt = '# Blacklisted Entries:\n';
    session.blackListedEntries.forEach((entry) => {
      blackListPrompt += `- ${entry}\n`;
    });
    messages.push({
      role: 'system',
      content: blackListPrompt,
    });
  }

  if (contextToSend.suggestedEntries && Object.keys(session.suggestedEntries).length > 0) {
    const anySuggested = Object.values(session.suggestedEntries).some((entries) => entries.length > 0);
    if (anySuggested) {
      const template = Handlebars.compile(promptSettings.lorebookDefinitionPrompt, { noEscape: true });
      const lorebooks: Record<string, WIEntry[]> = {};
      Object.entries(session.suggestedEntries)
        .filter(([_, entries]) => entries.length > 0)
        .forEach(([worldName, entries]) => {
          lorebooks[worldName] = entries;
        });

      const suggestedPromptrompt = template({ lorebooks });

      messages.push({
        role: 'system',
        content: `=== Already suggested entries ===\n${suggestedPromptrompt}`,
      });
    }
  }

  const finalUserPrompt = `${promptSettings.responseRulesPrompt}\n\n${promptSettings.lorebookRulesPrompt}\n\nYour task:\n${processedPrompt}`;
  messages.push({
    role: 'user',
    content: finalUserPrompt,
  });

  // console.log("Sending messages:", messages);

  const response = (await globalContext.ConnectionManagerRequestService.sendRequest(
    profileId,
    messages,
    maxResponseToken,
  )) as ExtractedData;

  // console.log("Received content:", response.content);

  const parsedEntries = parseXMLOwn(response.content);
  if (Object.keys(parsedEntries).length === 0) {
    return {};
  }

  // Set "key" and "comment" if missing, using the passed entriesGroupByWorldName
  Object.entries(parsedEntries).forEach(([worldName, entries]) => {
    if (!entriesGroupByWorldName[worldName]) {
      return;
    }
    entries.forEach((entry) => {
      const existentWI = entriesGroupByWorldName[worldName]?.find((e) => e.uid === entry.uid);
      if (existentWI) {
        if (entry.key.length === 0) {
          entry.key = existentWI.key;
        }
        if (!entry.comment) {
          entry.comment = existentWI.comment;
        }
      }
      // Ensure comment is at least an empty string if somehow still missing
      if (entry.comment === null || entry.comment === undefined) {
        entry.comment = '';
      }
    });
  });

  return parsedEntries;
}

/**
 * Adds or updates a World Info entry in memory. Does NOT save immediately.
 * @param entry The entry data to add/update.
 * @param targetWorldName The name of the world to add/update the entry in.
 * @param entriesGroupByWorldName The current state of all world info entries.
 * @returns The modified entry and its status ('added' or 'updated').
 * @throws Error if entry creation fails.
 */
export function prepareEntryModification(
  entry: WIEntry,
  targetWorldName: string,
  entriesGroupByWorldName: Record<string, WIEntry[]>,
): { modifiedEntry: WIEntry; status: 'added' | 'updated' } {
  if (!entriesGroupByWorldName[targetWorldName]) {
    // If the target world doesn't exist in the current context, create it in memory
    entriesGroupByWorldName[targetWorldName] = [];
    // Note: This doesn't create the actual lorebook file if it's brand new.
    // The save operation later should handle this, assuming the name is valid.
  }

  const worldEntries = entriesGroupByWorldName[targetWorldName];
  const existingEntryIndex = worldEntries.findIndex((e) => e.uid === entry.uid);
  let targetEntry: WIEntry;
  const isUpdate = existingEntryIndex !== -1;

  if (isUpdate) {
    targetEntry = worldEntries[existingEntryIndex];
  } else {
    // Create a temporary structure mimicking ST's format for st_createWorldInfoEntry
    const stFormat: { entries: Record<number, WIEntry> } = { entries: {} };
    worldEntries.forEach((e) => (stFormat.entries[e.uid] = e));

    const newEntry = st_createWorldInfoEntry(targetWorldName, stFormat); // Pass the temporary format
    if (!newEntry) {
      throw new Error(`Failed to create a new entry structure in world "${targetWorldName}"`);
    }
    // Find the last entry to potentially copy some default properties (like scan_depth etc)
    const lastEntry = worldEntries.length > 0 ? worldEntries[worldEntries.length - 1] : undefined;
    if (lastEntry) {
      // Copy properties BUT keep the new UID
      const newUid = newEntry.uid;
      Object.assign(newEntry, lastEntry);
      newEntry.uid = newUid;
    }
    targetEntry = newEntry;
    // Add the newly created entry structure to our in-memory list for this world
    worldEntries.push(targetEntry);
  }

  // Update entry properties from the suggestion
  targetEntry.key = entry.key;
  targetEntry.content = entry.content;
  targetEntry.comment = entry.comment;
  // Optionally update other fields if the AI could suggest them, e.g.,
  // targetEntry.scan_depth = entry.scan_depth ?? targetEntry.scan_depth;
  // targetEntry.selective = entry.selective ?? targetEntry.selective;
  // ... etc.

  return { modifiedEntry: targetEntry, status: isUpdate ? 'updated' : 'added' };
}

// Helper for slash command enum provider
export function provideConnectionProfiles() {
  const profiles = globalContext.extensionSettings?.connectionManager?.profiles ?? [];
  return profiles.map((p) => ({
    value: p.name ?? p.id,
    valueProvider: (value: string) => {
      return profiles.find((p) => p.name?.includes(value))?.name;
    },
  }));
}
