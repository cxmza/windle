import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import { App } from '@/App';
import { AppProviders } from '@/app/providers';
import { preventNativeDrag } from '@/lib/no-native-drag';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

preventNativeDrag();

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
