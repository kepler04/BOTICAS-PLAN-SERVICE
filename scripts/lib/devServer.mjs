// Arranca y detiene `vite` (dev o preview) para los scripts de navegador, en Windows y en Linux/macOS.
// En POSIX se crea un grupo de procesos propio para poder matar a `npx` y a vite juntos.
import { spawn, spawnSync } from 'node:child_process'

export function startVite(args, { cwd, env }) {
  const child = spawn('npx', ['vite', ...args], { cwd, env, shell: true, detached: process.platform !== 'win32' })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  return { child, log: () => log }
}

export function stopProcess(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true })
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // ya terminó
    }
  }
}

export async function waitForHttp(url, { tries = 60, log = () => '' } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // aún no responde
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`El servidor no respondió en ${url}:\n${log()}`)
}
