export default {
  locale: 'en-US',
  subtitle: 'Smaller images. Full quality.',
  privacyPolicyUrl: 'https://github.com/stacksjs/image-optimization/blob/main/PRIVACY.md',
  description: `Make images lighter, privately on your Mac.

Add images or drop them onto the window. ImageOptimization creates a smaller copy only when it saves space, preserving your originals and avoiding file replacements.

• PNG and JPEG optimization without re-encoding pixels.
• Lossless processing for supported static WebP, GIF, BMP and AVIF images.
• SVG comment removal that preserves text spacing.
• Animation, color profiles and metadata are preserved. Formats that cannot be safely reduced are left unchanged.
• Choose an output folder through the native macOS picker.
• Clear per-image results and visible errors.

No accounts, uploads, advertising or analytics. Processing happens locally with TypeScript codecs built by Stacks. Supports files up to 32 MiB. Savings depend on the image; some images are already optimized.

Free and open source. Requires an Apple Silicon Mac with macOS 15 or later.`,
  keywords: 'image,compress,optimization,lossless,png,jpeg,webp,gif,svg,bmp,avif,private,offline',
  supportUrl: 'https://github.com/stacksjs/image-optimization/issues',
  marketingUrl: 'https://github.com/stacksjs/image-optimization',
  copyright: '2026 Chris Breuer',
  primaryCategory: 'GRAPHICS_AND_DESIGN',
  contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' as const,
  price: '0',
  screenshots: [{ platform: 'MAC_APP_STORE' as const, files: ['.github/art/mac-app-store.jpg'] }],
  submitForReview: true,
}
