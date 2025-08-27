import React, { FC, useState, useEffect, useCallback, useMemo } from 'react';
import { diffWords } from 'diff';
import showdown from 'showdown';
import {
  STButton,
  STConnectionProfileSelect,
  STFancyDropdown,
  STPresetSelect,
  STTextarea,
  PresetItem,
  DropdownItem as FancyDropdownItem,
  Popup,
} from 'sillytavern-utils-lib/components';
import { BuildPromptOptions, getActiveWorldInfo } from 'sillytavern-utils-lib';
import {
  groups,
  selected_group,
  st_createWorldInfoEntry,
  st_echo,
  st_getCharaFilename,
  this_chid,
  world_names,
} from 'sillytavern-utils-lib/config';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

import { runWorldInfoRecommendation, Session } from '../generate.js';
import { ExtensionSettings, settingsManager } from '../settings.js';
import { Character } from 'sillytavern-utils-lib/types';
import { RegexScriptData } from 'sillytavern-utils-lib/types/regex';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';
import { EditEntryPopup } from './EditEntryPopup.js';
import { CompareEntryPopup } from './CompareEntryPopup.js';

const globalContext = SillyTavern.getContext();
const converter = new showdown.Converter();

// Helper to get current character/group avatar filename
const getAvatar = () => (this_chid ? st_getCharaFilename(this_chid) : selected_group);

/**
 * A React component for the main World Info Recommender popup UI.
 * This component replaces the vanilla TS popup script.
 */
