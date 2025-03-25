import {
  buildFancyDropdown,
  buildPresetSelect,
  buildPrompt,
  BuildPromptOptions,
  ExtensionSettingsManager,
  getActiveWorldInfo,
} from 'sillytavern-utils-lib';
import {
  characters,
  groups,
  selected_group,
  st_createWorldInfoEntry,
  st_echo,
  st_getCharaFilename,
  this_chid,
} from 'sillytavern-utils-lib/config';
import { ChatCompletionMessage, ExtractedData } from 'sillytavern-utils-lib/types';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';
import { DEFAULT_LOREBOOK_DEFINITION, DEFAULT_LOREBOOK_RULES, DEFAULT_ST_DESCRIPTION } from './constants.js';
import { DEFAULT_XML_DESCRIPTION, parseXMLOwn } from './xml.js';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

// @ts-ignore
import { Handlebars } from '../../../../../lib.js';
if (!Handlebars.helpers['join']) {
  Handlebars.registerHelper('join', function (array: any, separator: any) {
    return array.join(separator);
  });
}

const extensionName = 'SillyTavern-WorldInfo-Recommender';
const VERSION = '0.1.1';
const FORMAT_VERSION = 'F_1.0';
const globalContext = SillyTavern.getContext();

const KEYS = {
  EXTENSION: 'worldInfoRecommender',
} as const;

interface Session {
  suggestedEntries: Record<string, WIEntry[]>;
  blackListedEntries: string[];
  selectedWorldNames: string[];
}

interface PromptPreset {
  content: string;
}

interface ContextToSend {
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
}

interface ExtensionSettings {
  version: string;
  formatVersion: string;
  profileId: string;
  maxContextType: 'profile' | 'sampler' | 'custom';
  maxContextValue: number;
  maxResponseToken: number;
  contextToSend: ContextToSend;
  stWorldInfoPrompt: string;
  usingDefaultStWorldInfoPrompt: boolean;
  lorebookDefinitionPrompt: string;
  usingDefaultLorebookDefinitionPrompt: boolean;
  lorebookRulesPrompt: string;
  usingDefaultLorebookRulesPrompt: boolean;
  responseRulesPrompt: string;
  usingDefaultResponseRulesPrompt: boolean;
  promptPreset: string;
  promptPresets: Record<string, PromptPreset>;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  version: VERSION,
  formatVersion: FORMAT_VERSION,
  profileId: '',
  maxContextType: 'profile',
  maxContextValue: 16384,
  maxResponseToken: 1024,
  contextToSend: {
    stDescription: true,
    messages: {
      type: 'all',
      first: 10,
      last: 10,
      range: {
        start: 0,
        end: 10,
      },
    },
    charCard: true,
    authorNote: true,
    worldInfo: true,
  },
  stWorldInfoPrompt: DEFAULT_ST_DESCRIPTION,
  usingDefaultStWorldInfoPrompt: true,
  lorebookDefinitionPrompt: DEFAULT_LOREBOOK_DEFINITION,
  usingDefaultLorebookDefinitionPrompt: true,
  lorebookRulesPrompt: DEFAULT_LOREBOOK_RULES,
  usingDefaultLorebookRulesPrompt: true,
  responseRulesPrompt: DEFAULT_XML_DESCRIPTION,
  usingDefaultResponseRulesPrompt: true,
  promptPreset: 'default',
  promptPresets: {
    default: {
      content: '',
    },
  },
};

const settingsManager = new ExtensionSettingsManager<ExtensionSettings>(KEYS.EXTENSION, DEFAULT_SETTINGS);

