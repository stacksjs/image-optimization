#!/usr/bin/env bun
import { AppStoreConnectClient, ensureAppStoreVersions, waitForAppStoreBuilds, prepareAppStoreSubmission, submitAppStore } from 'ts-pantry'
import metadata from '../app-store.config'
import config from '../craft.config'
import pkg from '../package.json'

const client = new AppStoreConnectClient()
const app = await client.findApp(config.bundleId)
if (!app) throw new Error('Create the app record in App Store Connect before publishing')
const contact = JSON.parse(process.env.APPLE_REVIEW_CONTACT ?? '{}')
for (const field of ['firstName', 'lastName', 'phone', 'email'])
  if (!contact[field]) throw new Error(`APPLE_REVIEW_CONTACT requires ${field}`)
const store = {
  ...metadata,
  reviewContact: {
    ...contact,
    notes: 'No sign-in is required. Choose Add images and select a PNG, JPEG or other supported image. Choose an output folder when prompted. The app saves a smaller copy only when possible and preserves the original. The authenticated loopback server is the bundled local processing helper; no images are uploaded. The project is open source at https://github.com/stacksjs/image-optimization.',
  },
}
const versions = await ensureAppStoreVersions(client, app.id, [{ platform: 'MAC_OS', version: pkg.version }])
if (versions.some(version => version.status === 'deferred')) throw new Error(versions.map(version => version.reason).join('\n'))
if (process.argv.includes('--prepare')) {
  await prepareAppStoreSubmission(client, store, app.id, versions.map(version => ({ platform: 'macos', id: version.id })), { submit: false })
  console.log('App Store metadata and screenshots prepared')
}
else {
  const build = process.env.BUILD_NUMBER
  if (!build) throw new Error('BUILD_NUMBER is required')
  await waitForAppStoreBuilds(client, app.id, versions, build)
  const result = await submitAppStore(store, { bundleId: config.bundleId, version: pkg.version, platforms: ['macos'], submit: true })
  console.log(JSON.stringify(result))
}
