import debug from 'debug'
import { spawn } from 'node:child_process'

export const log = debug('electron-forge:maker:msix')

export const run = async (executable: string, args: Array<string>, neverFail = false) => {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(executable, args, {})
    log(`Running ${JSON.stringify([executable].concat(args))}`)

    let runningStdout = ''
    let collectedStdoutLogForReturn = ''
    proc.stdout.on('data', (data) => {
      collectedStdoutLogForReturn += data
      runningStdout += data

      if (runningStdout.includes('\n')) {
        const logLines = runningStdout.split('\n')
        while (logLines.length > 1) {
          log(`stdout: ${logLines.shift()?.trimEnd()}`)
        }
        if (logLines.length > 0) {
          runningStdout = logLines[0]
        }
      }
    })

    let runningStderr = ''
    proc.stderr.on('data', (data) => {
      runningStderr += data

      if (runningStderr.includes('\n')) {
        const logLines = runningStderr.split('\n')
        while (logLines.length > 1) {
          log(`stderr: ${logLines.shift()?.trimEnd()}`)
        }
        if (logLines.length > 0) {
          runningStderr = logLines[0]
        }
      }
    })

    proc.on('exit', (code) => {
      runningStdout.split('\n').forEach((line) => log(`stdout: ${line.trimEnd()}`))
      runningStderr.split('\n').forEach((line) => log(`stderr: ${line.trimEnd()}`))
      if (code !== 0) {
        if (neverFail) {
          log(`warning: ${executable} returned: ${code}`)
        } else {
          return reject(new Error(`Running ${executable} returned: ${code}.`))
        }
      }
      return resolve(collectedStdoutLogForReturn)
    })

    proc.stdin.end()
  })
}
