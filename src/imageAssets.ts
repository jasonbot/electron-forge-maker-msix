import fs from 'fs-extra'
import path from 'node:path'
import { Jimp } from 'jimp'
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
const REQUIRED_APPX_SCALES: number[] = [400] // , 125, 150, 200, 400]

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

      const imageNamewithScale = `${baseName}.scale-${scale}`
      const pathOnDiskWithScaleWithoutPng = path.join(path.join(assetPath, imageNamewithScale))
      const pathOnDiskWithScale: `${string}.${string}` = `${pathOnDiskWithScaleWithoutPng}.${'png'}`

      const image = await Jimp.read(config.appIcon)

      // Small touch: superimpose the app icon on a background for banner-sized images
      if ((h > 300 || w > 300) && config.wallpaperIcon) {
        const bgimage = (await Jimp.read(config.wallpaperIcon)).cover({
          w: imageWidth,
          h: imageHeight,
        })
        const overlayicon = await image.contain({
          w: Math.trunc(imageWidth * 0.85),
          h: Math.trunc(imageHeight * 0.85),
        })
        await bgimage
          .composite(
            overlayicon,
            bgimage.width / 2 - overlayicon.width / 2,
            bgimage.height / 2 - overlayicon.height / 2
          )
          .write(pathOnDiskWithScale)
      } else {
        await image.cover({ w: imageWidth, h: imageHeight }).write(pathOnDiskWithScale)
      }

      if (scale === 400) {
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
