import fs from 'fs-extra'
import path from 'node:path'
import Sharp from 'sharp'
import type { FileMapping, MakerMSIXConfig } from './types'

type ImageDimensions = { h: number; w: number; specialName?: string }
const REQUIRED_APPX_DIMENSIONS: ImageDimensions[] = [
  { w: 150, h: 150 },
  { w: 44, h: 44 },
  { w: 310, h: 150 },
  { w: 310, h: 310 },
  { w: 71, h: 71 },
  { w: 50, h: 50, specialName: 'StoreLogo' },
]
const REQUIRED_APPX_SCALES: number[] = [100, 125, 150, 200, 400]

export const makeAppXImages = async (
  appID: string,
  outPath: string,
  config: MakerMSIXConfig
): Promise<FileMapping> => {
  const fileMapping: FileMapping = {}
  const assetPath = path.join(outPath, 'assets')
  await fs.ensureDir(assetPath)
  for (const scale of REQUIRED_APPX_SCALES) {
    const scaleMultiplier = scale / 100.0
    for (const dimensions of REQUIRED_APPX_DIMENSIONS) {
      const { w, h } = dimensions

      const baseName = dimensions.specialName ?? `${appID}-${w}x${h}Logo`

      const imageName = `${baseName}.png`
      const pathinManifestWithoutScale = path.join('assets', imageName)
      const pathOnDiskWithoutScale = path.join(path.join(assetPath, imageName))

      const imageNamewithScale = `${baseName}.scale-${scale}.png`
      const pathOnDiskWithScale = path.join(path.join(assetPath, imageNamewithScale))
      const pathinManifestwithScale = path.join('assets', imageNamewithScale)

      const image = Sharp(config.appIcon)
      // Small touch: superimpose the app icon on a background for banner-sized images
      if ((h > 300 || w > 300) && config.wallpaperIcon) {
        const [imageWidth, imageHeight] = [
          Math.trunc(w * scaleMultiplier),
          Math.trunc(h * scaleMultiplier),
        ]
        const bgimage = Sharp(config.wallpaperIcon).resize(imageWidth, imageHeight, {
          fit: 'cover',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        const overlayicon = await image
          .resize(Math.trunc(imageWidth * 0.85), Math.trunc(imageHeight * 0.85), {
            fit: 'inside',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toBuffer()
        await bgimage
          .composite([{ input: overlayicon, gravity: 'center' }])
          .toFile(pathOnDiskWithScale)
      } else {
        await image
          .resize(Math.trunc(w * scaleMultiplier), Math.trunc(h * scaleMultiplier), {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toFile(pathOnDiskWithScale)
      }

      if (scale === 100) {
        await fs.copyFile(pathOnDiskWithScale, pathOnDiskWithoutScale)
        fileMapping[pathinManifestWithoutScale] = pathOnDiskWithoutScale
      }
      fileMapping[pathinManifestwithScale] = pathOnDiskWithScale
    }
  }

  return fileMapping
}
