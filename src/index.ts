import {
  buildFancyDropdown,
  buildPrompt,
  BuildPromptOptions,
  ExtensionSettingsManager,
  getActiveWorldInfo,
} from 'sillytavern-utils-lib';
import {
  selected_group,
  st_createWorldInfoEntry,
  st_echo,
  st_updateEditor,
  this_chid,
} from 'sillytavern-utils-lib/config';
import { ChatCompletionMessage, ExtractedData } from 'sillytavern-utils-lib/types';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';
import { DEFAULT_ST_DESCRIPTION } from './constants.js';
import { DEFAULT_XML_DESCRIPTION, parseXMLOwn } from './xml.js';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

const extensionName = 'SillyTavern-WorldInfo-Recommender';
const VERSION = '0.1.0';
const FORMAT_VERSION = 'F_1.0';
const globalContext = SillyTavern.getContext();

const KEYS = {
  EXTENSION: 'worldInfoRecommender',
} as const;

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
  responseRulesPrompt: string;
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
  responseRulesPrompt: DEFAULT_XML_DESCRIPTION,
};

const settingsManager = new ExtensionSettingsManager<ExtensionSettings>(KEYS.EXTENSION, DEFAULT_SETTINGS);

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

  const responseRulesPromptContainer = settingsContainer.find('.responseRulesPrompt');
  const responseRulesPromptContainerTextarea = responseRulesPromptContainer.find('textarea');

  stWorldInfoPromptContainerTextarea.val(settings.stWorldInfoPrompt);
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
    settingsManager.saveSettings();
  });
  responseRulesPromptContainerTextarea.on('change', () => {
    settings.responseRulesPrompt = responseRulesPromptContainerTextarea.val() ?? '';
    settingsManager.saveSettings();
  });

  const popupIconHtml = `<div class="menu_button fa-brands fa-wpexplorer interactable" title="World Info Recommender"></div>`;
  const popupIcon = $(popupIconHtml);
  $('.form_create_bottom_buttons_block').prepend(popupIcon);
  popupIcon.on('click', async () => {
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

    const stDescriptionCheckbox = popupContainer.find('#worldInfoRecommend_stDescription');
    const messagesContainer = popupContainer.find('.message-options');
    const charCardCheckbox = popupContainer.find('#worldInfoRecommend_charCard');
    const authorNoteCheckbox = popupContainer.find('#worldInfoRecommend_authorNote');
    const worldInfoCheckbox = popupContainer.find('#worldInfoRecommend_worldInfo');

    stDescriptionCheckbox.prop('checked', settings.contextToSend.stDescription);
    charCardCheckbox.prop('checked', settings.contextToSend.charCard);
    authorNoteCheckbox.prop('checked', settings.contextToSend.authorNote);
    worldInfoCheckbox.prop('checked', settings.contextToSend.worldInfo);
    const entriesGroupByWorldName = await getActiveWorldInfo(['all'], this_chid);
    const allWorldNames = Object.keys(entriesGroupByWorldName);
    let selectedWorldNames = structuredClone(allWorldNames);
    buildFancyDropdown('#worldInfoRecommend_worldInfoContainer', {
      label: 'World Info',
      initialList: allWorldNames,
      initialValues: selectedWorldNames,
      onSelectChange(_previousValues, newValues) {
        selectedWorldNames = newValues;
      },
    });

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
      const value = maxTokens.val() as number;
      settings.maxContextValue = value;
      settingsManager.saveSettings();
    });

    const maxResponseTokens = popupContainer.find('#worldInfoRecommend_maxResponseTokens');
    maxResponseTokens.val(settings.maxResponseToken);
    maxResponseTokens.on('change', () => {
      const value = maxResponseTokens.val() as number;
      settings.maxResponseToken = value;
      settingsManager.saveSettings();
    });

    let suggestedEntries: Record<string, WIEntry[]> = {};
    const blackListedEntries: string[] = [];
    const sendButton = popupContainer.find('#worldInfoRecommend_sendPrompt');
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

        let prompt = popupContainer.find('#worldInfoRecommend_prompt').val() as string;
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
              end: -1, // -1 means from the end
              start: -lastCount,
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
          if (allWorldNames.length > 0) {
            let worldInfoPrompt = '';
            Object.entries(entriesGroupByWorldName).forEach(([worldName, entries]) => {
              if (!selectedWorldNames.includes(worldName)) {
                return;
              }
              if (entries.length > 0) {
                worldInfoPrompt += `# WORLD NAME: ${worldName}\n`;
                entries.forEach((entry) => {
                  worldInfoPrompt += `## (NAME: ${entry.comment}) (ID: ${entry.uid})\n`;
                  worldInfoPrompt += `Triggers: ${entry.key.join(', ')}\n`;
                  worldInfoPrompt += `Content: ${entry.content}\n\n`;
                });
                worldInfoPrompt += '\n\n';
              }
            });

            if (worldInfoPrompt) {
              messages.push({
                role: 'assistant',
                content: `=== CURRENT LOREBOOKS ===\n${worldInfoPrompt}`,
              });
            }
          }
        }

        if (blackListedEntries.length > 0) {
          let blackListPrompt = '# Blacklisted Entries:\n';
          blackListedEntries.forEach((entry) => {
            blackListPrompt += `- ${entry}\n`;
          });
          messages.push({
            role: 'system',
            content: blackListPrompt,
          });
        }

        if (Object.keys(suggestedEntries).length > 0) {
          const anySuggested = Object.values(suggestedEntries).some((entries) => entries.length > 0);
          if (anySuggested) {
            let suggestedPromptrompt = '# Already suggested entries:\n';
            Object.entries(suggestedEntries).forEach(([worldName, entries]) => {
              if (entries.length > 0) {
                suggestedPromptrompt += `## WORLD NAME: ${worldName}\n`;
                entries.forEach((entry) => {
                  suggestedPromptrompt += `- (NAME: ${entry.comment}) (ID: ${entry.uid})\n`;
                  suggestedPromptrompt += `Triggers: ${entry.key.join(', ')}\n`;
                  suggestedPromptrompt += `Content: ${entry.content}\n\n`;
                });
              }
            });

            messages.push({
              role: 'system',
              content: suggestedPromptrompt,
            });
          }
        }

        const userPrompt = `${settings.responseRulesPrompt}\n\n${prompt}`;
        messages.push({
          role: 'user',
          content: userPrompt,
        });

        const response = (await globalContext.ConnectionManagerRequestService.sendRequest(
          profile.id,
          messages,
          settings.maxResponseToken,
        )) as ExtractedData;
        console.log(response.content);
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
        console.log(entries);

        const suggestedEntriesContainer = popupContainer.find('#worldInfoRecommend_suggestedEntries');
        const entryTemplate = popupContainer.find('#worldInfoRecommend_entryTemplate');
        if (!entryTemplate) {
          return;
        }
        Object.entries(entries).forEach(([worldName, entries]) => {
          entries.forEach((entry) => {
            if (!suggestedEntries[worldName]) {
              suggestedEntries[worldName] = [];
            }

            const existingEntry = suggestedEntries[worldName].find(
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

            node.find('.worldName').text(worldName);
            node.find('.comment').text(entry.comment);
            node.find('.key').text(entry.key.join(', '));
            node.find('.content').text(entry.content);
            if (!existingEntry) {
              suggestedEntries[worldName].push(entry);
              suggestedEntriesContainer.append(node);
            } else {
              existingEntry.key = entry.key;
              existingEntry.content = entry.content;
              existingEntry.comment = entry.comment;
            }
          });
        });

        function remove(entry: JQuery<HTMLDivElement>, blacklist: boolean) {
          const worldName = entry.data('world-name');
          const id = entry.data('id');
          const comment = entry.data('comment');
          if (!entry || !worldName || id === null || id === undefined || !comment) {
            return;
          }
          if (blacklist) {
            blackListedEntries.push(`${worldName} (${comment})`);
          }
          suggestedEntries[worldName] = suggestedEntries[worldName].filter((e) => e.uid !== parseInt(id));
          entry.remove();
        }

        suggestedEntriesContainer.find('.blacklist').on('click', (e) => {
          const entry: JQuery<HTMLDivElement> | null = $(e.currentTarget).closest('.entry');
          if (!entry) {
            return;
          }

          remove(entry, true);
        });

        suggestedEntriesContainer.find('.remove').on('click', (e) => {
          const entry: JQuery<HTMLDivElement> | null = $(e.currentTarget).closest('.entry');
          if (!entry) {
            return;
          }

          remove(entry, false);
        });

        const addButton = suggestedEntriesContainer.find('.add');
        let lastSelectedWorldName: string | null = null;
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
              return;
            }
            const suggestedEntry = structuredClone(suggestedEntries[worldName].find((e) => e.uid === parseInt(id)));
            if (!suggestedEntry) {
              return;
            }

            // If world doesn't exist, let user select one
            if (!entriesGroupByWorldName[worldName]) {
              let selectedWorld = lastSelectedWorldName ?? '';

              const div = document.createElement('div');
              const selectElement = document.createElement('select');
              selectElement.id = 'worldInfoRecommend_worldSelection';
              allWorldNames.forEach((worldName) => {
                const option = document.createElement('option');
                option.value = allWorldNames.indexOf(worldName).toString();
                option.text = worldName;
                selectElement.appendChild(option);
              });
              const infoElement = document.createElement('p');
              infoElement.innerText = "LLM couldn't find a world for this entry. Please select one.";
              div.appendChild(infoElement);
              div.appendChild(selectElement);

              let result = globalContext.callGenericPopup($(div).html(), POPUP_TYPE.CONFIRM);
              const addedSelectElement = $('#worldInfoRecommend_worldSelection');
              addedSelectElement.val(lastSelectedWorldName ? allWorldNames.indexOf(lastSelectedWorldName) : 0);
              addedSelectElement.on('change', () => {
                selectedWorld = allWorldNames[parseInt((addedSelectElement.val() as string) ?? '0')];
              });
              // @ts-ignore
              result = await result;
              // @ts-ignore
              if (result && selectedWorld) {
                worldName = selectedWorld;
              } else {
                st_echo('warning', 'No world selected');
                return;
              }
            }

            lastSelectedWorldName = worldName;
            const existingEntry = entriesGroupByWorldName[worldName]?.find((e) => e.uid === suggestedEntry.uid);

            remove(entry, false);

            const stFormat: { entries: Record<number, WIEntry> } = {
              entries: {},
            };
            for (const entry of entriesGroupByWorldName[worldName]) {
              stFormat.entries[entry.uid] = entry;
            }

            let targetEntry: WIEntry | undefined;
            const isUpdate = !!existingEntry;

            if (isUpdate) {
              targetEntry = existingEntry;
            } else {
              const values = Object.values(stFormat.entries);
              const lastEntry = values.length > 0 ? values[values.length - 1] : undefined;
              targetEntry = st_createWorldInfoEntry(worldName, stFormat);
              if (!targetEntry) {
                st_echo('error', 'Failed to create entry');
                return;
              }

              const newId = targetEntry.uid;
              if (lastEntry) {
                Object.assign(targetEntry, lastEntry);
              }
              targetEntry.uid = newId;
            }

            // Update entry properties
            targetEntry.key = suggestedEntry.key;
            targetEntry.content = suggestedEntry.content;
            targetEntry.comment = suggestedEntry.comment;

            // Save and update UI
            await globalContext.saveWorldInfo(worldName, stFormat);
            entriesGroupByWorldName[worldName] = Object.values(stFormat.entries);
            st_updateEditor(targetEntry.uid, $('#WorldInfo').is(':visible'), stFormat);
            st_echo('success', isUpdate ? 'Entry updated' : 'Entry added');
          } catch (error: any) {
            console.error(error);
            st_echo('error', error instanceof Error ? error.message : error);
          } finally {
            addButton.prop('disabled', false);
          }
        });
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

  return true;
}

function main() {
  handleUIChanges();
  initializeEvents();
}

if (!stagingCheck()) {
  const errorStr = '[World Info Recommender Error] Make sure you are on staging branch and staging is updated.';
  st_echo('error', errorStr);
} else {
  settingsManager
    .initializeSettings()
    .then((_result) => {
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
