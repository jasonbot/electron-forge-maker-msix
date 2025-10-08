import { MakerBase, type MakerOptions } from '@electron-forge/maker-base'
import type { ForgePlatform } from '@electron-forge/shared-types'
import { getChannelYml, getAppUpdateYml } from 'electron-updater-yaml'
import fs from 'fs-extra'
import path from 'node:path'
import { makeAppXImages as makeMSIXImageTiles } from './imageAssets'
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
import type { MakerMSIXConfig } from './types'
import { findInWindowsKits, walk } from './walk'

const findMainExecutable = async (rootPath: string): Promise<string> => {
  let executable: string | undefined
  for await (const fileName of walk(rootPath)) {
    const relativeFileName = fileName.substring(rootPath.length).replace(/^[\\/]+/, '')

    if (
      relativeFileName.toLocaleLowerCase().endsWith('.exe') &&
      (!executable || executable.split(/[/\\]/).length > relativeFileName.split(/[/\\]/).length)
    ) {
      executable = relativeFileName
    }
  }

  if (!executable) {
    throw new Error(`No executable file found in ${rootPath}`)
  }

  return executable
}

const makeMSIX = async (scratchPath: string, outMSIX: string, config: MakerMSIXConfig) => {
  const makeAppXPath = config.makeAppXPath ?? (await findInWindowsKits('makeappx.exe'))

  await codesign(config, scratchPath)
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

  /**
   * Maybe creates an app-update.yml, compatible with electron-updater
   */
  async createAppUpdateYml(options: MakerOptions, outPath: string) {
    if (!this.config.updater) return

    const ymlContents = await getAppUpdateYml({
      url: this.config.updater.url,
      name: options.appName,
      channel: this.config.updater.channel,
      updaterCacheDirName: this.config.updater.updaterCacheDirName,
      publisherName: this.config.updater.publisherName,
    })

    log(`Writing app-update.yml to ${outPath}`, ymlContents)
    await fs.writeFile(path.join(outPath, 'resources', 'app-update.yml'), ymlContents, 'utf8')
  }

  async createChannelYml(
    options: MakerOptions,
    installerPath: string
  ): Promise<string | undefined> {
    if (!this.config.updater) return

    const channel = this.config.updater.channel || 'latest'
    const version = options.packageJSON.version
    const channelFilePath = path.resolve(installerPath, `${channel}.yml`)

    const ymlContents = await getChannelYml({
      installerPath,
      version,
      platform: 'win32',
    })

    log(`Writing ${channel}.yml to ${installerPath}`, ymlContents)
    await fs.writeFile(channelFilePath, ymlContents, 'utf8')
    return channelFilePath
  }

  async make(options: MakerOptions): Promise<string[]> {
    const appID =
      this.config.internalAppID ??
      options.appName
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 10)

    // Copy out files to scratch directory for signing/packaging
    const scratchPath = path.join(options.makeDir, 'msix/build/')

    if (await fs.pathExists(scratchPath)) {
      await fs.remove(scratchPath)
    }

    const programFilesPath = path.join(scratchPath, options.appName)
    await fs.ensureDir(programFilesPath)
    await fs.copy(options.dir, programFilesPath)

    // Make sure the build dir exists
    const outPath = path.join(options.makeDir, `${options.appName}-${options.targetArch}-msix/`)
    await fs.ensureDir(outPath)

    // Find all the files to be installed
    const executable = await findMainExecutable(scratchPath)

    // Generate images for various tile sizes
    await makeMSIXImageTiles(appID, scratchPath, this.config)

    // Actual AppxManifest.xml, the orchestration layer

    // Courtesy: if publisher is not set, pull from signed exe
    let publisher: string
    if (this.config.publisher) {
      publisher = this.config.publisher
    } else {
      publisher = await getPublisher(path.join(scratchPath, executable), this.config)
    }

    const manifestConfig = makeManifestConfiguration({
      appID,
      version: options.packageJSON.version,
      executable,
      config: {
        ...this.config,
        publisher,
      },
      options,
    })

    await this.createAppUpdateYml(options, outPath)
    const channelYamlPath = await this.createChannelYml(options, options.makeDir)
    await makeAppManifest(scratchPath, manifestConfig)
    const appInstallerPath = await makeAppInstaller(outPath, scratchPath, manifestConfig)
    await makePRI(scratchPath, this.config)
    await writeContentTypeXML(scratchPath)

    const outMSIX = path.join(outPath, manifestConfig.msixFilename)
    await makeMSIX(scratchPath, outMSIX, this.config)

    return [outMSIX, appInstallerPath, channelYamlPath].filter((filename) => filename !== undefined)
  }
}
