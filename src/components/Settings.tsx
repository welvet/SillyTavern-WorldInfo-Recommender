import React, { FC, useState, useMemo, useCallback } from 'react';
import { st_echo } from 'sillytavern-utils-lib/config';
import {
  PresetItem,
  SortableListItemData,
  STButton,
  STPresetSelect,
  STSortableList,
  STTextarea,
} from 'sillytavern-utils-lib/components';

import {
  convertToVariableName,
  DEFAULT_PROMPT_CONTENTS,
  DEFAULT_SETTINGS,
  ExtensionSettings,
  MainContextPromptBlock,
  MainContextTemplatePreset,
  MessageRole,
  PromptSetting,
  settingsManager,
  SYSTEM_PROMPT_KEYS,
} from '../settings.js';

const globalContext = SillyTavern.getContext();

/**
 * A React component to manage the World Info Recommender settings UI.
 * This component replaces the vanilla TS setup script.
 */
export const WorldInfoRecommenderSettings: FC = () => {
  // --- State Management ---
  const [settings, setSettings] = useState<ExtensionSettings>(() => settingsManager.getSettings());
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<string>(SYSTEM_PROMPT_KEYS[0]);

  // Centralized function to update state and persist settings
  const updateSettings = useCallback(
    (newSettings: ExtensionSettings) => {
      setSettings(newSettings);
      // This is a bit of a hack to sync with the manager. A better approach
      // would be for the manager to accept the new settings object directly.
      // For now, we'll update key by key if needed.
      Object.assign(settingsManager.getSettings(), newSettings);
      settingsManager.saveSettings();
    },
    [settingsManager],
  );

  // --- Derived Data for UI (Memoized for performance) ---
  const mainContextPresetItems = useMemo(
    (): PresetItem[] =>
      Object.keys(settings.mainContextTemplatePresets).map((key) => ({
        value: key,
        label: key,
      })),
    [settings.mainContextTemplatePresets],
  );

  const systemPromptItems = useMemo(
    (): PresetItem[] =>
      Object.keys(settings.prompts).map((key) => {
        const prompt = settings.prompts[key];
        return {
          value: key,
          label: prompt ? `${prompt.label} (${key})` : key,
        };
      }),
    [settings.prompts],
  );

  const mainContextListItems = useMemo((): SortableListItemData[] => {
    const preset = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset];
    if (!preset) return [];
    return preset.prompts.map((prompt) => {
      const promptSetting = settings.prompts[prompt.promptName];
      const label = promptSetting ? `${promptSetting.label} (${prompt.promptName})` : prompt.promptName;
      return {
        id: prompt.promptName,
        label,
        enabled: prompt.enabled,
        selectValue: prompt.role,
        selectOptions: [
          { value: 'user', label: 'User' },
          { value: 'assistant', label: 'Assistant' },
          { value: 'system', label: 'System' },
        ],
      };
    });
  }, [settings.mainContextTemplatePreset, settings.mainContextTemplatePresets, settings.prompts]);

  // --- Handlers for Main Context Template ---
  const handleMainContextPresetChange = (newValue?: string) => {
    updateSettings({ ...settings, mainContextTemplatePreset: newValue ?? 'default' });
  };

  const handleMainContextPresetsChange = (newItems: PresetItem[]) => {
    const newPresets: Record<string, MainContextTemplatePreset> = {};
    const oldPresets = settings.mainContextTemplatePresets;
    const oldKeys = Object.keys(oldPresets);
    const newKeys = newItems.map((item) => item.value);

    // Copy existing or cloned presets
    for (const item of newItems) {
      if (oldPresets[item.value]) {
        newPresets[item.value] = oldPresets[item.value];
      } else {
        // This is a new item, clone the current or default
        const currentPreset = oldPresets[settings.mainContextTemplatePreset] ?? oldPresets['default'];
        newPresets[item.value] = structuredClone(currentPreset);
      }
    }

    // Handle renames by finding the missing old key
    if (newKeys.length === oldKeys.length && newKeys.length > 0) {
      const renamedOldKey = oldKeys.find((k) => !newKeys.includes(k));
      const renamedNewKey = newKeys.find((k) => !oldKeys.includes(k));
      if (renamedOldKey && renamedNewKey) {
        newPresets[renamedNewKey] = oldPresets[renamedOldKey];
      }
    }

    updateSettings({ ...settings, mainContextTemplatePresets: newPresets });
  };

  const handleMainContextListChange = (newListItems: SortableListItemData[]) => {
    const newPrompts: MainContextPromptBlock[] = newListItems.map((item) => ({
      promptName: item.id,
      enabled: item.enabled,
      role: (item.selectValue as MessageRole) ?? 'user',
    }));
    const newSettings = structuredClone(settings);
    newSettings.mainContextTemplatePresets[settings.mainContextTemplatePreset].prompts = newPrompts;
    updateSettings(newSettings);
  };

  const handleRestoreMainContextDefault = async () => {
    const confirm = await globalContext.Popup.show.confirm('Restore default', 'Are you sure?');
    if (!confirm) return;

    const newSettings = structuredClone(settings);
    newSettings.mainContextTemplatePresets['default'] = structuredClone(
      DEFAULT_SETTINGS.mainContextTemplatePresets['default'],
    );
    newSettings.mainContextTemplatePreset = 'default';
    updateSettings(newSettings);
  };

  // --- Handlers for System Prompts ---
  const handleSystemPromptsChange = (newItems: PresetItem[]) => {
    const newPrompts: Record<string, PromptSetting> = {};
    const oldPrompts = settings.prompts;
    const newSettings = structuredClone(settings);

    // Handle deletions
    const deletedKeys = Object.keys(oldPrompts).filter((key) => !newItems.some((item) => item.value === key));
    for (const key of deletedKeys) {
      // Remove from all main context presets
      Object.values(newSettings.mainContextTemplatePresets).forEach((preset) => {
        preset.prompts = preset.prompts.filter((p) => p.promptName !== key);
      });
    }

    // Rebuild prompts list
    for (const item of newItems) {
      newPrompts[item.value] = oldPrompts[item.value] ?? { content: '', isDefault: false, label: item.label };
    }

    // @ts-expect-error Type 'Record<string, PromptSetting>' is missing the following properties from type
    newSettings.prompts = newPrompts;
    updateSettings(newSettings);
  };

  const handleSystemPromptCreate = (value: string) => {
    const variableName = convertToVariableName(value);
    if (!variableName) {
      st_echo('error', `Invalid prompt name: ${value}`);
      return { confirmed: false };
    }
    if (settings.prompts[variableName]) {
      st_echo('error', `Prompt name already exists: ${variableName}`);
      return { confirmed: false };
    }

    const newSettings = structuredClone(settings);
    newSettings.prompts[variableName] = {
      content: settings.prompts[selectedSystemPrompt]?.content ?? '',
      isDefault: false,
      label: value,
    };
    Object.values(newSettings.mainContextTemplatePresets).forEach((preset) => {
      preset.prompts.push({ enabled: true, promptName: variableName, role: 'user' });
    });

    updateSettings(newSettings);
    setSelectedSystemPrompt(variableName);
    return { confirmed: true, value: variableName };
  };

  const handleSystemPromptRename = (oldValue: string, newValue: string) => {
    const variableName = convertToVariableName(newValue);
    if (!variableName) {
      st_echo('error', `Invalid prompt name: ${newValue}`);
      return { confirmed: false };
    }
    if (settings.prompts[variableName]) {
      st_echo('error', `Prompt name already exists: ${variableName}`);
      return { confirmed: false };
    }

    const newSettings = structuredClone(settings);
    newSettings.prompts[variableName] = { ...newSettings.prompts[oldValue], label: newValue };
    delete newSettings.prompts[oldValue];

    Object.values(newSettings.mainContextTemplatePresets).forEach((preset) => {
      preset.prompts.forEach((p) => {
        if (p.promptName === oldValue) {
          p.promptName = variableName;
        }
      });
    });

    updateSettings(newSettings);
    setSelectedSystemPrompt(variableName);
    return { confirmed: true, value: variableName };
  };

  const handleSystemPromptContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const newSettings = structuredClone(settings);
    const prompt = newSettings.prompts[selectedSystemPrompt];
    if (prompt) {
      prompt.content = newContent;
      // @ts-ignore
      prompt.isDefault = SYSTEM_PROMPT_KEYS.includes(selectedSystemPrompt)
        ? // @ts-ignore
          DEFAULT_PROMPT_CONTENTS[selectedSystemPrompt] === newContent
        : false;
      updateSettings(newSettings);
    }
  };

  const handleRestoreSystemPromptDefault = async () => {
    const prompt = settings.prompts[selectedSystemPrompt];
    if (!prompt) return st_echo('warning', 'No prompt selected.');

    const confirm = await globalContext.Popup.show.confirm('Restore Default', `Restore default for "${prompt.label}"?`);
    if (confirm) {
      const newSettings = structuredClone(settings);
      // @ts-ignore
      newSettings.prompts[selectedSystemPrompt].content = DEFAULT_PROMPT_CONTENTS[selectedSystemPrompt];
      updateSettings(newSettings);
    }
  };

  // --- Reset Handler ---
  const handleResetEverything = async () => {
    const confirm = await globalContext.Popup.show.confirm('Reset Everything', 'Are you sure? This cannot be undone.');
    if (confirm) {
      settingsManager.resetSettings();
      setTimeout(() => {
        st_echo('success', 'Settings reset. Please reload the page.');
        // Optionally, force a state reset to the new defaults without a reload
        setSettings(structuredClone(DEFAULT_SETTINGS));
      }, 1500);
    }
  };

  const selectedPromptContent = settings.prompts[selectedSystemPrompt]?.content ?? '';
  // @ts-ignore
  const isDefaultSystemPromptSelected = SYSTEM_PROMPT_KEYS.includes(selectedSystemPrompt);

  return (
    <div className="world-info-recommender-settings">
      <div style={{ marginTop: '10px' }}>
        <div className="title_restorable">
          <span>Main Context Template</span>
          <STButton
            className="fa-solid fa-undo"
            title="Restore main context template to default"
            onClick={handleRestoreMainContextDefault}
          />
        </div>
        <STPresetSelect
          label="Template"
          items={mainContextPresetItems}
          value={settings.mainContextTemplatePreset}
          readOnlyValues={['default']}
          onChange={handleMainContextPresetChange}
          onItemsChange={handleMainContextPresetsChange}
          enableCreate
          enableRename
          enableDelete
        />
        <div style={{ marginTop: '5px' }}>
          <STSortableList
            items={mainContextListItems}
            onItemsChange={handleMainContextListChange}
            showSelectInput
            showToggleButton
          />
        </div>
      </div>

      <hr style={{ margin: '10px 0' }} />

      <div style={{ marginTop: '10px' }}>
        <div className="title_restorable">
          <span>Prompt Templates</span>
          {isDefaultSystemPromptSelected && (
            <STButton
              className="fa-solid fa-undo"
              title="Restore selected prompt to default"
              onClick={handleRestoreSystemPromptDefault}
            />
          )}
        </div>
        <STPresetSelect
          label="Prompt"
          items={systemPromptItems}
          value={selectedSystemPrompt}
          readOnlyValues={SYSTEM_PROMPT_KEYS}
          onChange={(newValue) => setSelectedSystemPrompt(newValue ?? '')}
          onItemsChange={handleSystemPromptsChange}
          enableCreate
          enableRename
          enableDelete
          onCreate={handleSystemPromptCreate}
          onRename={handleSystemPromptRename}
        />
        <STTextarea
          value={selectedPromptContent}
          onChange={handleSystemPromptContentChange}
          placeholder="Edit the selected system prompt template here..."
          rows={6}
          style={{ marginTop: '5px', width: '100%' }}
        />
      </div>

      <hr style={{ margin: '15px 0' }} />

      <div style={{ textAlign: 'center', marginTop: '15px' }}>
        <STButton className="danger_button" style={{ width: 'auto' }} onClick={handleResetEverything}>
          <i style={{ marginRight: '10px' }} className="fa-solid fa-triangle-exclamation" />I messed up, reset
          everything
        </STButton>
      </div>
    </div>
  );
};
