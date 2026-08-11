
import React, { createContext, useState, useEffect, useContext } from 'react';

type Theme = 'light' | 'dark' | 'glass';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void; // Keeping for backward compatibility temporarily
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'glass') {
      return savedTheme as Theme;
    }
    // Fallback to system preference if no theme is saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    // Clear all theme classes first
    root.classList.remove('dark', 'glass');
    
    // Apply selected theme class
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'glass') {
      root.classList.add('glass');
      // For some components that rely on dark mode styling internally, we might also want to add dark class when glass is active
      // But let's keep it strictly 'glass' to allow the CSS to handle both light and dark backgrounds inside glass.
    }
    
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
