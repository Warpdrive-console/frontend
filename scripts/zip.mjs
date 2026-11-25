import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const zipPath = path.join(root, 'nova.zip')
await rm(zipPath, { force: true })

const zip = spawnSync('zip', ['-qr', zipPath, '.'], { cwd: path.join(root, 'dist'), stdio: 'inherit' })
if (zip.error) {
  console.warn(`zip was not run (${zip.error.message}); dist/ is ready`)
} else if (zip.status !== 0) {
  process.exit(zip.status ?? 1)
}
