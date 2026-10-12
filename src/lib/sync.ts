import { pullExpenses, pushExpenses } from './api'
import { listExpenses, putMany } from './db'

export type SyncResult = {
  pushed: number
  pulled: number
}

/**
 * Two-way merge between local IndexedDB and the server.
 *
 * Last-write-wins on `updatedAt`. Records that only exist on one side are
 * copied across. Simple by design — the seam to grow into real sync.
 */
export async function syncWithServer(token: string): Promise<SyncResult> {
  const [local, remote] = await Promise.all([
    listExpenses(),
    pullExpenses(token),
  ])

  const remoteById = new Map(remote.map((item) => [item.id, item]))
  const localById = new Map(local.map((item) => [item.id, item]))

  const toPush = local.filter((item) => !remoteById.has(item.id))
  const toPull = remote.filter((item) => {
    const localCopy = localById.get(item.id)
    return !localCopy || item.updatedAt > localCopy.updatedAt
  })

  if (toPush.length > 0) await pushExpenses(toPush, token)
  if (toPull.length > 0) await putMany(toPull)

  return { pushed: toPush.length, pulled: toPull.length }
}
