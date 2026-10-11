import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom has no WebGL: the brand panel must stay on its poster (and not log "not implemented").
HTMLCanvasElement.prototype.getContext = () => null;
