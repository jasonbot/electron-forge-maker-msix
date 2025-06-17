import { sign } from '@electron/windows-sign'
import type { HASHES } from '@electron/windows-sign/dist/cjs/types'
import fs from 'fs-extra'
import { log } from './run'
import type { MakerMSIXConfig } from './types'

export const codesign = async (config: MakerMSIXConfig, outPath: string) => {
  if (config.codesign) {
    try {
      if ((await fs.stat(outPath)).isDirectory()) {
        log(`Signing directory ${outPath}`)
        await sign({
          ...config.codesign,
          appDirectory: outPath,
          hashes: ['sha256' as HASHES],
        })
      } else {
        log(`Signing file ${outPath}`)
        await sign({
          ...config.codesign,
          files: [outPath],
          hashes: ['sha256' as HASHES],
        })
      }
    } catch (error) {
      console.error(
        'Failed to codesign using @electron/windows-sign. Check your config and the output for details!',
        error
      )
      throw error
    }

    // Setup signing. If these variables are set, app-builder-lib will actually
    // codesign.
    if (!process.env.CSC_LINK && config.codesign.certificateFile) {
      log(`Setting process.env.CSC_LINK to ${config.codesign.certificateFile}`)
      process.env.CSC_LINK = config.codesign.certificateFile
    }

    if (!process.env.CSC_KEY_PASSWORD && config.codesign.certificatePassword) {
      log('Setting process.env.CSC_KEY_PASSWORD to the passed password')
      process.env.CSC_KEY_PASSWORD = config.codesign.certificatePassword
    }
  } else {
    log("Skipping code signing, if you need it set 'config.codesign'")
  }
}
