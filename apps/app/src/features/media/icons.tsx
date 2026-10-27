import { glyph } from '@/shell/icons';

export const ImageIcon = ({ size = 18 }: { size?: number }) =>
  glyph(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17.5 4.5-4.5 3.5 3.5 3-3 4 4" />
    </>,
    size,
  );

export const AlertIcon = ({ size = 18 }: { size?: number }) =>
  glyph(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.2v.1" />
    </>,
    size,
  );

export const UploadIcon = ({ size = 18 }: { size?: number }) =>
  glyph(<path d="M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5M5 19h14" />, size);
