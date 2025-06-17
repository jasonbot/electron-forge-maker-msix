import type { SignOptions } from '@electron/windows-sign'

export type MSIXCodesignOptions = Omit<Omit<SignOptions, 'appDirectory'>, 'hashes'>

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
  protocols?: string[]
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
  protocols?: string[]
  baseDownloadURL?: string
}

export type PathInManifest = string
export type PathOnDisk = string
export type FileMapping = Record<PathInManifest, PathOnDisk>
