import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme, ThemeProvider } from '@/shared/theme';
import { ToastProvider } from '@/shared/ui';
import '@/shared/styles/globals.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

initTheme();
createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
