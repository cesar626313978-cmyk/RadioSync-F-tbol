/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Radio,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Tv,
  Clock,
  Sparkles,
  Download,
  Share2,
  Check,
  RefreshCw,
  Zap,
  Volume1,
  Music,
} from 'lucide-react';
import { usePWAInstall } from './hooks/usePWAInstall';
import { SoccerBall, SoccerFieldBackground, PitchCardCorner } from './components/SoccerDecorations';

// --- LISTA DE EMISORAS DEPORTIVAS ESPAÑOLAS CON ENLACES VERIFICADOS ---
interface RadioStation {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  color: string;
  streamUrl: string;
  backupUrl?: string;
  isHls?: boolean;
}

const STATIONS: RadioStation[] = [
  {
    id: 'ser',
    name: 'Cadena SER',
    tagline: 'Carrusel Deportivo / El Larguero',
    badge: 'SER',
    color: '#fbbf24',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASER.mp3',
    backupUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASER_SC',
  },
  {
    id: 'cope',
    name: 'Cadena COPE',
    tagline: 'Tiempo de Juego / El Partidazo',
    badge: 'COPE',
    color: '#38bdf8',
    streamUrl: 'https://net1-cope-rrcast.flumotion.com/cope/net1-low.mp3',
    backupUrl: 'https://flucast09-h-cloud.flumotion.com/cope/net1.mp3',
  },
  {
    id: 'marca',
    name: 'Radio Marca',
    tagline: 'Marcador / La Radio del Deporte',
    badge: 'MARCA',
    color: '#ef4444',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOMARCA_NACIONAL_SC',
    backupUrl: 'https://radiomarcavalladolid.streaming-pro.com:6106/radiomarca.mp3',
  },
  {
    id: 'ondacero',
    name: 'Onda Cero',
    tagline: 'Radioestadio / Radioestadio Noche',
    badge: 'ONDA',
    color: '#34d399',
    streamUrl: 'https://atres-live.ondacero.es/live/ondacero/bitrate_1.m3u8',
    backupUrl: 'https://srv7021.dns-lcinternet.com/8012/stream',
    isHls: true,
  },
  {
    id: 'rne',
    name: 'RNE Radio 1',
    tagline: 'Tablero Deportivo / Radio Nacional',
    badge: 'RNE 1',
    color: '#f97316',
    streamUrl: 'https://dispatcher.rndfnk.com/crtve/rne1/mad/mp3/high',
    backupUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r1_main.m3u8',
  },
  {
    id: 'esradio',
    name: 'esRadio',
    tagline: 'Fútbol esRadio / Libertad Digital',
    badge: 'esR',
    color: '#a855f7',
    streamUrl: 'https://libertaddigital-radio-live1.flumotion.com/libertaddigital/ld-live1-low.mp3',
    backupUrl: 'http://livestreaming.esradio.fm/stream64.mp3',
  },
];

// Presets de streaming habituales para fútbol
const STREAMING_PRESETS = [
  { label: 'Directo (0s)', delay: 0.0 },
  { label: 'TDT TV (~3s)', delay: 3.2 },
  { label: 'Movistar+ (~18s)', delay: 18.5 },
  { label: 'DAZN (~26s)', delay: 26.0 },
  { label: 'Orange TV (~21s)', delay: 21.0 },
  { label: 'Web / Streaming (~48s)', delay: 48.0 },
];

