import { FSRS, FSRSVersion, Card, Rating, createEmptyCard, FSRSState, dateDiffInDays } from "ts-fsrs"
import * as _ from "lodash-es"

export type HistoricalRevlog = {
    cid: number
    time: Date
    rating: Rating | -1
}

export type MemorizedCard = {
    fsrs: FSRS,
    card: Card
}

export type DefaultExportData = {
    retrievability: number[]
}

export type RangeBounds = {
    from: number,
    to: number
}

const day_ms = 1000 * 60 * 60 * 24
export function historicalFSRS(
    revlogs: HistoricalRevlog[],
    cards: Record<number, MemorizedCard>,
    end: Date,
    rollover_ms = 0,
    /* reviewRangeHook: (stability: number, card: MemorizedCard, range: RangeBounds) => void */
) {
    console.log(`ts-fsrs ${FSRSVersion}`)

    let historicalCards: Record<number, Card> = {}
    let dayFromTime = (time: Date) => { return Math.floor((time.getTime() - rollover_ms) / day_ms) }
    const end_day = dayFromTime(end)

    let sumR = <number[]>[]

    function forgetting_curve(fsrs: FSRS, stability: number, range: RangeBounds, /* card: Card */) {
        for (const day of _.range(range.from, range.to)) {
            const retrievability = fsrs.forgetting_curve(day - range.from, stability)
            sumR[day] = (sumR[day] || 0) + retrievability
        }
    }

    let last_stability = <number[]>[]

    for (const revlog of revlogs) {

        const grade = revlog.rating
        const new_card = !historicalCards[revlog.cid]
        const now = revlog.time
        const fsrs = cards[revlog.cid].fsrs
        //console.log({fsrs})
        let card = historicalCards[revlog.cid] ?? createEmptyCard(new Date(revlog.cid))

        /*for (let day = last_day; day < dayFromMs(revlog.id); day++) {
            const stabilities = Object.values(last_stability)
            day_medians[day] = d3.quantile(stabilities, 0.5) ?? 0
            day_means[day] = d3.mean(stabilities) ?? 0
        }*/ /* Todo */

        // on forget
        if (revlog.rating == -1 && !new_card) {
            card = fsrs.forget(card, now).card
            historicalCards[revlog.cid] = card
            // Forget Hook Todo
        }
        if (last_stability[revlog.cid]) {
            const previous = dayFromTime(card.last_review!)
            const stability = last_stability[revlog.cid]
            forgetting_curve(fsrs, stability, { from: previous, to: dayFromTime(revlog.time) }, /* card */)
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
        const fsrs = cards[num_cid].fsrs
        forgetting_curve(fsrs, last_stability[num_cid], { from: previous, to: end_day + 1 }, /* card */)
    }

    return {
        sumR,
        re_simulated_cards: historicalCards
    }
}