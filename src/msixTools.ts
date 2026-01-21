import type { MakerOptions } from '@electron-forge/maker-base'
import fs from 'fs-extra'
import path from 'node:path'
import { run } from './run'
import type { AppCapability, MakerMSIXConfig, MSIXAppManifestMetadata } from './types'
import { findInWindowsKits } from './walk'

export const makePRI = async (outPath: string, config: MakerMSIXConfig): Promise<void> => {
  const makePRIPath = config.makePriPath ?? (await findInWindowsKits('makepri.exe'))

  const outPriPath = path.join(outPath, 'resources.pri')
  const priConfigPath = path.join(outPath, 'priconfig.xml')

  await run(makePRIPath, ['createconfig', '/cf', priConfigPath, '/dq', 'en-US', '/pv', '10.0.0'])
  await run(makePRIPath, ['new', '/pr', outPath, '/cf', priConfigPath, '/of', outPriPath])
}

const ENTITY_REPLACEMENTS: [RegExp, string][] = [
  [/[&]/g, '&amp;'],
  [/["]/g, '&quot;'],
  [/[<]/g, '&lt;'],
  [/[>]/g, '&gt;'],
]

const xmlSafeString = (input: string | undefined): string | undefined =>
  input &&
  ENTITY_REPLACEMENTS.reduce(
    (input, [fromString, toNewString]) => input.replace(fromString, toNewString),
    input
  )

const msixSafeVersion = (inVersion: string): string =>
  Array.from(inVersion.match(/\d+/g) || [])
    .concat(['0', '0', '0', '0'])
    .slice(0, 4)
    .join('.')

export const makeContentTypeXML = async (outPath: string): Promise<void> => {
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
    <Default Extension="yml" ContentType="application/yaml" />
    <Default Extension="yaml" ContentType="application/yaml" />
    <Default Extension="appinstaller" ContentType="application/appinstaller" />
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

const CapabilityMap: Record<AppCapability, string> = {
  GraphicsCapture: '<uap6:Capability Name="graphicsCapture" />',
  Microphone: '<DeviceCapability Name="microphone" />',
  Webcam: '<DeviceCapability Name="webcam"/>',
}

export const makeAppManifestXML = ({
  appID,
  appName,
  architecture,
  appDescription,
  executable,
  publisher,
  version,
  protocols,
  appCapabilities,
  allowExternalContent,
  copilotKey,
  baseDownloadURL,
  appInstallerFilename,
  makeAppInstaller,
  runAtStartup,
  exeAlias,
  startupParams,
  appURIHandlers,
}: MSIXAppManifestMetadata): string => {
  const startupExtension = runAtStartup
    ? `
        <desktop:Extension
          Category="windows.startupTask"
          Executable="${xmlSafeString(executable)}"
          ${startupParams ? `uap11:Parameters="${xmlSafeString(startupParams)}"` : ''}
          EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask TaskId="${xmlSafeString(appID)}.Startup" Enabled="true" DisplayName="${xmlSafeString(appName)}" />
        </desktop:Extension>
  `
    : ''

  const exeAliasExtension = exeAlias
    ? `
        ${startupExtension}
        <uap3:Extension
          Category="windows.appExecutionAlias"
          Executable="${xmlSafeString(executable)}"
          EntryPoint="Windows.FullTrustApplication">
          <uap3:AppExecutionAlias>
            <desktop:ExecutionAlias Alias="${xmlSafeString(executable.split(/[/\\]/).pop())}" />
          </uap3:AppExecutionAlias>
        </uap3:Extension>
`
    : ''

  let extensions = `
        ${startupExtension}
        ${exeAliasExtension}
`

  let autoUpdateXML = ''
  if (baseDownloadURL && makeAppInstaller) {
    autoUpdateXML += `<uap13:AutoUpdate>
        <uap13:AppInstaller File="${xmlSafeString(appInstallerFilename)}" />
    </uap13:AutoUpdate>
`
  }

  let additionalCapabilities = ''
  if (appCapabilities) {
    additionalCapabilities += [...new Set(appCapabilities)]
      .map((cap) => CapabilityMap[cap])
      .filter((cv) => !!cv)
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

  if (appURIHandlers) {
    for (const appURIHandler of appURIHandlers) {
      extensions += `<uap3:Extension Category="windows.appUriHandler">
          <uap3:AppUriHandler>
            <uap3:Host Name="${xmlSafeString(appURIHandler)}" />
          </uap3:AppUriHandler>
        </uap3:Extension>
`
    }
  }

  let minVersionTested = '10.0.17763.0'
  let maxVersionTested = '10.0.21300.0'

  if (copilotKey) {
    // Version range to enable this is later
    minVersionTested = '10.0.19041.0'
    maxVersionTested = '10.0.22621.0'

    const tapString = copilotKey.tap
      ? `<SingleTap ${copilotKey.tap.wparam ? `MessageWParam="${xmlSafeString(copilotKey.tap.wparam.toString())}"` : ''}>${xmlSafeString(copilotKey.tap.url)}</SingleTap>`
      : ''
    const startString = copilotKey.start
      ? `<PressAndHoldStart ${copilotKey.start.wparam ? `MessageWParam="${xmlSafeString(copilotKey.start.wparam.toString())}"` : ''}>${xmlSafeString(copilotKey.start.url)}</PressAndHoldStart>`
      : ''

    const stopString = copilotKey.stop
      ? `<PressAndHoldStop ${copilotKey.stop.wparam ? `MessageWParam="${xmlSafeString(copilotKey.stop.wparam.toString())}"` : ''}>${xmlSafeString(copilotKey.stop.url)}</PressAndHoldStop>`
      : ''

    extensions += `
              <uap3:Extension Category="windows.appExtension">
                <uap3:AppExtension Name="com.microsoft.windows.copilotkeyprovider"
                    DisplayName="${appName} - Copilot Key"
                    Id="${appID}"
                    Description="${appDescription}"
                    PublicFolder="Public">
                    <uap3:Properties>
                        ${tapString}
                        ${startString}
                        ${stopString}
                    </uap3:Properties>
                </uap3:AppExtension>
              </uap3:Extension>
`
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
    xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
    xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
    xmlns:uap6="http://schemas.microsoft.com/appx/manifest/uap/windows10/6"
    xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
    xmlns:uap11="http://schemas.microsoft.com/appx/manifest/uap/windows10/11"
    xmlns:uap13="http://schemas.microsoft.com/appx/manifest/uap/windows10/13"
    xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
    xmlns:desktop2="http://schemas.microsoft.com/appx/manifest/desktop/windows10/2"
    xmlns:desktop7="http://schemas.microsoft.com/appx/manifest/desktop/windows10/7"
    xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
    IgnorableNamespaces="uap uap3 uap10 desktop7 rescap">
    <Identity Name="${xmlSafeString(appID)}" Publisher="${xmlSafeString(
      publisher.startsWith('CN=') ? publisher : `CN=${publisher}`
    )}" Version="${xmlSafeString(msixSafeVersion(version))}" ProcessorArchitecture="${xmlSafeString(architecture)}" />
    <Properties>
        <DisplayName>${xmlSafeString(appName)}</DisplayName>
        <PublisherDisplayName>${xmlSafeString(appName)}</PublisherDisplayName>
        <Description>${xmlSafeString(appDescription)}</Description>
        <Logo>assets\\StoreLogo.png</Logo>
        <uap10:PackageIntegrity>
            <uap10:Content Enforcement="on" />
        </uap10:PackageIntegrity>
        <uap10:AllowExternalContent>${allowExternalContent}</uap10:AllowExternalContent>
        ${autoUpdateXML}
    </Properties>
    <Resources>
        <Resource Language="en-us" />
    </Resources>
    <Dependencies>
        <TargetDeviceFamily Name="Windows.Desktop" MinVersion="${xmlSafeString(minVersionTested)}" MaxVersionTested="${xmlSafeString(maxVersionTested)}" />
    </Dependencies>
    <Capabilities>
        <rescap:Capability Name="runFullTrust" />
        <rescap:Capability Name="packageManagement" />
        <Capability Name="internetClient" />
        ${additionalCapabilities}
    </Capabilities>
    <Applications>
        <Application Id="${xmlSafeString(appID)}" Executable="${xmlSafeString(executable)}"
            EntryPoint="Windows.FullTrustApplication">
            <uap:VisualElements BackgroundColor="transparent" DisplayName="${xmlSafeString(appName)}"
                Square150x150Logo="assets\\${xmlSafeString(appID)}-150x150Logo.png"
                Square44x44Logo="assets\\${xmlSafeString(appID)}-44x44Logo.png" Description="${xmlSafeString(appName)}">
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

export const makeManifestConfiguration = ({
  appID,
  version,
  executable,
  config,
  options,
}: {
  appID: string
  version: string
  executable: string
  config: MakerMSIXConfig & Required<Pick<MakerMSIXConfig, 'publisher'>>
  options: MakerOptions
}): MSIXAppManifestMetadata => {
  return {
    appID,
    appName: options.appName,
    appDescription: config.appDescription ?? options.appName,
    executable,
    architecture: options.targetArch,
    version,
    publisher: config.publisher,
    allowExternalContent: !!config.allowExternalContent,
    protocols: options.forgeConfig.packagerConfig.protocols,
    baseDownloadURL: config.baseDownloadURL,
    makeAppInstaller: config.makeAppInstaller ?? true,
    msixFilename: `${options.appName}-${options.targetArch}-${version}.msix`,
    appInstallerFilename: `${options.appName}-${options.targetArch}.appinstaller`,
    appCapabilities: config.appCapabilities,
    copilotKey: config.copilotKey,
    allowRollbacks: config.allowRollbacks,
    runAtStartup: !!config.runAtStartup,
    startupParams: config.startupParams,
    exeAlias: !!config.exeAlias,
    appURIHandlers: config.appURIHandlers,
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
  appID,
  publisher,
  version,
  baseDownloadURL,
  msixFilename,
  appInstallerFilename,
  allowRollbacks,
}: MSIXAppManifestMetadata) => {
  const base = baseDownloadURL?.replace(/\/+$/, '')
  const MSIXURL = `${base}/${xmlSafeString(msixFilename)}`
  // Go round trip through URL class to escape spaces etc
  const appInstallerURL = new URL(`${base}/${appInstallerFilename}`).toString()

  return `<?xml version="1.0" encoding="utf-8"?>
<AppInstaller
    xmlns="http://schemas.microsoft.com/appx/appinstaller/2021"
    Version="1.0.0.0"
    Uri="${xmlSafeString(appInstallerURL)}" >
    <MainBundle
        Name="${xmlSafeString(appID)}"
        Publisher="${xmlSafeString(publisher.startsWith('CN=') ? publisher : `CN=${publisher}`)}"
        Version="${xmlSafeString(msixSafeVersion(version))}"
        Uri="${xmlSafeString(new URL(MSIXURL).toString())}" />
    <UpdateSettings>
        <OnLaunch HoursBetweenUpdateChecks="12" />
        <ForceUpdateFromAnyVersion>${allowRollbacks ?? true}</ForceUpdateFromAnyVersion>
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

  if (manifestConfig.makeAppInstaller && manifestConfig.baseDownloadURL) {
    const outXML = makeAppInstallerXML(manifestConfig)
    await fs.writeFile(outFilePath, outXML)
    await fs.writeFile(embedFilePath, outXML)
    return outFilePath
  }
}
