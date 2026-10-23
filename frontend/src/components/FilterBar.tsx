import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FilterGroup {
  key: string;
  label: string;
  options: { key: string; label: string }[];
}

export interface FilterBarProps {
  groups: FilterGroup[];
  activeFilters: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
}

type FilterDropdownProps = {
  group: FilterGroup;
  activeFilters: Set<string>;
  onToggle: (key: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
};

function FilterDropdown({
  group,
  activeFilters,
  onToggle,
  isOpen,
  onToggleOpen,
}: FilterDropdownProps) {
  const selectedCount = group.options.filter((o) => activeFilters.has(o.key)).length;
  const hasSelection = selectedCount > 0;
  const triggerLabel = hasSelection ? `${group.label} · ${selectedCount}` : group.label;

  const triggerClass = [
    'filter-dropdown__trigger',
    'inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium',
    hasSelection ? 'filter-dropdown__trigger--selected' : 'filter-dropdown__trigger--plain',
  ].join(' ');

  return (
    <div className="filter-dropdown relative">
      <button
        type="button"
        className={triggerClass}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={onToggleOpen}
      >
        <span>{triggerLabel}</span>
        <ChevronDown size={16} aria-hidden className="shrink-0 opacity-80" />
      </button>
      {isOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-2 min-w-56 whitespace-nowrap bg-card border border-border rounded-xl shadow-lg py-2 px-1"
          role="listbox"
        >
          {group.options.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted rounded-lg"
            >
              <input
                type="checkbox"
                className="shrink-0 h-4 w-4 accent-green-600 cursor-pointer"
                checked={activeFilters.has(option.key)}
                onChange={() => onToggle(option.key)}
              />
              <span className="text-sm font-normal text-foreground leading-none">{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ groups, activeFilters, onToggle, onClear }: FilterBarProps) {
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openGroupKey === null) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setOpenGroupKey(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [openGroupKey]);

  const handleClear = () => {
    setOpenGroupKey(null);
    onClear();
  };

  return (
    <div className="filter-bar">
      <div ref={rowRef} className="flex flex-wrap items-center gap-3 mb-6">
        {groups.map((group) => (
          <FilterDropdown
            key={group.key}
            group={group}
            activeFilters={activeFilters}
            onToggle={onToggle}
            isOpen={openGroupKey === group.key}
            onToggleOpen={() =>
              setOpenGroupKey((prev) => (prev === group.key ? null : group.key))
            }
          />
        ))}
        {activeFilters.size > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-2 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
