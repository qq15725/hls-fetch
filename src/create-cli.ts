import path from 'node:path'
import fs from 'node:fs'
import { cac } from 'cac'
import colors from 'picocolors'
import Progress from 'progress'
import fetch from 'node-fetch'
import { bin, version } from '../package.json'
import { createFfmpeg } from './ffmpeg'
import type { Options } from './types'

export function createCli(options: Options) {
  const { cwd } = options

  const cli = cac(Object.keys(bin)[0])

  cli
    .command('<url> <output>', 'm3u8 url')
    .option('--number <number>', 'Concurrent requests')
    .action(async (url: string, output: string, options: Record<string, any>) => {
      output = path.resolve(cwd, output)
      const number = options.number ?? 5
      const content = await fetch(url).then(res => res.text())
      const chunks = content.match(/.+\.ts/ig)
      if (!chunks) return
      const total = chunks.length
      const baseUrl = url.substring(0, url.length - path.basename(url).length)
      const dir = path.join(path.dirname(output), path.basename(output).split('.')[0])
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const indexM3u3 = path.join(dir, 'index.m3u8')
      if (!fs.existsSync(indexM3u3)) {
        let i = 0
        fs.writeFileSync(
          indexM3u3,
          content.replace(/.+\.ts/ig, () => {
            return `${ i++ }.ts`
          }),
          'utf8',
        )
      }

      const bar = new Progress(
        `${ colors.green('Downloading') } ${ colors.cyan('[:bar]') } :percent | Time: :elapseds`,
        {
          width: 40,
          complete: '\u2588',
          incomplete: '\u2591',
          total,
        },
      )

      let index = 0
      await Promise.all(
        [...new Array(number)].map(async () => {
          let chunkIndex = index++
          while (chunks[chunkIndex]) {
            let chunk = chunks[chunkIndex]
            if (!/^http/.test(chunk)) {
              chunk = `${ baseUrl }${ chunk }`
            }
            const filename = path.join(dir, `${ chunkIndex }.ts`)
            if (!fs.existsSync(filename)) {
              const content = await fetch(chunk).then(res => res.arrayBuffer())
              fs.writeFileSync(filename, Buffer.from(content))
            }
            bar.update((index + 1) / total)
            chunkIndex = index++
          }
        }),
      )

      const ffconcat = path.join(dir, 'ffconcat.txt')
      if (!fs.existsSync(ffconcat)) {
        fs.writeFileSync(
          ffconcat,
          [
            'ffconcat version 1.0',
            ...chunks.map((_, index) => `file ${ index }.ts`),
          ].join('\n'),
          'utf8',
        )
      }

      bar.update(1)
      bar.terminate()

      const ffmpeg = createFfmpeg([
        '-i', ffconcat,
        '-acodec', 'copy',
        '-vcodec', 'copy',
        '-absf', 'aac_adtstoasc',
        output,
      ])

      await ffmpeg.await()
    })

  cli
    .help()
    .version(version)
    .parse(process.argv, { run: false })

  return cli
}
