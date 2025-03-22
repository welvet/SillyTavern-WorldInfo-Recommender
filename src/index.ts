import { buildPrompt, ExtensionSettingsManager, getAllWorldInfo } from 'sillytavern-utils-lib';
import { selected_group, st_echo, this_chid } from 'sillytavern-utils-lib/config';
import { ChatCompletionMessage, ExtractedData } from 'sillytavern-utils-lib/types';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';
import { DEFAULT_ST_DESCRIPTION } from './constants.js';
import { DEFAULT_XML_DESCRIPTION, parseXMLOwn } from './xml.js';

const extensionName = 'SillyTavern-WorldInfo-Recommender';
const VERSION = '0.1.0';
const FORMAT_VERSION = 'F_1.0';
const globalContext = SillyTavern.getContext();

const KEYS = {
  EXTENSION: 'worldInfoRecommender',
} as const;

interface ContextToSend {
  stDescription: boolean;
  lastMessages: boolean;
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
    lastMessages: true,
    charCard: true,
    authorNote: true,
    worldInfo: true,
  },
};

const settingsManager = new ExtensionSettingsManager<ExtensionSettings>(KEYS.EXTENSION, DEFAULT_SETTINGS);

async function handleUIChanges(): Promise<void> {
  // const settingsHtml: string = await globalContext.renderExtensionTemplateAsync(
  //   `third-party/${extensionName}`,
  //   'templates/settings',
  // );
  // $('#extensions_settings').append(settingsHtml);

  // const settingsContainer = $('.worldInfoRecommender_settings');
  // const settings = settingsManager.getSettings();

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

    const settings = settingsManager.getSettings();
    const container = $('#worldInfoRecommenderPopup');

    globalContext.ConnectionManagerRequestService.handleDropdown(
      '#worldInfoRecommenderPopup #worldInfoRecommend_connectionProfile',
      settings.profileId,
      (profile) => {
        settings.profileId = profile?.id ?? '';
        settingsManager.saveSettings();
      },
    );

    const stDescriptionCheckbox = container.find('#worldInfoRecommend_stDescription');
    const lastMessagesCheckbox = container.find('#worldInfoRecommend_lastMessages');
    const charCardCheckbox = container.find('#worldInfoRecommend_charCard');
    const authorNoteCheckbox = container.find('#worldInfoRecommend_authorNote');
    const worldInfoCheckbox = container.find('#worldInfoRecommend_worldInfo');

    stDescriptionCheckbox.prop('checked', settings.contextToSend.stDescription);
    lastMessagesCheckbox.prop('checked', settings.contextToSend.lastMessages);
    charCardCheckbox.prop('checked', settings.contextToSend.charCard);
    authorNoteCheckbox.prop('checked', settings.contextToSend.authorNote);
    worldInfoCheckbox.prop('checked', settings.contextToSend.worldInfo);

    stDescriptionCheckbox.on('change', () => {
      settings.contextToSend.stDescription = stDescriptionCheckbox.prop('checked');
      settingsManager.saveSettings();
    });
    lastMessagesCheckbox.on('change', () => {
      settings.contextToSend.lastMessages = lastMessagesCheckbox.prop('checked');
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

    const maxContextType = container.find('#worldInfoRecommend_maxContextType');
    const maxTokensContainer = container.find('#worldInfoRecommend_maxTokens_container');
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

    const maxTokens = container.find('#worldInfoRecommend_maxTokens');
    maxTokens.val(settings.maxContextValue);
    maxTokens.on('change', () => {
      const value = maxTokens.val() as number;
      settings.maxContextValue = value;
      settingsManager.saveSettings();
    });

    const maxResponseTokens = container.find('#worldInfoRecommend_maxResponseTokens');
    maxResponseTokens.val(settings.maxResponseToken);
    maxResponseTokens.on('change', () => {
      const value = maxResponseTokens.val() as number;
      settings.maxResponseToken = value;
      settingsManager.saveSettings();
    });

    container.find('#worldInfoRecommend_sendPrompt').on('click', async () => {
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

      let prompt = container.find('#worldInfoRecommend_prompt').val() as string;
      if (!prompt) {
        return;
      }
      prompt = globalContext.substituteParams(prompt.trim());
      if (!prompt) {
        return;
      }

      const messages: ChatCompletionMessage[] = [];
      if (settings.contextToSend.lastMessages) {
        const selectedApi = profile.api ? globalContext.CONNECT_API_MAP[profile.api].selected : undefined;
        messages.push(
          ...(await buildPrompt(selectedApi, undefined, undefined, {
            presetName: profile.preset,
            contextName: profile.context,
            instructName: profile.instruct,
            syspromptName: profile.sysprompt,
            ignoreCharacterFields: !!settings.contextToSend.charCard,
            ignoreWorldInfo: true, // We don't need triggered world info here
            ignoreAuthorNote: !!settings.contextToSend.authorNote,
            maxContext:
              settings.maxContextType === 'custom'
                ? settings.maxContextValue
                : settings.maxContextType === 'profile'
                  ? 'preset'
                  : 'active',
            includeNames: !!selected_group,
          })),
        );
      }

      if (settings.contextToSend.stDescription) {
        messages.push({
          role: 'user',
          content: DEFAULT_ST_DESCRIPTION,
        });
      }

      if (settings.contextToSend.worldInfo) {
        const entriesGroupByWorldName = await getAllWorldInfo(['all'], this_chid);
        if (Object.keys(entriesGroupByWorldName).length > 0) {
          let worldInfoPrompt = '';
          Object.entries(entriesGroupByWorldName).forEach(([worldName, entries]) => {
            if (entries.length > 0) {
              worldInfoPrompt += `# WORLD NAME: ${worldName} \n`;
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
              role: 'user',
              content: `=== CURRENT LOREBOOKS === \n${worldInfoPrompt}`,
            });
          }
        }
      }

      messages.push({
        role: 'user',
        content: `${prompt}\n\n${DEFAULT_XML_DESCRIPTION}`,
      });

      const response = (await globalContext.ConnectionManagerRequestService.sendRequest(
        profile.id,
        messages,
        settings.maxResponseToken,
      )) as ExtractedData;
      console.log(response.content);
      const entries = parseXMLOwn(response.content);
      console.log(entries);

      const suggestedEntriesContainer = container.find('#worldInfoRecommend_suggestedEntries');
      const entryTemplate = container.find('#worldInfoRecommend_entryTemplate');
      if (!entryTemplate) {
        return;
      }
      suggestedEntriesContainer.empty();
      Object.entries(entries).forEach(([worldName, entries]) => {
        entries.forEach((entry) => {
          const cloneNode = $(entryTemplate.html());
          cloneNode.find('.worldName').text(worldName);
          cloneNode.find('.comment').text(entry.comment);
          cloneNode.find('.key').text(entry.key.join(', '));
          cloneNode.find('.content').text(entry.content);
          suggestedEntriesContainer.append(cloneNode);
        });
      });
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
