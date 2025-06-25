import type { MakerOptions } from '@electron-forge/maker-base'
import fs from 'fs-extra'
import path from 'node:path'
import { run } from './run'
import type { MakerMSIXConfig, MSIXAppManifestMetadata } from './types'
import { findInWindowsKits } from './walk'

export const makePRI = async (outPath: string, config: MakerMSIXConfig): Promise<void> => {
  const makePRIPath = config.makePriPath ?? (await findInWindowsKits('makepri.exe'))

  const outPriPath = path.join(outPath, 'resources.pri')
  const priConfigPath = path.join(outPath, 'priconfig.xml')

  await run(makePRIPath, ['createconfig', '/cf', priConfigPath, '/dq', 'en-US', '/pv', '10.0.0'])
  await run(makePRIPath, ['new', '/cf', priConfigPath, '/pr', outPath, '/of', outPriPath])
}

const xmlSafeString = (input: string | undefined): string | undefined =>
  input &&
  [
    ['&', '&amp;'],
    ['"', '&quot;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
  ].reduce((input, [fromString, toNewString]) => input.replace(fromString, toNewString), input)

export const writeContentTypeXML = async (outPath: string): Promise<void> => {
  const fileName = '[Content_Types].xml'
  const outFileName = path.join(outPath, fileName)
  const co = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="mp3" ContentType="audio/mpeg" />
    <Default Extension="png" ContentType="image/png" />
    <Default Extension="ico" ContentType="image/vnd.microsoft.icon" />
    <Default Extension="dll" ContentType="application/x-msdownload" />
    <Default Extension="pak" ContentType="application/octet-stream" />
    <Default Extension="bin" ContentType="application/octet-stream" />
    <Default Extension="dat" ContentType="application/octet-stream" />
    <Default Extension="html" ContentType="text/html" />
    <Default Extension="json" ContentType="application/json" />
    <Default Extension="xml" ContentType="text/xml" />
    <Default Extension="asar" ContentType="application/octet-stream" />
    <Default Extension="node" ContentType="application/octet-stream" />
    <Default Extension="exe" ContentType="application/x-msdownload" />
    <Default Extension="pri" ContentType="application/octet-stream" />
    <Override PartName="/AppxManifest.xml" ContentType="application/vnd.ms-appx.manifest+xml" />
    <Override PartName="/AppxBlockMap.xml" ContentType="application/vnd.ms-appx.blockmap+xml" />
    <Override PartName="/AppxSignature.p7x" ContentType="application/vnd.ms-appx.signature" />
    <Override PartName="/AppxMetadata/CodeIntegrity.cat" ContentType="application/vnd.ms-pkiseccat" />
</Types>`

  await fs.writeFile(outFileName, co)
}

export const getPublisher = async (
  executable: string,
  config: MakerMSIXConfig
): Promise<string> => {
  const stdout = await run(config.sigCheckPath ?? 'sigcheck.exe', ['-accepteula', executable], true)
  const publisherRE = /\r\n[ \t]+Publisher:[ \t]+(?<publisher>.+?)\r\n/
  const foundPublisher = stdout.match(publisherRE)?.groups?.publisher
  if (foundPublisher) {
    return foundPublisher
  } else {
    throw new Error(
      `Could not determine publisher: ${executable} is not signed or sigcheck is not installed.`
    )
  }
}

const makeAppManifestXML = ({
  appID,
  appName,
  architecture,
  appDescription,
  executable,
  publisher,
  version,
  protocols,
  embedAppInstaller,
  appInstallerFilename,
}: MSIXAppManifestMetadata): string => {
  let extensions = `
        <desktop:Extension
          Category="windows.startupTask"
          Executable="${xmlSafeString(executable)}"
          EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask TaskId="SlackStartup" Enabled="true" DisplayName="${xmlSafeString(appName)}" />
        </desktop:Extension>
        <uap3:Extension
          Category="windows.appExecutionAlias"
          Executable="${xmlSafeString(executable)}"
          EntryPoint="Windows.FullTrustApplication">
          <uap3:AppExecutionAlias>
            <desktop:ExecutionAlias Alias="${xmlSafeString(executable.split(/[/\\]/).pop())}" />
          </uap3:AppExecutionAlias>
        </uap3:Extension>
`

  let autoUpdateXML = ''
  if (embedAppInstaller) {
    autoUpdateXML += `<uap13:AutoUpdate>
        <uap13:AppInstaller File="${xmlSafeString(appInstallerFilename)}" />
    </uap13:AutoUpdate>
`
  }

  if (protocols) {
    for (const protocolGroup of protocols) {
      for (const protocol of protocolGroup.schemes) {
        extensions += `<uap3:Extension Category="windows.protocol">
                    <uap3:Protocol Name="${xmlSafeString(protocol)}" Parameters="&quot;%1&quot;">
                        <uap:DisplayName>${xmlSafeString(protocol === protocolGroup.name ? protocol : `${protocolGroup.name} (${protocol})`)}</uap:DisplayName>
                    </uap3:Protocol>
                </uap3:Extension>
`
      }
    }
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
    xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
    xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
    xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
        xmlns:uap13="http://schemas.microsoft.com/appx/manifest/uap/windows10/13" 
    xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
    xmlns:desktop2="http://schemas.microsoft.com/appx/manifest/desktop/windows10/2"
    xmlns:desktop7="http://schemas.microsoft.com/appx/manifest/desktop/windows10/7"
    xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
    IgnorableNamespaces="uap uap3 uap10 desktop7 rescap">
    <Identity Name="${xmlSafeString(publisher)}" Publisher="${
      publisher.startsWith('CN=') ? publisher : `CN=${xmlSafeString(publisher)}`
    }" Version="${xmlSafeString(version)}" ProcessorArchitecture="${xmlSafeString(architecture)}" />
    <Properties>
        <DisplayName>${xmlSafeString(appName)}</DisplayName>
        <PublisherDisplayName>${xmlSafeString(appName)}</PublisherDisplayName>
        <Description>${xmlSafeString(appDescription)}</Description>
        <Logo>assets\\StoreLogo.png</Logo>
        <uap10:PackageIntegrity>
            <uap10:Content Enforcement="on" />
        </uap10:PackageIntegrity>
        ${autoUpdateXML}
    </Properties>
    <Resources>
        <Resource Language="en-us" />
    </Resources>
    <Dependencies>
        <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.17763.0" />
    </Dependencies>
    <Capabilities>
        <rescap:Capability Name="runFullTrust" />
        <Capability Name="internetClient" />
    </Capabilities>
    <Applications>
        <Application Id="${xmlSafeString(appID)}" Executable="${xmlSafeString(executable)}"
            EntryPoint="Windows.FullTrustApplication">
            <uap:VisualElements BackgroundColor="transparent" DisplayName="Notion"
                Square150x150Logo="assets\\${xmlSafeString(appID)}-150x150Logo.png"
                Square44x44Logo="assets\\${xmlSafeString(appID)}-44x44Logo.png" Description="Notion">
                <uap:DefaultTile Wide310x150Logo="assets\\${xmlSafeString(appID)}-310x150Logo.png"
                    Square310x310Logo="assets\\${xmlSafeString(appID)}-310x310Logo.png"
                    Square71x71Logo="assets\\${xmlSafeString(appID)}-71x71Logo.png" />
            </uap:VisualElements>
            <Extensions>
                ${extensions}
            </Extensions>
        </Application>
    </Applications>
    <Extensions>
        <desktop2:Extension Category="windows.firewallRules">
            <desktop2:FirewallRules Executable="${xmlSafeString(executable)}">
                <desktop2:Rule Direction="in" IPProtocol="TCP" Profile="all"/>
                <desktop2:Rule Direction="out" IPProtocol="TCP" Profile="all"/>
            </desktop2:FirewallRules>
        </desktop2:Extension>
    </Extensions>
</Package>`.trim()
}

export const makeManifestConfiguration = (
  appID: string,
  version: string,
  executable: string,
  config: MakerMSIXConfig & Required<Pick<MakerMSIXConfig, 'publisher'>>,
  options: MakerOptions
): MSIXAppManifestMetadata => {
  if (!config.baseDownloadURL && (config.embedAppInstaller ?? true)) {
    throw new Error("Can't create an appinstaller file without a base URL for download")
  }

  const versionString = version.split('.').concat(['0', '0', '0', '0']).slice(0, 4).join('.')

  return {
    appID,
    appName: options.appName,
    appDescription: config.appDescription ?? options.appName,
    executable,
    architecture: options.targetArch,
    version: versionString,
    publisher: config.publisher,
    protocols: options.forgeConfig.packagerConfig.protocols,
    baseDownloadURL: config.baseDownloadURL,
    msixFilename: `${options.appName}-${options.targetArch}-${versionString}.msix`,
    appInstallerFilename: `${options.appName}-${options.targetArch}.appinstaller`,
    embedAppInstaller: config.embedAppInstaller ?? !!config.baseDownloadURL,
  }
}

export const makeAppManifest = async (
  outPath: string,
  manifestConfig: MSIXAppManifestMetadata
): Promise<void> => {
  await fs.ensureDir(outPath)
  const outFilePath = path.join(outPath, 'AppxManifest.xml')
  const manifestXML = makeAppManifestXML(manifestConfig)

  fs.writeFile(outFilePath, manifestXML)
}

export const makeAppInstallerXML = ({
  appName,
  publisher,
  version,
  baseDownloadURL,
  msixFilename,
  appInstallerFilename,
}: MSIXAppManifestMetadata) => {
  const MSIXURL = `${baseDownloadURL?.replace(/\/+$/, '')}/${xmlSafeString(msixFilename)}`
  const appInstallerURL = `${baseDownloadURL?.replace(
    /\/+$/,
    ''
  )}/${xmlSafeString(appInstallerFilename)}`

  return `<?xml version="1.0" encoding="utf-8"?>
<AppInstaller
    xmlns="http://schemas.microsoft.com/appx/appinstaller/2021"
    Version="1.0.0.0"
    Uri="http://mywebservice.azurewebsites.net/appset.appinstaller" >
    <MainBundle
        Name="${xmlSafeString(appName)}"
        Publisher="${xmlSafeString(publisher.startsWith('CN=') ? publisher : `CN=${publisher}`)}"
        Version="${xmlSafeString(version)}"
        Uri="${xmlSafeString(MSIXURL)}" />
    <UpdateSettings>
        <OnLaunch HoursBetweenUpdateChecks="12" />
    </UpdateSettings>
    <UpdateUris>
        <UpdateUri>${xmlSafeString(appInstallerURL)}</UpdateUri>
    </UpdateUris>
    <RepairUris>
        <RepairUri>${xmlSafeString(appInstallerURL)}</RepairUri>
    </RepairUris>
</AppInstaller>`
}

export const makeAppInstaller = async (
  outPath: string,
  inBundlePath: string,
  manifestConfig: MSIXAppManifestMetadata
): Promise<string | undefined> => {
  await fs.ensureDir(outPath)
  const outFilePath = path.join(outPath, manifestConfig.appInstallerFilename)
  const embedFilePath = path.join(inBundlePath, manifestConfig.appInstallerFilename)

  if (manifestConfig.baseDownloadURL) {
    const outXML = makeAppInstallerXML(manifestConfig)
    await fs.writeFile(outFilePath, outXML)
    await fs.writeFile(embedFilePath, outXML)
    return outFilePath
  }
}
