import { CaChip, SocialLinks, socialEntries, useTokenCa } from '@windle/brand';
import { GlassIsland } from './GlassIsland';

const DEV = import.meta.env.DEV;

const iconClass = 'text-(color:--nav-text) [@media(hover:hover)]:hover:text-foreground active:text-foreground';

/**
 * Social links and the token CA beside the bar. Both are glass islands marked `data-dock-early`: they fade in right
 * away instead of waiting for `--dock-enter-delay`, so they are on screen (and clickable) during the intro.
 * [data-dock-socials] the icon island (from sm up; below sm the mobile sheet carries them), [data-dock-ca] the chip
 * island, tucked under the bar's right edge at every width (it only renders once a CA is configured).
 */
export function DockSocials() {
  const ca = useTokenCa(DEV);
  return (
    <>
      {socialEntries(DEV).length > 0 && (
        <GlassIsland
          data-dock-early
          data-dock-socials
          className="hidden h-full items-center justify-self-end p-1.5 sm:flex"
        >
          <SocialLinks size="md" showPlaceholders={DEV} linkClassName={iconClass} />
        </GlassIsland>
      )}
      {ca !== null && (
        <GlassIsland data-dock-early data-dock-ca className="absolute top-full right-0 mt-2 flex items-center p-1">
          <CaChip address={ca} className="border-transparent" />
        </GlassIsland>
      )}
    </>
  );
}
