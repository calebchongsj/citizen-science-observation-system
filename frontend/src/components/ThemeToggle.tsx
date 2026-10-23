import { useTheme } from '../contexts/ThemeContext';

type Props = {
  className?: string;
};

export function ThemeToggle({ className = '' }: Props) {
  const { effectiveTheme, setTheme } = useTheme();

  return (
    <div
      className={`theme-toggle ${className}`.trim()}
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        className={`theme-toggle__option ${effectiveTheme === 'light' ? 'active' : ''}`}
        onClick={() => setTheme('light')}
        aria-pressed={effectiveTheme === 'light'}
      >
        Light
      </button>
      <button
        type="button"
        className={`theme-toggle__option ${effectiveTheme === 'dark' ? 'active' : ''}`}
        onClick={() => setTheme('dark')}
        aria-pressed={effectiveTheme === 'dark'}
      >
        Dark
      </button>
    </div>
  );
}
