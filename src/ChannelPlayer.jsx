import { useEffect, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, X } from 'lucide-react'
import { inspectStreamUrl } from './player-utils'

const protocolErrors = {
  invalid: 'A URL deste canal está ausente ou inválida.',
  protocol: 'O navegador só pode abrir streams HTTP ou HTTPS.',
  insecure: 'Este canal usa HTTP. Em uma página HTTPS, o navegador bloqueia essa transmissão insegura.',
}

export default function ChannelPlayer({ channel, onClose }) {
  const dialogRef = useRef(null)
  const videoRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const video = videoRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    let hls
    let cancelled = false

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

    const stream = inspectStreamUrl(channel.url)
    if (!stream.ok) {
      setError(protocolErrors[stream.reason])
      setLoading(false)
    } else {
      const showMediaError = () => {
        if (!cancelled) {
          setLoading(false)
          setError('O navegador não conseguiu reproduzir este canal. Verifique a disponibilidade, o CORS e o formato do stream.')
        }
      }

      video.addEventListener('error', showMediaError)
      const load = async () => {
        try {
          if (stream.isHls) {
            const { default: Hls } = await import('hls.js')
            if (cancelled) return
            if (Hls.isSupported()) {
              hls = new Hls({ enableWorker: true })
              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal && !cancelled) {
                  setLoading(false)
                  setError(data.type === Hls.ErrorTypes.NETWORK_ERROR
                    ? 'Falha de rede ou CORS ao carregar este canal.'
                    : 'O navegador não suporta o formato deste canal.')
                }
              })
              hls.loadSource(stream.url)
              hls.attachMedia(video)
              return
            }
            if (!video.canPlayType('application/vnd.apple.mpegurl')) {
              setLoading(false)
              setError('Este navegador não oferece suporte à reprodução HLS.')
              return
            }
          }
          video.src = stream.url
          video.load()
        } catch {
          if (!cancelled) {
            setLoading(false)
            setError('Não foi possível iniciar o player neste navegador.')
          }
        }
      }
      load()
      return () => {
        cancelled = true
        window.removeEventListener('keydown', closeOnEscape)
        video.removeEventListener('error', showMediaError)
        hls?.destroy()
        video.pause()
        video.removeAttribute('src')
        video.load()
        document.body.style.overflow = previousOverflow
        previousFocus?.focus?.()
      }
    }

    return () => {
      cancelled = true
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [channel.url, onClose])

  return <div className="player-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="player-dialog" role="dialog" aria-modal="true" aria-labelledby="player-title" tabIndex={-1} ref={dialogRef}>
      <header className="player-header">
        <div><span className="eyebrow">VISUALIZADOR</span><h2 id="player-title">{channel.name || 'Canal sem nome'}</h2><p>{channel.category || channel.groupTitle || channel.group || 'Sem categoria'}</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar player"><X size={18}/></button>
      </header>
      <div className="player-stage">
        <video ref={videoRef} controls autoPlay playsInline aria-label={`Transmissão de ${channel.name || 'canal'}`} onCanPlay={() => { setLoading(false); setError('') }}/>
        {loading && <div className="player-feedback"><LoaderCircle size={22} className="spin"/><span>Conectando ao canal…</span></div>}
        {error && <div className="player-feedback player-error" role="alert"><AlertCircle size={22}/><span>{error}</span></div>}
      </div>
      <p className="player-note">Reprodução direta do stream autorizado. Alguns provedores bloqueiam reprodução no navegador.</p>
    </section>
  </div>
}
