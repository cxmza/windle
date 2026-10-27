import { createContext } from 'react';

/** Whether the desktop sidebar is collapsed, for content that compensates for it outside CSS (the 3D camera). */
export const SidebarCollapsedContext = createContext(false);
