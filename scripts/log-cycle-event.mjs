#!/usr/bin/env node
/**
 * 사이클 사건 하나를 기록한다. 감독자와 관제가 단계 경계에서 부른다.
 *
 *   node scripts/log-cycle-event.mjs --actor cherpa --stage design-review \
 *     --status blocked --sequence 12 --slug ripples \
 *     --ko "안내대로 쳐도 지지 않아 공개를 멈췄다" \
 *     --en "Following the guide never loses, so the release stopped"
 *
 * 키가 없거나 네트워크가 죽어도 종료 코드 0으로 조용히 넘어간다. 관찰이 사이클을
 * 멈추면 안 되기 때문이다. 남겼는지 여부는 표준 출력으로 알린다.
 */
import { cycleLogConfigured, logCycleEvent } from './lib/cycle-log.mjs'

const argv = process.argv.slice(2)
function arg(name) {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : null
}

const sequence = arg('sequence')
const written = await logCycleEvent({
  actor: arg('actor'),
  stage: arg('stage'),
  status: arg('status'),
  sequence: sequence === null ? undefined : Number(sequence),
  slug: arg('slug') ?? undefined,
  noteKo: arg('ko') ?? undefined,
  noteEn: arg('en') ?? undefined,
})

process.stdout.write(written
  ? '기록했습니다.\n'
  : cycleLogConfigured()
    ? '남기지 못했습니다. 사이클은 계속합니다.\n'
    : 'SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없어 건너뜁니다.\n')
