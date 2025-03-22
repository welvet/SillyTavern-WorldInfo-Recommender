import { buildPrompt, buildPresetSelect, ExtensionSettingsManager } from 'sillytavern-utils-lib';
import {
  characters,
  selected_group,
  st_echo,
  st_runCommandCallback,
  system_avatar,
  systemUserName,
} from 'sillytavern-utils-lib/config';
import { ChatMessage, EventNames, ExtractedData } from 'sillytavern-utils-lib/types';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';

const extensionName = 'SillyTavern-WorldInfo-Recommender';
const VERSION = '0.1.0';
const FORMAT_VERSION = 'F_1.0';
const globalContext = SillyTavern.getContext();

const KEYS = {
  EXTENSION: 'worldInfoRecommender',
} as const;

interface ExtensionSettings {
  version: string;
  formatVersion: string;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  version: VERSION,
  formatVersion: FORMAT_VERSION,
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
  })

}
function initializeEvents() {
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
        .confirm('Data migration failed. Do you want to reset the World Info Recommender data?', 'World Info Recommender')
        .then((result) => {
          if (result) {
            settingsManager.resetSettings();
            main();
          }
        });
    });
}
