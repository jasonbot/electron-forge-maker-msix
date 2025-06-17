import { MakerBase, type MakerOptions } from '@electron-forge/maker-base'
import type { ForgePlatform } from '@electron-forge/shared-types'
import fs from 'fs-extra'
import path from 'node:path'
import { makeAppXImages } from './imageAssets'
import {
  getPublisher,
  makeAppInstaller,
  makeAppManifest,
  makeManifestConfiguration,
  makePRI,
  writeContentTypeXML,
} from './msixTools'
import { log, run } from './run'
import { codesign } from './sign'
import type { FileMapping, MakerMSIXConfig, PathInManifest } from './types'
import { walk } from './walk'

const inventoryInstallFilesForMapping = async (
  rootPath: string,
): Promise<[string, FileMapping]> => {
  const fileMapping: FileMapping = {}

  let executable: string | undefined
  for await (const fileName of walk(rootPath)) {
    const relativeFileName: PathInManifest = fileName
      .substring(rootPath.length)
      .replace(/^[\\/]+/, '')

    if (!executable && relativeFileName.toLocaleLowerCase().endsWith('.exe')) {
      executable = relativeFileName
    }

    fileMapping[relativeFileName] = fileName
  }

  if (!executable) {
    throw new Error(`No executable file found in ${rootPath}`)
  }

  return [executable, fileMapping]
}

const writeMappingFile = async (
  fileMapping: FileMapping,
  mappingFilename: string,
): Promise<void> => {
  log(`Writing file mapping to ${fileMapping}`)
  const contentLines = ['[Files]']

  for (const [inManifest, onDisk] of Object.entries(fileMapping)) {
    contentLines.push(`"${onDisk}" "${inManifest}"`)
  }

  // Lol dos
  await fs.writeFile(mappingFilename, contentLines.join('\r\n'))
}

const makeMSIX = async (scratchPath: string, outMSIX: string, config: MakerMSIXConfig) => {
  const makeAppXPath =
    config.makeAppXPath ??
    'C:\\Program Files (x86)\\Windows Kits\\10\\App Certification Kit\\makeappx.exe'

  try {
    if ((await fs.stat(outMSIX)).isFile()) {
      log(`${outMSIX} already exists; making new one`)
      await fs.unlink(outMSIX)
    }
  } catch (e) {
    log(`Error looking for existing ${outMSIX}: ${e}`)
  }

  await run(makeAppXPath, ['pack', '/d', scratchPath, '/p', outMSIX])
  await codesign(config, outMSIX)
}

export default class MakerMSIX extends MakerBase<MakerMSIXConfig> {
  name = 'msix'
  defaultPlatforms: ForgePlatform[] = ['win32']

  isSupportedOnCurrentPlatform(): boolean {
    return process.platform === 'win32'
  }

  async make(options: MakerOptions): Promise<string[]> {
    const appID =
      this.config.internalAppID ??
      options.appName
        .toUpperCase()
        .replace(/[^A-Z]/, '')
        .slice(0, 10)

    // Copy out files to scratch directory for signing/packaging
    const scratchPath = path.join(options.makeDir, 'msix/build/')

    if (await fs.pathExists(scratchPath)) {
      await fs.remove(scratchPath)
    }

    const programFilesPath = path.join(scratchPath, options.appName)
    await fs.ensureDir(programFilesPath)
    await fs.copy(options.dir, programFilesPath)
    await codesign(this.config, programFilesPath)

    // Make sure the build dir exists
    const outPath = path.join(options.makeDir, `${options.appName}-${options.targetArch}-msix/`)
    await fs.ensureDir(outPath)

    // Find all the files to be installed
    const [executable, installMapping] = await inventoryInstallFilesForMapping(scratchPath)

    // Generate images for various tile sizes
    const imageAssetMapping = await makeAppXImages(appID, scratchPath, this.config)

    // Actual AppxManifest.xml, the orchestration layer

    // Courtesy: if publisher is not set, pull from signed exe
    let publisher: string
    if (this.config.publisher) {
      publisher = this.config.publisher
    } else {
      publisher = await getPublisher(installMapping, this.config)
    }

    const manifestConfig = makeManifestConfiguration(
      appID,
      options.packageJSON.version,
      executable,
      {
        ...this.config,
        publisher,
      },
      options,
    )

    const appManifestMapping: FileMapping = await makeAppManifest(scratchPath, manifestConfig)
    const appInstallerPath = await makeAppInstaller(outPath, manifestConfig)
    const priFileMapping = await makePRI(scratchPath, this.config)
    const contentTypeFileMapping = await writeContentTypeXML(scratchPath)

    // Write file mapping
    // Combine all the files we need to install into a single filemapping
    const manifestMapping = Object.assign(
      appManifestMapping,
      installMapping,
      imageAssetMapping,
      priFileMapping,
      contentTypeFileMapping,
    )
    const fileMappingFilenameOnDisk = path.join(outPath, 'filemapping.txt')
    writeMappingFile(manifestMapping, fileMappingFilenameOnDisk)

    const outMSIX = path.join(
      outPath,
      `${options.appName}-${options.targetArch}-${manifestConfig.version}.msix`,
    )
    await makeMSIX(scratchPath, outMSIX, this.config)

    const latestMSIXPath = path.join(
      outPath,
      `${options.appName}-${options.targetArch}-latest.msix`,
    )

    await fs.copyFile(outMSIX, latestMSIXPath)

    return [outMSIX, latestMSIXPath, appInstallerPath].filter((filename) => filename !== undefined)
  }
}
