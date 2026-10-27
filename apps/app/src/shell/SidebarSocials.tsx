import { CaChip, SOCIAL_META, SocialLinks, socialEntries, useTokenCa } from '@windle/brand';
import { RailTip } from './RailTip';

const DEV = import.meta.env.DEV;

/**
 * GitHub / X links and the token CA at the foot of the navigation (desktop sidebar and the mobile drawer).
 * Full sidebar: an icon row, then the CA chip. Rail: the icons stacked, each with a tooltip, and the CA reduced to a
 * "CA" copy button. Renders nothing when there is nothing to show.
 */
export function SidebarSocials({ rail }: { rail: boolean }) {
  const ca = useTokenCa(DEV);
  if (socialEntries(DEV).length === 0 && ca === null) return null;
  return (
    <div
      data-sidebar-socials
      className={rail ? 'flex flex-col items-center gap-2' : 'flex flex-wrap items-center gap-x-2 gap-y-2 px-1'}
    >
      <SocialLinks
        size="sm"
        orientation={rail ? 'vertical' : 'horizontal'}
        showPlaceholders={DEV}
        wrap={(item, entry) => (
          <RailTip
            label={entry.href === null ? `${entry.label} link not set` : SOCIAL_META[entry.slot].label}
            active={rail}
          >
            {item}
          </RailTip>
        )}
      />
      {ca !== null && (
        <RailTip label="Copy contract address" active={rail}>
          <CaChip address={ca} compact={rail} />
        </RailTip>
      )}
    </div>
  );
}
