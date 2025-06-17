import fs from 'fs-extra'
import path from 'node:path'

export async function* walk(dir: string): AsyncGenerator<string> {
  for await (const d of await fs.opendir(dir)) {
    const entry = path.join(dir, d.name)
    if (d.isDirectory()) {
      yield* walk(entry)
    } else if (d.isFile()) {
      yield entry
    }
  }
}

export async function findInWindowsKits(exename: string): string {
  const searchPath = 'C:\\Program Files (x86)\\Windows Kits\\10'

  const foundExes: string[] = []
  const foundPreferredExes: string[] = []
  for await (const fileName of walk(searchPath)) {
    if (path.basename(fileName).toLowerCase() === exename) {
      foundExes.push(fileName)
      if (fileName.toLowerCase().includes('x64')) {
        foundPreferredExes.push(fileName)
      }
    }
  }

  const exesToSort = foundPreferredExes.length > 0 ? foundPreferredExes : foundExes
  if (exesToSort.length > 0) {
    const returnVal = exesToSort.sort().pop()
    if (returnVal) {
      return returnVal
    }
  }

  throw new Error(
    `Could not file ${exename} on this development machine. Is the Windows 10 SDK installed?`
  )
}
