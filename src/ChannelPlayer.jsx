import { useEffect, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, X } from 'lucide-react'
import { inspectStreamUrl, secureStreamUrl } from './player-utils'

const protocolErrors = {
  credentials: 'Este endereço contém credenciais que o player web não aceita.',
  invalid: 'A URL deste canal está ausente ou inválida.',
  protocol: 'O navegador só pode abrir streams HTTP ou HTTPS.',
  insecure: 'Este canal usa HTTP. Em uma página HTTPS, o navegador bloqueia essa transmissão insegura.',
}

export default function ChannelPlayer({ channel, onClose }) {
  const dialogRef = useRef(null)
  const videoRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [attempt, setAttempt] = useState(0)
  const [copyFeedback, setCopyFeedback] = useState('')
  const original = inspectStreamUrl(channel.url, 'http:')

  async function copyStream() {
    try {
      await navigator.clipboard.writeText(original.url)
      setCopyFeedback('Endereço copiado. No VLC, use Mídia > Abrir fluxo de rede.')
    } catch {
      setCopyFeedback('O navegador não permitiu copiar o endereço.')
    }
  }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), video[controls]')
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [onClose])

  useEffect(() => {
    const video = videoRef.current
    let hls
    let cancelled = false
    const input = inspectStreamUrl(channel.url)
    const upgraded = input.reason === 'insecure' ? secureStreamUrl(channel.url) : null
    const stream = upgraded ? inspectStreamUrl(upgraded) : input
    let timeout
    let failed = false

    const stop = () => {
      clearTimeout(timeout)
      hls?.destroy()
      hls = undefined
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    const fail = message => {
      if (cancelled || failed) return
      failed = true
      setLoading(false)
      setError(message)
      stop()
    }
    const ready = () => {
      clearTimeout(timeout)
      if (!failed) setLoading(false)
    }
    const connectionError = upgraded
      ? 'A versão HTTPS da fonte não abriu. Use o endereço original em um aplicativo IPTV.'
      : 'A fonte não abriu no navegador. A origem pode estar indisponível ou ter restrições de TLS ou CORS.'
    const mediaError = () => fail(video.error?.code === 3
      ? 'O navegador não conseguiu decodificar o vídeo.'
      : connectionError)

    if (!stream.ok) {
      fail(protocolErrors[stream.reason])
    } else {
      video.addEventListener('error', mediaError)
      video.addEventListener('canplay', ready)
      timeout = setTimeout(() => fail(connectionError), 15000)

      async function load() {
        try {
          if (!stream.isHls || video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = stream.url
            video.load()
            return
          }
          const { default: Hls } = await import('hls.js')
          if (cancelled || failed) return
          if (!Hls.isSupported()) {
            fail('Este navegador não oferece suporte à reprodução HLS.')
            return
          }
          hls = new Hls()
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) fail(data.type === Hls.ErrorTypes.NETWORK_ERROR
              ? connectionError
              : 'O formato do canal não pôde ser reproduzido neste navegador.')
          })
          hls.loadSource(stream.url)
          hls.attachMedia(video)
        } catch {
          fail('Não foi possível iniciar o player neste navegador.')
        }
      }

      load()
    }

    return () => {
      cancelled = true
      video.removeEventListener('error', mediaError)
      video.removeEventListener('canplay', ready)
      stop()
    }
  }, [channel.url, attempt])

  return <div className="player-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="player-dialog" role="dialog" aria-modal="true" aria-labelledby="player-title" tabIndex={-1} ref={dialogRef}>
      <header className="player-header">
        <div><span className="eyebrow">VISUALIZADOR</span><h2 id="player-title">{channel.name || 'Canal sem nome'}</h2><p>{channel.category || channel.groupTitle || channel.group || 'Sem categoria'}</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar player"><X size={18}/></button>
      </header>
      <div className="player-stage">
        <video ref={videoRef} controls autoPlay playsInline aria-label={`Transmissão de ${channel.name || 'canal'}`}/>
        {loading && <div className="player-feedback"><LoaderCircle size={22} className="spin"/><span>Conectando ao canal…</span></div>}
        {error && <div className="player-feedback player-error" role="alert"><AlertCircle size={22}/><span>{error}</span></div>}
      </div>
      {error && original.ok && <div className="player-recovery">
        <button className="button secondary" type="button" onClick={() => {
          setError('')
          setCopyFeedback('')
          setLoading(true)
          dialogRef.current?.focus()
          setAttempt(value => value + 1)
        }}>Tentar novamente</button>
        <button className="button secondary" type="button" onClick={copyStream}>Copiar endereço para VLC</button>
        <span role="status">{copyFeedback}</span>
      </div>}
    </section>
  </div>
}
