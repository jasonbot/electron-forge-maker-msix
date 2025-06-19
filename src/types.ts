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
}

export type MSIXAppManifestMetadata = {
  appID: string
  appName: string
  appDescription: string
  publisher: string
  version: string
  executable: string
  architecture: string
  protocols?: MacOSProtocol[]
  baseDownloadURL?: string
}