// --- CÓDIGO DEL AUDIOWORKLET PROCESSOR INLINE ---
// Soporta hasta 180s en estéreo con arranque instantáneo en directo y rampa suave hacia el retardo memorizado
const AUDIO_WORKLET_CODE = `
class CircularDelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'delayTime',
        defaultValue: 0,
        minValue: 0,
        maxValue: 180,
        automationRate: 'k-rate'
      }
    ];
  }

  constructor() {
    super();
    // Búfer circular de 180 segundos a frecuencia de muestreo del contexto
    this.maxSamples = Math.ceil(sampleRate * 180) + 4096;
    this.bufferL = new Float32Array(this.maxSamples);
    this.bufferR = new Float32Array(this.maxSamples);
    this.writeIndex = 0;

    // Estado de retardo actual en muestras
    this.currentDelaySamples = 0.0;
    this.targetDelaySamples = 0.0;
    this.isPaused = false;
    this.validSamplesCount = 0;
    this.lastNotifyFrame = 0;
    this.isRamping = false;

    this.port.onmessage = (e) => {
      const data = e.data;
      if (data === 'pause') {
        this.isPaused = true;
        this.bufferL.fill(0);
        this.bufferR.fill(0);
        this.validSamplesCount = 0;
        this.currentDelaySamples = 0.0;
        this.targetDelaySamples = 0.0;
        this.isRamping = false;
      } else if (data === 'resume') {
        this.isPaused = false;
      } else if (data === 'start-ramp' || (data && data.type === 'start-ramp')) {
        // Al conmutar de emisora:
        // Sonar de inmediato en DIRECTO (0s de retardo)
        // y acumular el retardo suavemente sin silencios previos
        this.isPaused = false;
        this.bufferL.fill(0);
        this.bufferR.fill(0);
        this.validSamplesCount = 0;
        this.currentDelaySamples = 0.0;
        this.isRamping = true;
        if (data && typeof data.targetDelay === 'number') {
          this.targetDelaySamples = Math.max(0, Math.min(this.maxSamples - 256, data.targetDelay * sampleRate));
        }
      } else if (data && data.type === 'set-target-delay') {
        this.targetDelaySamples = Math.max(0, Math.min(this.maxSamples - 256, data.targetDelay * sampleRate));
      } else if (data && data.type === 'jump-to-delay') {
        // Salto forzado si el usuario no desea esperar la rampa progresiva
        this.currentDelaySamples = Math.max(0, Math.min(this.validSamplesCount, data.delay * sampleRate));
        this.targetDelaySamples = this.currentDelaySamples;
        this.isRamping = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || !output[0]) return true;

    const outL = output[0];
    const outR = output[1] || output[0];

    // Si está pausado, silenciar salida inmediatamente sin retardo
    if (this.isPaused) {
      outL.fill(0);
      if (outR && outR !== outL) outR.fill(0);
      return true;
    }

    if (!input || !input[0] || input[0].length === 0) {
      outL.fill(0);
      if (outR && outR !== outL) outR.fill(0);
      return true;
    }

    const inL = input[0];
    const inR = input[1] || input[0];
    const frames = inL.length;

    // Sincronizar target con el AudioParam si no estamos en rampa de conmutación
    const paramDelaySec = parameters.delayTime ? parameters.delayTime[0] : 0;
    const paramDelaySamples = Math.max(0, Math.min(this.maxSamples - 256, paramDelaySec * sampleRate));
    if (!this.isRamping) {
      this.targetDelaySamples = paramDelaySamples;
    }

    // Tasa suave de ajuste por muestra (0.10 proporciona ralentización musical sutil ~10%)
    const maxRampStep = 0.10;
    const normalSlew = 0.005;

    for (let i = 0; i < frames; i++) {
      // 1. Escribir audio entrante en el búfer circular
      this.bufferL[this.writeIndex] = inL[i];
      this.bufferR[this.writeIndex] = inR[i];
      if (this.validSamplesCount < this.maxSamples) {
        this.validSamplesCount++;
      }

      // 2. Techo seguro de retardo: nunca leer más atrás del audio real acumulado
      const maxAvailableDelay = Math.max(0, this.validSamplesCount - 32);
      const effectiveTarget = Math.min(this.targetDelaySamples, maxAvailableDelay);

      const delta = effectiveTarget - this.currentDelaySamples;

      if (this.isRamping) {
        if (delta > 0) {
          const step = Math.min(delta, maxRampStep);
          this.currentDelaySamples += step;
        } else if (delta < 0) {
          const step = Math.min(-delta, maxRampStep);
          this.currentDelaySamples -= step;
        } else if (this.currentDelaySamples >= this.targetDelaySamples - 100) {
          this.isRamping = false;
        }
      } else {
        if (Math.abs(delta) > 0.01) {
          this.currentDelaySamples += delta * normalSlew;
        } else {
          this.currentDelaySamples = effectiveTarget;
        }
      }

      // Clamp dentro de los límites
      if (this.currentDelaySamples > maxAvailableDelay) {
        this.currentDelaySamples = maxAvailableDelay;
      }
      if (this.currentDelaySamples < 0) {
        this.currentDelaySamples = 0;
      }

      // 3. Posición flotante de lectura
      let readPos = this.writeIndex - this.currentDelaySamples;
      while (readPos < 0) readPos += this.maxSamples;
      while (readPos >= this.maxSamples) readPos -= this.maxSamples;

      // 4. Interpolación lineal para transición libre de clics
      const idx0 = Math.floor(readPos);
      const idx1 = (idx0 + 1) % this.maxSamples;
      const frac = readPos - idx0;

      outL[i] = this.bufferL[idx0] * (1.0 - frac) + this.bufferL[idx1] * frac;
      if (outR && outR !== outL) {
        outR[i] = this.bufferR[idx0] * (1.0 - frac) + this.bufferR[idx1] * frac;
      }

      this.writeIndex = (this.writeIndex + 1) % this.maxSamples;
    }

    // 5. Notificar estado al hilo principal ~5 veces por segundo
    this.lastNotifyFrame += frames;
    if (this.lastNotifyFrame >= sampleRate * 0.2) {
      this.lastNotifyFrame = 0;
      const curSec = this.currentDelaySamples / sampleRate;
      const tgtSec = this.targetDelaySamples / sampleRate;
      const isStillRamping = this.isRamping && (tgtSec - curSec > 0.3);
      this.port.postMessage({
        type: 'ramp-status',
        currentDelay: curSec,
        targetDelay: tgtSec,
        isRamping: isStillRamping
      });
    }

    return true;
  }
}

registerProcessor('circular-delay-processor', CircularDelayProcessor);
`;

