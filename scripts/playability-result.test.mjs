import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { verifyPlayabilityResult, PLAYABILITY_RESULT_PATH } from './lib/publication.mjs'
import { evaluateGates } from '../launchpad/scripts/playability-sim.mjs'

// verifyPlayabilityResult는 게임 디렉터리의 고정 경로에서 결과 파일을 읽는다.
// 임시 디렉터리에 그 파일을 두고, publish-game과 같은 readJson을 넘겨 검사한다.
const SMOKE = 'a'.repeat(64)
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const dirs = []

function gameDirWith(body) {
  const dir = mkdtempSync(join(tmpdir(), 'playresult-'))
  dirs.push(dir)
  const path = join(dir, PLAYABILITY_RESULT_PATH)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(body))
  return dir
}

function emptyGameDir() {
  const dir = mkdtempSync(join(tmpdir(), 'playresult-'))
  dirs.push(dir)
  return dir
}

process.on('exit', () => {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

test('sequence 17 미만은 소급하지 않는다', () => {
  const dir = emptyGameDir()
  assert.doesNotThrow(() => verifyPlayabilityResult(dir, SMOKE, 16, readJson))
  assert.doesNotThrow(() => verifyPlayabilityResult(dir, SMOKE, 9, readJson))
})

test('결과 파일이 없으면 막는다', () => {
  const dir = emptyGameDir()
  assert.throws(() => verifyPlayabilityResult(dir, SMOKE, 17, readJson), /없습니다/)
})

test('pass가 true이고 sourceHash가 smoke와 같으면 통과한다', () => {
  const dir = gameDirWith({ pass: true, sourceHash: SMOKE, policies: [] })
  assert.doesNotThrow(() => verifyPlayabilityResult(dir, SMOKE, 17, readJson))
})

test('pass가 아니면 막는다', () => {
  const dir = gameDirWith({ pass: false, sourceHash: SMOKE, failedGates: ['skilledCompletion'] })
  assert.throws(() => verifyPlayabilityResult(dir, SMOKE, 17, readJson), /pass가 true가 아닙니다/)
})

test('sourceHash가 smoke와 다르면 막는다', () => {
  const dir = gameDirWith({ pass: true, sourceHash: 'b'.repeat(64) })
  assert.throws(() => verifyPlayabilityResult(dir, SMOKE, 17, readJson), /sourceHash가 현재 smoke 증거와 다릅니다/)
})

test('sourceHash가 없으면 막는다', () => {
  const dir = gameDirWith({ pass: true })
  assert.throws(() => verifyPlayabilityResult(dir, SMOKE, 17, readJson), /sourceHash/)
})

// 공용 게이트 판정(launchpad 템플릿). 문턱이 코드에 있어야 게임이 조용히 낮추지 못한다.
const passing = {
  intuitive: { completionRate: 0, meanJudgments: 21, endedByJudgementRate: 1, spentFailureBudgetRate: 1, survivedFraction: 0, scoreMedian: 20 },
  skilled: { completionRate: 0.29, meanJudgments: 42, endedByJudgementRate: 1, spentFailureBudgetRate: 1, survivedFraction: 0, scoreMedian: 41 },
  noInput: { completionRate: 0, meanJudgments: 3, endedByJudgementRate: 1, spentFailureBudgetRate: 1, survivedFraction: 0.07, scoreMedian: 3 },
}

test('건강한 세 정책 요약은 게이트를 통과한다', () => {
  assert.deepEqual(evaluateGates(passing), { pass: true, failedGates: [] })
})

test('무입력이 앞 1/4을 넘겨 살면 막는다', () => {
  const r = evaluateGates({ ...passing, noInput: { ...passing.noInput, survivedFraction: 0.5 } })
  assert.equal(r.pass, false)
  assert.ok(r.failedGates.includes('idleSurvivesTooLong'))
})

test('숙련이 완주하지 못하면 막는다', () => {
  const r = evaluateGates({ ...passing, skilled: { ...passing.skilled, completionRate: 0 } })
  assert.ok(r.failedGates.includes('skilledCanComplete'))
})

test('직관이 전부 완주 + 실패 예산 0이면 질 수 없는 게임으로 막는다', () => {
  const r = evaluateGates({ ...passing, intuitive: { ...passing.intuitive, completionRate: 1, spentFailureBudgetRate: 0 } })
  assert.ok(r.failedGates.includes('intuitiveSaturated'))
})

test('두 정책 점수가 구분되지 않으면 막는다', () => {
  const r = evaluateGates({ ...passing, skilled: { ...passing.skilled, scoreMedian: 20 } })
  assert.ok(r.failedGates.includes('policiesScoreIndistinct'))
})
