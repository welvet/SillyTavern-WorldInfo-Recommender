import { ExtensionSettingsManager } from 'sillytavern-utils-lib';
import { DEFAULT_ST_DESCRIPTION, DEFAULT_LOREBOOK_DEFINITION, DEFAULT_LOREBOOK_RULES } from './constants.js';
import { ContextToSend } from './generate.js';
import { DEFAULT_XML_DESCRIPTION } from './xml.js';

export const extensionName = 'SillyTavern-WorldInfo-Recommender';
export const VERSION = '0.1.1';
export const FORMAT_VERSION = 'F_1.0';

export const KEYS = {
  EXTENSION: 'worldInfoRecommender',
} as const;

export interface PromptPreset {
  content: string;
}

export interface ExtensionSettings {
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

export const DEFAULT_SETTINGS: ExtensionSettings = {
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
    suggestedEntries: true,
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

export const settingsManager = new ExtensionSettingsManager<ExtensionSettings>(KEYS.EXTENSION, DEFAULT_SETTINGS);
