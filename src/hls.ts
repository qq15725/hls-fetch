export const STREAM_URL_RE = /#EXT-X-STREAM-INF:.+\n(.+)/g
export const CHUNK_URL_RE = /#EXTINF:.+\n(.+)/g
export const X_KEY_URL_RE = /#EXT-X-KEY.*URI="(.+)".*/g

function parseUrl(url: string, baseUrl: string) {
  if (url.startsWith('http')) {
    return url
  } else if (url.startsWith('/')) {
    return `${ new URL(baseUrl).origin }${ url }`
  } else {
    return `${ baseUrl }${ url }`
  }
}

export function parsePlaylist(content: string, baseUrl: string) {
  const streamUrls = Array.from(content.matchAll(STREAM_URL_RE), m => parseUrl(m[1], baseUrl))
  const chunkUrls: string[] = []
  const xKeyUrls: string[] = []
  let i = 0
  const replacedContent = content
    .replace(CHUNK_URL_RE, (val, url) => {
      chunkUrls.push(parseUrl(url, baseUrl))
      return val.replace(url, `${ i++ }.ts`)
    })
    .replace(X_KEY_URL_RE, (val, url) => {
      xKeyUrls.push(parseUrl(url, baseUrl))
      return val.replace(url, 'x.key')
    })
  return {
    streamUrls,
    chunkUrls,
    xKeyUrls,
    replacedContent,
  }
}
