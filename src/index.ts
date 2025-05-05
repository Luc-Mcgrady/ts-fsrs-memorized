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
    cid: number
    review: Date
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

export type historicalFSRSHooks = Partial<{
    reviewRangeHook: (stability: number, card: Card, range: RangeBounds) => void
    forgetHook: (cid: number, card: Card) => void
    dayEndHook: (
        cards: Record<number, Card>,
        stabilities: Record<number, number>
    ) => void
}>

const day_ms = 1000 * 60 * 60 * 24
export function historicalFSRS(
    revlogs: HistoricalReviewLog[],
    fsrs: Record<number, FSRS> | FSRS,
    end = new Date(Date.now()),
    rollover_ms = 0,
    hooks: historicalFSRSHooks = {}
) {
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
    }: historicalFSRSHooks = hooks

    let sumR = <number[]>[]

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
            sumR[day] = (sumR[day] || 0) + retrievability
        }
        reviewRangeHook(stability, card, range)
    }

    let last_stability = <number[]>[]
    const start_day = dayFromTime(revlogs[0].review)
    /** The day that a card was reviewed previously, before this review. Used for dayEndHook. */
    let last_day = start_day

    function getFSRS(cid: number) {
        if (fsrs instanceof FSRS) {
            return fsrs
        }
        else return fsrs[cid]
    }

    for (const revlog of revlogs) {
        const grade = revlog.rating
        const new_card = !historicalCards[revlog.cid]
        const now = revlog.review
        const today = dayFromTime(now)
        const fsrs = getFSRS(revlog.cid)
        let card =
            historicalCards[revlog.cid] ?? createEmptyCard(new Date(revlog.cid))

        for (let day = last_day; day < today; day++) {
            dayEndHook(historicalCards, last_stability)
        }
        last_day = today

        // on forget
        if (grade == -1 && !new_card) {
            card = fsrs.forget(card, now).card
            historicalCards[revlog.cid] = card
            forgetHook(revlog.cid, card)
            continue
        }
        if (last_stability[revlog.cid]) {
            const previous = dayFromTime(card.last_review!)
            const stability = last_stability[revlog.cid]
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
        last_stability[revlog.cid] = card.stability // To prevent "forget" affecting the forgetting curve

        historicalCards[revlog.cid] = card
    }

    for (const [cid, card] of Object.entries(historicalCards)) {
        const num_cid = +cid
        const previous = dayFromTime(card.last_review!)
        const fsrs = getFSRS(num_cid)
        forgetting_curve(
            fsrs,
            last_stability[num_cid],
            { from: previous, to: end_day + 1 },
            card
        )
    }

    return {
        sumR,
        re_simulated_cards: historicalCards,
    }
}
