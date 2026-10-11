export interface SceneBridge {
  hovered: string | null;
  focused: string | null;
  selected: string | null;
  cover: { right: number; bottom: number; top: number };
  lastInput: number;
  wake: () => void;
}

export function createSceneBridge(): SceneBridge {
  return {
    hovered: null,
    focused: null,
    selected: null,
    cover: { right: 0, bottom: 0, top: 0 },
    lastInput: typeof performance === 'undefined' ? 0 : performance.now(),
    wake: () => {},
  };
}

export function poke(bridge: SceneBridge) {
  bridge.lastInput = performance.now();
  bridge.wake();
}
