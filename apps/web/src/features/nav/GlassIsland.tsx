import { type ComponentPropsWithoutRef, type CSSProperties, useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/lib/use-media-query';
import { LiquidGlassDefs, useLensMap } from './LiquidGlassDefs';

const LENS_QUERY = '(min-width: 48rem) and (hover: hover) and (pointer: fine)';

type GlassStyle = CSSProperties & { '--glass-lens'?: string };

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setSize((prev) =>
        prev.width === el.offsetWidth && prev.height === el.offsetHeight
          ? prev
          : { width: el.offsetWidth, height: el.offsetHeight },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

/**
 * A pill of thick liquid glass. Its first child is the glass layer (backdrop blur, rim, sheen; in Chromium on a fine
 * pointer also an SVG refraction map built for this island's measured size). Content sits above it.
 */
export function GlassIsland({ className, children, ...props }: ComponentPropsWithoutRef<'div'>) {
  const id = `lens-${useId().replace(/\W/g, '')}`;
  const { ref, width, height } = useBoxSize<HTMLDivElement>();
  const finePointer = useMediaQuery(LENS_QUERY);
  const href = useLensMap(width, height, finePointer);
  const style: GlassStyle | undefined = href ? { '--glass-lens': `url(#${id})` } : undefined;
  return (
    <div ref={ref} data-dock-island className={cn('relative rounded-full', className)} {...props}>
      <span data-glass aria-hidden="true" data-lens={href ? '' : undefined} style={style} />
      {href && <LiquidGlassDefs id={id} href={href} width={width} height={height} />}
      {children}
    </div>
  );
}
