import type { MakerOptions } from '@electron-forge/maker-base'
import fs from 'fs-extra'
import path from 'node:path'
import { run } from './run'
import type { FileMapping, MakerMSIXConfig, MSIXAppManifestMetadata } from './types'

export const makePRI = async (outPath: string, config: MakerMSIXConfig): Promise<FileMapping> => {
  const glob = require('node:fs/promises').glob

  const makePRIPath =
    config.makePriPath ??
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x86\\makepri.exe'

  const outPriPath = path.join(outPath, 'resources.pri')
  const priConfigPath = path.join(outPath, 'priconfig.xml')

  await run(makePRIPath, ['createconfig', '/cf', priConfigPath, '/dq', 'en-US', '/pv', '10.0.0'])
  await run(makePRIPath, ['new', '/cf', priConfigPath, '/pr', outPath, '/of', outPriPath])

  const fileMapping: FileMapping = {}
  for await (const item of await glob(path.join(outPath, '*.pri'))) {
    fileMapping[path.basename(item)] = item
  }

  return fileMapping
}

export const writeContentTypeXML = async (outPath: string): Promise<FileMapping> => {
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

  return { fileName: outFileName }
}

export const getPublisher = async (
  installMapping: FileMapping,
  config: MakerMSIXConfig,
): Promise<string> => {
  const exes = Object.values(installMapping).filter((f) => f.toLowerCase().endsWith('.exe'))
  if (exes.length > 0) {
    const stdout = await run(config.sigCheckPath ?? 'sigcheck.exe', ['-accepteula', exes[0]], true)
    const publisherRE = /\r\n[ \t]+Publisher:[ \t]+(?<publisher>.+?)\r\n/
    const foundPublisher = stdout.match(publisherRE)?.groups?.publisher
    if (foundPublisher) {
      return foundPublisher
    } else {
      throw new Error(`Could not determine publisher: ${exes[0]} is not signed.`)
    }
  } else {
    throw new Error('Could not determine publisher: nothing signed')
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
}: MSIXAppManifestMetadata): string => {
  let extensions = `
        <desktop:Extension
          Category="windows.startupTask"
          Executable="${executable}"
          EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask TaskId="SlackStartup" Enabled="true" DisplayName="${appName}" />
        </desktop:Extension>
        <uap3:Extension
          Category="windows.appExecutionAlias"
          Executable="${executable}"
          EntryPoint="Windows.FullTrustApplication">
          <uap3:AppExecutionAlias>
            <desktop:ExecutionAlias Alias="${executable.split(/[/\\]/).pop()}" />
          </uap3:AppExecutionAlias>
        </uap3:Extension>
`

  if (protocols) {
    for (const protocol of protocols) {
      extensions += `<uap3:Extension Category="windows.protocol">
                    <uap3:Protocol Name="${protocol}" Parameters="&quot;%1&quot;">
                        <uap:DisplayName>${protocol}</uap:DisplayName>
                    </uap3:Protocol>
                </uap3:Extension>
`
    }
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
    xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
    xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
    xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
    xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
    xmlns:desktop2="http://schemas.microsoft.com/appx/manifest/desktop/windows10/2"
    xmlns:desktop7="http://schemas.microsoft.com/appx/manifest/desktop/windows10/7"
    xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
    IgnorableNamespaces="uap uap3 uap10 desktop7 rescap">
    <Identity Name="${publisher}" Publisher="${
    publisher.startsWith('CN=') ? publisher : `CN=${publisher}`
  }" Version="${version}" ProcessorArchitecture="${architecture}" />
    <Properties>
        <DisplayName>${appName}</DisplayName>
        <PublisherDisplayName>${appName}</PublisherDisplayName>
        <Description>${appDescription}</Description>
        <Logo>assets\\StoreLogo.png</Logo>
        <uap10:PackageIntegrity>
            <uap10:Content Enforcement="on" />
        </uap10:PackageIntegrity>
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
        <Application Id="${appID}" Executable="${executable}"
            EntryPoint="Windows.FullTrustApplication">
            <uap:VisualElements BackgroundColor="transparent" DisplayName="Notion"
                Square150x150Logo="assets\\${appID}-150x150Logo.png"
                Square44x44Logo="assets\\${appID}-44x44Logo.png" Description="Notion">
                <uap:DefaultTile Wide310x150Logo="assets\\${appID}-310x150Logo.png"
                    Square310x310Logo="assets\\${appID}-310x310Logo.png"
                    Square71x71Logo="assets\\${appID}-71x71Logo.png" />
            </uap:VisualElements>
            <Extensions>
                ${extensions}
            </Extensions>
        </Application>
    </Applications>
    <Extensions>
        <desktop2:Extension Category="windows.firewallRules">
            <desktop2:FirewallRules Executable="${executable}">
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
  options: MakerOptions,
): MSIXAppManifestMetadata => {
  return {
    appID,
    appName: options.appName,
    appDescription: config.appDescription ?? options.appName,
    executable,
    architecture: options.targetArch,
    version: version.split('.').concat(['0', '0', '0', '0']).slice(0, 4).join('.'),
    publisher: config.publisher,
    protocols: config.protocols,
    baseDownloadURL: config.baseDownloadURL,
  }
}

export const makeAppManifest = async (
  outPath: string,
  manifestConfig: MSIXAppManifestMetadata,
): Promise<FileMapping> => {
  await fs.ensureDir(outPath)
  const outFilePath = path.join(outPath, 'AppxManifest.xml')
  const manifestXML = makeAppManifestXML(manifestConfig)

  fs.writeFile(outFilePath, manifestXML)

  return { 'AppxManifest.xml': outFilePath }
}

export const makeAppInstallerXML = ({
  appName,
  publisher,
  architecture,
  version,
  baseDownloadURL,
}: MSIXAppManifestMetadata) => {
  const MSIXURL = `${baseDownloadURL?.replace(
    /\/+$/,
    '',
  )}/${appName}-${architecture}-${version}.msix`

  return `<?xml version="1.0" encoding="utf-8"?>
<AppInstaller
    xmlns="http://schemas.microsoft.com/appx/appinstaller/2021"
    Version="1.0.0.0"
    Uri="http://mywebservice.azurewebsites.net/appset.appinstaller" >

    <MainBundle
        Name="${appName}"
        Publisher="${publisher.startsWith('CN=') ? publisher : `CN=${publisher}`}"
        Version="${version}"
        Uri="${MSIXURL}" />

    <UpdateSettings>
        <OnLaunch HoursBetweenUpdateChecks="12" />
    </UpdateSettings>
    <UpdateUris>
        <UpdateUri>${MSIXURL}</UpdateUri>
    </UpdateUris>
    <RepairUris>
        <RepairUri>${MSIXURL}</RepairUri>
    </RepairUris>
</AppInstaller>`
}

export const makeAppInstaller = async (
  outPath: string,
  manifestConfig: MSIXAppManifestMetadata,
): Promise<string | undefined> => {
  await fs.ensureDir(outPath)
  const outFilePath = path.join(
    outPath,
    `${manifestConfig.appName}-${manifestConfig.architecture}.AppInstaller`,
  )

  if (manifestConfig.baseDownloadURL) {
    const outXML = makeAppInstallerXML(manifestConfig)
    await fs.writeFile(outFilePath, outXML)
    return outFilePath
  }
}
