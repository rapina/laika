#!/usr/bin/env node
/**
 * 사이클 지표 기록.
 *
 * 목표는 1000편이 아니라 1000번의 개선이다. 그러면 봐야 할 값은 만든 편수가
 * 아니라 바퀴가 나아지고 있는지다. 두 가지만 센다.
 *
 *   interventions  사람이 끼어들어야 했던 횟수 (자율성 곡선)
 *   escaped        로컬 게이트를 통과했는데 운영·preview에서야 잡힌 결함 수
 *
 * 발견한 결함 수는 지표가 아니다. 더 깊이 들여다봐서 늘어난 것일 수 있다.
 *
 *   node scripts/record-cycle.mjs --sequence 12 --slug foo \
 *     --interventions 0 --escaped 2 --held false --note "한 줄"
 *   node scripts/record-cycle.mjs --show
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'docs/knowledge/cycle-metrics.json')

function load() {
  if (!existsSync(path)) return { schemaVersion: 1, cycles: [] }
  return JSON.parse(readFileSync(path, 'utf8'))
}

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index++) {
    const match = argv[index].match(/^--([a-zA-Z-]+)$/)
    if (!match) continue
    const key = match[1]
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) options[key] = true
    else { options[key] = next; index++ }
  }
  return options
}

const options = parseArgs(process.argv.slice(2))
const data = load()

if (options.show || Object.keys(options).length === 0) {
  if (data.cycles.length === 0) {
    process.stdout.write('기록된 사이클이 없습니다.\n')
    process.exit(0)
  }
  const rows = data.cycles.slice(-12)
  process.stdout.write('seq  slug          개입  누출  보류  비고\n')
  for (const cycle of rows) {
    process.stdout.write(
      `${String(cycle.sequence).padStart(3)}  ${String(cycle.slug).padEnd(12)}  ` +
      `${String(cycle.interventions).padStart(4)}  ${String(cycle.escaped).padStart(4)}  ` +
      `${cycle.held ? ' 예 ' : ' -  '}  ${cycle.note ?? ''}\n`)
  }
  const recent = rows.slice(-3)
  if (recent.length >= 2) {
    const mean = (list, key) => (list.reduce((sum, cycle) => sum + cycle[key], 0) / list.length).toFixed(1)
    process.stdout.write(`\n최근 ${recent.length}회 평균: 개입 ${mean(recent, 'interventions')}회, 누출 ${mean(recent, 'escaped')}건\n`)
  }
  process.exit(0)
}

for (const required of ['sequence', 'slug', 'interventions', 'escaped']) {
  if (options[required] === undefined) {
    throw new Error(`--${required}가 필요합니다. 사용법은 파일 상단 주석 참고.`)
  }
}

const sequence = Number(options.sequence)
if (!Number.isInteger(sequence) || sequence < 1) throw new Error('--sequence는 양의 정수여야 합니다.')
if (data.cycles.some((cycle) => cycle.sequence === sequence)) {
  throw new Error(`sequence ${sequence}는 이미 기록돼 있습니다. 고치려면 파일을 직접 수정하세요.`)
}

data.cycles.push({
  sequence,
  slug: String(options.slug),
  interventions: Number(options.interventions),
  escaped: Number(options.escaped),
  held: options.held === true || options.held === 'true',
  note: typeof options.note === 'string' ? options.note : '',
})
data.cycles.sort((a, b) => a.sequence - b.sequence)
writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
process.stdout.write(`sequence ${sequence} 기록 완료. 총 ${data.cycles.length}회.\n`)
