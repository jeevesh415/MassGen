/**
 * AgentMentionAutocomplete Component
 *
 * Provides @mention autocomplete for broadcasting to agents.
 * Triggered when user types @ followed by a prefix in the input.
 * Supports keyboard navigation (ArrowUp/Down, Tab/Enter, Escape).
 */

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useAgentStore } from '../../../stores/agentStore';

export interface AgentMentionAutocompleteHandle {
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

interface AgentMentionAutocompleteProps {
  inputValue: string;
  onSelect: (mention: string) => void;
  enabled?: boolean;
}

export const AgentMentionAutocomplete = forwardRef<
  AgentMentionAutocompleteHandle,
  AgentMentionAutocompleteProps
>(function AgentMentionAutocomplete({ inputValue, onSelect, enabled = true }, ref) {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const agentOrder = useAgentStore((s) => s.agentOrder);

  // Parse @mention trigger from end of input
  const parseMention = useCallback(
    (value: string): { prefix: string; atPos: number } | null => {
      // Find @ at the end of the string (possibly with a partial name after it)
      const match = value.match(/@(\w*)$/);
      if (!match) return null;
      const atPos = value.length - match[0].length;
      return { prefix: match[1].toLowerCase(), atPos };
    },
    [],
  );

  // Update filtered options when input changes
  useEffect(() => {
    if (!enabled || agentOrder.length === 0) {
      setIsVisible(false);
      return;
    }

    const mention = parseMention(inputValue);
    if (!mention) {
      setIsVisible(false);
      return;
    }

    const allOptions = ['all', ...agentOrder];
    const filtered = mention.prefix
      ? allOptions.filter((o) => o.toLowerCase().startsWith(mention.prefix))
      : allOptions;

    setFilteredOptions(filtered);
    setSelectedIndex(0);
    setIsVisible(filtered.length > 0);
  }, [inputValue, enabled, agentOrder, parseMention]);

  const handleSelect = useCallback(
    (option: string) => {
      const mention = parseMention(inputValue);
      if (!mention) return;

      // Replace @prefix with @option + trailing space
      const before = inputValue.substring(0, mention.atPos);
      onSelect(`${before}@${option} `);
      setIsVisible(false);
    },
    [inputValue, onSelect, parseMention],
  );

  // Expose keyboard handler to parent
  useImperativeHandle(
    ref,
    () => ({
      handleKeyDown: (e: React.KeyboardEvent): boolean => {
        if (!isVisible || filteredOptions.length === 0) return false;

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % filteredOptions.length);
            return true;

          case 'ArrowUp':
            e.preventDefault();
            setSelectedIndex(
              (prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length,
            );
            return true;

          case 'Tab':
          case 'Enter':
            e.preventDefault();
            if (filteredOptions[selectedIndex]) {
              handleSelect(filteredOptions[selectedIndex]);
            }
            return true;

          case 'Escape':
            e.preventDefault();
            setIsVisible(false);
            return true;

          default:
            return false;
        }
      },
    }),
    [isVisible, filteredOptions, selectedIndex, handleSelect],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (dropdownRef.current && filteredOptions.length > 0) {
      const selected = dropdownRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredOptions.length]);

  if (!isVisible) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-v2-surface-raised border border-v2-border rounded-v2-card shadow-lg overflow-hidden max-h-48 overflow-y-auto v2-scrollbar z-50"
    >
      <div className="py-1">
        {filteredOptions.map((option, index) => {
          const isSelected = index === selectedIndex;
          const isAll = option === 'all';

          return (
            <div
              key={option}
              data-index={index}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`
                flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm
                ${isSelected ? 'bg-[var(--v2-channel-hover)] text-v2-text' : 'text-v2-text-secondary hover:bg-[var(--v2-channel-hover)]'}
              `}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${isAll ? 'bg-purple-400' : 'bg-v2-online'}`} />
              <span className={isAll ? 'font-medium' : ''}>
                @{option}
              </span>
              {isAll && (
                <span className="text-xs text-v2-text-muted ml-auto">
                  all agents
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
