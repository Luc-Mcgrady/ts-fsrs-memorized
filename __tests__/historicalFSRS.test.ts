import { createEmptyCard, FSRS } from "ts-fsrs"
import { historicalFSRS, HistoricalReviewLog } from "../src"

describe("Historical Memorised", () => {
    it("Same stabilities as ts-fsrs", () => {
        let f = new FSRS({})
        let now = new Date()
        let review2 = now
        review2.setDate(review2.getDate() + 5)

        let revlog: HistoricalReviewLog[] = [
            { cid: 1, rating: 3, review: now },
            { cid: 1, rating: 3, review: review2 },
        ]
        let card = createEmptyCard(now)

        historicalFSRS([...revlog], f, 40000, review2, {
            onReviewRange(stability) {
                let repeat = f.repeat(card, now)[3]
                let s = repeat.card.stability
                card = repeat.card
                expect(s).toBe(stability)
            },
        })
    })
})
