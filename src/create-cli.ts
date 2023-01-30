import path from 'node:path'
import fs from 'node:fs'
import { cac } from 'cac'
import colors from 'picocolors'
import Progress from 'progress'
import fetch from 'node-fetch'
import { bin, version } from '../package.json'
import { createFfmpeg } from './ffmpeg'
import { parsePlaylist } from './hls'
import type { Options } from './types'

export function createCli(options: Options) {
  const { cwd } = options

  const cli = cac(Object.keys(bin)[0])

  cli
    .command('<url> <output>', 'm3u8 url')
    .option('--number <number>', 'Concurrent requests')
    .action(async (url: string, output: string, options: Record<string, any>) => {
      output = path.resolve(cwd, output)
      const baseUrl = url.substring(0, url.length - path.basename(url).length)
      const dir = path.join(path.dirname(output), path.basename(output).split('.')[0])
      const { number = 5 } = options
      let content = await fetch(url).then(res => res.text())
      // eslint-disable-next-line prefer-const
      let { streamUrls, xKeyUrls, chunkUrls, replacedContent } = parsePlaylist(content, baseUrl)
      if (streamUrls.length) {
        content = await fetch(streamUrls[0]).then(res => res.text())
        const parsed = parsePlaylist(content, baseUrl)
        xKeyUrls = parsed.xKeyUrls
        chunkUrls = parsed.chunkUrls
        replacedContent = parsed.replacedContent
      }

      if (!chunkUrls.length) return
      const total = chunkUrls.length
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      if (xKeyUrls.length) {
        fs.writeFileSync(
          path.join(dir, 'x.key'),
          Buffer.from(
            await fetch(xKeyUrls[0]).then(res => res.arrayBuffer()),
          ),
        )
      }

      const indexM3u3 = path.join(dir, 'index.m3u8')
      fs.writeFileSync(
        indexM3u3,
        replacedContent,
        'utf8',
      )

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
          while (chunkUrls[chunkIndex]) {
            const filename = path.join(dir, `${ chunkIndex }.ts`)
            if (!fs.existsSync(filename)) {
              const content = await fetch(chunkUrls[chunkIndex]).then(res => res.arrayBuffer())
              fs.writeFileSync(filename, Buffer.from(content))
            }
            bar.update((index + 1) / total)
            chunkIndex = index++
          }
        }),
      )

      bar.update(1)
      bar.terminate()

      const ffmpeg = createFfmpeg([
        '-allowed_extensions', 'ALL',
        '-i', indexM3u3,
        '-acodec', 'copy',
        '-vcodec', 'copy',
        '-absf', 'aac_adtstoasc',
        output,
      ])

      await ffmpeg.await()

      fs.rmdirSync(dir)
    })

  cli
    .help()
    .version(version)
    .parse(process.argv, { run: false })

  return cli
}
