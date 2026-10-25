#!/usr/bin/env bun
import { resolve, join } from 'node:path'
import { packageApp } from 'craft-native'
import config from '../craft.config'
import pkg from '../package.json'

if (process.platform !== 'darwin') throw new Error('macOS packaging requires macOS')
const app = resolve('dist', `${config.name}.app`)
const store = process.env.DISTRIBUTION === 'app-store'
const release = process.env.RELEASE === '1'
const identity = process.env.APPLE_SIGNING_IDENTITY
const keyPath = process.env.APP_STORE_CONNECT_API_KEY_PATH
const keyId = process.env.APP_STORE_CONNECT_API_KEY_ID
const issuer = process.env.APP_STORE_CONNECT_API_ISSUER_ID
const keychainProfile = process.env.APPLE_NOTARY_PROFILE
const nativeRuntimePath = Bun.which(config.runtimeProfile === 'webview' ? 'craft-webview' : 'craft')
if (!nativeRuntimePath) throw new Error('Install the configured Craft runtime with Pantry before packaging')
if (store && (!identity || !process.env.APPLE_INSTALLER_IDENTITY || !process.env.APPLE_PROVISIONING_PROFILE || !process.env.BUILD_NUMBER))
  throw new Error('App Store packaging requires application and installer identities, a provisioning profile and BUILD_NUMBER')
if (release && !store && (!identity || (!keychainProfile && !(keyPath && keyId && issuer))))
  throw new Error('Release requires a signing identity and notarization credentials')
const results = await packageApp({
  name: config.name,
  version: pkg.version,
  bundleId: config.bundleId,
  binaryPath: join(app, 'Contents/MacOS', config.name),
  outDir: resolve('dist', store ? 'app-store' : 'direct'),
  platforms: ['macos'],
  macos: {
    appBundlePath: app,
    nativeRuntimePath,
    dmg: !store,
    appStore: store,
    signIdentity: identity,
    installerIdentity: process.env.APPLE_INSTALLER_IDENTITY,
    signingKeychain: process.env.APPLE_SIGNING_KEYCHAIN,
    provisioningProfile: store ? process.env.APPLE_PROVISIONING_PROFILE : undefined,
    buildNumber: store ? process.env.BUILD_NUMBER : undefined,
    privacyManifest: resolve('assets/PrivacyInfo.xcprivacy'),
    entitlements: store ? resolve('assets/store-entitlements.plist') : undefined,
    helperEntitlements: resolve(store ? 'assets/store-helper-entitlements.plist' : 'assets/entitlements.plist'),
    notarize: release && !store,
    notaryKeychainProfile: keychainProfile,
    notaryApiKey: keyPath && keyId && issuer ? { path: keyPath, keyId, issuer } : undefined,
  },
})
for (const result of results) {
  if (!result.success) throw new Error(`${result.format}: ${result.error}`)
  console.log(`${result.format}: ${result.outputPath}`)
}
