import type { SignOptions } from '@electron/windows-sign'
import type { MacOSProtocol } from '@electron/packager/dist/types'

export type MSIXCodesignOptions = Omit<SignOptions, 'appDirectory' | 'hashes'>

export type CopilotKeyAction = 'tap' | 'start' | 'stop'

export type CopilotKeyURIAndWParam = {
  url: string
  wparam?: number
}

export type CopilotKeyConfiguration = Record<CopilotKeyAction, CopilotKeyURIAndWParam>

export type AppCapability = 'GraphicsCapture' | 'Microphone' | 'Webcam'

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
  makeAppInstaller?: boolean
  allowExternalContent?: boolean
  copilotKey?: CopilotKeyConfiguration
  appCapabilities?: AppCapability[]
  allowRollbacks?: boolean
  runAtStartup?: boolean
  startupParams?: string
  exeAlias?: boolean
  appURIHandlers?: string[]

  updater?: {
    url: string
    channel?: string
    updaterCacheDirName?: string
    publisherName?: string
  }
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
  protocols: MacOSProtocol[] | undefined
  baseDownloadURL: string | undefined
  makeAppInstaller: boolean
  allowExternalContent: boolean
  copilotKey: CopilotKeyConfiguration | undefined
  appCapabilities: AppCapability[] | undefined
  allowRollbacks: boolean | undefined
  runAtStartup: boolean
  exeAlias: boolean
  startupParams: string | undefined
  appURIHandlers: string[] | undefined
}
