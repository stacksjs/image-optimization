import type { NativeBuildConfig } from '@stacksjs/stx/craft'

export default {
  name: 'ImageOptimization',
  input: 'src/pages/index.stx',
  target: 'macos',
  runtimeProfile: 'webview',
  bundleId: 'org.stacksjs.image-optimization',
  icon: 'assets/AppIcon.icns',
  copyright: 'Copyright © 2026 Chris Breuer',
  category: 'public.app-category.graphics-design',
  minimumSystemVersion: '15.0',
  backend: { entry: 'src/api.ts', maxRequestBodySize: 32 * 1024 * 1024 },
  window: { title: 'ImageOptimization', width: 760, height: 560 },
  infoPlist: {
    ITSAppUsesNonExemptEncryption: false,
    NSDesktopFolderUsageDescription: 'Optimize images you choose on your Desktop.',
    NSDocumentsFolderUsageDescription: 'Optimize images you choose in Documents.',
    NSDownloadsFolderUsageDescription: 'Optimize images you choose in Downloads.',
  },
} satisfies NativeBuildConfig
