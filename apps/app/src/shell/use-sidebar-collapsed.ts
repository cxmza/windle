import { useState } from 'react';

const KEY = 'windle.sidebar.collapsed';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(collapsed: boolean) {
  try {
    window.localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    // storage blocked: the choice lasts until reload
  }
}

export function useSidebarCollapsed(): [collapsed: boolean, toggle: () => void] {
  const [collapsed, setCollapsed] = useState(read);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    write(next);
  };
  return [collapsed, toggle];
}