let popupIcon: JQuery<HTMLDivElement> | undefined;
async function handleUIChanges(): Promise<void> {
  const settingsHtml: string = await globalContext.renderExtensionTemplateAsync(
    `third-party/${extensionName}`,
    'templates/settings',
  );
  $('#extensions_settings').append(settingsHtml);

  const settingsContainer = $('.worldInfoRecommender_settings');
  const settings = settingsManager.getSettings();

  const stWorldInfoPromptContainer = settingsContainer.find('.stWorldInfoPrompt');
  const stWorldInfoPromptContainerTextarea = stWorldInfoPromptContainer.find('textarea');

  const lorebookDefinitionPromptContainer = settingsContainer.find('.lorebookDefinitionPrompt');
  const lorebookDefinitionPromptContainerTextarea = lorebookDefinitionPromptContainer.find('textarea');

  const lorebookRulesPromptContainer = settingsContainer.find('.lorebookRulesPrompt');
  const lorebookRulesPromptContainerTextarea = lorebookRulesPromptContainer.find('textarea');

  const responseRulesPromptContainer = settingsContainer.find('.responseRulesPrompt');
  const responseRulesPromptContainerTextarea = responseRulesPromptContainer.find('textarea');

  stWorldInfoPromptContainerTextarea.val(settings.stWorldInfoPrompt);
  lorebookDefinitionPromptContainerTextarea.val(settings.lorebookDefinitionPrompt);
  lorebookRulesPromptContainerTextarea.val(settings.lorebookRulesPrompt);
  responseRulesPromptContainerTextarea.val(settings.responseRulesPrompt);

  stWorldInfoPromptContainer.find('.restore_default').on('click', async () => {
    const confirm = await globalContext.Popup.show.confirm(
      'Are you sure you want to restore the default ST/World Info description?',
      'World Info Recommender',
    );
    if (!confirm) {
      return;
    }
    stWorldInfoPromptContainerTextarea.val(DEFAULT_ST_DESCRIPTION);
    stWorldInfoPromptContainerTextarea.trigger('change');
  });
  lorebookDefinitionPromptContainer.find('.restore_default').on('click', async () => {
    const confirm = await globalContext.Popup.show.confirm(
      'Are you sure you want to restore the default lorebook definition?',
      'World Info Recommender',
    );
    if (!confirm) {
      return;
    }
    lorebookDefinitionPromptContainerTextarea.val(DEFAULT_LOREBOOK_DEFINITION);
    lorebookDefinitionPromptContainerTextarea.trigger('change');
  });
  lorebookRulesPromptContainer.find('.restore_default').on('click', async () => {
    const confirm = await globalContext.Popup.show.confirm(
      'Are you sure you want to restore the default lorebook rules?',
      'World Info Recommender',
    );
    if (!confirm) {
      return;
    }
    lorebookRulesPromptContainerTextarea.val(DEFAULT_LOREBOOK_RULES);
    lorebookRulesPromptContainerTextarea.trigger('change');
  });
  responseRulesPromptContainer.find('.restore_default').on('click', async () => {
    const confirm = await globalContext.Popup.show.confirm(
      'Are you sure you want to restore the default response rules?',
      'World Info Recommender',
    );
    if (!confirm) {
      return;
    }
    responseRulesPromptContainerTextarea.val(DEFAULT_XML_DESCRIPTION);
    responseRulesPromptContainerTextarea.trigger('change');
  });

  stWorldInfoPromptContainerTextarea.on('change', () => {
    settings.stWorldInfoPrompt = stWorldInfoPromptContainerTextarea.val() ?? '';
    settings.usingDefaultStWorldInfoPrompt = settings.stWorldInfoPrompt === DEFAULT_ST_DESCRIPTION;
    settingsManager.saveSettings();
  });
  lorebookDefinitionPromptContainerTextarea.on('change', () => {
    settings.lorebookDefinitionPrompt = lorebookDefinitionPromptContainerTextarea.val() ?? '';
    settings.usingDefaultLorebookDefinitionPrompt = settings.lorebookDefinitionPrompt === DEFAULT_LOREBOOK_DEFINITION;
    settingsManager.saveSettings();
  });
  lorebookRulesPromptContainerTextarea.on('change', () => {
    settings.lorebookRulesPrompt = lorebookRulesPromptContainerTextarea.val() ?? '';
    settings.usingDefaultLorebookRulesPrompt = settings.lorebookRulesPrompt === DEFAULT_LOREBOOK_RULES;
    settingsManager.saveSettings();
  });
  responseRulesPromptContainerTextarea.on('change', () => {
    settings.responseRulesPrompt = responseRulesPromptContainerTextarea.val() ?? '';
    settings.usingDefaultResponseRulesPrompt = settings.responseRulesPrompt === DEFAULT_XML_DESCRIPTION;
    settingsManager.saveSettings();
  });

  const popupIconHtml = `<div class="menu_button fa-brands fa-wpexplorer interactable worldInfoRecommender-icon" title="World Info Recommender"></div>`;
  $('.form_create_bottom_buttons_block').prepend($(popupIconHtml));
  $('#GroupFavDelOkBack').prepend($(popupIconHtml));
  const popupIcons = $('.worldInfoRecommender-icon') as JQuery<HTMLDivElement>;
  popupIcon = popupIcons.eq(0);
  popupIcons.on('click', async () => {
    const popupHtml: string = await globalContext.renderExtensionTemplateAsync(
      `third-party/${extensionName}`,
      'templates/popup',
    );
    globalContext.callGenericPopup(popupHtml, POPUP_TYPE.DISPLAY, undefined, {
      large: true,
      wide: true,
    });

    const popupContainer = $('#worldInfoRecommenderPopup');

    globalContext.ConnectionManagerRequestService.handleDropdown(
      '#worldInfoRecommenderPopup #worldInfoRecommend_connectionProfile',
      settings.profileId,
      (profile) => {
        settings.profileId = profile?.id ?? '';
        settingsManager.saveSettings();
      },
    );

    const charCardContainer: JQuery<HTMLDivElement> = popupContainer.find('#worldInfoRecommend_charCardContainer');
    const charCardSelect: JQuery<HTMLSelectElement> = charCardContainer.find('#worldInfoRecommend_charCardSelect');
    let firstGroupMemberIndex: number | undefined;
    if (selected_group) {
      const groupIndex = groups.findIndex((g: any) => g.id === selected_group);
      const group: { generation_mode: number; members: string[] } = groups[groupIndex];
      if (group.generation_mode === 0) {
        // Swap character cards
        charCardSelect.empty();
        for (const member of group.members) {
          const index: number = characters.findIndex((c: any) => c.avatar === member);
          const name = characters[index].name;
          charCardSelect.append(`<option value="${index}">${name}</option>`);
        }
        charCardContainer.show();
      } else if (group.members.length > 0) {
        firstGroupMemberIndex = characters.findIndex((c: any) => c.avatar === group.members[0]);
      }
    }

    const avatar = this_chid ? st_getCharaFilename(this_chid) : selected_group;
    if (!avatar) {
      st_echo('warning', 'No active character found.');
      return;
    }

    const stDescriptionCheckbox = popupContainer.find('#worldInfoRecommend_stDescription');
    const messagesContainer = popupContainer.find('.message-options');
    const charCardCheckbox = popupContainer.find('#worldInfoRecommend_charCard');
    const authorNoteCheckbox = popupContainer.find('#worldInfoRecommend_authorNote');
    const worldInfoCheckbox = popupContainer.find('#worldInfoRecommend_worldInfo');

    stDescriptionCheckbox.prop('checked', settings.contextToSend.stDescription);
    charCardCheckbox.prop('checked', settings.contextToSend.charCard);
    authorNoteCheckbox.prop('checked', settings.contextToSend.authorNote);
    worldInfoCheckbox.prop('checked', settings.contextToSend.worldInfo);

    // Set up message options
    const messageTypeSelect = messagesContainer.find('#messageType');
    const firstXDiv = messagesContainer.find('#firstX');
    const lastXDiv = messagesContainer.find('#lastX');
    const rangeXDiv = messagesContainer.find('#rangeX');
    const firstXInput = messagesContainer.find('#firstXMessages');
    const lastXInput = messagesContainer.find('#lastXMessages');
    const rangeStartInput = messagesContainer.find('#rangeStart');
    const rangeEndInput = messagesContainer.find('#rangeEnd');

    // Initialize values
    messageTypeSelect.val(settings.contextToSend.messages.type);
    firstXInput.val(settings.contextToSend.messages.first ?? 10);
    lastXInput.val(settings.contextToSend.messages.last ?? 10);
    rangeStartInput.val(settings.contextToSend.messages.range?.start ?? 0);
    rangeEndInput.val(settings.contextToSend.messages.range?.end ?? 10);

    // Show/hide appropriate div based on initial type
    updateMessageInputVisibility(settings.contextToSend.messages.type);

    // Event handlers
    stDescriptionCheckbox.on('change', () => {
      settings.contextToSend.stDescription = stDescriptionCheckbox.prop('checked');
      settingsManager.saveSettings();
    });
    charCardCheckbox.on('change', () => {
      settings.contextToSend.charCard = charCardCheckbox.prop('checked');
      settingsManager.saveSettings();
    });
    authorNoteCheckbox.on('change', () => {
      settings.contextToSend.authorNote = authorNoteCheckbox.prop('checked');
      settingsManager.saveSettings();
    });
    worldInfoCheckbox.on('change', () => {
      settings.contextToSend.worldInfo = worldInfoCheckbox.prop('checked');
      settingsManager.saveSettings();
    });

    function updateMessageInputVisibility(type: 'none' | 'all' | 'first' | 'last' | 'range') {
      firstXDiv.hide();
      lastXDiv.hide();
      rangeXDiv.hide();

      switch (type) {
        case 'first':
          firstXDiv.show();
          break;
        case 'last':
          lastXDiv.show();
          break;
        case 'range':
          rangeXDiv.show();
          break;
        case 'none':
        case 'all':
          break;
      }
    }

    messageTypeSelect.on('change', () => {
      const type = messageTypeSelect.val() as 'all' | 'first' | 'last' | 'range';
      settings.contextToSend.messages.type = type;
      settingsManager.saveSettings();
      updateMessageInputVisibility(type);
    });

    firstXInput.on('change', () => {
      settings.contextToSend.messages.first = parseInt(firstXInput.val() as string) || 10;
      settingsManager.saveSettings();
    });

    lastXInput.on('change', () => {
      settings.contextToSend.messages.last = parseInt(lastXInput.val() as string) || 10;
      settingsManager.saveSettings();
    });

    rangeStartInput.on('change', () => {
      if (!settings.contextToSend.messages.range) {
        settings.contextToSend.messages.range = { start: 0, end: 10 };
      }
      settings.contextToSend.messages.range.start = parseInt(rangeStartInput.val() as string) || 0;
      settingsManager.saveSettings();
    });

    rangeEndInput.on('change', () => {
      if (!settings.contextToSend.messages.range) {
        settings.contextToSend.messages.range = { start: 0, end: 10 };
      }
      settings.contextToSend.messages.range.end = parseInt(rangeEndInput.val() as string) || 10;
      settingsManager.saveSettings();
    });

    const maxContextType = popupContainer.find('#worldInfoRecommend_maxContextType');
    const maxTokensContainer = popupContainer.find('#worldInfoRecommend_maxTokens_container');
    maxContextType.val(settings.maxContextType);
    maxTokensContainer.css('display', settings.maxContextType === 'custom' ? 'block' : 'none');
    maxContextType.on('change', () => {
      const value = maxContextType.val() as 'profile' | 'sampler' | 'custom';
      settings.maxContextType = value;
      settingsManager.saveSettings();
      if (value === 'custom') {
        maxTokensContainer.show();
      } else {
        maxTokensContainer.hide();
      }
    });

    const maxTokens = popupContainer.find('#worldInfoRecommend_maxTokens');
    maxTokens.val(settings.maxContextValue);
    maxTokens.on('change', () => {
      const value = Number(maxTokens.val() as string);
      settings.maxContextValue = value;
      settingsManager.saveSettings();
    });

    const maxResponseTokens = popupContainer.find('#worldInfoRecommend_maxResponseTokens');
    maxResponseTokens.val(settings.maxResponseToken);
    maxResponseTokens.on('change', () => {
      const value = Number(maxResponseTokens.val() as string);
      settings.maxResponseToken = value;
      settingsManager.saveSettings();
    });

    const entriesGroupByWorldName = await getActiveWorldInfo(['all'], this_chid);
    const allWorldNames = Object.keys(entriesGroupByWorldName);
    if (allWorldNames.length === 0) {
      st_echo('warning', 'No active World Info entries found.');
    }

    const key = `worldInfoRecommend_${avatar}`;
    const activeSession: Session = JSON.parse(localStorage.getItem(key) ?? '{}');
    function saveSession() {
      localStorage.setItem(key, JSON.stringify(activeSession));
    }

    if (!activeSession.suggestedEntries) {
      activeSession.suggestedEntries = {};
      saveSession();
    }
    if (!activeSession.blackListedEntries) {
      activeSession.blackListedEntries = [];
      saveSession();
    }
    if (!activeSession.selectedWorldNames) {
      activeSession.selectedWorldNames = structuredClone(allWorldNames);
      saveSession();
    }

    // Check if selectedWorldNames is a subset of allWorldNames
    const worldNamesMissing = activeSession.selectedWorldNames.filter(
      (worldName) => !allWorldNames.includes(worldName),
    );
    if (worldNamesMissing.length > 0) {
      st_echo('warning', `World names missing from last session: ${worldNamesMissing.join(', ')}`);
      activeSession.selectedWorldNames = activeSession.selectedWorldNames.filter(
        (worldName) => !worldNamesMissing.includes(worldName),
      );
      saveSession();
    }

    const { selectAll } = buildFancyDropdown('#worldInfoRecommend_worldInfoContainer', {
      label: 'World Info',
      initialList: allWorldNames,
      initialValues: activeSession.selectedWorldNames,
      onSelectChange(_previousValues, newValues) {
        activeSession.selectedWorldNames = newValues;
        saveSession();
      },
    });

    const promptTextarea = popupContainer.find('#worldInfoRecommend_prompt');
    buildPresetSelect('#worldInfoRecommenderPopup #worldInfoRecommend_promptPreset', {
      label: 'prompt',
      initialValue: settings.promptPreset,
      initialList: Object.keys(settings.promptPresets),
      readOnlyValues: ['default'],
      onSelectChange: async (_previousValue, newValue) => {
        const newPresetValue = newValue ?? 'default';
        settings.promptPreset = newPresetValue;
        settingsManager.saveSettings();

        // Update the prompt textarea with the selected preset content

        promptTextarea.val(settings.promptPresets[newPresetValue]?.content ?? '');
      },
      create: {
        onAfterCreate: (value) => {
          // When creating a new preset, copy the content from the current preset
          const currentPreset = settings.promptPresets[settings.promptPreset];
          settings.promptPresets[value] = {
            content: currentPreset?.content ?? '',
          };
        },
      },
      rename: {
        onAfterRename: (previousValue, newValue) => {
          // Transfer the content to the new preset name
          settings.promptPresets[newValue] = settings.promptPresets[previousValue];
          delete settings.promptPresets[previousValue];
        },
      },
      delete: {
        onAfterDelete: (value) => {
          // Remove the deleted preset
          delete settings.promptPresets[value];
        },
      },
    });

    // Set initial value for prompt textarea based on selected preset
    promptTextarea.val(settings.promptPresets[settings.promptPreset]?.content ?? '');

    // Save prompt content to the current preset when it changes
    promptTextarea.on('change', function () {
      const content = $(this).val() as string;
      settings.promptPresets[settings.promptPreset].content = content;
      settingsManager.saveSettings();
    });

    const sendButton = popupContainer.find('#worldInfoRecommend_sendPrompt');
    const addAllButton = popupContainer.find('#worldInfoRecommend_addAll');
    const suggestedEntriesContainer = popupContainer.find('#worldInfoRecommend_suggestedEntries');
    const entryTemplate = popupContainer.find('#worldInfoRecommend_entryTemplate');
    if (!entryTemplate) {
      st_echo('warning', 'Missing entry template. Contact developer.');
      return;
    }

    async function addEntry(
      entry: WIEntry,
      selectedWorldName: string,
      skipSave: boolean = false,
    ): Promise<'added' | 'updated'> {
      if (!entriesGroupByWorldName[selectedWorldName]) {
        entriesGroupByWorldName[selectedWorldName] = [];
      }

      const stFormat: { entries: Record<number, WIEntry> } = {
        entries: {},
      };
      for (const entry of entriesGroupByWorldName[selectedWorldName]) {
        stFormat.entries[entry.uid] = entry;
      }

      const existingEntry = entriesGroupByWorldName[selectedWorldName]?.find((e) => e.uid === entry.uid);
      let targetEntry: WIEntry | undefined;
      const isUpdate = !!existingEntry;

      if (isUpdate) {
        targetEntry = existingEntry;
      } else {
        const values = Object.values(stFormat.entries);
        const lastEntry = values.length > 0 ? values[values.length - 1] : undefined;
        targetEntry = st_createWorldInfoEntry(selectedWorldName, stFormat);
        if (!targetEntry) {
          throw new Error('Failed to create entry');
        }

        const newId = targetEntry.uid;
        if (lastEntry) {
          Object.assign(targetEntry, lastEntry);
        }
        targetEntry.uid = newId;
      }

      // Update entry properties
      targetEntry.key = entry.key;
      targetEntry.content = entry.content;
      targetEntry.comment = entry.comment;

      // Update local state
      stFormat.entries[targetEntry.uid] = targetEntry;
      entriesGroupByWorldName[selectedWorldName] = Object.values(stFormat.entries);

      // Save and update UI only if not skipping (for individual adds)
      if (!skipSave) {
        await globalContext.saveWorldInfo(selectedWorldName, stFormat);
        globalContext.reloadWorldInfoEditor(selectedWorldName, true);
        saveSession();
      }

      return isUpdate ? 'updated' : 'added';
    }

    function applyEntriesToUI(
      entries: Record<string, WIEntry[]>,
      lastAddedWorldName: string | null,
      type: 'initial' | 'classic' = 'classic',
    ) {
      Object.entries(entries).forEach(([worldName, entries]) => {
        entries.forEach((entry) => {
          let finalWorldName = worldName;
          let worldIndex = allWorldNames.indexOf(finalWorldName);
          if (worldIndex === -1) {
            if (lastAddedWorldName) {
              finalWorldName = lastAddedWorldName;
            } else {
              finalWorldName = allWorldNames.length > 0 ? allWorldNames[0] : '';
            }
          }
          worldIndex = allWorldNames.indexOf(finalWorldName);

          if (!activeSession.suggestedEntries[worldName]) {
            activeSession.suggestedEntries[worldName] = [];
          }

          const existingEntry =
            type === 'initial'
              ? undefined
              : activeSession.suggestedEntries[worldName].find(
                  (e) => e.uid === entry.uid && e.comment === entry.comment,
                );
          let node: JQuery<HTMLDivElement> | undefined;

          if (existingEntry) {
            let query = `.entry[data-id="${entry.uid}"][data-world-name="${worldName}"]`;
            node = suggestedEntriesContainer.find(query);
          } else {
            node = $(entryTemplate.html());
          }
          node.attr('data-world-name', worldName);
          node.attr('data-id', entry.uid.toString());
          node.attr('data-comment', entry.comment);

          // Update button text based on whether entry exists in current lorebook
          if (finalWorldName) {
            const existingInLorebook = entriesGroupByWorldName[finalWorldName]?.find((e) => e.uid === entry.uid);
            const closestAddButton = node.find('.add');
            closestAddButton.text(existingInLorebook ? 'Update' : 'Add');
          }

          // Populate world select dropdown
          const worldSelect = node.find('.world-select');
          worldSelect.empty();
          allWorldNames.forEach((name, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.text = name;
            worldSelect.append(option);
          });
          // Set selected value to the index of the world name
          if (worldIndex !== -1) {
            worldSelect.val(worldIndex.toString());
          }

          // Update button text when world selection changes
          worldSelect.on('change', function () {
            const selectedIndex = parseInt($(this).val() as string);
            if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= allWorldNames.length) {
              return;
            }
            const selectedWorldName = allWorldNames[selectedIndex];
            const existingInLorebook = entriesGroupByWorldName[selectedWorldName]?.find(
              (e) => e.uid === entry.uid && e.comment === entry.comment,
            );
            const closestAddButton = node.find('.add');
            closestAddButton.text(existingInLorebook ? 'Update' : 'Add');
          });

          node.find('.comment').text(entry.comment);
          node.find('.key').text(entry.key.join(', '));
          node.find('.content').text(entry.content);
          if (type === 'classic') {
            if (!existingEntry) {
              activeSession.suggestedEntries[worldName].push(entry);
            } else {
              existingEntry.key = entry.key;
              existingEntry.content = entry.content;
              existingEntry.comment = entry.comment;
            }
          }

          if (!existingEntry) {
            suggestedEntriesContainer.append(node);
          }
        });
      });

      if (type === 'classic' && Object.keys(entries).length > 0) {
        saveSession();
      }

      function remove(entry: JQuery<HTMLDivElement>, blacklist: boolean) {
        const worldName = entry.data('world-name');
        const id = entry.data('id');
        const comment = entry.data('comment');
        if (!entry || !worldName || id === null || id === undefined || !comment) {
          if (!worldName) {
            st_echo('warning', 'Selected entry is missing world name');
          }
          return;
        }
        if (blacklist) {
          activeSession.blackListedEntries.push(`${worldName} (${comment})`);
        }
        activeSession.suggestedEntries[worldName] = activeSession.suggestedEntries[worldName].filter(
          (e) => e.uid !== parseInt(id),
        );
        entry.remove();
      }

      suggestedEntriesContainer.find('.blacklist').on('click', (e) => {
        const entry: JQuery<HTMLDivElement> | null = $(e.currentTarget).closest('.entry');
        if (!entry) {
          return;
        }

        remove(entry, true);
        saveSession();
      });

      suggestedEntriesContainer.find('.remove').on('click', (e) => {
        const entry: JQuery<HTMLDivElement> | null = $(e.currentTarget).closest('.entry');
        if (!entry) {
          return;
        }

        remove(entry, false);
        saveSession();
      });

      const addButton = suggestedEntriesContainer.find('.add');

      addButton.on('click', async (e) => {
        try {
          addButton.prop('disabled', true);
          const entry: JQuery<HTMLDivElement> | null = $(e.currentTarget).closest('.entry');
          if (!entry) {
            return;
          }
          let worldName = entry.data('world-name');
          const id = entry.data('id');
          const comment = entry.data('comment');
          if (!entry || !worldName || id === null || id === undefined || !comment) {
            if (!worldName) {
              st_echo('warning', 'Selected entry is missing world name');
            }
            return;
          }
          const suggestedEntry = structuredClone(
            activeSession.suggestedEntries[worldName].find((e) => e.uid === parseInt(id)),
          );
          if (!suggestedEntry) {
            return;
          }

          // Get the selected world index from the dropdown
          const worldSelect = entry.find('.world-select');
          const selectedIndex = parseInt(worldSelect.val() as string);

          if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= allWorldNames.length) {
            st_echo('warning', 'Please select a valid world');
            return;
          }

          // Update the world name with the selected one
          const selectedWorldName = allWorldNames[selectedIndex];
          lastAddedWorldName = selectedWorldName;

          remove(entry, false);
          const status = await addEntry(suggestedEntry, selectedWorldName);
          st_echo('success', status === 'added' ? 'Entry added' : 'Entry updated');
        } catch (error: any) {
          console.error(error);
          st_echo('error', error instanceof Error ? error.message : error);
        } finally {
          addButton.prop('disabled', false);
        }
      });
    }

    function resetUIAndSession() {
      suggestedEntriesContainer.empty();
      activeSession.suggestedEntries = {};
      activeSession.blackListedEntries = [];
      activeSession.selectedWorldNames = structuredClone(allWorldNames);
      selectAll();
      saveSession();
    }

    applyEntriesToUI(activeSession.suggestedEntries, null, 'initial');

    // Reset button handler
    const resetButton = popupContainer.find('#worldInfoRecommend_reset');
    resetButton.on('click', async () => {
      try {
        const confirm = await globalContext.Popup.show.confirm(
          'World Info Recommender',
          'Are you sure you want to reset? This will clear all suggested entries, reset the \"Lorebooks to Include\".',
        );
        if (!confirm) {
          return;
        }
        resetUIAndSession();
        st_echo('success', 'Reset successful');
      } catch (error: any) {
        console.error(error);
        st_echo('error', error instanceof Error ? error.message : error);
      }
    });

    // Add all button handler
    addAllButton.on('click', async () => {
      try {
        addAllButton.prop('disabled', true);

        // First, validate that we have worlds to add entries to
        if (allWorldNames.length === 0) {
          st_echo('error', 'No available worlds to add entries to');
          return;
        }

        // Count total entries to process
        const totalEntries = Object.values(activeSession.suggestedEntries).reduce(
          (sum, entries) => sum + entries.length,
          0,
        );

        if (totalEntries === 0) {
          st_echo('warning', 'No entries to add');
          return;
        }

        const confirm = await globalContext.Popup.show.confirm(
          'World Info Recommender',
          `Are you sure you want to add/update all ${totalEntries} suggested entries?`,
        );
        if (!confirm) {
          return;
        }

        let addedCount = 0;
        let updatedCount = 0;
        const results: { worldName: string; entry: WIEntry; status: 'added' | 'updated' }[] = [];
        const modifiedWorlds = new Set<string>();

        // Process entries
        for (const [worldName, entries] of Object.entries(activeSession.suggestedEntries)) {
          if (entries.length === 0) continue;

          for (const entry of entries) {
            // If the world doesn't exist in the lorebook, use the first available world
            let targetWorldName = worldName;
            if (!entriesGroupByWorldName[targetWorldName]) {
              targetWorldName = allWorldNames[0];
            }

            try {
              const status = await addEntry(entry, targetWorldName, true); // Skip save during individual adds
              results.push({ worldName: targetWorldName, entry, status });
              if (status === 'added') addedCount++;
              else updatedCount++;
              modifiedWorlds.add(targetWorldName);
            } catch (error) {
              console.error(`Failed to process entry: ${entry.comment}`, error);
              st_echo('error', `Failed to process entry: ${entry.comment}`);
            }
          }
        }

        // Save and reload all modified worlds at once
        for (const worldName of modifiedWorlds) {
          const stFormat: { entries: Record<number, WIEntry> } = {
            entries: {},
          };
          for (const entry of entriesGroupByWorldName[worldName]) {
            stFormat.entries[entry.uid] = entry;
          }
          await globalContext.saveWorldInfo(worldName, stFormat);
          globalContext.reloadWorldInfoEditor(worldName, true);
        }

        // Clear suggested entries after adding all
        activeSession.suggestedEntries = {};
        saveSession();
        popupContainer.find('#worldInfoRecommend_suggestedEntries').empty();

        // Show detailed results
        if (addedCount > 0 || updatedCount > 0) {
          const message = `
            <div class="results-summary">
              <p>Successfully processed ${addedCount + updatedCount} entries:</p>
              <ul>
              <li>Added: ${addedCount}</li>
              <li>Updated: ${updatedCount}</li>
              <li>Modified worlds: ${Array.from(modifiedWorlds).join(', ')}</li>
              </ul>
            </div>`;
          st_echo('success', message, { escapeHtml: false });
        } else {
          st_echo('warning', 'No entries were processed successfully');
        }
      } catch (error: any) {
        console.error(error);
        st_echo('error', error instanceof Error ? error.message : error);
      } finally {
        addAllButton.prop('disabled', false);
      }
    });

    sendButton.on('click', async () => {
      try {
        sendButton.prop('disabled', true);
        if (!settings.profileId) {
          return;
        }
        const context = SillyTavern.getContext();
        const profile = context.extensionSettings.connectionManager?.profiles?.find(
          (profile) => profile.id === settings.profileId,
        );
        if (!profile) {
          return;
        }

        let prompt = promptTextarea.val() as string;
        if (!prompt) {
          return;
        }
        prompt = globalContext.substituteParams(prompt.trim());
        if (!prompt) {
          return;
        }

        const messages: ChatCompletionMessage[] = [];
        const selectedApi = profile.api ? globalContext.CONNECT_API_MAP[profile.api].selected : undefined;
        if (!selectedApi) {
          return;
        }

        const selectedCharCard = charCardSelect.val() as string;
        const buildPromptOptions: BuildPromptOptions = {
          presetName: profile.preset,
          contextName: profile.context,
          instructName: profile.instruct,
          syspromptName: profile.sysprompt,
          ignoreCharacterFields: !settings.contextToSend.charCard,
          ignoreWorldInfo: true, // We don't need triggered world info here
          ignoreAuthorNote: !settings.contextToSend.authorNote,
          maxContext:
            settings.maxContextType === 'custom'
              ? settings.maxContextValue
              : settings.maxContextType === 'profile'
                ? 'preset'
                : 'active',
          includeNames: !!selected_group,
          targetCharacterId: selected_group
            ? ((selectedCharCard ? Number(selectedCharCard) : undefined) ?? firstGroupMemberIndex)
            : undefined,
        };

        // Add message options based on selected type
        switch (settings.contextToSend.messages.type) {
          case 'none':
            buildPromptOptions.messageIndexesBetween = {
              start: -1,
              end: -1,
            };
            break;
          case 'first':
            buildPromptOptions.messageIndexesBetween = {
              start: 0,
              end: settings.contextToSend.messages.first ?? 10,
            };
            break;
          case 'last':
            const lastCount = settings.contextToSend.messages.last ?? 10;
            buildPromptOptions.messageIndexesBetween = {
              end: context.chat.length - 1,
              start: context.chat.length - lastCount,
            };
            break;
          case 'range':
            if (settings.contextToSend.messages.range) {
              buildPromptOptions.messageIndexesBetween = {
                start: settings.contextToSend.messages.range.start,
                end: settings.contextToSend.messages.range.end,
              };
            }
            break;
          case 'all':
          default:
            break;
        }

        messages.push(...(await buildPrompt(selectedApi, buildPromptOptions)));

        if (settings.contextToSend.stDescription) {
          messages.push({
            role: 'system',
            content: settings.stWorldInfoPrompt,
          });
        }
        if (settings.contextToSend.worldInfo) {
          if (activeSession.selectedWorldNames.length > 0) {
            const template = Handlebars.compile(settings.lorebookDefinitionPrompt, { noEscape: true });
            const lorebooks: Record<string, WIEntry[]> = {};
            Object.entries(entriesGroupByWorldName)
              .filter(
                ([worldName, entries]) => entries.length > 0 && activeSession.selectedWorldNames.includes(worldName),
              )
              .forEach(([worldName, entries]) => {
                lorebooks[worldName] = entries;
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

        if (activeSession.blackListedEntries.length > 0) {
          let blackListPrompt = '# Blacklisted Entries:\n';
          activeSession.blackListedEntries.forEach((entry) => {
            blackListPrompt += `- ${entry}\n`;
          });
          messages.push({
            role: 'system',
            content: blackListPrompt,
          });
        }

        if (Object.keys(activeSession.suggestedEntries).length > 0) {
          const anySuggested = Object.values(activeSession.suggestedEntries).some((entries) => entries.length > 0);
          if (anySuggested) {
            const template = Handlebars.compile(settings.lorebookDefinitionPrompt, { noEscape: true });
            const lorebooks: Record<string, WIEntry[]> = {};
            Object.entries(activeSession.suggestedEntries)
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

        const userPrompt = `${settings.responseRulesPrompt}\n\n${settings.lorebookRulesPrompt}\n\nYour task:\n${prompt}`;
        messages.push({
          role: 'user',
          content: userPrompt,
        });

        const response = (await globalContext.ConnectionManagerRequestService.sendRequest(
          profile.id,
          messages,
          settings.maxResponseToken,
        )) as ExtractedData;
        // console.log(response.content);
        const entries = parseXMLOwn(response.content);
        if (Object.keys(entries).length === 0) {
          st_echo('warning', 'No entries in response');
          return;
        }
        // Set "key" and "comment" if missing
        Object.entries(entries).forEach(([worldName, entries]) => {
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
          });
        });
        // console.log(entries);

        let lastAddedWorldName: string | null = null;
        applyEntriesToUI(entries, lastAddedWorldName, 'classic');
      } catch (error: any) {
        console.error(error);
        st_echo('error', error instanceof Error ? error.message : error);
      } finally {
        sendButton.prop('disabled', false);
      }
    });
  });
}
function initializeEvents() {}
function initializeCommands() {
  globalContext.SlashCommandParser.addCommandObject(
    globalContext.SlashCommand.fromProps({
      name: 'world-info-recommender-popup-open',
      helpString: 'Open World Info Recommender popup',
      unnamedArgumentList: [],
      callback: async (_args: any, _value: any) => {
        if (popupIcon) {
          popupIcon.trigger('click');
          return true;
        }

        return false;
      },
      returns: globalContext.ARGUMENT_TYPE.BOOLEAN,
    }),
  );
}

function stagingCheck(): boolean {
  if (!globalContext.ConnectionManagerRequestService) {
    return false;
  }

  if (!globalContext.getCharacterCardFields) {
    return false;
  }

  if (!globalContext.getWorldInfoPrompt) {
    return false;
  }

  if (!globalContext.reloadWorldInfoEditor) {
    return false;
  }

  return true;
}

function main() {
  handleUIChanges();
  initializeEvents();
  initializeCommands();
}

if (!stagingCheck()) {
  const errorStr = '[World Info Recommender Error] Make sure you are on staging branch and staging is updated.';
  st_echo('error', errorStr);
} else {
  settingsManager
    .initializeSettings()
    .then((result) => {
      if (result.version.changed) {
        const settings = settingsManager.getSettings();
        let anyChange = false;
        if (settings.usingDefaultStWorldInfoPrompt && settings.stWorldInfoPrompt !== DEFAULT_ST_DESCRIPTION) {
          settings.stWorldInfoPrompt = DEFAULT_ST_DESCRIPTION;
          anyChange = true;
        }
        if (
          settings.usingDefaultLorebookDefinitionPrompt &&
          settings.lorebookDefinitionPrompt !== DEFAULT_LOREBOOK_DEFINITION
        ) {
          settings.lorebookDefinitionPrompt = DEFAULT_LOREBOOK_DEFINITION;
          anyChange = true;
        }
        if (settings.usingDefaultLorebookRulesPrompt && settings.lorebookRulesPrompt !== DEFAULT_LOREBOOK_RULES) {
          settings.lorebookRulesPrompt = DEFAULT_LOREBOOK_RULES;
          anyChange = true;
        }
        if (settings.usingDefaultResponseRulesPrompt && settings.responseRulesPrompt !== DEFAULT_XML_DESCRIPTION) {
          settings.responseRulesPrompt = DEFAULT_XML_DESCRIPTION;
          anyChange = true;
        }
        if (anyChange) {
          settingsManager.saveSettings();
        }
      }
      main();
    })
    .catch((error) => {
      st_echo('error', error);
      globalContext.Popup.show
        .confirm(
          'Data migration failed. Do you want to reset the World Info Recommender data?',
          'World Info Recommender',
        )
        .then((result) => {
          if (result) {
            settingsManager.resetSettings();
            main();
          }
        });
    });
}
