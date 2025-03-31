import { buildFancyDropdown, buildPresetSelect, BuildPromptOptions, getActiveWorldInfo } from 'sillytavern-utils-lib';
import {
  groups,
  selected_group,
  st_createWorldInfoEntry,
  st_echo,
  st_getCharaFilename,
  this_chid,
  world_names,
} from 'sillytavern-utils-lib/config';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';
import { DEFAULT_LOREBOOK_DEFINITION, DEFAULT_LOREBOOK_RULES, DEFAULT_ST_DESCRIPTION } from './constants.js';
import { DEFAULT_XML_DESCRIPTION } from './xml.js';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';
import showdown from 'showdown';

import { globalContext, runWorldInfoRecommendation, Session } from './generate.js';
import { initializeCommands, setPopupIcon } from './commands.js';

// @ts-ignore
import { Handlebars } from '../../../../../lib.js';
import { extensionName, settingsManager } from './settings.js';
if (!Handlebars.helpers['join']) {
  Handlebars.registerHelper('join', function (array: any, separator: any) {
    return array.join(separator);
  });
}

const converter = new showdown.Converter();

async function handleUIChanges(): Promise<void> {
  const settingsHtml: string = await globalContext.renderExtensionTemplateAsync(
    `third-party/${extensionName}`,
    'templates/settings',
  );
  document.querySelector('#extensions_settings')!.insertAdjacentHTML('beforeend', settingsHtml);

  const settingsContainer = document.querySelector<HTMLElement>('.worldInfoRecommender_settings');
  if (!settingsContainer) {
    st_echo('error', 'Could not find settings container. Contact the developer.');
    return;
  }

  const settings = settingsManager.getSettings();

  const stWorldInfoPromptContainer = settingsContainer.querySelector<HTMLElement>('.stWorldInfoPrompt');
  const stWorldInfoPromptContainerTextarea = stWorldInfoPromptContainer!.querySelector<HTMLTextAreaElement>('textarea');

  const lorebookDefinitionPromptContainer = settingsContainer.querySelector<HTMLElement>('.lorebookDefinitionPrompt');
  const lorebookDefinitionPromptContainerTextarea =
    lorebookDefinitionPromptContainer!.querySelector<HTMLTextAreaElement>('textarea');

  const lorebookRulesPromptContainer = settingsContainer.querySelector<HTMLElement>('.lorebookRulesPrompt');
  const lorebookRulesPromptContainerTextarea =
    lorebookRulesPromptContainer!.querySelector<HTMLTextAreaElement>('textarea');

  const responseRulesPromptContainer = settingsContainer.querySelector<HTMLElement>('.responseRulesPrompt');
  const responseRulesPromptContainerTextarea =
    responseRulesPromptContainer!.querySelector<HTMLTextAreaElement>('textarea');

  stWorldInfoPromptContainerTextarea!.value = settings.stWorldInfoPrompt;
  lorebookDefinitionPromptContainerTextarea!.value = settings.lorebookDefinitionPrompt;
  lorebookRulesPromptContainerTextarea!.value = settings.lorebookRulesPrompt;
  responseRulesPromptContainerTextarea!.value = settings.responseRulesPrompt;

  // Helper function to attach restore default listeners
  const attachRestoreListener = (
    container: HTMLElement | null,
    textarea: HTMLTextAreaElement | null | undefined,
    confirmMessage: string,
    defaultValue: string,
  ) => {
    container!.querySelector('.restore_default')!.addEventListener('click', async () => {
      const confirm = await globalContext.Popup.show.confirm('World Info Recommender', confirmMessage);
      if (!confirm) {
        return;
      }
      textarea!.value = defaultValue;
      textarea!.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  attachRestoreListener(
    stWorldInfoPromptContainer,
    stWorldInfoPromptContainerTextarea,
    'Are you sure you want to restore the default ST/World Info description?',
    DEFAULT_ST_DESCRIPTION,
  );
  attachRestoreListener(
    lorebookDefinitionPromptContainer,
    lorebookDefinitionPromptContainerTextarea,
    'Are you sure you want to restore the default lorebook definition?',
    DEFAULT_LOREBOOK_DEFINITION,
  );
  attachRestoreListener(
    lorebookRulesPromptContainer,
    lorebookRulesPromptContainerTextarea,
    'Are you sure you want to restore the default lorebook rules?',
    DEFAULT_LOREBOOK_RULES,
  );
  attachRestoreListener(
    responseRulesPromptContainer,
    responseRulesPromptContainerTextarea,
    'Are you sure you want to restore the default response rules?',
    DEFAULT_XML_DESCRIPTION,
  );

  // Helper function to attach change listeners for saving settings
  const attachChangeListener = (
    textarea: HTMLTextAreaElement | null | undefined,
    settingKey: keyof typeof settings,
    defaultKey: keyof typeof settings,
    defaultValue: string,
  ) => {
    textarea!.addEventListener('change', () => {
      (settings[settingKey] as any) = textarea!.value ?? '';
      (settings[defaultKey] as any) = (settings[settingKey] as any) === defaultValue;
      settingsManager.saveSettings();
    });
  };

  attachChangeListener(
    stWorldInfoPromptContainerTextarea,
    'stWorldInfoPrompt',
    'usingDefaultStWorldInfoPrompt',
    DEFAULT_ST_DESCRIPTION,
  );
  attachChangeListener(
    lorebookDefinitionPromptContainerTextarea,
    'lorebookDefinitionPrompt',
    'usingDefaultLorebookDefinitionPrompt',
    DEFAULT_LOREBOOK_DEFINITION,
  );
  attachChangeListener(
    lorebookRulesPromptContainerTextarea,
    'lorebookRulesPrompt',
    'usingDefaultLorebookRulesPrompt',
    DEFAULT_LOREBOOK_RULES,
  );
  attachChangeListener(
    responseRulesPromptContainerTextarea,
    'responseRulesPrompt',
    'usingDefaultResponseRulesPrompt',
    DEFAULT_XML_DESCRIPTION,
  );

  // Create and prepend popup icons
  const popupIconHtml = `<div class="menu_button fa-brands fa-wpexplorer interactable worldInfoRecommender-icon" title="World Info Recommender"></div>`;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = popupIconHtml.trim();
  const popupIconTemplate = tempDiv.firstChild as HTMLElement | null;

  const targetSelectors = '.form_create_bottom_buttons_block, #GroupFavDelOkBack, #form_character_search_form';
  document.querySelectorAll(targetSelectors).forEach((target) => {
    target.insertBefore(popupIconTemplate!.cloneNode(true), target.firstChild);
  });

  const popupIcons = document.querySelectorAll<HTMLDivElement>('.worldInfoRecommender-icon');
  setPopupIcon(popupIcons[0]);

  popupIcons.forEach((icon) => {
    icon.addEventListener('click', async () => {
      const popupHtml: string = await globalContext.renderExtensionTemplateAsync(
        `third-party/${extensionName}`,
        'templates/popup',
      );
      globalContext.callGenericPopup(popupHtml, POPUP_TYPE.DISPLAY, undefined, {
        large: true,
        wide: true,
      });

      const popupContainer = document.getElementById('worldInfoRecommenderPopup');
      if (!popupContainer) {
        console.error('Popup container not found');
        return;
      }

      // Connection Profile Dropdown
      globalContext.ConnectionManagerRequestService.handleDropdown(
        '#worldInfoRecommenderPopup #worldInfoRecommend_connectionProfile',
        settings.profileId,
        (profile) => {
          settings.profileId = profile?.id ?? '';
          settingsManager.saveSettings();
        },
      );

      const context = SillyTavern.getContext();
      const charCardContainer = popupContainer.querySelector<HTMLDivElement>('#worldInfoRecommend_charCardContainer');
      const charCardSelect = charCardContainer!.querySelector<HTMLSelectElement>('#worldInfoRecommend_charCardSelect');
      let firstGroupMemberIndex: number | undefined;

      if (selected_group) {
        const groupIndex = groups.findIndex((g: any) => g.id === selected_group);
        const group: { generation_mode: number; members: string[] } = groups[groupIndex];
        if (group.generation_mode === 0) {
          // Swap character cards
          charCardSelect!.innerHTML = ''; // Clear existing options
          for (const member of group.members) {
            const index: number = context.characters.findIndex((c: any) => c.avatar === member);
            const name = context.characters[index].name;
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = name;
            charCardSelect!.appendChild(option);
          }
          charCardContainer!.style.display = 'block';
        } else if (group.members.length > 0) {
          firstGroupMemberIndex = context.characters.findIndex((c: any) => c.avatar === group.members[0]);
        }
      } else if (charCardContainer) {
        charCardContainer.style.display = 'none';
      }

      const avatar = this_chid ? st_getCharaFilename(this_chid) : selected_group;

      const stDescriptionCheckbox = popupContainer.querySelector<HTMLInputElement>('#worldInfoRecommend_stDescription');
      const messagesContainer = popupContainer.querySelector<HTMLElement>('.message-options');
      if (!avatar) {
        messagesContainer!.style.display = 'none';
      }
      const charCardCheckbox = popupContainer.querySelector<HTMLInputElement>('#worldInfoRecommend_charCard');
      const authorNoteCheckbox = popupContainer.querySelector<HTMLInputElement>('#worldInfoRecommend_authorNote');
      const worldInfoCheckbox = popupContainer.querySelector<HTMLInputElement>('#worldInfoRecommend_worldInfo');
      const suggestedEntriesCheckbox = popupContainer.querySelector<HTMLInputElement>(
        '#worldInfoRecommend_includeSuggestedEntries',
      );

      stDescriptionCheckbox!.checked = settings.contextToSend.stDescription;
      charCardCheckbox!.checked = settings.contextToSend.charCard;
      authorNoteCheckbox!.checked = settings.contextToSend.authorNote;
      worldInfoCheckbox!.checked = settings.contextToSend.worldInfo;
      suggestedEntriesCheckbox!.checked = settings.contextToSend.suggestedEntries;

      // Set up message options
      const messageTypeSelect = messagesContainer!.querySelector<HTMLSelectElement>('#messageType');
      const firstXDiv = messagesContainer!.querySelector<HTMLElement>('#firstX');
      const lastXDiv = messagesContainer!.querySelector<HTMLElement>('#lastX');
      const rangeXDiv = messagesContainer!.querySelector<HTMLElement>('#rangeX');
      const firstXInput = messagesContainer!.querySelector<HTMLInputElement>('#firstXMessages');
      const lastXInput = messagesContainer!.querySelector<HTMLInputElement>('#lastXMessages');
      const rangeStartInput = messagesContainer!.querySelector<HTMLInputElement>('#rangeStart');
      const rangeEndInput = messagesContainer!.querySelector<HTMLInputElement>('#rangeEnd');

      // Initialize values
      messageTypeSelect!.value = settings.contextToSend.messages.type;
      firstXInput!.value = (settings.contextToSend.messages.first ?? 10).toString();
      lastXInput!.value = (settings.contextToSend.messages.last ?? 10).toString();
      rangeStartInput!.value = (settings.contextToSend.messages.range?.start ?? 0).toString();
      rangeEndInput!.value = (settings.contextToSend.messages.range?.end ?? 10).toString();

      function updateMessageInputVisibility(type: 'none' | 'all' | 'first' | 'last' | 'range') {
        firstXDiv!.style.display = 'none';
        lastXDiv!.style.display = 'none';
        rangeXDiv!.style.display = 'none';

        switch (type) {
          case 'first':
            firstXDiv!.style.display = 'block';
            break;
          case 'last':
            lastXDiv!.style.display = 'block';
            break;
          case 'range':
            rangeXDiv!.style.display = 'block';
            break;
          case 'none':
          case 'all':
            break;
        }
      }

      // Show/hide appropriate div based on initial type
      updateMessageInputVisibility(settings.contextToSend.messages.type);

      // Event handlers
      stDescriptionCheckbox!.addEventListener('change', () => {
        settings.contextToSend.stDescription = stDescriptionCheckbox!.checked;
        settingsManager.saveSettings();
      });
      charCardCheckbox!.addEventListener('change', () => {
        settings.contextToSend.charCard = charCardCheckbox!.checked;
        settingsManager.saveSettings();
      });
      authorNoteCheckbox!.addEventListener('change', () => {
        settings.contextToSend.authorNote = authorNoteCheckbox!.checked;
        settingsManager.saveSettings();
      });
      worldInfoCheckbox!.addEventListener('change', () => {
        settings.contextToSend.worldInfo = worldInfoCheckbox!.checked;
        settingsManager.saveSettings();
      });
      suggestedEntriesCheckbox!.addEventListener('change', () => {
        settings.contextToSend.suggestedEntries = suggestedEntriesCheckbox!.checked;
        settingsManager.saveSettings();
      });

      messageTypeSelect!.addEventListener('change', (e) => {
        const type = (e.target as HTMLSelectElement).value as 'all' | 'first' | 'last' | 'range';
        settings.contextToSend.messages.type = type;
        settingsManager.saveSettings();
        updateMessageInputVisibility(type);
      });

      firstXInput!.addEventListener('change', (e) => {
        settings.contextToSend.messages.first = parseInt((e.target as HTMLInputElement).value) || 10;
        settingsManager.saveSettings();
      });

      lastXInput!.addEventListener('change', (e) => {
        settings.contextToSend.messages.last = parseInt((e.target as HTMLInputElement).value) || 10;
        settingsManager.saveSettings();
      });

      rangeStartInput!.addEventListener('change', (e) => {
        if (!settings.contextToSend.messages.range) {
          settings.contextToSend.messages.range = { start: 0, end: 10 };
        }
        settings.contextToSend.messages.range.start = parseInt((e.target as HTMLInputElement).value) || 0;
        settingsManager.saveSettings();
      });

      rangeEndInput!.addEventListener('change', (e) => {
        if (!settings.contextToSend.messages.range) {
          settings.contextToSend.messages.range = { start: 0, end: 10 };
        }
        settings.contextToSend.messages.range.end = parseInt((e.target as HTMLInputElement).value) || 10;
        settingsManager.saveSettings();
      });

      const maxContextType = popupContainer.querySelector<HTMLSelectElement>('#worldInfoRecommend_maxContextType');
      const maxTokensContainer = popupContainer.querySelector<HTMLElement>('#worldInfoRecommend_maxTokens_container');
      maxContextType!.value = settings.maxContextType;
      maxTokensContainer!.style.display = settings.maxContextType === 'custom' ? 'block' : 'none';

      maxContextType!.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value as 'profile' | 'sampler' | 'custom';
        settings.maxContextType = value;
        settingsManager.saveSettings();
        maxTokensContainer!.style.display = value === 'custom' ? 'block' : 'none';
      });

      const maxTokens = popupContainer.querySelector<HTMLInputElement>('#worldInfoRecommend_maxTokens');
      maxTokens!.value = settings.maxContextValue.toString();
      maxTokens!.addEventListener('change', (e) => {
        const value = Number((e.target as HTMLInputElement).value);
        settings.maxContextValue = value;
        settingsManager.saveSettings();
      });

      const maxResponseTokens = popupContainer.querySelector<HTMLInputElement>('#worldInfoRecommend_maxResponseTokens');
      maxResponseTokens!.value = settings.maxResponseToken.toString();
      maxResponseTokens!.addEventListener('change', (e) => {
        const value = Number((e.target as HTMLInputElement).value);
        settings.maxResponseToken = value;
        settingsManager.saveSettings();
      });

      let entriesGroupByWorldName: Record<string, WIEntry[]> = {};
      if (avatar) {
        entriesGroupByWorldName = await getActiveWorldInfo(['all'], this_chid);
      } else {
        for (const worldName of world_names) {
          const worldInfo = await globalContext.loadWorldInfo(worldName);
          if (worldInfo) {
            entriesGroupByWorldName[worldName] = Object.values(worldInfo.entries);
          }
        }
      }
      const allWorldNames = Object.keys(entriesGroupByWorldName);
      if (allWorldNames.length === 0) {
        st_echo('warning', 'No active World Info entries found.');
      }

      const key = `worldInfoRecommend_${avatar ?? '_global'}`;
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
        activeSession.selectedWorldNames = avatar ? structuredClone(allWorldNames) : [];
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

      const { selectAll, deselectAll } = buildFancyDropdown('#worldInfoRecommend_worldInfoContainer', {
        initialList: allWorldNames,
        initialValues: activeSession.selectedWorldNames,
        onSelectChange(_previousValues, newValues) {
          activeSession.selectedWorldNames = newValues;
          saveSession();
        },
        enableSearch: allWorldNames.length > 10,
      });

      const promptTextarea = popupContainer.querySelector<HTMLTextAreaElement>('#worldInfoRecommend_prompt');
      buildPresetSelect('#worldInfoRecommenderPopup #worldInfoRecommend_promptPreset', {
        label: 'prompt',
        initialValue: settings.promptPreset,
        initialList: Object.keys(settings.promptPresets),
        readOnlyValues: ['default'],
        onSelectChange: async (_previousValue, newValue) => {
          const newPresetValue = newValue ?? 'default';
          settings.promptPreset = newPresetValue;
          settingsManager.saveSettings();
          promptTextarea!.value = settings.promptPresets[newPresetValue]?.content ?? '';
        },
        create: {
          onAfterCreate: (value) => {
            const currentPreset = settings.promptPresets[settings.promptPreset];
            settings.promptPresets[value] = {
              content: currentPreset?.content ?? '',
            };
          },
        },
        rename: {
          onAfterRename: (previousValue, newValue) => {
            settings.promptPresets[newValue] = settings.promptPresets[previousValue];
            delete settings.promptPresets[previousValue];
          },
        },
        delete: {
          onAfterDelete: (value) => {
            delete settings.promptPresets[value];
          },
        },
      });

      // Set initial value for prompt textarea based on selected preset
      promptTextarea!.value = settings.promptPresets[settings.promptPreset]!.content ?? '';

      // Save prompt content to the current preset when it changes
      promptTextarea!.addEventListener('change', function (this: HTMLTextAreaElement) {
        const content = this.value;
        settings.promptPresets[settings.promptPreset].content = content;
        settingsManager.saveSettings();
      });

      const sendButton = popupContainer.querySelector<HTMLButtonElement>('#worldInfoRecommend_sendPrompt');
      const addAllButton = popupContainer.querySelector<HTMLButtonElement>('#worldInfoRecommend_addAll');
      const suggestedEntriesContainer = popupContainer.querySelector<HTMLElement>(
        '#worldInfoRecommend_suggestedEntries',
      );
      const entryTemplate = popupContainer.querySelector<HTMLTemplateElement>(
        '#worldInfoRecommend_entryTemplate',
      ) as HTMLTemplateElement;

      if (!entryTemplate) {
        st_echo('warning', 'Missing entry template. Contact developer.');
        return;
      }
      if (!suggestedEntriesContainer) {
        st_echo('warning', 'Missing suggested entries container. Contact developer.');
        return;
      }

      let lastAddedWorldName: string | null = null;
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
        for (const currentEntry of entriesGroupByWorldName[selectedWorldName]) {
          stFormat.entries[currentEntry.uid] = currentEntry;
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

      function applyEntriesToUI(entries: Record<string, WIEntry[]>, type: 'initial' | 'classic' = 'classic') {
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

            let node: HTMLDivElement;
            if (existingEntry) {
              const query = `.entry[data-id="${entry.uid}"][data-world-name="${worldName}"]`;
              node = suggestedEntriesContainer!.querySelector<HTMLDivElement>(query) as HTMLDivElement;
            } else {
              const templateContent = entryTemplate.content.cloneNode(true) as DocumentFragment;
              node = templateContent.firstElementChild as HTMLDivElement;
            }

            node.dataset.worldName = worldName;
            node.dataset.id = entry.uid.toString();
            node.dataset.comment = entry.comment;

            const addButton = node.querySelector<HTMLButtonElement>('.add');

            const updateAddButtonText = (selectedWorld: string) => {
              const existingInLorebook = entriesGroupByWorldName[selectedWorld]?.find((e) => e.uid === entry.uid);
              addButton!.textContent = existingInLorebook ? 'Update' : 'Add';
            };

            // Populate world select dropdown
            const worldSelect = node.querySelector<HTMLSelectElement>('.world-select');
            worldSelect!.innerHTML = '';
            allWorldNames.forEach((name, index) => {
              const option = document.createElement('option');
              option.value = index.toString();
              option.textContent = name;
              worldSelect!.appendChild(option);
            });
            // Set selected value to the index of the world name
            if (worldIndex !== -1) {
              worldSelect!.value = worldIndex.toString();
            }

            // Update button text when world selection changes
            worldSelect!.addEventListener('change', function (this: HTMLSelectElement) {
              const selectedIndex = parseInt(this.value);
              if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= allWorldNames.length) {
                return;
              }
              const selectedWorldName = allWorldNames[selectedIndex];
              updateAddButtonText(selectedWorldName);
            });

            // Update button text based on initial/current world selection
            if (worldSelect) {
              const initialSelectedWorld = allWorldNames[parseInt(worldSelect.value)] ?? finalWorldName;
              updateAddButtonText(initialSelectedWorld);
            } else {
              updateAddButtonText(finalWorldName);
            }

            const commentEl = node.querySelector<HTMLElement>('.comment');
            const keyEl = node.querySelector<HTMLElement>('.key');
            const contentEl = node.querySelector<HTMLElement>('.content');

            commentEl!.textContent = entry.comment;
            keyEl!.textContent = entry.key.join(', ');
            contentEl!.innerHTML = converter.makeHtml(entry.content);

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
              suggestedEntriesContainer!.appendChild(node);

              // Attach listeners only to newly added nodes
              const removeButton = node.querySelector('.remove');
              const blacklistButton = node.querySelector('.blacklist');

              removeButton!.addEventListener('click', (e) => handleRemove(e, false));
              blacklistButton!.addEventListener('click', (e) => handleRemove(e, true));
              addButton!.addEventListener('click', handleAdd);
            }
          });
        });

        if (type === 'classic' && Object.keys(entries).length > 0) {
          saveSession();
        }
      }

      function handleRemove(event: Event, blacklist: boolean) {
        const button = event.currentTarget as HTMLElement;
        const entryElement = button.closest<HTMLDivElement>('.entry');
        if (!entryElement) return;

        const worldName = entryElement.dataset.worldName;
        const idStr = entryElement.dataset.id;
        const comment = entryElement.dataset.comment;

        if (!worldName || idStr === undefined || !comment) {
          st_echo('warning', 'Entry data is incomplete for removal.');
          return;
        }

        const id = parseInt(idStr);
        if (isNaN(id)) {
          st_echo('warning', 'Invalid entry ID for removal.');
          return;
        }

        if (blacklist) {
          activeSession.blackListedEntries.push(`${worldName} (${comment})`);
        }

        if (activeSession.suggestedEntries[worldName]) {
          activeSession.suggestedEntries[worldName] = activeSession.suggestedEntries[worldName].filter(
            (e) => !(e.uid === id && e.comment === comment),
          );
        }
        entryElement.remove();
        saveSession();
      }

      async function handleAdd(event: Event) {
        const addButton = event.currentTarget as HTMLButtonElement;
        const entryElement = addButton.closest<HTMLDivElement>('.entry');
        if (!entryElement) return;

        addButton.disabled = true;
        try {
          const worldName = entryElement.dataset.worldName;
          const idStr = entryElement.dataset.id;
          const comment = entryElement.dataset.comment;

          if (!worldName || idStr === undefined || !comment) {
            st_echo('warning', 'Entry data is incomplete for adding.');
            return;
          }

          const id = parseInt(idStr);
          if (isNaN(id)) {
            st_echo('warning', 'Invalid entry ID for adding.');
            return;
          }
          const suggestedEntry = structuredClone(
            activeSession.suggestedEntries[worldName]?.find((e) => e.uid === id && e.comment === comment),
          );
          if (!suggestedEntry) {
            return;
          }

          // Get the selected world index from the dropdown
          const worldSelect = entryElement.querySelector<HTMLSelectElement>('.world-select');
          const selectedIndex = parseInt(worldSelect!.value);

          if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= allWorldNames.length) {
            st_echo('warning', 'Please select a valid world.');
            return;
          }

          // Update the world name with the selected one
          const selectedWorldName = allWorldNames[selectedIndex];
          lastAddedWorldName = selectedWorldName; // Keep track for potential future adds

          // Remove from UI and session *before* adding to lorebook
          if (activeSession.suggestedEntries[worldName]) {
            activeSession.suggestedEntries[worldName] = activeSession.suggestedEntries[worldName].filter(
              (e) => !(e.uid === id && e.comment === comment),
            );
          }
          entryElement.remove();

          const status = await addEntry(suggestedEntry, selectedWorldName);
          st_echo('success', status === 'added' ? 'Entry added' : 'Entry updated');
        } catch (error: any) {
          console.error(error);
          st_echo('error', error instanceof Error ? error.message : error);
        } finally {
          addButton.disabled = false;
        }
      }

      applyEntriesToUI(activeSession.suggestedEntries, 'initial');

      function resetUIAndSession() {
        suggestedEntriesContainer!.innerHTML = '';
        activeSession.suggestedEntries = {};
        activeSession.blackListedEntries = [];
        if (avatar) {
          activeSession.selectedWorldNames = structuredClone(allWorldNames);
          selectAll();
        } else {
          activeSession.selectedWorldNames = [];
          deselectAll();
        }
        saveSession();
      }

      // Reset button handler
      const resetButton = popupContainer.querySelector<HTMLButtonElement>('#worldInfoRecommend_reset');
      resetButton!.addEventListener('click', async () => {
        try {
          const confirm = await globalContext.Popup.show.confirm(
            'World Info Recommender',
            'Are you sure you want to reset? This will clear all suggested entries and reset the \"Lorebooks to Include\".',
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
      addAllButton!.addEventListener('click', async () => {
        if (!addAllButton) return;
        addAllButton.disabled = true;

        try {
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
          const modifiedWorlds = new Set<string>();
          const entriesToAdd: { worldName: string; entry: WIEntry }[] = [];

          // Process entries
          for (const [worldName, entries] of Object.entries(activeSession.suggestedEntries)) {
            if (entries.length === 0) continue;

            for (const entry of entries) {
              // If the world doesn't exist in the lorebook, use the first available world
              let targetWorldName = worldName;
              if (!entriesGroupByWorldName[targetWorldName]) {
                if (allWorldNames.length > 0) {
                  targetWorldName = allWorldNames[0];
                } else {
                  console.error(`No target world available for entry: ${entry.comment}`);
                  st_echo('error', `Cannot find target world for entry: ${entry.comment}`);
                  continue;
                }
              }
              entriesToAdd.push({ worldName: targetWorldName, entry });
            }
          }

          // Process collected entries
          for (const { worldName, entry } of entriesToAdd) {
            try {
              const status = await addEntry(entry, worldName, true); // Skip individual saves
              if (status === 'added') addedCount++;
              else updatedCount++;
              modifiedWorlds.add(worldName);
            } catch (error) {
              console.error(`Failed to process entry: ${entry.comment}`, error);
              st_echo('error', `Failed to process entry: ${entry.comment}`);
            }
          }

          // Save and reload all modified worlds at once
          for (const worldName of modifiedWorlds) {
            const stFormat: { entries: Record<number, WIEntry> } = {
              entries: {},
            };
            // Rebuild the format from the potentially updated entriesGroupByWorldName
            for (const entry of entriesGroupByWorldName[worldName]) {
              stFormat.entries[entry.uid] = entry;
            }
            try {
              await globalContext.saveWorldInfo(worldName, stFormat);
              globalContext.reloadWorldInfoEditor(worldName, true);
            } catch (error) {
              console.error(`Failed to save world: ${worldName}`, error);
              st_echo('error', `Failed to save world: ${worldName}`);
            }
          }

          // Clear suggested entries from session and UI after processing all
          activeSession.suggestedEntries = {};
          saveSession();
          suggestedEntriesContainer.innerHTML = '';

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
          addAllButton.disabled = false;
        }
      });

      sendButton!.addEventListener('click', async () => {
        if (!sendButton || !promptTextarea) return;
        sendButton.disabled = true;

        try {
          const prompt = promptTextarea.value;

          if (!settings.profileId) {
            st_echo('warning', 'Please select a connection profile.');
            return;
          }
          if (!prompt) {
            st_echo('warning', 'Please enter a prompt.');
            return;
          }

          const selectedCharCardValue = charCardSelect?.value;
          const targetCharacterId = selected_group
            ? ((selectedCharCardValue ? Number(selectedCharCardValue) : undefined) ?? firstGroupMemberIndex)
            : undefined;

          const context = SillyTavern.getContext();
          const profile = context.extensionSettings.connectionManager?.profiles?.find(
            (p) => p.id === settings.profileId,
          );
          if (!profile) {
            st_echo('warning', 'Connection profile not found.');
            return;
          }

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
            targetCharacterId: targetCharacterId,
          };

          // Add message range options if character/group is selected
          if (!avatar) {
            buildPromptOptions.messageIndexesBetween = { start: -1, end: -1 };
          } else {
            switch (settings.contextToSend.messages.type) {
              case 'none':
                buildPromptOptions.messageIndexesBetween = { start: -1, end: -1 };
                break;
              case 'first':
                buildPromptOptions.messageIndexesBetween = {
                  start: 0,
                  end: settings.contextToSend.messages.first ?? 10,
                };
                break;
              case 'last':
                const lastCount = settings.contextToSend.messages.last ?? 10;
                const chatLength = context.chat?.length ?? 0;
                buildPromptOptions.messageIndexesBetween = {
                  end: Math.max(0, chatLength - 1),
                  start: Math.max(0, chatLength - lastCount),
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
                // No need to set messageIndexesBetween, defaults to all
                break;
            }
          }

          const resultingEntries = await runWorldInfoRecommendation({
            profileId: settings.profileId,
            userPrompt: prompt,
            buildPromptOptions: buildPromptOptions,
            contextToSend: settings.contextToSend,
            session: activeSession,
            entriesGroupByWorldName: entriesGroupByWorldName,
            promptSettings: {
              stWorldInfoPrompt: settings.stWorldInfoPrompt,
              lorebookDefinitionPrompt: settings.lorebookDefinitionPrompt,
              responseRulesPrompt: settings.responseRulesPrompt,
              lorebookRulesPrompt: settings.lorebookRulesPrompt,
            },
            maxResponseToken: settings.maxResponseToken,
          });

          if (Object.keys(resultingEntries).length > 0) {
            // Pass the last world name used during *this specific run* if any individual adds happened before
            applyEntriesToUI(resultingEntries, 'classic');
          } else {
            st_echo('warning', 'No results from AI');
          }
        } catch (error: any) {
          console.error(error);
          st_echo('error', error instanceof Error ? error.message : String(error));
        } finally {
          sendButton.disabled = false;
        }
      });
    });
  });
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
