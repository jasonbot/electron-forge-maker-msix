import type { SignOptions } from '@electron/windows-sign'
import type { MacOSProtocol } from '@electron/packager/dist/types'

export type MSIXCodesignOptions = Omit<SignOptions, 'appDirectory' | 'hashes'>

export type MakerMSIXConfig = {
  appIcon: string
  publisher?: string
  internalAppID?: string
  appDescription?: string
  wallpaperIcon?: string
  makeAppXPath?: string
  makePriPath?: string
  sigCheckPath?: string
  codesign?: MSIXCodesignOptions
  baseDownloadURL?: string
  embedAppInstaller?: boolean
}

export type MSIXAppManifestMetadata = {
  appID: string
  appName: string
  appDescription: string
  publisher: string
  version: string
  executable: string
  architecture: string
  appInstallerFilename: string
  msixFilename: string
  embedAppInstaller: boolean
  protocols?: MacOSProtocol[]
  baseDownloadURL?: string
}
