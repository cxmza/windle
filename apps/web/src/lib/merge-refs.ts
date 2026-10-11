import type { Ref, RefCallback } from 'react';

/** Combine a local ref with a ref passed through props (React 19: ref is a prop). */
export function mergeRefs<T>(...refs: ReadonlyArray<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    const cleanups = refs.map((ref) => {
      if (typeof ref === 'function') {
        const cleanup = ref(node);
        return typeof cleanup === 'function' ? cleanup : () => ref(null);
      }
      if (ref) {
        ref.current = node;
        return () => {
          ref.current = null;
        };
      }
      return () => {};
    });
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  };
}
