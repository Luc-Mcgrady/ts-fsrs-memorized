import { Card, createEmptyCard, dateDiffInDays, FSRS, Rating } from "ts-fsrs"
import { historicalFSRS, HistoricalReviewLog } from "../src"

describe("Historical Memorised", () => {
    it("Same stabilities as ts-fsrs", () => {
        let f = new FSRS({})
        let now = new Date()
        let review2 = now
        review2.setDate(review2.getDate() + 5)
        let review3 = now
        review2.setDate(review2.getDate() + 20)

        let revlog: HistoricalReviewLog[] = [
            { cid: 1, rating: Rating.Good, review: now },
            { cid: 1, rating: Rating.Good, review: review2 },
            { cid: 1, rating: Rating.Good, review: review3 },
        ]
        let card = { stability: 0, difficulty: 0 }

        historicalFSRS([...revlog], f, 40000, review2, {
            onReview(r, b, { stability }) {
                card = f.next_state(
                    b,
                    b.last_review
                        ? dateDiffInDays(b.last_review, r.review)
                        : 0,
                    r.rating
                )
                let s = card.stability
                expect(s).toBe(stability)
            },
        })
    })

    it("Same stabilities with different presets", () => {
        let f = new FSRS({
            w: [
                0.0392, 0.584, 33.4248, 100.0, 7.4532, 0.4596, 2.1257, 0.0013,
                1.4625, 0.1949, 0.6697, 1.18, 0.1128, 0.2364, 1.7667, 0.1183,
                1.4849, 0.8357, 0.6337, 0.1707, 0.3,
            ],
        })
        let f2 = new FSRS({})

        let fsrs: Record<number, FSRS> = { 1: f, 2: f2 }

        let now = new Date()
        let review2 = now
        review2.setDate(review2.getDate() + 5)

        let revlog: HistoricalReviewLog[] = [
            { cid: 1, rating: 3, review: now },
            { cid: 1, rating: 3, review: review2 },
            { cid: 2, rating: 3, review: now },
            { cid: 2, rating: 3, review: review2 },
        ]
        let cards: Record<number, Card> = {
            1: createEmptyCard(now),
            2: createEmptyCard(now),
        }

        historicalFSRS([...revlog], fsrs, 40000, review2, {
            onReviewRange(stability, _, __, cid) {
                let repeat = fsrs[cid].repeat(cards[cid], now)[Rating.Good]
                let s = repeat.card.stability
                cards[cid] = repeat.card
                expect(s).toBe(stability)
            },
        })
    })
})
