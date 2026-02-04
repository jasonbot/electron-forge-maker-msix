import fs from 'fs-extra'
import path from 'node:path'
import Sharp from 'sharp'
import type { MakerMSIXConfig } from './types'

type ImageDimensions = {
  w: number
  h: number
  specialName?: string
}
const REQUIRED_APPX_DIMENSIONS: ImageDimensions[] = [
  { w: 150, h: 150 },
  { w: 44, h: 44 },
  { w: 310, h: 150 },
  { w: 310, h: 310 },
  { w: 71, h: 71 },
  { w: 50, h: 50, specialName: 'StoreLogo' },
]
const REQUIRED_APPX_SCALES: number[] = [100, 125, 150, 200, 400]
const INVISIBLE: Sharp.RGBA = { r: 0, g: 0, b: 0, alpha: 0 }

export const makeAppXImages = async (
  appID: string,
  outPath: string,
  config: MakerMSIXConfig
): Promise<void> => {
  const assetPath = path.join(outPath, 'assets')
  await fs.ensureDir(assetPath)
  for (const scale of REQUIRED_APPX_SCALES) {
    const scaleMultiplier = scale / 100.0

    for (const dimensions of REQUIRED_APPX_DIMENSIONS) {
      const { w, h } = dimensions
      const [imageWidth, imageHeight] = [
        Math.trunc(w * scaleMultiplier),
        Math.trunc(h * scaleMultiplier),
      ]

      const baseName = dimensions.specialName ?? `${appID}-${w}x${h}Logo`

      const imageNamewithScale = `${baseName}.scale-${scale}.png`
      const pathOnDiskWithScale = path.join(path.join(assetPath, imageNamewithScale))

      const image = Sharp(config.appIcon)
      // Small touch: superimpose the app icon on a background for banner-sized images
      if ((h > 300 || w > 300) && config.wallpaperIcon) {
        const bgimage = Sharp(config.wallpaperIcon).resize(imageWidth, imageHeight, {
          fit: 'cover',
          background: INVISIBLE,
        })
        const overlayicon = await image
          .resize(Math.trunc(imageWidth * 0.85), Math.trunc(imageHeight * 0.85), {
            fit: 'inside',
            background: INVISIBLE,
          })
          .toBuffer()
        await bgimage
          .composite([{ input: overlayicon, gravity: 'center' }])
          .toFile(pathOnDiskWithScale)
      } else {
        await image
          .resize(imageWidth, imageHeight, {
            fit: 'contain',
            background: INVISIBLE,
          })
          .toFile(pathOnDiskWithScale)
      }

      if (scale === 100) {
        const imageName = `${baseName}.png`
        const pathOnDiskWithoutScale = path.join(path.join(assetPath, imageName))
        await fs.copyFile(pathOnDiskWithScale, pathOnDiskWithoutScale)

        const unplatedLightImageName = `${baseName}.targetsize-${dimensions.w}_altform-lightunplated.png`
        const pathOnDiskWithoutScaleAndUnplated = path.join(
          path.join(assetPath, unplatedLightImageName)
        )
        await fs.copyFile(pathOnDiskWithScale, pathOnDiskWithoutScaleAndUnplated)

        const unplatedDarkImageName = `${baseName}.targetsize-${dimensions.w}_altform-unplated.png`
        const pathOnDiskWithoutScaleAndDarkUnplated = path.join(
          path.join(assetPath, unplatedDarkImageName)
        )
        await fs.copyFile(pathOnDiskWithScale, pathOnDiskWithoutScaleAndDarkUnplated)
      }
    }
  }
}
