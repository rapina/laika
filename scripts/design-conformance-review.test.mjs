import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyDesignConformanceReview } from './lib/design-conformance-review.mjs'

function review(overrides = {}) {
  return {
    schemaVersion: 3,
    sourceHash: 'current',
    verdict: 'pass',
    method: { build: 'production build' },
    designConformance: [
      { id: 'rule', designClaim: '문서의 규칙', status: 'implemented', observed: '빌드에서 확인' },
    ],
    creatorTests: [
      { command: 'npm test', covers: '제작자가 정한 로직', status: 'pass' },
    ],
    deployable: { status: 'pass', observed: '빌드와 자산이 열림' },
    ...overrides,
  }
}

test('accepts creator-owned tests and implemented design claims', () => {
  assert.doesNotThrow(() => verifyDesignConformanceReview(review(), 'current'))
})

test('rejects a missing design promise', () => {
  const designConformance = [
    { id: 'rule', designClaim: '문서의 규칙', status: 'missing', observed: '빌드에 없음' },
  ]
  assert.throws(() => verifyDesignConformanceReview(review({ designConformance }), 'current'), /빌드가 다릅니다/)
})

test('rejects absent creator tests without prescribing their contents', () => {
  assert.throws(() => verifyDesignConformanceReview(review({ creatorTests: [] }), 'current'), /테스트 기록/)
})

test('rejects stale build identity', () => {
  assert.throws(() => verifyDesignConformanceReview(review(), 'other'), /sourceHash/)
})
