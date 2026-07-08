import { RNGDLE_ROLL_RANGE } from '@/utils/rngdle/daily';
import {
    formatOfficialPercentileText,
    getOfficialCardRarityTier,
    OFFICIAL_SCORE_PERCENTILES,
    officialPercentileToBps
} from '@/utils/rngdle/official';
import { RarityTier } from '@/utils/rngdle/types';

export interface RngdlePercentileInfo {
    totalEp: number;
    count: number;
    belowCount: number;
    atOrBelowCount: number;
    totalCount: number;
    bottomBps: number;
    topBps: number;
    rarity: RarityTier;
    percentileText: string;
}

export async function getRngdlePercentileInfo(totalEp: number): Promise<RngdlePercentileInfo | null> {
    if (OFFICIAL_SCORE_PERCENTILES[String(totalEp)] === undefined) return null;

    const { bottomBps, topBps } = officialPercentileToBps(totalEp);
    return {
        totalEp,
        count: 0,
        belowCount: 0,
        atOrBelowCount: 0,
        totalCount: RNGDLE_ROLL_RANGE,
        bottomBps,
        topBps,
        rarity: getOfficialCardRarityTier(totalEp),
        percentileText: formatOfficialPercentileText(totalEp)
    };
}
