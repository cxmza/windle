import type { ApiTrade } from '@windle/shared';

export const BOT_HINT = 'House market-making bot — practice points, not ranked';

export const isBotTrade = (t: Pick<ApiTrade, 'bot'>): boolean => t.bot === true;
