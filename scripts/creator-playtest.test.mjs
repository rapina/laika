import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyCreatorPlaytest } from './lib/creator-playtest.mjs'

const initial = '1'.repeat(64)
const current = '2'.repeat(64)

function report(overrides = {}) {
  return {
    schemaVersion: 1,
    initialBuildHash: initial,
    finalBuildHash: current,
    sessions: [{
      playerContext: 'build-only',
      observation: {
        understood: '화면에서 읽은 목표',
        attempted: '실제로 시도한 입력',
        reached: '도달한 상태',
        friction: '막힌 지점',
      },
    }],
    makerResponse: {
      changes: [{ observation: '막힌 지점', change: '다시 제작한 내용' }],
      releaseCandidateReason: '관찰을 반영한 완성작으로 판단했다.',
    },
    ...overrides,
  }
}

test('accepts a fresh-context playtest followed by a rebuilt candidate', () => {
  assert.doesNotThrow(() => verifyCreatorPlaytest(report(), current))
})

test('rejects an unchanged first implementation', () => {
  assert.throws(
    () => verifyCreatorPlaytest(report({ initialBuildHash: current }), current),
    /소스 변경/,
  )
})

test('rejects playtest evidence from a design-aware player', () => {
  const sessions = [{ ...report().sessions[0], playerContext: 'design-aware' }]
  assert.throws(() => verifyCreatorPlaytest(report({ sessions }), current), /독립 플레이/)
})

test('rejects a stale final candidate hash', () => {
  assert.throws(
    () => verifyCreatorPlaytest(report({ finalBuildHash: '3'.repeat(64) }), current),
    /최종 해시/,
  )
})