export const MainPopup: FC = () => {
  // --- State Management ---
  const [settings, setSettings] = useState<ExtensionSettings>(() => settingsManager.getSettings());
  const [session, setSession] = useState<Session>({
    suggestedEntries: {},
    blackListedEntries: [],
    selectedWorldNames: [],
    regexIds: {},
  });
  const [allWorldNames, setAllWorldNames] = useState<string[]>([]);
  const [entriesGroupByWorldName, setEntriesGroupByWorldName] = useState<Record<string, WIEntry[]>>({});
  const [groupMembers, setGroupMembers] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastAddedWorldName, setLastAddedWorldName] = useState<string | null>(null);

  // --- Data Loading Effect ---
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const avatar = getAvatar();
      const key = `worldInfoRecommend_${avatar ?? '_global'}`;

      // Load session from localStorage
      const savedSession: Partial<Session> = JSON.parse(localStorage.getItem(key) ?? '{}');
      const initialSession: Session = {
        suggestedEntries: savedSession.suggestedEntries ?? {},
        blackListedEntries: savedSession.blackListedEntries ?? [],
        selectedWorldNames: savedSession.selectedWorldNames ?? [],
        regexIds: savedSession.regexIds ?? {},
      };

      // Load World Info
      let loadedEntries: Record<string, WIEntry[]> = {};
      if (avatar) {
        if (selected_group) {
          const groupWorldInfo = await getActiveWorldInfo(['chat', 'persona', 'global']);
          if (groupWorldInfo) loadedEntries = groupWorldInfo;

          const group = groups.find((g: any) => g.id === selected_group);
          if (group) {
            for (const member of group.members) {
              const index = globalContext.characters.findIndex((c: Character) => c.avatar === member);
              if (index !== -1) {
                const worldInfo = await getActiveWorldInfo(['character'], index);
                if (worldInfo) loadedEntries = { ...loadedEntries, ...worldInfo };
              }
            }
          }
        } else {
          loadedEntries = await getActiveWorldInfo(['all'], this_chid);
        }
      } else {
        for (const worldName of world_names) {
          const worldInfo = await globalContext.loadWorldInfo(worldName);
          if (worldInfo) loadedEntries[worldName] = Object.values(worldInfo.entries);
        }
      }
      setEntriesGroupByWorldName(loadedEntries);
      const loadedWorldNames = Object.keys(loadedEntries);
      setAllWorldNames(loadedWorldNames);

      // Sync session's selected worlds with available worlds
      if (initialSession.selectedWorldNames.length === 0 && avatar) {
        initialSession.selectedWorldNames = [...loadedWorldNames];
      } else {
        initialSession.selectedWorldNames = initialSession.selectedWorldNames.filter((name) =>
          loadedWorldNames.includes(name),
        );
      }
      setSession(initialSession);

      // Load group members for char card selection if in group chat
      if (selected_group) {
        const group = groups.find((g: any) => g.id === selected_group);
        if (group?.generation_mode === 0) {
          const members = group.members
            .map((memberAvatar: string) => globalContext.characters.find((c: Character) => c.avatar === memberAvatar))
            .filter((c?: Character): c is Character => !!c);
          setGroupMembers(members);
        }
      }

      setIsLoading(false);
    };

    loadData();
  }, []);

  // --- Session Saving Effect ---
  useEffect(() => {
    const avatar = getAvatar();
    const key = `worldInfoRecommend_${avatar ?? '_global'}`;
    localStorage.setItem(key, JSON.stringify(session));
  }, [session]);

  // --- Generic Handlers ---
  const updateSetting = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    Object.assign(settingsManager.getSettings(), newSettings);
    settingsManager.saveSettings();
  };

  const updateContextToSend = <K extends keyof ExtensionSettings['contextToSend']>(
    key: K,
    value: ExtensionSettings['contextToSend'][K],
  ) => {
    const newSettings = {
      ...settings,
      contextToSend: {
        ...settings.contextToSend,
        [key]: value,
      },
    };
    setSettings(newSettings);
    Object.assign(settingsManager.getSettings(), newSettings);
    settingsManager.saveSettings();
  };

  // --- Memoized Derived Data for UI ---
  const promptPresetItems = useMemo(
    (): PresetItem[] => Object.keys(settings.promptPresets).map((key) => ({ value: key, label: key })),
    [settings.promptPresets],
  );

  const worldInfoDropdownItems = useMemo(
    (): FancyDropdownItem[] => allWorldNames.map((name) => ({ value: name, label: name })),
    [allWorldNames],
  );

  // --- Core Logic Callbacks ---
  const addEntry = useCallback(
    async (entry: WIEntry, selectedWorldName: string, skipSave: boolean = false): Promise<'added' | 'updated'> => {
      const worldInfoCopy = structuredClone(entriesGroupByWorldName);
      if (!worldInfoCopy[selectedWorldName]) {
        worldInfoCopy[selectedWorldName] = [];
      }

      const existingEntry = worldInfoCopy[selectedWorldName].find((e) => e.uid === entry.uid);
      const isUpdate = !!existingEntry;
      let targetEntry: WIEntry;

      if (isUpdate) {
        targetEntry = existingEntry!;
      } else {
        const stFormat = { entries: Object.fromEntries(worldInfoCopy[selectedWorldName].map((e) => [e.uid, e])) };
        const newEntry = st_createWorldInfoEntry(selectedWorldName, stFormat);
        if (!newEntry) throw new Error('Failed to create new World Info entry.');
        targetEntry = newEntry;
        worldInfoCopy[selectedWorldName].push(targetEntry);
      }

      Object.assign(targetEntry, { key: entry.key, content: entry.content, comment: entry.comment });
      setEntriesGroupByWorldName(worldInfoCopy);
      setLastAddedWorldName(selectedWorldName);

      if (!skipSave) {
        const finalFormat = { entries: Object.fromEntries(worldInfoCopy[selectedWorldName].map((e) => [e.uid, e])) };
        await globalContext.saveWorldInfo(selectedWorldName, finalFormat);
        globalContext.reloadWorldInfoEditor(selectedWorldName, true);
      }

      return isUpdate ? 'updated' : 'added';
    },
    [entriesGroupByWorldName],
  );

  const handleGeneration = useCallback(
    async (continueFrom?: { worldName: string; entry: WIEntry }) => {
      if (!settings.profileId) return st_echo('warning', 'Please select a connection profile.');
      if (!settings.promptPresets[settings.promptPreset]?.content && !continueFrom)
        return st_echo('warning', 'Please enter a prompt.');

      setIsGenerating(true);
      try {
        const profile = globalContext.extensionSettings.connectionManager?.profiles?.find(
          (p) => p.id === settings.profileId,
        );
        if (!profile) throw new Error('Connection profile not found.');

        const avatar = getAvatar();
        const buildPromptOptions: BuildPromptOptions = {
          presetName: profile.preset,
          contextName: profile.context,
          instructName: profile.instruct,
          syspromptName: profile.sysprompt,
          ignoreCharacterFields: !settings.contextToSend.charCard,
          ignoreWorldInfo: true,
          ignoreAuthorNote: !settings.contextToSend.authorNote,
          maxContext:
            settings.maxContextType === 'custom'
              ? settings.maxContextValue
              : settings.maxContextType === 'profile'
                ? 'preset'
                : 'active',
          includeNames: !!selected_group,
        };

        if (!avatar) {
          buildPromptOptions.messageIndexesBetween = { start: -1, end: -1 };
        } else {
          switch (settings.contextToSend.messages.type) {
            case 'none':
              buildPromptOptions.messageIndexesBetween = { start: -1, end: -1 };
              break;
            case 'first':
              buildPromptOptions.messageIndexesBetween = { start: 0, end: settings.contextToSend.messages.first ?? 10 };
              break;
            case 'last': {
              const lastCount = settings.contextToSend.messages.last ?? 10;
              const chatLength = globalContext.chat?.length ?? 0;
              buildPromptOptions.messageIndexesBetween = {
                end: Math.max(0, chatLength - 1),
                start: Math.max(0, chatLength - lastCount),
              };
              break;
            }
            case 'range':
              if (settings.contextToSend.messages.range)
                buildPromptOptions.messageIndexesBetween = settings.contextToSend.messages.range;
              break;
          }
        }

        const promptSettings = structuredClone(settings.prompts);
        if (!settings.contextToSend.stDescription) delete (promptSettings as any).stDescription;
        if (!settings.contextToSend.worldInfo || session.selectedWorldNames.length === 0)
          delete (promptSettings as any).currentLorebooks;
        const anySuggestedEntries = Object.values(session.suggestedEntries).some((e) => e.length > 0);
        if (!settings.contextToSend.suggestedEntries || !anySuggestedEntries)
          delete (promptSettings as any).suggestedLorebooks;
        if (session.blackListedEntries.length === 0) delete (promptSettings as any).blackListedEntries;

        const resultingEntries = await runWorldInfoRecommendation({
          profileId: settings.profileId,
          userPrompt: settings.promptPresets[settings.promptPreset].content,
          buildPromptOptions,
          session,
          entriesGroupByWorldName,
          promptSettings,
          mainContextList: settings.mainContextTemplatePresets[settings.mainContextTemplatePreset].prompts
            .filter((p) => p.enabled)
            .map((p) => ({ promptName: p.promptName, role: p.role })),
          maxResponseToken: settings.maxResponseToken,
          continueFrom,
        });

        if (Object.keys(resultingEntries).length > 0) {
          setSession((prev) => {
            const newSuggested = structuredClone(prev.suggestedEntries);
            for (const [worldName, entries] of Object.entries(resultingEntries)) {
              if (!newSuggested[worldName]) newSuggested[worldName] = [];
              // Avoid adding duplicates
              for (const entry of entries) {
                if (!newSuggested[worldName].some((e) => e.uid === entry.uid && e.comment === entry.comment)) {
                  newSuggested[worldName].push(entry);
                }
              }
            }
            return { ...prev, suggestedEntries: newSuggested };
          });
        } else {
          st_echo('warning', 'No results from AI');
        }
      } catch (error: any) {
        console.error(error);
        st_echo('error', error instanceof Error ? error.message : String(error));
      } finally {
        setIsGenerating(false);
      }
    },
    [settings, session, entriesGroupByWorldName],
  );

  // --- UI Action Handlers ---
  const handleAddSingleEntry = useCallback(
    async (entry: WIEntry, worldName: string, selectedTargetWorld: string) => {
      try {
        const status = await addEntry(entry, selectedTargetWorld);
        st_echo('success', status === 'added' ? 'Entry added' : 'Entry updated');
        // Remove from suggested list
        setSession((prev) => {
          const newSuggested = { ...prev.suggestedEntries };
          if (newSuggested[worldName]) {
            newSuggested[worldName] = newSuggested[worldName].filter(
              (e) => !(e.uid === entry.uid && e.comment === entry.comment),
            );
          }
          return { ...prev, suggestedEntries: newSuggested };
        });
      } catch (error: any) {
        console.error(error);
        st_echo('error', `Failed to add entry: ${error.message}`);
      }
    },
    [addEntry],
  );

  const handleAddAll = async () => {
    const totalEntries = Object.values(session.suggestedEntries).flat().length;
    if (totalEntries === 0) return st_echo('warning', 'No entries to add.');

    const confirm = await globalContext.Popup.show.confirm(
      'Add All',
      `Are you sure you want to add/update all ${totalEntries} suggested entries?`,
    );
    if (!confirm) return;

    setIsGenerating(true);
    let addedCount = 0;
    let updatedCount = 0;
    const modifiedWorlds = new Set<string>();
    const entriesToAdd: { worldName: string; entry: WIEntry }[] = [];

    Object.entries(session.suggestedEntries).forEach(([worldName, entries]) => {
      entries.forEach((entry) => {
        const targetWorldName = allWorldNames.includes(worldName) ? worldName : (allWorldNames[0] ?? '');
        if (targetWorldName) entriesToAdd.push({ worldName: targetWorldName, entry });
      });
    });

    for (const { worldName, entry } of entriesToAdd) {
      try {
        const status = await addEntry(entry, worldName, true);
        if (status === 'added') addedCount++;
        else updatedCount++;
        modifiedWorlds.add(worldName);
      } catch (error) {
        st_echo('error', `Failed to process entry: ${entry.comment}`);
      }
    }

    for (const worldName of modifiedWorlds) {
      try {
        const finalFormat = { entries: Object.fromEntries(entriesGroupByWorldName[worldName].map((e) => [e.uid, e])) };
        await globalContext.saveWorldInfo(worldName, finalFormat);
        globalContext.reloadWorldInfoEditor(worldName, true);
      } catch (error) {
        st_echo('error', `Failed to save world: ${worldName}`);
      }
    }

    setSession((prev) => ({ ...prev, suggestedEntries: {} }));
    st_echo('success', `Processed ${addedCount} new and ${updatedCount} updated entries.`);
    setIsGenerating(false);
  };

  const handleReset = async () => {
    const confirm = await globalContext.Popup.show.confirm(
      'Reset',
      'Clear all suggestions and reset lorebook selection?',
    );
    if (confirm) {
      setSession((prev) => ({
        ...prev,
        suggestedEntries: {},
        blackListedEntries: [],
        selectedWorldNames: getAvatar() ? [...allWorldNames] : [],
      }));
      st_echo('success', 'Reset successful');
    }
  };

  const handleRemoveEntry = (entry: WIEntry, worldName: string, isBlacklist: boolean) => {
    setSession((prev) => {
      const newSession = { ...prev };
      if (isBlacklist) {
        newSession.blackListedEntries = [...newSession.blackListedEntries, `${worldName} (${entry.comment})`];
      }
      const newSuggested = { ...newSession.suggestedEntries };
      if (newSuggested[worldName]) {
        newSuggested[worldName] = newSuggested[worldName].filter(
          (e) => !(e.uid === entry.uid && e.comment === entry.comment),
        );
      }
      newSession.suggestedEntries = newSuggested;
      return newSession;
    });
  };

  const handleUpdateEntry = (
    worldName: string,
    updatedEntry: WIEntry,
    updatedRegexIds: Record<string, Partial<RegexScriptData>>,
  ) => {
    setSession((prev) => {
      const newSuggested = { ...prev.suggestedEntries };
      if (newSuggested[worldName]) {
        const entryIndex = newSuggested[worldName].findIndex(
          (e) => e.uid === updatedEntry.uid && e.comment === updatedEntry.comment,
        );
        if (entryIndex !== -1) {
          newSuggested[worldName][entryIndex] = updatedEntry;
        }
      }
      return { ...prev, suggestedEntries: newSuggested, regexIds: updatedRegexIds };
    });
  };

  // --- Render ---
  if (isLoading) {
    return <div>Loading...</div>;
  }

  const suggestedEntriesList = Object.entries(session.suggestedEntries).flatMap(([worldName, entries]) =>
    entries.map((entry) => ({ worldName, entry })),
  );

  return (
    <div id="worldInfoRecommenderPopup">
      <h2>World Info Recommender</h2>
      <div className="container">
        {/* Left Column */}
        <div className="column">
          <div className="card">
            <h3>Connection Profile</h3>
            <STConnectionProfileSelect
              initialSelectedProfileId={settings.profileId}
              // @ts-ignore
              onChange={(profile) => updateSetting('profileId', profile?.id)}
            />
          </div>

          <div className="card">
            <h3>Context to Send</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label className="checkbox_label">
                <input
                  type="checkbox"
                  checked={settings.contextToSend.stDescription}
                  onChange={(e) => updateContextToSend('stDescription', e.target.checked)}
                />
                Description of SillyTavern and Lorebook
              </label>
              {/* Message Options */}
              <div className="message-options">
                <h4>Messages to Include</h4>
                <select
                  className="text_pole"
                  value={settings.contextToSend.messages.type}
                  onChange={(e) =>
                    updateContextToSend('messages', { ...settings.contextToSend.messages, type: e.target.value as any })
                  }
                >
                  <option value="none">None</option>
                  <option value="all">All Messages</option>
                  <option value="first">First X Messages</option>
                  <option value="last">Last X Messages</option>
                  <option value="range">Range</option>
                </select>
                {/* ... inputs for first/last/range ... */}
              </div>
              <label className="checkbox_label">
                <input
                  type="checkbox"
                  checked={settings.contextToSend.charCard}
                  onChange={(e) => updateContextToSend('charCard', e.target.checked)}
                />
                Char Card
              </label>
              {groupMembers.length > 0 && (
                <div id="worldInfoRecommend_charCardContainer">
                  <h4>Select Character</h4>
                  <select className="text_pole" title="Select character for your group.">
                    {groupMembers.map((member) => (
                      <option key={member.avatar} value={member.avatar}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="checkbox_label">
                <input
                  type="checkbox"
                  checked={settings.contextToSend.authorNote}
                  onChange={(e) => updateContextToSend('authorNote', e.target.checked)}
                />{' '}
                Author Note
              </label>
              <label className="checkbox_label">
                <input
                  type="checkbox"
                  checked={settings.contextToSend.worldInfo}
                  onChange={(e) => updateContextToSend('worldInfo', e.target.checked)}
                />{' '}
                World Info
              </label>
              <div>
                <h4>Lorebooks to Include</h4>
                <STFancyDropdown
                  items={worldInfoDropdownItems}
                  value={session.selectedWorldNames}
                  onChange={(newValues) => setSession((prev) => ({ ...prev, selectedWorldNames: newValues }))}
                  multiple
                  enableSearch
                />
              </div>
              <label className="checkbox_label">
                <input
                  type="checkbox"
                  checked={settings.contextToSend.suggestedEntries}
                  onChange={(e) => updateContextToSend('suggestedEntries', e.target.checked)}
                />{' '}
                Existing Suggestions
              </label>
            </div>
          </div>

          <div className="card">{/* Max Context and Max Response Tokens */}</div>

          <div className="card">
            <h3>Your Prompt</h3>
            <STPresetSelect
              label="Prompt Preset"
              items={promptPresetItems}
              value={settings.promptPreset}
              readOnlyValues={['default']}
              onChange={(newValue) => updateSetting('promptPreset', newValue ?? 'default')}
              onItemsChange={(newItems) => {
                const newPresets = newItems.reduce(
                  (acc, item) => {
                    acc[item.value] = settings.promptPresets[item.value] ?? { content: '' };
                    return acc;
                  },
                  {} as Record<string, { content: string }>,
                );
                updateSetting('promptPresets', newPresets);
              }}
              enableCreate
              enableRename
              enableDelete
            />
            <STTextarea
              value={settings.promptPresets[settings.promptPreset]?.content ?? ''}
              onChange={(e) => {
                const newPresets = { ...settings.promptPresets };
                if (newPresets[settings.promptPreset]) {
                  newPresets[settings.promptPreset].content = e.target.value;
                  updateSetting('promptPresets', newPresets);
                }
              }}
              placeholder="e.g., 'Suggest entries for places {{user}} visited.'"
              rows={4}
              style={{ marginTop: '5px', width: '100%' }}
            />
            <STButton
              onClick={() => handleGeneration()}
              disabled={isGenerating}
              className="menu_button interactable"
              style={{ marginTop: '5px' }}
            >
              {isGenerating ? 'Generating...' : 'Send Prompt'}
            </STButton>
          </div>
        </div>

        {/* Right Column */}
        <div className="wide-column">
          <div className="card">
            <h3>Suggested Entries</h3>
            <div className="actions">
              <STButton
                onClick={handleAddAll}
                disabled={isGenerating || suggestedEntriesList.length === 0}
                className="menu_button interactable"
              >
                Add All
              </STButton>
              <STButton onClick={handleReset} disabled={isGenerating} className="menu_button interactable">
                Reset
              </STButton>
            </div>
            <div id="worldInfoRecommend_suggestedEntries">
              {suggestedEntriesList.length === 0 && <p>No suggestions yet. Send a prompt to get started!</p>}
              {suggestedEntriesList.map(({ worldName, entry }) => (
                <SuggestedEntry
                  key={`${worldName}-${entry.uid}-${entry.comment}`}
                  initialWorldName={worldName}
                  entry={entry}
                  allWorldNames={allWorldNames}
                  existingEntry={entriesGroupByWorldName[worldName]?.find((e) => e.uid === entry.uid)}
                  sessionRegexIds={session.regexIds}
                  onAdd={handleAddSingleEntry}
                  onRemove={handleRemoveEntry}
                  onContinue={handleGeneration}
                  onUpdate={handleUpdateEntry}
                  entriesGroupByWorldName={entriesGroupByWorldName}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Child Component for a single suggestion ---
interface SuggestedEntryProps {
  initialWorldName: string;
  entry: WIEntry;
  allWorldNames: string[];
  existingEntry?: WIEntry;
  sessionRegexIds: Record<string, Partial<RegexScriptData>>;
  onAdd: (entry: WIEntry, initialWorldName: string, selectedTargetWorld: string) => void;
  onRemove: (entry: WIEntry, initialWorldName: string, isBlacklist: boolean) => void;
  onContinue: (continueFrom: { worldName: string; entry: WIEntry }) => void;
  onUpdate: (
    worldName: string,
    updatedEntry: WIEntry,
    updatedRegexIds: Record<string, Partial<RegexScriptData>>,
  ) => void;
  entriesGroupByWorldName: Record<string, WIEntry[]>;
}

const SuggestedEntry: FC<SuggestedEntryProps> = ({
  initialWorldName,
  entry,
  allWorldNames,
  existingEntry,
  sessionRegexIds,
  onAdd,
  onRemove,
  onContinue,
  onUpdate,
  entriesGroupByWorldName,
}) => {
  const [selectedWorld, setSelectedWorld] = useState(() => {
    const initial = allWorldNames.find((w) => w === initialWorldName);
    return initial ?? allWorldNames[0] ?? '';
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isComparing, setIsComparing] = useState(false);

  const isUpdate = useMemo(
    () => !!entriesGroupByWorldName[selectedWorld]?.find((e) => e.uid === entry.uid),
    [selectedWorld, entry.uid],
  );

  const handleAddClick = async () => {
    setIsAdding(true);
    await onAdd(entry, initialWorldName, selectedWorld);
    // The component will be unmounted by parent state change, so no need to setIsAdding(false)
  };

  const handleContinueClick = async () => {
    setIsContinuing(true);
    await onContinue({ worldName: initialWorldName, entry });
    setIsContinuing(false);
  };

  const handleSaveEdit = (updatedEntry: WIEntry, updatedRegexIds: Record<string, Partial<RegexScriptData>>) => {
    onUpdate(initialWorldName, updatedEntry, updatedRegexIds);
    setIsEditing(false); // Close the popup
  };

  return (
    <>
      {' '}
      {/* Use a fragment to wrap the entry and its potential popup */}
      <div className="entry" data-id={entry.uid} data-world-name={initialWorldName}>
        <div className="menu">
          <select
            className="world-select text_pole"
            value={selectedWorld}
            onChange={(e) => setSelectedWorld(e.target.value)}
          >
            {allWorldNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <STButton onClick={handleAddClick} disabled={isAdding} className="menu_button interactable add">
            {isUpdate ? 'Update' : 'Add'}
          </STButton>
          <STButton onClick={handleContinueClick} disabled={isContinuing} className="menu_button interactable continue">
            {isContinuing ? '...' : 'Continue'}
          </STButton>
          <STButton onClick={() => setIsEditing(true)} className="menu_button interactable edit">
            Edit
          </STButton>{' '}
          {isUpdate && (
            <STButton
              onClick={() => setIsComparing(true)}
              className="menu_button interactable compare"
            >
              Compare
            </STButton>
          )}
          <STButton
            onClick={() => onRemove(entry, initialWorldName, true)}
            className="menu_button interactable blacklist"
          >
            Blacklist
          </STButton>
          <STButton
            onClick={() => onRemove(entry, initialWorldName, false)}
            className="menu_button interactable remove"
          >
            Remove
          </STButton>
        </div>
        <h4 className="comment">{entry.comment}</h4>
        <div className="key">{entry.key.join(', ')}</div>
        <p className="content" dangerouslySetInnerHTML={{ __html: converter.makeHtml(entry.content ?? '') }}></p>
      </div>
      {/* Conditionally render the Edit Popup */}
      {isEditing && (
        <Popup
          type={POPUP_TYPE.CONFIRM}
          content={<EditEntryPopup entry={entry} initialRegexIds={sessionRegexIds} />}
          onComplete={(confirmed) => {
            setIsEditing(false);
            if (confirmed) {
              handleSaveEdit(entry, sessionRegexIds);
            }
          }}
        />
      )}
      {isComparing && existingEntry && (
        <Popup
          type={POPUP_TYPE.DISPLAY}
          content={<CompareEntryPopup originalEntry={existingEntry} newEntry={entry} />}
          onComplete={() => setIsComparing(false)}
        />
      )}
    </>
  );
};
