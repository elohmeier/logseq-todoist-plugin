import { getNameFromString } from '../helpers'
import type { TaskBlock } from './task-block'

interface InsertOptions {
  title?: string
}

export const insertTasksIntoGraph = async (
  blocks: TaskBlock[],
  uuid: string,
  options?: InsertOptions,
) => {
  if (blocks.length === 0) {
    return
  }

  await logseq.Editor.insertBatchBlock(uuid, blocks, { before: true })

  const desiredTitle = options?.title?.trim()

  if (desiredTitle && desiredTitle.length > 0) {
    await logseq.Editor.updateBlock(uuid, desiredTitle)
    return
  }

  if (logseq.settings?.projectNameAsParentBlk) {
    const fallback = getNameFromString(logseq.settings!.retrieveDefaultProject as string)
    if (fallback && fallback.length > 0) {
      await logseq.Editor.updateBlock(uuid, fallback)
      return
    }
  }

  await logseq.Editor.removeBlock(uuid)
}