export default function App() {
  // --- ESTADO PRINCIPAL ---
  // Memoria de retardo individual por emisora (persistente en localStorage)
  const [stationDelays, setStationDelays] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('radiosync_station_delays');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      ser: 0.0,
      cope: 0.0,
      marca: 0.0,
      ondacero: 0.0,
      rne: 0.0,
      esradio: 0.0,
    };
  });

  const [selectedStation, setSelectedStation] = useState<RadioStation>(STATIONS[0]);
  const [customUrl, setCustomUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [delay, setDelay] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('radiosync_station_delays');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed[STATIONS[0].id] ?? 0.0;
      }
    } catch (e) {}
    return 0.0;
  });
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [commentaryBoost, setCommentaryBoost] = useState(false);
  const [visualizerMode, setVisualizerMode] = useState<'bars' | 'wave' | 'vu'>('bars');
  const [usingBackup, setUsingBackup] = useState(false);

  // Marcador de Sincronización Rápida
  const [syncStep, setSyncStep] = useState<0 | 1>(0);
  const [syncOrigin, setSyncOrigin] = useState<'tv-first' | 'radio-first'>('radio-first');
  const [syncTimestamp, setSyncTimestamp] = useState<number | null>(null);
  const [syncTimerSeconds, setSyncTimerSeconds] = useState<number>(0);
  const syncIntervalRef = useRef<number | null>(null);

  // Estado de Rampa Suave de Audio
  const [liveAudioDelay, setLiveAudioDelay] = useState<number>(0);
  const [isRampingDelay, setIsRampingDelay] = useState<boolean>(false);

  // PWA Hook
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissTooltip, setDismissTooltip] = useState(false);

  // Referencias de Web Audio y HLS
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const delayNodeRef = useRef<AudioWorkletNode | null>(null);
  const boostFilterRef = useRef<BiquadFilterNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  // Limpieza proactiva de cachés antiguas del Service Worker
  useEffect(() => {
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (key !== 'radiosync-cache-v3') {
            caches.delete(key);
          }
        });
      });
    }
  }, []);

  const handleForceRefresh = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
    } catch (e) {
      console.warn(e);
    }
    window.location.reload();
  };

  // --- INICIALIZACIÓN DE MOTOR WEB AUDIO ---
  const initAudioEngine = async () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    // Cargar AudioWorkletProcessor inline vía Blob URL
    const blob = new Blob([AUDIO_WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    // Delay Node de 180s estéreo
    const delayNode = new AudioWorkletNode(ctx, 'circular-delay-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    delayNode.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === 'ramp-status') {
        setLiveAudioDelay(parseFloat(data.currentDelay.toFixed(1)));
        setIsRampingDelay(data.isRamping);
      }
    };
    delayNodeRef.current = delayNode;

    // Filtro de comentaristas (Realce vocal +5dB a 2.4kHz)
    const boostFilter = ctx.createBiquadFilter();
    boostFilter.type = 'peaking';
    boostFilter.frequency.value = 2400;
    boostFilter.Q.value = 1.2;
    boostFilter.gain.value = commentaryBoost ? 5 : 0;
    boostFilterRef.current = boostFilter;

    // Ganancia
    const gainNode = ctx.createGain();
    gainNode.gain.value = isMuted ? 0 : volume;
    gainNodeRef.current = gainNode;

    // Analizador de espectro para canvas
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.8;
    analyserNodeRef.current = analyser;

    // Conectar el elemento HTMLAudio al grafo
    if (audioElRef.current && !sourceNodeRef.current) {
      try {
        const srcNode = ctx.createMediaElementSource(audioElRef.current);
        sourceNodeRef.current = srcNode;

        // Conexiones: Fuente -> Delay -> Boost -> Gain -> Analyser -> Salida
        srcNode.connect(delayNode);
        delayNode.connect(boostFilter);
        boostFilter.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(ctx.destination);
      } catch (err) {
        console.warn('Conexión de nodo:', err);
      }
    }

    updateWorkletDelay(delay);
    return ctx;
  };

  // Actualizar retardo en el procesador
  const updateWorkletDelay = useCallback((val: number) => {
    if (delayNodeRef.current && audioCtxRef.current) {
      const param = delayNodeRef.current.parameters.get('delayTime');
      if (param) {
        param.setValueAtTime(val, audioCtxRef.current.currentTime);
      }
    }
  }, []);

  const handleDelayChange = (newVal: number) => {
    const clamped = Math.max(0, Math.min(180, parseFloat(newVal.toFixed(1))));
    setDelay(clamped);
    updateWorkletDelay(clamped);
    delayNodeRef.current?.port.postMessage({
      type: 'set-target-delay',
      targetDelay: clamped,
    });
    updateMediaSession(clamped);

    // Guardar en la memoria persistente individual de la emisora activa
    setStationDelays((prev) => {
      const updated = { ...prev, [selectedStation.id]: clamped };
      try {
        localStorage.setItem('radiosync_station_delays', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleStepDelay = (delta: number) => {
    handleDelayChange(delay + delta);
  };

  // --- CONTROL SEGURO DE SLIDER POR ARRASTRE DE BOLA (PROTEGIDO CONTRA TOQUES EN EL CARRIL) ---
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  const calculateDelayFromPointer = (clientX: number) => {
    if (!trackRef.current) return delay;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return delay;
    const ballRadius = 16;
    const availableWidth = rect.width - ballRadius * 2;
    if (availableWidth <= 0) return delay;
    const relativeX = clientX - rect.left - ballRadius;
    const rawPct = relativeX / availableWidth;
    const clampedPct = Math.max(0, Math.min(1, rawPct));
    return Math.round(clampedPct * 180 * 10) / 10;
  };

  const handleBallPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setIsDraggingSlider(true);
  };

  const handleBallPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSlider) return;
    e.preventDefault();
    e.stopPropagation();
    const newDelay = calculateDelayFromPointer(e.clientX);
    handleDelayChange(newDelay);
  };

  const handleBallPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSlider) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDraggingSlider(false);
  };

  const handleBallKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : 0.1;
      handleDelayChange(Math.max(0, delay - step));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.shiftKey ? 1.0 : 0.1;
      handleDelayChange(Math.min(180, delay + step));
    }
  };

  // --- CARGA DE STREAM (MP3 DIRECTO O HLS VÍA HLS.JS) ---
  const loadStreamUrl = async (url: string, isHlsStream?: boolean) => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;

    setIsLoading(true);

    // Destruir instancia previa de HLS si existía
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = isHlsStream || url.includes('.m3u8');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(audioEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audioEl.play().then(() => {
          setIsLoading(false);
          setIsPlaying(true);
        }).catch((err) => {
          console.warn('Error play HLS:', err);
          setIsLoading(false);
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn('Fallo fatal HLS:', data.type);
          // Si falla HLS y hay backup en MP3, conmutar automáticamente
          if (selectedStation.backupUrl && !usingBackup) {
            setUsingBackup(true);
            loadStreamUrl(selectedStation.backupUrl, false);
          }
        }
      });
    } else {
      // Stream MP3 / AAC estándar o Safari nativo HLS
      audioEl.src = url;
      audioEl.load();

      try {
        await audioEl.play();
        setIsLoading(false);
        setIsPlaying(true);
      } catch (err) {
        console.warn('Error play audio standard:', err);
        // Si falla el primario y existe respaldo, cambiar automáticamente
        if (selectedStation.backupUrl && !usingBackup) {
          setUsingBackup(true);
          loadStreamUrl(selectedStation.backupUrl, selectedStation.backupUrl.includes('.m3u8'));
        } else {
          setIsLoading(false);
          setIsPlaying(false);
        }
      }
    }
  };

  // --- REPRODUCIR / PAUSAR ---
  const togglePlay = async () => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;

    if (isPlaying) {
      // 1. Silenciar y vaciar inmediatamente el búfer del AudioWorklet (corta al instante el retardo acumulado)
      delayNodeRef.current?.port.postMessage('pause');
      setIsRampingDelay(false);

      // 2. Silencio inmediato en el nodo de ganancia y suspensión del contexto
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend();
      }

      // 3. Pausar la entrada de audio nativa y detener HLS
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
      if (hlsRef.current) {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
      }

      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    try {
      await initAudioEngine();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      // Iniciar con sonido instantáneo y rampa suave hacia el retardo
      delayNodeRef.current?.port.postMessage({
        type: 'start-ramp',
        targetDelay: delay,
      });
      setIsRampingDelay(delay > 0.5);

      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.setValueAtTime(isMuted ? 0 : volume, audioCtxRef.current.currentTime);
      }
      setUsingBackup(false);
      await loadStreamUrl(selectedStation.streamUrl, selectedStation.isHls);
      updateMediaSession(delay);
    } catch (err) {
      console.error('Error al inicializar audio:', err);
      setIsLoading(false);
    }
  };

  // Selección de Emisora con recuperación de su retardo individual memorizado
  const handleSelectStation = async (station: RadioStation) => {
    setSelectedStation(station);
    setUsingBackup(false);

    // Recuperar el retardo memorizado para esta emisora específica
    const stationSavedDelay = stationDelays[station.id] ?? 0.0;
    setDelay(stationSavedDelay);
    updateWorkletDelay(stationSavedDelay);

    if (isPlaying) {
      setIsLoading(true);
      await initAudioEngine();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      // Iniciar rampa suave: empieza a sonar INMEDIATAMENTE en DIRECTO (0s)
      // y va acumulando el retardo memorizado progresivamente
      delayNodeRef.current?.port.postMessage({
        type: 'start-ramp',
        targetDelay: stationSavedDelay,
      });
      setIsRampingDelay(stationSavedDelay > 0.5);

      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.setValueAtTime(isMuted ? 0 : volume, audioCtxRef.current.currentTime);
      }
      await loadStreamUrl(station.streamUrl, station.isHls);
      updateMediaSession(stationSavedDelay, station.name);
    }
  };

  // Cargar URL Personalizada
  const handleCustomUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;

    const url = customUrl.trim();
    const isHls = url.includes('.m3u8');
    const customStation: RadioStation = {
      id: 'custom',
      name: 'Radio Personalizada',
      tagline: url.split('/').pop()?.split('?')[0] || 'Stream en directo',
      badge: 'URL',
      color: '#10b981',
      streamUrl: url,
      isHls,
    };

    setSelectedStation(customStation);
    setUsingBackup(false);
    setIsLoading(true);
    await initAudioEngine();
    await loadStreamUrl(url, isHls);
    updateMediaSession(delay, customStation.name);
  };

  // Volumen y Mute
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    }
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(isMuted ? 0 : newVol, audioCtxRef.current.currentTime);
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(nextMute ? 0 : volume, audioCtxRef.current.currentTime);
    }
  };

  // Filtro de Realce de Voz (Comentaristas de fútbol)
  const toggleCommentaryBoost = () => {
    const next = !commentaryBoost;
    setCommentaryBoost(next);
    if (boostFilterRef.current && audioCtxRef.current) {
      boostFilterRef.current.gain.setValueAtTime(next ? 5 : 0, audioCtxRef.current.currentTime);
    }
  };

  // --- CALIBRADOR RÁPIDO DE SINCRONIZACIÓN ---
  const handleSyncStep1 = (origin: 'radio-first' | 'tv-first') => {
    setSyncOrigin(origin);
    setSyncStep(1);
    const start = performance.now();
    setSyncTimestamp(start);
    setSyncTimerSeconds(0);

    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    syncIntervalRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      setSyncTimerSeconds(parseFloat(elapsed.toFixed(1)));
    }, 100);
  };

  const handleSyncStep2 = () => {
    if (!syncTimestamp) return;

    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    const elapsed = (performance.now() - syncTimestamp) / 1000;
    setSyncStep(0);
    setSyncTimestamp(null);

    let target = delay;
    if (syncOrigin === 'radio-first') {
      target = delay + elapsed;
    } else {
      target = Math.max(0, delay - elapsed);
    }

    const finalDelay = Math.max(0, Math.min(180, parseFloat(target.toFixed(1))));
    handleDelayChange(finalDelay);
  };

  const cancelSync = () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    setSyncStep(0);
    setSyncTimestamp(null);
    setSyncTimerSeconds(0);
  };

  // --- MEDIA SESSION API ---
  const updateMediaSession = useCallback(
    (currentDelayVal: number, stationName?: string) => {
      if ('mediaSession' in navigator) {
        const name = stationName || selectedStation.name;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `[${currentDelayVal.toFixed(1)}s] ${name}`,
          artist: 'RadioSync Fútbol',
          album: 'Audio Sincronizado en Directo',
          artwork: [
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
            },
          ],
        });

        navigator.mediaSession.setActionHandler('play', () => {
          if (!isPlaying) togglePlay();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (isPlaying) togglePlay();
        });
        navigator.mediaSession.setActionHandler('seekforward', () => {
          handleStepDelay(1.0);
        });
        navigator.mediaSession.setActionHandler('seekbackward', () => {
          handleStepDelay(-1.0);
        });
      }
    },
    [selectedStation, isPlaying, delay]
  );

  // --- CANVAS VISUALIZADOR ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = '#080d17';
      ctx.fillRect(0, 0, width, height);

      // Línea de medio campo sutil
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const analyser = analyserNodeRef.current;

      if (!analyser || !isPlaying) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.font = 'bold 10px Chakra Petch, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('EMISORA LISTA // PULSA ESCUCHAR EN DIRECTO', width / 2, height / 2 + 3);

        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      if (visualizerMode === 'bars') {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const barCount = 38;
        const barWidth = width / barCount;
        const step = Math.floor(bufferLength / barCount) || 1;

        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i * step] || 0;
          const barHeight = Math.max(3, (val / 255) * (height - 6));
          const x = i * barWidth;
          const y = height - barHeight;

          const grad = ctx.createLinearGradient(0, height, 0, y);
          grad.addColorStop(0, '#059669');
          grad.addColorStop(0.6, '#10b981');
          grad.addColorStop(1, '#34d399');

          ctx.fillStyle = grad;
          ctx.fillRect(x + 1.5, y, barWidth - 3, barHeight);

          if (barHeight > 10) {
            ctx.fillStyle = '#a7f3d0';
            ctx.fillRect(x + 1.5, y, barWidth - 3, 2);
          }
        }
      } else if (visualizerMode === 'wave') {
        const bufferLength = analyser.fftSize;
        const timeData = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(timeData);

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#10b981';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 8;
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (visualizerMode === 'vu') {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        let sumL = 0;
        let sumR = 0;
        const half = Math.floor(bufferLength / 2);

        for (let i = 0; i < half; i++) sumL += dataArray[i];
        for (let i = half; i < bufferLength; i++) sumR += dataArray[i];

        const avgL = sumL / (half * 255);
        const avgR = sumR / (half * 255);

        // Barra L
        const hL = avgL * (width - 50);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('L', 10, 16);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(25, 8, width - 35, 10);
        ctx.fillStyle = avgL > 0.8 ? '#ef4444' : '#10b981';
        ctx.fillRect(25, 8, hL, 10);

        // Barra R
        const hR = avgR * (width - 50);
        ctx.fillStyle = '#64748b';
        ctx.fillText('R', 10, 36);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(25, 28, width - 35, 10);
        ctx.fillStyle = avgR > 0.8 ? '#ef4444' : '#10b981';
        ctx.fillRect(25, 28, hR, 10);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, visualizerMode]);

  return (
    <div className="min-h-screen bg-[#06110a] text-slate-100 flex flex-col justify-between max-w-md mx-auto p-3.5 sm:p-4 select-none turf-pattern relative overflow-x-hidden w-full">
      {/* Fondo Reglamentario Sutil de Campo de Fútbol */}
      <SoccerFieldBackground />

      {/* Audio Element HTML5 */}
      <audio
        ref={audioElRef}
        crossOrigin="anonymous"
        preload="auto"
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => setIsLoading(false)}
        onError={() => {
          // Autorecuperación transparente si el primario falla
          if (selectedStation.backupUrl && !usingBackup) {
            setUsingBackup(true);
            loadStreamUrl(selectedStation.backupUrl, selectedStation.backupUrl.includes('.m3u8'));
          } else {
            setIsLoading(false);
            setIsPlaying(false);
          }
        }}
      />

      {/* --- CABECERA PRINCIPAL (OPTIMIZADA PARA MÓVIL) --- */}
      <header className="relative z-10 pb-2.5 border-b border-emerald-950/60 w-full overflow-visible">
        {/* FILA SUPERIOR: Logo, Título y Botón Instalar */}
        <div className="flex items-center justify-between gap-2">
          {/* Logo y Nombre con Balón de Fútbol Vectorial */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-800 to-slate-950 flex items-center justify-center p-1 shadow-md shadow-emerald-500/20 border border-emerald-400/40">
                <SoccerBall className="w-6 h-6" glow />
              </div>
              {isPlaying && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-[#06110a]"></span>
                </span>
              )}
            </div>

            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white font-digital truncate leading-none flex items-center gap-1.5">
                RadioSync <span className="text-emerald-400">Fútbol</span>
              </h1>
              <span className="text-[9px] text-emerald-400/90 font-semibold tracking-wider uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Directo Verificado Estadio
              </span>
            </div>
          </div>

          {/* Botón de Instalar App en la parte superior derecha */}
          {!isInstalled && (
            <div className="relative shrink-0">
              <button
                onClick={() => (isInstallable ? install() : isIOS ? setShowIOSModal(true) : null)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-black bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 hover:bg-emerald-400 active:scale-95 transition"
                title="Descargar e instalar aplicación"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Instalar App</span>
              </button>

              {/* Bocadillo señalando hacia arriba a la derecha */}
              {!dismissTooltip && (
                <div className="absolute right-0 top-full mt-2 z-50 w-52 sm:w-56 bg-slate-900 border border-emerald-500/70 p-2.5 rounded-xl shadow-2xl shadow-black backdrop-blur-md animate-float-subtle">
                  {/* Flechita superior derecha alineada con el botón */}
                  <div className="absolute -top-1.5 right-6 w-3 h-3 bg-slate-900 rotate-45 border-t border-l border-emerald-500/70"></div>

                  <div className="flex items-start justify-between gap-1.5 relative z-10">
                    <div className="flex-1 pr-1">
                      <p className="text-[11px] font-black text-emerald-300 leading-tight">
                        ¡Descárgate la App aquí!
                      </p>
                      <p className="text-[9px] text-slate-300 leading-snug mt-0.5">
                        Para escuchar la radio con la pantalla apagada y sin cortes.
                      </p>
                    </div>

                    {/* Manita a la derecha para que coincida con el botón */}
                    <div className="flex flex-col items-center shrink-0">
                      <span className="text-base leading-none animate-bounce">👆</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDismissTooltip(true);
                      }}
                      className="text-slate-400 hover:text-white p-0.5 rounded text-[11px] font-bold transition shrink-0 ml-1"
                      title="Cerrar aviso"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SUB-FILA INFERIOR: Subtítulo y botones de utilidad (Voz y Refrescar) */}
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/40">
          <p className="text-[11px] text-slate-400 truncate">
            Sincroniza la radio en directo con la TV
          </p>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Botón Filtro Comentaristas */}
            <button
              onClick={toggleCommentaryBoost}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition border ${
                commentaryBoost
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Filtro de audio: Realza la voz de los comentaristas sobre el ruido de fondo"
            >
              <Zap className="w-3 h-3" />
              <span>Voz Comentaristas</span>
            </button>

            {/* Botón Refrescar y limpiar caché */}
            <button
              onClick={handleForceRefresh}
              className="p-1 rounded-lg text-slate-400 hover:text-white bg-slate-900/90 border border-slate-800 active:scale-95 transition"
              title="Recargar y limpiar caché"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </header>

      {/* --- SECCIÓN 1: EMISORAS DE FÚTBOL CON 1 TOQUE --- */}
      <section className="relative z-10 mt-3 bg-slate-900/80 p-3.5 rounded-2xl border border-emerald-950/70 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400" /> Emisoras (Memoria independiente)
          </label>
          <span className="text-[10px] text-emerald-400/90 font-medium font-mono-num flex items-center gap-1">
            <SoccerBall className="w-3 h-3" />
            <span className="truncate max-w-[130px]">{selectedStation.name}</span>
          </span>
        </div>

        {/* Rejilla de Botones de Emisoras */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {STATIONS.map((st) => {
            const isSelected = selectedStation.id === st.id;
            const stDelay = stationDelays[st.id] ?? 0.0;
            return (
              <button
                key={st.id}
                onClick={() => handleSelectStation(st)}
                className={`relative flex items-center gap-2 p-2.5 rounded-xl text-left border transition-all active:scale-95 overflow-hidden ${
                  isSelected
                    ? 'bg-slate-800/95 border-emerald-500/80 text-white shadow-lg shadow-emerald-500/15 ring-1 ring-emerald-500/50'
                    : 'bg-slate-800/40 hover:bg-slate-800/70 border-slate-800/90 text-slate-300'
                }`}
              >
                {/* Filigrana sutil de esquina de campo de fútbol */}
                <PitchCardCorner className={isSelected ? 'text-emerald-400/30' : 'text-slate-600/15'} />

                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 transition-transform shadow-inner"
                  style={{
                    backgroundColor: isSelected ? st.color : 'rgba(255,255,255,0.07)',
                    color: isSelected ? '#000000' : st.color,
                  }}
                >
                  {st.badge}
                </span>
                <div className="overflow-hidden flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold truncate leading-tight flex items-center gap-1">
                      {st.name}
                      {isSelected && <SoccerBall className="w-2.5 h-2.5 shrink-0" />}
                    </span>
                    <span
                      className={`text-[9px] font-mono-num px-1 py-0.2 rounded font-bold shrink-0 ${
                        stDelay > 0
                          ? isSelected
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-emerald-500/20 text-emerald-300'
                          : 'text-slate-500'
                      }`}
                      title={`Retardo memorizado: ${stDelay.toFixed(1)}s`}
                    >
                      {stDelay > 0 ? `${stDelay.toFixed(1)}s` : '0s'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="block text-[9px] text-slate-400 truncate leading-tight">
                      {st.tagline.split('/')[0]}
                    </span>
                    {isSelected && isPlaying && (
                      <span className="flex gap-0.5 items-end h-2.5 shrink-0 ml-1">
                        <span className="w-0.5 h-2 bg-emerald-400 animate-pulse"></span>
                        <span className="w-0.5 h-2.5 bg-emerald-400 animate-pulse delay-75"></span>
                        <span className="w-0.5 h-1.5 bg-emerald-400 animate-pulse delay-150"></span>
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Banner de Conmutación Instantánea con Rampa Suave */}
        {isRampingDelay && isPlaying && (
          <div className="mb-2.5 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 border border-emerald-500/50 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-lg animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-black text-emerald-300">
                    Directo Activo
                  </span>
                  <span className="text-[10px] text-slate-300 font-medium">
                    → Adaptando a <span className="text-emerald-400 font-bold">{delay.toFixed(1)}s</span>
                  </span>
                </div>
                <div className="text-[9px] text-slate-400 truncate">
                  Retardo en altavoz: <span className="font-mono-num font-bold text-white">+{liveAudioDelay.toFixed(1)}s</span> (sin pausas ni silencios)
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                delayNodeRef.current?.port.postMessage({ type: 'jump-to-delay', delay });
                setIsRampingDelay(false);
              }}
              className="shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-2 py-1.5 rounded-lg text-[10px] active:scale-95 transition"
              title="Fijar inmediatamente al retardo memorizado"
            >
              Fijar {delay.toFixed(1)}s
            </button>
          </div>
        )}

        {/* Input para URL Personalizada */}
        <form onSubmit={handleCustomUrlSubmit} className="flex gap-2">
          <input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="Pega cualquier enlace (.mp3 / .aac / .m3u8)..."
            className="flex-1 bg-slate-950/80 text-xs px-3 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500 text-slate-200 placeholder-slate-500"
          />
          <button
            type="submit"
            className="bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-200 border border-slate-700 active:scale-95 transition"
          >
            Sintonizar
          </button>
        </form>
      </section>

      {/* --- SECCIÓN 2: DISPLAY DE RETARDO Y CONTROL (CON BALÓN Y ÁREA DE FÚTBOL) --- */}
      <section className="relative z-10 mt-3 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 p-4 sm:p-5 rounded-3xl border border-emerald-950/80 shadow-2xl relative overflow-hidden backdrop-blur-md">
        {/* Filigrana sutil de medialuna y área de penalti de estadio */}
        <div className="absolute top-0 right-0 w-24 h-16 border-b border-l border-emerald-500/10 rounded-bl-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-28 h-28 border border-emerald-500/10 rounded-full pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-10 bg-emerald-500/10 blur-xl pointer-events-none rounded-full" />

        <div className="flex items-center justify-between text-xs mb-1">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
              Retardo de Sincronización
            </span>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
              delay === 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            <SoccerBall className="w-2.5 h-2.5" />
            {delay === 0 ? 'DIRECTO (0s)' : `RETARDADO +${delay.toFixed(1)}s`}
          </span>
        </div>

        {/* Display Números Gigantes */}
        <div className="flex items-baseline justify-center gap-2 my-2">
          <span className="text-5xl sm:text-6xl font-black tracking-tight text-white font-mono-num drop-shadow-md">
            {delay.toFixed(1)}
          </span>
          <span className="text-xl sm:text-2xl font-bold text-emerald-400 font-digital uppercase">
            seg
          </span>
        </div>

        {isRampingDelay && isPlaying && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-300 font-semibold mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span>Retardo en vivo: <strong>+{liveAudioDelay.toFixed(1)}s</strong> (avanzando a +{delay.toFixed(1)}s)</span>
          </div>
        )}

        {/* Visualizador Canvas */}
        <div className="relative my-2">
          <canvas
            ref={canvasRef}
            width={400}
            height={44}
            className="w-full h-11 bg-slate-950/70 rounded-xl border border-slate-900 shadow-inner"
          />
          <div className="absolute top-1.5 right-1.5 flex gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-800 text-[9px]">
            <button
              onClick={() => setVisualizerMode('bars')}
              className={`px-1.5 py-0.5 rounded ${
                visualizerMode === 'bars' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              Barras
            </button>
            <button
              onClick={() => setVisualizerMode('wave')}
              className={`px-1.5 py-0.5 rounded ${
                visualizerMode === 'wave' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              Onda
            </button>
            <button
              onClick={() => setVisualizerMode('vu')}
              className={`px-1.5 py-0.5 rounded ${
                visualizerMode === 'vu' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              VU
            </button>
          </div>
        </div>

        {/* SLIDER DE RETARDO (0.0s a 180.0s) - RECORRIDO VISIBLE Y BALÓN DE ARRASTRE */}
        <div className="px-1 mt-3 select-none">
          {/* Cabecera indicativa del carril */}
          <div className="flex items-center justify-between text-[11px] mb-1.5 px-0.5">
            <span className="flex items-center gap-1.5 font-bold text-slate-300">
              <SoccerBall className="w-3.5 h-3.5" />
              Recorrido de Sincronización
            </span>
            <span className="text-[10px] text-emerald-300/90 font-medium bg-emerald-950/70 border border-emerald-700/50 px-2 py-0.5 rounded-md">
              Arrastra el balón para mover
            </span>
          </div>

          {/* Contenedor del Carril y el Balón */}
          <div className="relative py-3 flex items-center">
            {/* Carril Visible de Fondo (Recorrido) */}
            <div
              ref={trackRef}
              className="relative h-4 w-full bg-slate-950 rounded-full border-2 border-emerald-900/70 shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)] overflow-hidden"
            >
              {/* Marcas de regla y división en el carril (cada 30s) */}
              <div className="absolute inset-0 flex justify-between px-3 items-center pointer-events-none opacity-40 z-0">
                <span className="w-0.5 h-2.5 bg-slate-400 rounded-full" />
                <span className="w-0.5 h-1.5 bg-slate-600 rounded-full" />
                <span className="w-0.5 h-2 bg-slate-400 rounded-full" />
                <span className="w-0.5 h-1.5 bg-slate-600 rounded-full" />
                <span className="w-0.5 h-2 bg-slate-400 rounded-full" />
                <span className="w-0.5 h-1.5 bg-slate-600 rounded-full" />
                <span className="w-0.5 h-2.5 bg-slate-400 rounded-full" />
              </div>

              {/* Barra de Progreso Luminosa Activa (Relleno del retardo actual) */}
              <div
                className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 rounded-full shadow-[0_0_14px_rgba(16,185,129,0.85)]"
                style={{ width: `${Math.max(1, Math.min(100, (delay / 180) * 100))}%` }}
              />
            </div>

            {/* Balón de Fútbol Interactivo (SOLO responde si se arrastra directamente el balón) */}
            <div
              role="slider"
              aria-label="Retardo de sincronización en segundos"
              aria-valuemin={0}
              aria-valuemax={180}
              aria-valuenow={delay}
              tabIndex={0}
              onPointerDown={handleBallPointerDown}
              onPointerMove={handleBallPointerMove}
              onPointerUp={handleBallPointerUp}
              onPointerCancel={handleBallPointerUp}
              onKeyDown={handleBallKeyDown}
              style={{
                left: `calc(${((delay / 180) * 100).toFixed(2)}% - ${(((delay / 180) * 100) / 100 * 32).toFixed(2)}px)`,
              }}
              className={`absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-900 border-2 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.85),_0_4px_10px_rgba(0,0,0,0.8)] cursor-grab active:cursor-grabbing flex items-center justify-center touch-none select-none transition-transform ${
                isDraggingSlider
                  ? 'scale-125 ring-4 ring-emerald-400/50 z-30'
                  : 'hover:scale-110 z-20'
              }`}
              title="Arrastra este balón para ajustar el retardo"
            >
              {/* Balón clásico de fútbol bordado en el mando de arrastre */}
              <SoccerBall className="w-7 h-7 pointer-events-none drop-shadow" />

              {/* Globo emergente superior mientras se arrastra */}
              {isDraggingSlider && (
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-900 border-2 border-emerald-400 text-emerald-300 font-mono-num font-extrabold text-xs px-2.5 py-0.5 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.8)] whitespace-nowrap pointer-events-none flex items-center gap-1">
                  <SoccerBall className="w-3 h-3" />
                  <span>+{delay.toFixed(1)}s</span>
                </div>
              )}
            </div>
          </div>

          {/* Marcas y etiquetas inferiores del recorrido */}
          <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-0.5 font-mono-num px-0.5">
            <span className="text-emerald-400">0s Directo</span>
            <span>30s</span>
            <span>60s (1m)</span>
            <span>120s (2m)</span>
            <span>180s (3m)</span>
          </div>

          {/* Aviso sutil de protección contra toques indeseados al deslizar la pantalla */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 px-0.5">
            <span className="flex items-center gap-1 text-slate-400/80">
              <span className="inline-block text-emerald-400">↔</span> Arrastra la bola hacia los lados
            </span>
            <span className="text-slate-500 text-[9px] bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
              Protegido contra toques al hacer scroll
            </span>
          </div>
        </div>

        {/* BOTONES DE AJUSTE FINO (±0.1s, ±0.2s, ±1.0s, ±5.0s) */}
        <div className="grid grid-cols-5 gap-1.5 mt-3">
          <button
            onClick={() => handleStepDelay(-1.0)}
            className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 py-2 rounded-xl text-xs font-bold border border-slate-700/80 active:scale-95 transition"
          >
            -1.0s
          </button>
          <button
            onClick={() => handleStepDelay(-0.2)}
            className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 py-2 rounded-xl text-xs font-bold border border-slate-700/80 active:scale-95 transition"
          >
            -0.2s
          </button>
          <button
            onClick={() => handleDelayChange(0)}
            className="bg-slate-800/80 hover:bg-slate-700 text-amber-400 py-2 rounded-xl text-xs font-bold border border-slate-700/80 active:scale-95 transition flex items-center justify-center gap-1"
            title="Reset a directo"
          >
            <RotateCcw className="w-3 h-3" /> 0s
          </button>
          <button
            onClick={() => handleStepDelay(0.2)}
            className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 py-2 rounded-xl text-xs font-bold border border-slate-700/80 active:scale-95 transition"
          >
            +0.2s
          </button>
          <button
            onClick={() => handleStepDelay(1.0)}
            className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 py-2 rounded-xl text-xs font-bold border border-slate-700/80 active:scale-95 transition"
          >
            +1.0s
          </button>
        </div>

        {/* Fila secundaria de pasos finos ±0.1s y ±5.0s */}
        <div className="grid grid-cols-4 gap-1.5 mt-1.5">
          <button
            onClick={() => handleStepDelay(-5.0)}
            className="bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-800 active:scale-95 transition"
          >
            -5.0s
          </button>
          <button
            onClick={() => handleStepDelay(-0.1)}
            className="bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-800 active:scale-95 transition"
          >
            -0.1s
          </button>
          <button
            onClick={() => handleStepDelay(0.1)}
            className="bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-800 active:scale-95 transition"
          >
            +0.1s
          </button>
          <button
            onClick={() => handleStepDelay(5.0)}
            className="bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-800 active:scale-95 transition"
          >
            +5.0s
          </button>
        </div>

        {/* PRESETS DE PLATAFORMAS (Movistar, DAZN, TDT...) */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/70">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
            Retardos Típicos según tu Emisión de TV:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {STREAMING_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handleDelayChange(preset.delay)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition active:scale-95 ${
                  Math.abs(delay - preset.delay) < 0.2
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 ring-1 ring-emerald-500/30'
                    : 'bg-slate-800/40 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* --- SECCIÓN 3: MARCADOR DE SINCRONIZACIÓN RÁPIDA --- */}
      <section className="relative z-10 mt-3 bg-slate-900/80 border border-emerald-950/70 p-3.5 rounded-2xl shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <SoccerBall className="w-3.5 h-3.5" /> Sincronizador Automático TV vs Radio
          </span>
          {syncStep === 1 && (
            <button
              onClick={cancelSync}
              className="text-[10px] text-red-400 hover:text-red-300 font-semibold"
            >
              Cancelar
            </button>
          )}
        </div>

        {syncStep === 0 ? (
          <div>
            <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
              ¿La radio va por delante de tu tele? Pulsa cuando suene en la radio y vuelve a pulsar cuando lo veas en la tele:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSyncStep1('radio-first')}
                className="bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 font-bold py-2.5 px-3 rounded-xl text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition"
              >
                <div className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. Suena en RADIO</span>
                </div>
                <span className="text-[9px] font-normal text-emerald-400/80">(P.ej. gol o pitido)</span>
              </button>

              <button
                onClick={() => handleSyncStep1('tv-first')}
                className="bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold py-2.5 px-3 rounded-xl text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition"
              >
                <div className="flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-sky-400" />
                  <span>1. Se ve en TV</span>
                </div>
                <span className="text-[9px] font-normal text-slate-400">(Si la tele va antes)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 animate-in fade-in">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <div>
                  <span className="text-xs font-bold text-amber-300 block">
                    Cronómetro en marcha...
                  </span>
                  <span className="text-[10px] text-amber-200/70">
                    {syncOrigin === 'radio-first'
                      ? 'Esperando a que veas la jugada en la pantalla de TV'
                      : 'Esperando a que suene en la radio'}
                  </span>
                </div>
              </div>
              <div className="text-xl font-black font-mono-num text-amber-400">
                +{syncTimerSeconds.toFixed(1)}s
              </div>
            </div>

            <button
              onClick={handleSyncStep2}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black py-3 px-4 rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-500/25 active:scale-95 transition flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>
                {syncOrigin === 'radio-first'
                  ? '2. ¡PULSA AHORA! (Al verlo en la pantalla de TV)'
                  : '2. ¡PULSA AHORA! (Al escucharlo en la radio)'}
              </span>
            </button>
          </div>
        )}
      </section>

      {/* --- SECCIÓN 4: BARRA DE CONTROL PRINCIPAL --- */}
      <footer className="relative z-10 mt-4 pt-2">
        <div className="grid grid-cols-12 gap-2">
          {/* Control de Volumen y Silencio */}
          <div className="col-span-3 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl">
            <button
              onClick={toggleMute}
              className="text-slate-300 hover:text-white p-1"
              title={isMuted ? 'Desmutear' : 'Mutear'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* BOTÓN PRINCIPAL REPRODUCIR / PAUSAR */}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className={`col-span-6 font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl active:scale-95 transition text-sm sm:text-base tracking-wide ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
            }`}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>CONECTANDO...</span>
              </>
            ) : isPlaying ? (
              <>
                <Pause className="w-5 h-5 fill-current" />
                <span>PAUSAR RADIO</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>ESCUCHAR EN DIRECTO</span>
              </>
            )}
          </button>

          {/* Reset Retardo a 0s */}
          <button
            onClick={() => handleDelayChange(0)}
            className="col-span-3 bg-slate-900/90 hover:bg-slate-800 text-slate-300 rounded-2xl flex flex-col items-center justify-center border border-slate-800 active:scale-95 transition py-2"
            title="Poner retardo a 0s"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] mt-0.5 font-bold">Directo 0s</span>
          </button>
        </div>

        {/* Estado en vivo */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="truncate max-w-[200px]">
              {isPlaying
                ? `${selectedStation.name} (+${delay.toFixed(1)}s)`
                : 'Selecciona emisora y pulsa reproducir'}
            </span>
          </div>
          <span>Búfer 180s Estéreo</span>
        </div>
      </footer>

      {/* --- MODAL PWA IOS --- */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-400" /> Instalar en iPhone / iPad
              </h3>
              <button
                onClick={() => setShowIOSModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs text-slate-300">
              <p>Para escuchar con pantalla apagada en segundo plano como una app nativa:</p>
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span>
                  Pulsa el botón <strong>Compartir</strong> en la barra inferior de Safari.
                </span>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span>
                  Baja y selecciona <strong>"Añadir a pantalla de inicio"</strong>.
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
