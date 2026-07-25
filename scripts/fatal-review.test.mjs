import test from 'node:test'
import assert from 'node:assert/strict'
import { FATAL_CHECK_IDS, verifyFatalOnlyReview } from './lib/fatal-review.mjs'

function review(overrides = {}) {
  return {
    schemaVersion: 2,
    verdict: 'pass',
    sourceHash: 'current',
    method: { inputPath: 'pointer-events' },
    fatalChecks: FATAL_CHECK_IDS.map((id) => ({ id, status: 'pass', observed: `${id} 확인` })),
    ...overrides,
  }
}

test('fatal-only review accepts all six passing checks', () => {
  assert.doesNotThrow(() => verifyFatalOnlyReview(review(), 'current'))
})

test('fatal-only review rejects a missing check', () => {
  assert.throws(
    () => verifyFatalOnlyReview(review({ fatalChecks: review().fatalChecks.slice(1) }), 'current'),
    /빠졌습니다/,
  )
})

test('fatal-only review rejects a fatal defect', () => {
  const fatalChecks = review().fatalChecks
  fatalChecks[0] = { ...fatalChecks[0], status: 'fatal' }
  assert.throws(() => verifyFatalOnlyReview(review({ fatalChecks }), 'current'), /치명적 결함/)
})

test('fatal-only review rejects stale smoke identity', () => {
  assert.throws(() => verifyFatalOnlyReview(review(), 'other'), /sourceHash/)
})
