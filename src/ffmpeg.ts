import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

export function createFfmpeg(args: string[]): ChildProcess & { await: any } {
  args = [
    '-v', 'error',
    '-stats',
    '-hide_banner',
    '-y',
    ...args,
  ]
  const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args) as ChildProcess
  ;(ffmpeg as any).await = () => new Promise((resolve, reject) => {
    ffmpeg.stdin?.on('error', err => {
      if ((err as any).code !== 'EPIPE') {
        return reject(err)
      }
    })
    ffmpeg.on('exit', status => {
      if (status) {
        return reject(new Error(`FFmpeg exited with status ${ status }`))
      } else {
        return resolve(true)
      }
    })
  })
  ffmpeg.stdout?.pipe(process.stdout)
  ffmpeg.stderr?.pipe(process.stderr)
  return ffmpeg as any
}
