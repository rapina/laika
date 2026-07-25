/**
 * 사이클이 도는 동안 무슨 일이 있었는지 실시간으로 남긴다.
 *
 * 규칙 두 가지.
 *
 * 1. 감독자와 관제만 쓴다. 콘셉트·제작 에이전트는 브랜드 블라인드라 아케이드도
 *    라이카도 몰라야 하는데, 걔들이 공개 피드에 쓰려면 엔드포인트를 알아야 한다.
 *    격리가 깨진다. 단계 경계마다 보고를 받는 쪽이 대신 남긴다.
 * 2. 기록 실패가 사이클을 멈추지 않는다. 이건 관찰이지 게이트가 아니다.
 *    키가 없거나 네트워크가 죽어도 조용히 넘어간다.
 *
 * 쓰기에는 service_role 키가 필요하다. RLS를 우회하므로 이 키는 로컬 환경에만
 * 두고 절대 커밋하지 않는다. 브라우저는 anon 키로 읽기만 한다.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<로컬 전용>
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TIMEOUT_MS = 4000

const ACTORS = new Set(['enos', 'laika', 'cherpa', 'murr'])
const STATUSES = new Set(['started', 'passed', 'blocked', 'failed', 'done', 'noted'])

function localEnv() {
  const values = {}
  for (const file of ['.env.local', 'arcade/.env.local']) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/.exec(rawLine.trim())
      if (!match) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!(match[1] in values)) values[match[1]] = value
    }
  }
  return values
}

function credentials() {
  const env = { ...localEnv(), ...process.env }
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null
}

/**
 * 사건 하나를 남긴다. 성공하면 true, 남기지 못했으면 false. 던지지 않는다.
 *
 *   await logCycleEvent({
 *     actor: 'cherpa', stage: 'design-review', status: 'blocked',
 *     sequence: 12, slug: 'ripples',
 *     noteKo: '안내대로 쳐도 지지 않아 공개를 멈췄다',
 *     noteEn: 'Following the guide never loses, so the release stopped',
 *   })
 */
export async function logCycleEvent(event) {
  const { actor, stage, status } = event
  if (!ACTORS.has(actor)) throw new Error(`actor는 ${[...ACTORS].join(', ')} 중 하나여야 합니다: ${actor}`)
  if (!STATUSES.has(status)) throw new Error(`status는 ${[...STATUSES].join(', ')} 중 하나여야 합니다: ${status}`)
  if (typeof stage !== 'string' || !stage.trim()) throw new Error('stage가 필요합니다.')

  const auth = credentials()
  if (!auth) return false

  const row = {
    actor,
    stage: stage.trim(),
    status,
    sequence: Number.isInteger(event.sequence) ? event.sequence : null,
    slug: event.slug ?? null,
    note_ko: event.noteKo?.slice(0, 300) ?? null,
    note_en: event.noteEn?.slice(0, 300) ?? null,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${auth.url}/rest/v1/cycle_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: auth.key,
        Authorization: `Bearer ${auth.key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      signal: controller.signal,
    })
    return response.ok
  } catch {
    // 관찰은 사이클을 멈추지 않는다.
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function cycleLogConfigured() {
  return credentials() !== null
}
