import { MakerBase, type MakerOptions } from '@electron-forge/maker-base'
import type { ForgePlatform } from '@electron-forge/shared-types'
import { getChannelYml, getAppUpdateYml } from './yaml'
import fs from 'fs-extra'
import path from 'node:path'
import { makeAppXImages as createMSIXImageTiles } from './imageAssets'
import {
  getPublisher,
  makeAppInstaller,
  makeAppManifest,
  makeManifestConfiguration,
  makePRI,
  makeContentTypeXML,
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

const packageMSIXFromFolder = async (
  scratchPath: string,
  outMSIX: string,
  config: MakerMSIXConfig
) => {
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

const makeAppUpdateYml = async (
  config: MakerMSIXConfig,
  options: MakerOptions,
  outPath: string
) => {
  if (!config.updater) return

  const ymlContents = await getAppUpdateYml({
    url: config.updater.url,
    name: options.appName,
    channel: config.updater.channel,
    updaterCacheDirName: config.updater.updaterCacheDirName,
    publisherName: config.updater.publisherName,
  })

  const resourcePath = path.join(outPath, 'resources')

  log(`Writing app-update.yml to ${resourcePath}`, ymlContents)
  await fs.ensureDir(resourcePath)
  await fs.writeFile(path.join(resourcePath, 'app-update.yml'), ymlContents, 'utf8')
}

const makeChannelYml = async (
  config: MakerMSIXConfig,
  options: MakerOptions,
  installerPath: string
): Promise<string | undefined> => {
  if (!config.updater) return

  const channel = config.updater.channel || 'latest'
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
        .replace(/[^A-Z]/g, '')
        .slice(0, 10)

    // Copy out files to scratch directory for signing/packaging
    const msixBuildFolderRootPath = path.join(options.makeDir, 'msix/build/')

    if (await fs.pathExists(msixBuildFolderRootPath)) {
      await fs.remove(msixBuildFolderRootPath)
    }

    const programFilesPath = path.join(msixBuildFolderRootPath, options.appName)
    await fs.ensureDir(programFilesPath)
    await fs.copy(options.dir, programFilesPath)

    // Make sure the build dir exists
    const outPath = path.join(options.makeDir, `${options.appName}-${options.targetArch}-msix/`)
    await fs.ensureDir(outPath)

    // Find all the files to be installed
    const executable = await findMainExecutable(msixBuildFolderRootPath)

    // Generate images for various tile sizes
    await createMSIXImageTiles(appID, msixBuildFolderRootPath, this.config)

    // Courtesy: if publisher is not set, pull from signed exe
    let publisher: string
    if (this.config.publisher) {
      publisher = this.config.publisher
    } else {
      publisher = await getPublisher(path.join(msixBuildFolderRootPath, executable), this.config)
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

    // Actual AppxManifest.xml, the orchestration layer
    const appInstallerPath = await makeAppInstaller(
      outPath,
      msixBuildFolderRootPath,
      manifestConfig
    )
    await makePRI(msixBuildFolderRootPath, this.config)
    await makeAppUpdateYml(this.config, options, programFilesPath)
    await makeAppManifest(msixBuildFolderRootPath, manifestConfig)
    await makeContentTypeXML(msixBuildFolderRootPath)
    const outMSIX = path.join(outPath, manifestConfig.msixFilename)
    await packageMSIXFromFolder(msixBuildFolderRootPath, outMSIX, this.config)
    const channelYamlPath = await makeChannelYml(this.config, options, outPath)

    return [outMSIX, appInstallerPath, channelYamlPath].filter((filename) => filename !== undefined)
  }
}
