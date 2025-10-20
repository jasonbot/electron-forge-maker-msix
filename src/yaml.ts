// Borrowed with modifications from https://github.com/felixrieseberg/electron-updater-yaml
// MIT Licensed

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

type Platform = 'win32'

export interface AppUpdateYmlOptions {
  // Name of your application.
  name: string
  // URL to the location of your yml files. If your channel file (say, latest.yml) currently
  // lives at https://s3-us-west-2.amazonaws.com/my-bucket/latest.yml, you should set this
  // property to "https://s3-us-west-2.amazonaws.com/my-bucket"
  url: string
  // Name of your channel. Defaults to "latest".
  channel?: string
  // Name of your updater cache directory name. Defaults to "${name}-latest".
  updaterCacheDirName?: string
  publisherName?: string
}

/**
 * Returns the contents of the app-update.yml file, which you should place in
 * your app package's "resources" folder. This file is used by the auto-updater
 * to determine where to download updates from.
 */
export async function getAppUpdateYml(options: AppUpdateYmlOptions) {
  const { name, url, publisherName } = options
  const channel = options.channel || 'latest'
  const updaterCacheDirName = options.updaterCacheDirName || `${name.toLowerCase()}-updater`
  let ymlContents = `provider: generic
url: '${url}'
channel: ${channel}
updaterCacheDirName: ${updaterCacheDirName}\n`

  if (publisherName) {
    ymlContents += `publisherName: 
  - ${publisherName}\n`
  }

  return ymlContents
}

export interface ChannelYmlOptions {
  // Path to the location of your installers - typically an "out" or "dist" folder.
  // This tool will be scanning this folder for installers to include in the channel.yml, so
  // it should _only_ contain your installers. On Windows, we'll look for .exe files. On
  // macOS, we'll look for .zip and .dmg files.
  installerPath: string
  // Version of your installer. This should match the version of your application.
  version: string
  // Release date of your installer. Defaults to the current date.
  releaseDate?: string
  // Platform to use. Defaults to the host platform (process.platform).
  platform?: Platform
}

/**
 * Returns the contents of the channel.yml file, which you should place in your
 */
export async function getChannelYml(options: ChannelYmlOptions) {
  const { installerPath, version } = options
  const platform = options.platform || (process.platform as Platform)
  const releaseDate = options.releaseDate || new Date().toISOString()
  const files = await getFiles(installerPath, platform)

  let filesText = ''

  for (const file of files) {
    filesText += `
  - url: ${file.name}
    sha512: ${file.hash}
    size: ${file.size}`
  }

  const ymlContents = `version: ${version}
files:${filesText}
path: ${files[0].name}
sha512: ${files[0].hash}
releaseDate: '${releaseDate}'\n`

  return ymlContents
}

interface File {
  name: string
  path: string
  size: number
  hash: string
}

/**
 * Returns files we should use to auto-update
 */
async function getFiles(installerPath: string, platform: Platform) {
  const files = []
  const result: Array<File> = []

  if (platform === 'win32') {
    const exeFile = getFileInFolder(/\.exe$/, installerPath)
    const msixFile = getFileInFolder(/\.msix$/, installerPath)

    if (!(exeFile || msixFile)) {
      throw new Error(`Could not find .exe or .msix file in ${installerPath}`)
    }

    if (exeFile) {
      files.push(exeFile)
    }

    if (msixFile) {
      files.push(msixFile)
    }
  } else if (platform === 'darwin') {
    const zipFile = getFileInFolder(/\.zip$/, installerPath)
    const dmgFile = getFileInFolder(/\.dmg$/, installerPath)

    if (!zipFile) {
      throw new Error(`Could not find .zip file in ${installerPath}`)
    }

    if (!dmgFile) {
      throw new Error(`Could not find .dmg file in ${installerPath}`)
    }

    files.push(zipFile, dmgFile)
  } else {
    throw new Error(`Unsupported platform: ${platform}`)
  }

  for (const file of files) {
    const filePath = path.join(installerPath, file)

    result.push({
      name: file,
      path: filePath,
      size: getFileSize(filePath),
      hash: await getFileHash(filePath),
    })
  }

  return result
}

/**
 * Returns an sha512 hash of the file at the given path
 */
function getFileHash(filePath: string) {
  const hash = crypto.createHash('sha512')
  const stream = fs.createReadStream(filePath)
  hash.setEncoding('base64')

  return new Promise<string>((resolve, reject) => {
    stream.on('end', () => {
      hash.end()
      resolve(hash.read())
    })

    stream.on('error', (error) => {
      hash.end()
      reject(error)
    })

    stream.pipe(hash)
  })
}

/**
 * Returns file size in bytes
 */
function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size
}

/**
 * Find files in a folder that match a certain extension
 */
function getFileInFolder(test: RegExp, dir: string) {
  return fs.readdirSync(dir).find((file) => test.test(file))
}
