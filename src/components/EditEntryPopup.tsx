import { FC, useState, useEffect, useMemo, useCallback } from 'react';
import {
  STButton,
  STFancyDropdown,
  STSortableList,
  STTextarea,
  SortableListItemData,
  DropdownItem,
} from 'sillytavern-utils-lib/components';
import { st_runRegexScript } from 'sillytavern-utils-lib/config';
import { RegexScriptData } from 'sillytavern-utils-lib/types/regex';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

const globalContext = SillyTavern.getContext();

interface EditEntryPopupProps {
  entry: WIEntry;
  initialRegexIds: Record<string, Partial<RegexScriptData>>;
}

export const EditEntryPopup: FC<EditEntryPopupProps> = ({ entry, initialRegexIds }) => {
  // --- State ---
  const [allRegexes, setAllRegexes] = useState<RegexScriptData[]>([]);
  const [title, setTitle] = useState(entry.comment);
  const [keywords, setKeywords] = useState(entry.key.join(', '));
  const [content, setContent] = useState(entry.content);

  const [regexListItems, setRegexListItems] = useState<SortableListItemData[]>([]);

  // --- Effects ---
  useEffect(() => {
    // Load all available regex scripts once on mount
    const loadedRegexes = globalContext.extensionSettings.regex ?? [];
    setAllRegexes(loadedRegexes);

    // Initialize the sortable list from the session's regex state
    // @ts-ignore
    const initialItems: SortableListItemData[] = Object.entries(initialRegexIds)
      .map(([id, data]) => {
        const regex = loadedRegexes.find((r) => r.id === id);
        return regex ? { id: regex.id, label: regex.scriptName, enabled: !data.disabled } : null;
      })
      // @ts-ignore
      .filter((item): item is SortableListItemData => item !== null);
    setRegexListItems(initialItems);
  }, [initialRegexIds]);

  // --- Derived Data ---
  const fancyDropdownItems = useMemo(
    (): DropdownItem[] => allRegexes.map((r) => ({ value: r.id, label: r.scriptName })),
    [allRegexes],
  );

  const selectedRegexIds = useMemo(() => regexListItems.map((item) => item.id), [regexListItems]);

  // --- Handlers ---
  const handleSimulate = useCallback(() => {
    let simulatedContent = entry.content; // Start from original content for simulation
    const orderedEnabledItems = regexListItems.filter((item) => item.enabled);

    for (const item of orderedEnabledItems) {
      const regex = allRegexes.find((r) => r.id === item.id);
      if (regex) {
        simulatedContent = st_runRegexScript(regex, simulatedContent);
      }
    }
    setContent(simulatedContent);
  }, [regexListItems, allRegexes, entry.content]);

  const handleRegexSelectionChange = (newIds: string[]) => {
    // Rebuild the list based on the new selection, preserving order and enabled state
    const newItems = newIds
      .map((id) => {
        const existingItem = regexListItems.find((item) => item.id === id);
        if (existingItem) return existingItem;
        const regex = allRegexes.find((r) => r.id === id);
        return regex ? { id: regex.id, label: regex.scriptName, enabled: true } : null;
      })
      .filter((item): item is SortableListItemData => item !== null);
    setRegexListItems(newItems);
  };

  return (
    <div className="edit-popup" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <h3>Edit Suggestion</h3>
      <div>
        <label>Title</label>
        <input type="text" className="text_pole" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label>Keywords (comma-separated)</label>
        <input type="text" className="text_pole" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </div>

      <div>
        <h4>Apply Regex Scripts</h4>
        <STFancyDropdown
          items={fancyDropdownItems}
          value={selectedRegexIds}
          onChange={handleRegexSelectionChange}
          multiple
          enableSearch
          placeholder="Select regex scripts..."
        />
        {regexListItems.length > 0 && (
          <STSortableList
            items={regexListItems}
            onItemsChange={setRegexListItems}
            showToggleButton
            showDeleteButton
            sortableJsOptions={{ style: { marginTop: '10px' } }}
          />
        )}
      </div>

      <STButton onClick={handleSimulate} className="menu_button">
        Simulate Regex
      </STButton>

      <STTextarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        placeholder="Resulting content..."
      />
    </div>
  );
};
