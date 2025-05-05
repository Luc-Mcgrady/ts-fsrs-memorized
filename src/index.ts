import {
    FSRS,
    FSRSVersion,
    Card,
    Rating,
    createEmptyCard,
    FSRSState,
    dateDiffInDays,
    ReviewLog,
} from "ts-fsrs"
import * as _ from "lodash-es"

export interface HistoricalReviewLog {
    /**
     * A unique identifier for the card
     */
    cid: number
    /**
     * The time at which a review was transacted
     */
    review: Date
    /**
     * -1 for forgotten cards
     */
    rating: Rating | -1
}

export interface RangeBounds {
    from: number
    to: number
}

export function ConvertReviewLogForHistorical(
    log: ReviewLog,
    cid: number
): HistoricalReviewLog {
    return {
        cid,
        review: log.review,
        rating: log.rating,
    }
}

export type HistoricalFSRSHooks = Partial<{
    /**
     *
     * @param stability The stability of the card. Unlike card.stability ignores "forget"
     * @param card The card that was reviewed on range.to
     * @param range The range in days between card.last_review and the current review
     */
    reviewRangeHook: (stability: number, card: Card, range: RangeBounds) => void
    forgetHook: (cid: number, card: Card) => void
    /**
     * Called whenever a day ends
     * @param cards The states of all the cards on the given day
     * @param stabilities The stabilities of all the cards on the given day. Unlike card.stability ignores "forget"
     */
    dayEndHook: (
        cards: Record<number, Card>,
        stabilities: Record<number, number>
    ) => void
}>

const day_ms = 1000 * 60 * 60 * 24

export interface HistoricalFSRSReturn {
    /**
     * The sum of the retrivabilities of cards for the given date
     */
    historicalRetention: number[]
    /**
     * The cards indexed by cid in the state they are when the simulation finishes.
     */
    ResultantCards: Record<number, Card>
}

/**
 *
 * @param reviewLogs A list of review logs; processed to extract the relevant data
 * @param fsrs Either an FSRS instance or a mapping of cid's to FSRS instances which should be used for the respective cards.
 * @param rollover_ms The number of ms after midnight on which a new "day" is considered to start
 * @param end The day on which to end the simulation, The start will be the first day on which a review was done.
 * @param hooks Functions which can be used to extract extra information if wanted
 * @returns see {@link HistoricalFSRSReturn}
 *
 * @example
 * // From the Anki add-on "Search Stats Extended"
 *
 * let historicalRevlogs = revlogs
 *   .filter((revlog) => {
 *     return !(
 *       (revlog.ease === 0 && revlog.ivl !== 0) ||
 *       (revlog.type === 3 && revlog.time === 0)
 *     );
 *   })
 *   .map((revlog) => {
 *     const rating = revlog.ease !== 0 ? revlog.ease : -1;
 *     return {
 *       rating,
 *       review: new Date(revlog.id),
 *       cid: revlog.cid,
 *     };
 *   });
 *
 * let presetFsrs = _.mapValues(
 *   configs,
 *   (config) =>
 *     new FSRS(
 *       generatorParameters({
 *         enable_short_term: true,
 *         w: config.fsrsParams5 ? config.fsrsParams5 : config.fsrsWeights,
 *       })
 *     )
 * );
 *
 * let fsrs = Object.fromEntries(
 *   cards.map((card) => [card.id, presetFsrs[config_mapping[card.did]]])
 *
 * let { historicalRetention } = historicalFSRS(historicalRevlogs, fsrs);
 */
export function historicalFSRS(
    reviewLogs: HistoricalReviewLog[],
    fsrs: Record<number, FSRS> | FSRS,
    rollover_ms = 0,
    end = new Date(Date.now()),
    hooks: HistoricalFSRSHooks = {}
): HistoricalFSRSReturn {
    console.log(`ts-fsrs ${FSRSVersion}`)

    let historicalCards: Record<number, Card> = {}
    let dayFromTime = (time: Date) => {
        return Math.floor((time.getTime() - rollover_ms) / day_ms)
    }
    const end_day = dayFromTime(end)
    const {
        reviewRangeHook = _.noop,
        forgetHook = _.noop,
        dayEndHook = _.noop,
    }: HistoricalFSRSHooks = hooks

    let historicalRetention = <number[]>[]

    function forgetting_curve(
        fsrs: FSRS,
        stability: number,
        range: RangeBounds,
        card: Card
    ) {
        for (const day of _.range(range.from, range.to)) {
            const retrievability = fsrs.forgetting_curve(
                day - range.from,
                stability
            )
            historicalRetention[day] =
                (historicalRetention[day] || 0) + retrievability
        }
        reviewRangeHook(stability, card, range)
    }

    let lastStabilities = <number[]>[]
    const start_day = dayFromTime(reviewLogs[0].review)
    /** The day that a card was reviewed previously, before this review. Used for dayEndHook. */
    let last_day = start_day

    function getFSRS(cid: number) {
        if (fsrs instanceof FSRS) {
            return fsrs
        } else return fsrs[cid]
    }

    for (const revlog of reviewLogs) {
        const grade = revlog.rating
        const newCard = !historicalCards[revlog.cid]
        const now = revlog.review
        const today = dayFromTime(now)
        const fsrs = getFSRS(revlog.cid)
        let card =
            historicalCards[revlog.cid] ?? createEmptyCard(new Date(revlog.cid))

        for (let day = last_day; day < today; day++) {
            dayEndHook(historicalCards, lastStabilities)
        }
        last_day = today

        // on forget
        if (grade == -1) {
            if (!newCard) {
                card = fsrs.forget(card, now).card
                historicalCards[revlog.cid] = card
                forgetHook(revlog.cid, card)
            }
            continue
        }
        if (lastStabilities[revlog.cid]) {
            const previous = dayFromTime(card.last_review!)
            const stability = lastStabilities[revlog.cid]
            forgetting_curve(
                fsrs,
                stability,
                { from: previous, to: dayFromTime(revlog.review) },
                card
            )
        }

        //console.log(grade)
        let memoryState: FSRSState | null = null
        let elapsed = 0
        if (card.last_review) {
            memoryState = card.stability
                ? {
                      difficulty: card.difficulty,
                      stability: card.stability,
                  }
                : null
            const oldDate = new Date(card.last_review.getTime() - rollover_ms)
            oldDate.setHours(0, 0, 0, 0)
            const newDate = new Date(now.getTime() - rollover_ms)
            newDate.setHours(0, 0, 0, 0)
            elapsed = dateDiffInDays(oldDate, newDate)
        }
        const newState = fsrs.next_state(memoryState, elapsed, grade)
        card.last_review = now
        card.stability = newState.stability
        card.difficulty = newState.difficulty
        lastStabilities[revlog.cid] = card.stability // To prevent "forget" affecting the forgetting curve

        historicalCards[revlog.cid] = card
    }

    for (const [cid, card] of Object.entries(historicalCards)) {
        const num_cid = +cid
        const previous = dayFromTime(card.last_review!)
        const fsrs = getFSRS(num_cid)
        forgetting_curve(
            fsrs,
            lastStabilities[num_cid],
            { from: previous, to: end_day + 1 },
            card
        )
    }

    return {
        historicalRetention,
        ResultantCards: historicalCards,
    }
}
