import { buildPrompt, buildPresetSelect, ExtensionSettingsManager } from 'sillytavern-utils-lib';
import {
  characters,
  selected_group,
  st_echo,
  st_runCommandCallback,
  system_avatar,
  systemUserName,
} from 'sillytavern-utils-lib/config';
import { ChatCompletionMessage, ChatMessage, EventNames, ExtractedData } from 'sillytavern-utils-lib/types';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';

const extensionName = 'SillyTavern-WorldInfo-Recommender';
const VERSION = '0.1.0';
const FORMAT_VERSION = 'F_1.0';
const globalContext = SillyTavern.getContext();

const KEYS = {
  EXTENSION: 'worldInfoRecommender',
} as const;

interface ContextToSend {
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

    const lastMessagesCheckbox = container.find('#worldInfoRecommend_lastMessages');
    const charCardCheckbox = container.find('#worldInfoRecommend_charCard');
    const authorNoteCheckbox = container.find('#worldInfoRecommend_authorNote');
    const worldInfoCheckbox = container.find('#worldInfoRecommend_worldInfo');

    lastMessagesCheckbox.prop('checked', settings.contextToSend.lastMessages);
    charCardCheckbox.prop('checked', settings.contextToSend.charCard);
    authorNoteCheckbox.prop('checked', settings.contextToSend.authorNote);
    worldInfoCheckbox.prop('checked', settings.contextToSend.worldInfo);

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
      const prompt = container.find('#worldInfoRecommend_prompt').val();
      if (!prompt) {
        return;
      }

      if (!settings.profileId) {
        return;
      }

      const messages: ChatCompletionMessage[] = [];
      if (settings.contextToSend.lastMessages) {
        const context = SillyTavern.getContext();
        const profile = context.extensionSettings.connectionManager?.profiles?.find(
          (profile) => profile.id === settings.profileId,
        );
        const presetName = profile?.preset;
        const contextName = profile?.context;
        const instructName = profile?.instruct;
        const syspromptName = profile?.sysprompt;
        messages.push(
          ...(await buildPrompt(settings.profileId, undefined, undefined, {
            presetName,
            contextName,
            instructName,
            syspromptName,
          })),
        );
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
