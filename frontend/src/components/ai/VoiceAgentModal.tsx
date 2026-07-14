'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PhoneOff, Mic, MicOff, Volume2, VolumeX, ArrowLeft,
  Calendar, FileText, CheckCircle, BarChart3, HelpCircle,
  AlertTriangle, Sun, Moon, ExternalLink, Sparkles, ArrowRight, StopCircle
} from 'lucide-react';
import { aiApi, quotes as quotesApi } from '@/lib/api';

interface VoiceAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: number;
  onNewMessage?: (msg: any) => void;
}

interface DiagnosticResult {
  isSecure: boolean;
  isOnline: boolean;
  hasSpeechSupport: boolean;
  hasMediaDevicesSupport: boolean;
  permissionState: 'granted' | 'prompt' | 'denied' | 'unknown';
  devicesCount: number;
  devices: MediaDeviceInfo[];
  getUserMediaError: { name: string; message: string } | null;
  possibleCause: 'permission_denied' | 'no_devices' | 'device_locked' | 'insecure_context' | 'offline' | 'unsupported_browser' | 'unknown';
  friendlyExplanation: string;
  recommendedAction: string;
}

// ─── VAD constants ─────────────────────────────────────────────────────────
// Average frequency magnitude (0–255) below which input counts as silence.
const VAD_SILENCE_THRESHOLD = 12;
// Consecutive "loud" rAF frames needed before we consider the user speaking.
// At ~60 fps, 8 frames ≈ 133 ms — long enough to ignore keyboard clicks.
const VAD_SPEECH_FRAMES_NEEDED = 8;
// Consecutive "quiet" frames before we mark the user as having stopped.
const VAD_SILENCE_FRAMES_NEEDED = 30; // ~500 ms

export default function VoiceAgentModal({ isOpen, onClose, conversationId, onNewMessage }: VoiceAgentModalProps) {
  // Theme state
  const [theme, setTheme] = useState<'stark' | 'dark'>('stark');
  
  const [status, setStatusState] = useState<'connecting' | 'listening' | 'thinking' | 'speaking'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [aiText, setAiText] = useState('');
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  
  // Real-time diagnostics & calibration logs
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

  // ─── Core Audio & STT refs ────────────────────────────────────────────────
  const recognitionRef = useRef<any>(null);
  const synthesisUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const aiTextRef = useRef<string>(''); // current JARVIS speech (echo guard)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Web Audio Analyser refs (shared between visualization + VAD)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // ─── FIX 1: Session destruction guard ────────────────────────────────────
  // Set to `true` the instant End Call is pressed. Every async callback checks
  // this first and returns immediately, guaranteeing nothing continues after
  // the call ends — no TTS, no STT restarts, no API response processing.
  const isDestroyedRef = useRef(false);

  // ─── FIX 2: API call cancellation ────────────────────────────────────────
  // Each voiceTalk call gets its own AbortController, stored here so we can
  // cancel the in-flight request on barge-in or hang-up.
  const apiAbortControllerRef = useRef<AbortController | null>(null);

  // ─── FIX 5: Recognition session versioning ───────────────────────────────
  // Incremented whenever we create a new SpeechRecognition instance. Callbacks
  // capture the version number at creation time; stale callbacks self-drop.
  const recognitionSessionRef = useRef(0);

  // ─── FIX 4: WebAudio VAD state ───────────────────────────────────────────
  const vadFrameRef = useRef<number | null>(null);    // rAF handle for VAD loop
  const vadSpeechCountRef = useRef(0);                // consecutive loud frames
  const vadSilenceCountRef = useRef(0);               // consecutive quiet frames
  const userIsSpeakingRef = useRef(false);            // true = user actively talking

  // ─── FIX 9: Pending timeout tracking ─────────────────────────────────────
  // All timeouts registered via safeTimeout() are tracked here so they can be
  // bulk-cancelled during session destruction — no orphaned timers.
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // ─── Thread-safe refs (prevent closure stale values) ─────────────────────
  const statusRef = useRef<'connecting' | 'listening' | 'thinking' | 'speaking'>('connecting');
  const isMutedRef = useRef(isMuted);
  const isSpeakerOnRef = useRef(isSpeakerOn);
  const isOpenRef = useRef(isOpen);
  const conversationIdRef = useRef(conversationId);
  // Tracks the actual voice session conversation ID — updated after the first
  // voiceTalk response so every subsequent turn reuses the same conversation.
  const activeVoiceConversationIdRef = useRef<number | undefined>(conversationId);
  const onNewMessageRef = useRef(onNewMessage);
  const hasFatalErrorRef = useRef(false);
  const isListeningActiveRef = useRef(false); // STT engine active flag
  const isStartingRef = useRef(false);        // STT engine starting flag
  const isAcquiringRef = useRef(false);       // guards re-entrant getUserMedia
  const deviceChangeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // React Query: Fetch quotes for sidebar summary card
  const { data: quotesPage } = useQuery({
    queryKey: ['quotes_list_voice'],
    queryFn: async () => {
      const res = await quotesApi.list({ per_page: 100 });
      return res.data;
    },
    enabled: isOpen,
  });

  const quotesList = quotesPage?.data || [];
  const quotesCount = quotesList.length;
  const draftCount = quotesList.filter(q => q.status === 'draft').length;
  const expiredCount = quotesList.filter(q => q.status === 'expired').length;
  const convertedCount = quotesList.filter(q => q.status === 'converted' || q.status === 'accepted').length;

  const displayQuotesCreated = quotesCount;
  const displayConverted = convertedCount;
  const displayDraft = draftCount;
  const displayExpired = expiredCount;

  // Calibration log helper — entries are shown in the in-UI diagnostics panel
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `${time} - ${msg}`]);
  };

  // Sync state values to refs
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    isSpeakerOnRef.current = isSpeakerOn;
    if (synthesisUtteranceRef.current && !isSpeakerOn) {
      window.speechSynthesis.cancel();
    }
  }, [isSpeakerOn]);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
    activeVoiceConversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => { onNewMessageRef.current = onNewMessage; }, [onNewMessage]);

  const setStatus = (newStatus: 'connecting' | 'listening' | 'thinking' | 'speaking') => {
    statusRef.current = newStatus;
    setStatusState(newStatus);
  };

  // Timer counter
  useEffect(() => {
    if (isOpen && !errorMessage) {
      setSecondsElapsed(0);
      timerIntervalRef.current = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen, errorMessage]);

  // Format MM:SS
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ─── Utility: tracked setTimeout ─────────────────────────────────────────
  // All timeouts registered here are automatically cancelled on session destroy,
  // eliminating the class of bugs where a delayed callback fires after hang-up.
  const safeTimeout = (fn: () => void, delay: number): ReturnType<typeof setTimeout> => {
    const id = setTimeout(() => {
      pendingTimeoutsRef.current.delete(id);
      fn();
    }, delay);
    pendingTimeoutsRef.current.add(id);
    return id;
  };

  // ─── Utility: cancel in-flight API call ──────────────────────────────────
  const cancelApiCall = () => {
    if (apiAbortControllerRef.current) {
      apiAbortControllerRef.current.abort();
      apiAbortControllerRef.current = null;
    }
  };

  // ─── FIX 4: WebAudio VAD loop ─────────────────────────────────────────────
  // Runs in its own requestAnimationFrame loop separate from the visualizer.
  // Measures average frequency magnitude from the live mic analyser every
  // frame to decide if the user is speaking. Powers the full-duplex barge-in.
  const startVadLoop = () => {
    if (vadFrameRef.current !== null) return; // already running

    const loop = () => {
      if (isDestroyedRef.current) return;

      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);

        let sum = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          sum += dataArrayRef.current[i];
        }
        const avg = sum / dataArrayRef.current.length;

        if (avg > VAD_SILENCE_THRESHOLD) {
          vadSpeechCountRef.current++;
          vadSilenceCountRef.current = 0;

          // User has been continuously speaking for long enough
          if (vadSpeechCountRef.current >= VAD_SPEECH_FRAMES_NEEDED && !userIsSpeakingRef.current) {
            userIsSpeakingRef.current = true;

            // ── FIX 3: Full-duplex barge-in ───────────────────────────
            // The user started talking while JARVIS is speaking → interrupt
            // immediately based on raw mic amplitude. No stop-word required.
            if (statusRef.current === 'speaking' && !isMutedRef.current) {
              addLog('VAD: Barge-in — user started speaking, interrupting JARVIS.');
              handleInterrupt();
            }
          }
        } else {
          vadSilenceCountRef.current++;
          vadSpeechCountRef.current = 0;

          if (vadSilenceCountRef.current >= VAD_SILENCE_FRAMES_NEEDED && userIsSpeakingRef.current) {
            userIsSpeakingRef.current = false;
          }
        }
      }

      vadFrameRef.current = requestAnimationFrame(loop);
    };

    vadFrameRef.current = requestAnimationFrame(loop);
  };

  const stopVadLoop = () => {
    if (vadFrameRef.current !== null) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    vadSpeechCountRef.current = 0;
    vadSilenceCountRef.current = 0;
    userIsSpeakingRef.current = false;
  };

  // ─── FIX 6: Web Audio Analyzer (AudioContext singleton) ──────────────────
  // Previous bug: a new AudioContext was created on every retry call, leaking
  // old ones. Now we close any existing context before creating a new one.
  const setupAudioAnalyzer = async (stream: MediaStream) => {
    try {
      addLog('Setting up Web Audio Context analyser...');
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        addLog('Warning: AudioContext not supported in this browser.');
        return;
      }

      // Singleton guard: close the old context if still open
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { await audioCtxRef.current.close(); } catch (e) {}
      }

      const audioCtx = new AudioContextClass();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      
      source.connect(analyser);
      analyser.fftSize = 64; // minimal bins — fast enough for both vis + VAD

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
      addLog('Web Audio Context analyser configured successfully.');

      // Start the VAD loop as soon as the analyser is ready
      startVadLoop();
    } catch (e) {
      addLog(`Warning: Failed to setup Web Audio Analyzer: ${e}`);
    }
  };

  // Audio wave visualizer loop (Real mic data vs simulated speaker waves)
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const render = () => {
      if (isDestroyedRef.current) return; // FIX 8: destroy guard
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const isStark = theme === 'stark';
      const waveColor = isStark ? 'rgba(6, 182, 212, 0.85)' : 'rgba(236, 72, 153, 0.85)';
      const accentWaveColor = isStark ? 'rgba(234, 179, 8, 0.4)' : 'rgba(124, 58, 237, 0.4)';

      const barsCount = 20;
      const barWidth = 4;
      const barGap = 6;
      const startX = (canvas.width - (barsCount * (barWidth + barGap) - barGap)) / 2;

      // 1. If LISTENING and we have real mic frequency data
      if (status === 'listening' && analyserRef.current && dataArrayRef.current && !isMuted) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
        
        ctx.fillStyle = waveColor;
        for (let i = 0; i < barsCount; i++) {
          const dataIdx = Math.floor((i / barsCount) * dataArrayRef.current.length);
          const rawVal = dataArrayRef.current[dataIdx]; // 0 - 255
          
          const scale = rawVal / 255;
          const barHeight = Math.max(4, scale * (canvas.height - 10));
          const x = startX + i * (barWidth + barGap);
          const y = (canvas.height - barHeight) / 2;

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
      } 
      // 2. Otherwise, draw a clean simulated visual wave (pulsing/speaking/thinking)
      else {
        let amplitude = 4;
        let speed = 0.05;
        
        if (errorMessage) {
          amplitude = 1;
        } else if (status === 'speaking') {
          amplitude = 25;
          speed = 0.12;
        } else if (status === 'thinking') {
          amplitude = 15;
          speed = 0.20;
        } else if (status === 'connecting') {
          amplitude = 8;
          speed = 0.08;
        }

        ctx.fillStyle = waveColor;
        for (let i = 0; i < barsCount; i++) {
          const distanceFromCenter = Math.abs(i - (barsCount - 1) / 2);
          const weight = Math.max(0.1, 1 - distanceFromCenter / (barsCount / 2));
          
          const waveHeight = Math.sin(i * 0.4 + phase) * amplitude * weight;
          const barHeight = Math.max(4, Math.abs(waveHeight) + 4);
          
          const x = startX + i * (barWidth + barGap);
          const y = (canvas.height - barHeight) / 2;

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }

        if (status === 'speaking' || status === 'thinking') {
          ctx.fillStyle = accentWaveColor;
          for (let i = 0; i < barsCount; i++) {
            const distanceFromCenter = Math.abs(i - (barsCount - 1) / 2);
            const weight = Math.max(0.1, 1 - distanceFromCenter / (barsCount / 2));
            
            const waveHeight = Math.cos(i * 0.5 - phase) * (amplitude * 0.6) * weight;
            const barHeight = Math.max(4, Math.abs(waveHeight) + 2);
            
            const x = startX + i * (barWidth + barGap);
            const y = (canvas.height - barHeight) / 2;

            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
          }
        }
        
        phase += speed;
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, status, errorMessage, theme, isMuted]);

  // ─── FIX 5: SpeechRecognition factory (session-versioned, no orphans) ─────
  // Every call aborts the previous instance and increments the session counter.
  // All callbacks capture the session version at creation time and silently
  // self-drop if the version has since advanced (stale callback guard).
  const createRecognition = () => {
    addLog('Configuring STT SpeechRecognition instance...');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addLog('Fatal: SpeechRecognition API not supported in this browser.');
      return null;
    }

    // Destroy the previous instance before creating a new one — prevents
    // orphaned instances that hold the mic track open.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    // Version stamp: callbacks from this instance will self-drop once
    // recognitionSessionRef.current is incremented by the next createRecognition call.
    const sessionVersion = ++recognitionSessionRef.current;

    const rec = new SpeechRecognition();
    // continuous=true keeps the mic alive through natural speech pauses instead of
    // cutting off mid-sentence. interimResults=true gives partial transcript
    // events so the user sees feedback while speaking.
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      // FIX 8: Dual guard — session destroyed OR stale recognition instance
      if (isDestroyedRef.current || recognitionSessionRef.current !== sessionVersion) return;
      addLog('STT SpeechRecognition started listening.');
      isListeningActiveRef.current = true;
      isStartingRef.current = false;
      setStatus('listening');
      setTranscript('');
    };

    rec.onresult = async (event: any) => {
      if (isDestroyedRef.current || recognitionSessionRef.current !== sessionVersion) return;

      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      // No final result yet — wait for more speech
      if (!finalTranscript.trim()) return;
      const speechToText = finalTranscript.trim();

      // ── FIX 3: Full-duplex belt-and-suspenders ────────────────────────
      // VAD fires the interrupt via amplitude. This catches soft-voice
      // barge-ins that VAD missed but STT still transcribed.
      if (statusRef.current === 'speaking') {
        const heard = speechToText.toLowerCase().trim();
        const spoken = (aiTextRef.current || '').toLowerCase();
        // Echo guard: JARVIS's own voice bleeding into the mic is ignored
        const isEcho =
          spoken.length > 0 &&
          heard.length > 0 &&
          (spoken.includes(heard) ||
            (heard.length > 10 && spoken.includes(heard.substring(0, 15))));
        if (!isEcho) {
          addLog(`Transcript barge-in: "${speechToText}" — interrupting JARVIS.`);
          handleInterrupt();
        }
        return;
      }

      // Ignore very short noise bursts (< 3 chars)
      if (speechToText.length < 3) {
        addLog(`Ignoring noise burst: "${speechToText}"`);
        return;
      }

      // ── FIX 4: VAD confidence gate ────────────────────────────────────
      // If WebAudio shows no mic activity but we got a short transcript,
      // it is most likely a noise artifact — discard it.
      if (analyserRef.current && !userIsSpeakingRef.current && speechToText.split(' ').length < 3) {
        addLog(`VAD: Low-confidence transcript discarded (no mic activity): "${speechToText}"`);
        return;
      }

      addLog(`Speech Transcribed: "${speechToText}"`);
      setTranscript(speechToText);
      setStatus('thinking');

      isListeningActiveRef.current = false;
      isStartingRef.current = false;
      try { rec.stop(); } catch (e) {}

      // ── FIX 2: AbortController for voiceTalk ─────────────────────────
      cancelApiCall(); // cancel any stale prior call
      const abortController = new AbortController();
      apiAbortControllerRef.current = abortController;

      try {
        addLog('Sending transcript to Gemini API...');
        const res = await aiApi.voiceTalk(speechToText, activeVoiceConversationIdRef.current);

        // FIX 8: Check destroy + stale session after every await
        if (isDestroyedRef.current || recognitionSessionRef.current !== sessionVersion) return;
        apiAbortControllerRef.current = null;

        const returnedConvId = res.data.conversation_id;
        if (returnedConvId && returnedConvId !== activeVoiceConversationIdRef.current) {
          addLog(`Voice session pinned to conversation ID: ${returnedConvId}`);
          activeVoiceConversationIdRef.current = returnedConvId;
        }

        const reply = res.data.response_text;
        addLog('Gemini response retrieved. Preparing speech playback.');
        setAiText(reply);

        if (onNewMessageRef.current) {
          onNewMessageRef.current(res.data);
        }

        speakText(reply);
      } catch (error: any) {
        if (isDestroyedRef.current) return;
        // AbortError means handleInterrupt / handleEndCall cancelled us — ignore
        if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') return;
        addLog(`Error: Failed voiceTalk request: ${error}`);
        // FIX 6: Set status before calling startListeningSafe
        setStatus('listening');
        startListeningSafe();
      }
    };

    rec.onerror = (e: any) => {
      if (isDestroyedRef.current || recognitionSessionRef.current !== sessionVersion) return;
      isStartingRef.current = false;
      if (e.error === 'aborted') {
        isListeningActiveRef.current = false;
        return;
      }
      if (e.error === 'no-speech') {
        isListeningActiveRef.current = false;
        if (
          isOpenRef.current &&
          !isMutedRef.current &&
          !hasFatalErrorRef.current &&
          (statusRef.current === 'listening' || statusRef.current === 'speaking')
        ) {
          startListeningSafe();
        }
        return;
      }

      addLog(`STT SpeechRecognition error: ${e.error}`);
      isListeningActiveRef.current = false;

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        hasFatalErrorRef.current = true;
        setErrorMessage(
          e.error === 'not-allowed'
            ? 'Microphone access is blocked. Please enable microphone permissions in your browser settings and try again.'
            : `Speech recognition hardware error: ${e.error}`
        );
        runDiagnostics();
        return;
      }

      setStatus('listening');
    };

    rec.onend = () => {
      if (isDestroyedRef.current || recognitionSessionRef.current !== sessionVersion) return;
      isListeningActiveRef.current = false;
      isStartingRef.current = false;

      // FIX 10: Never restart STT while the API call is in-flight (thinking)
      safeTimeout(() => {
        if (
          isDestroyedRef.current ||
          recognitionSessionRef.current !== sessionVersion ||
          !isOpenRef.current ||
          statusRef.current === 'thinking' ||   // ← was the key missing guard
          isMutedRef.current ||
          hasFatalErrorRef.current ||
          isListeningActiveRef.current ||
          isStartingRef.current
        ) return;

        if (statusRef.current === 'listening' || statusRef.current === 'speaking') {
          startListeningSafe();
        }
      }, 400);
    };

    recognitionRef.current = rec;
    addLog('STT SpeechRecognition configured successfully.');
    return rec;
  };

  // User-gesture-gated microphone acquisition
  const requestMicrophoneStream = async () => {
    if (isDestroyedRef.current) return null;
    // Prevent overlapping acquisition attempts
    if (isAcquiringRef.current) {
      addLog('Microphone acquisition already in progress; skipping duplicate attempt.');
      return null;
    }
    isAcquiringRef.current = true;

    addLog('Acquiring microphone stream via getUserMedia...');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errStr = 'Browser error: navigator.mediaDevices.getUserMedia is unsupported (ensure localhost or HTTPS secure origin).';
      addLog(`Error: ${errStr}`);
      setErrorMessage(errStr);
      isAcquiringRef.current = false;
      runDiagnostics();
      return null;
    }

    try {
      // Request hardware-level echo cancellation + noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // If session was destroyed while we were waiting for the permission prompt
      if (isDestroyedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        isAcquiringRef.current = false;
        return null;
      }

      addLog('Microphone stream successfully acquired.');
      hasFatalErrorRef.current = false;
      setErrorMessage(null);

      // Stop any previous stream tracks before replacing (prevents mic lock)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      streamRef.current = stream;
      await setupAudioAnalyzer(stream);

      const recInstance = createRecognition();
      if (recInstance) {
        setStatus('listening');
        startListeningSafe();
      } else {
        hasFatalErrorRef.current = true;
        setErrorMessage('Speech recognition is not supported in this browser.');
        runDiagnostics();
      }
      runDiagnostics();
      return stream;
    } catch (err: any) {
      addLog(`Microphone acquisition failed: ${err.name} - ${err.message}`);
      hasFatalErrorRef.current = true;

      let displayErr = `Microphone access failed: ${err.name}`;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        displayErr = 'Permission Denied: The user or browser settings blocked microphone access.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        displayErr = 'No Microphone Found: Please connect a recording device to your system.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        displayErr = 'Microphone Locked: Another app (Zoom, Teams, etc.) or open tab is using the microphone.';
      } else if (err.name === 'SecurityError') {
        displayErr = 'Security Block: Media access is blocked on this origin.';
      } else if (err.message) {
        displayErr = `Microphone error: ${err.message}`;
      }

      setErrorMessage(displayErr);
      runDiagnostics();
      return null;
    } finally {
      isAcquiringRef.current = false;
    }
  };

  // Pre-emptive permission query and diagnostics run on open
  useEffect(() => {
    if (!isOpen) return;

    // ── FIX 1: Reset the destruction flag for this new session ────────────
    isDestroyedRef.current = false;
    hasFatalErrorRef.current = false;
    setErrorMessage(null);
    setDiagnostics(null);
    setLogs([]);
    setSecondsElapsed(0);
    // Reset the active voice session ID so a new call doesn't reuse a stale ID
    activeVoiceConversationIdRef.current = conversationId;

    addLog('System starting voice calibration routine...');
    addLog(`Secure Origin Context: ${window.isSecureContext ? 'YES (Secure)' : 'NO (Insecure HTTP)'}`);
    addLog(`Network Connectivity: ${navigator.onLine ? 'ONLINE' : 'OFFLINE'}`);
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    addLog(`Web Speech STT Support: ${SpeechRecognition ? 'SUPPORTED' : 'UNSUPPORTED'}`);
    addLog(`MediaDevices API Support: ${!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? 'SUPPORTED' : 'UNSUPPORTED'}`);

    const checkPermissionsAndStart = async () => {
      // 1. Devices check
      let devicesCount = 0;
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          devicesCount = devices.filter(d => d.kind === 'audioinput').length;
          addLog(`Audio input devices counted: ${devicesCount}`);
        } catch (e) {
          addLog('Device enumeration failed during init.');
        }
      }

      // 2. Query Permissions API state
      let permissionState: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const st = await navigator.permissions.query({ name: 'microphone' as any });
          permissionState = st.state as any;
          addLog(`Microphone permission state: ${permissionState}`);
        } catch (e) {
          addLog('Permissions API query unsupported or failed.');
        }
      }

      // Guard: session may have been destroyed while we awaited permissions
      if (isDestroyedRef.current) return;

      // 3. Acquire stream (only if permission is granted or unknown — which covers
      //    Safari/Firefox where the Permissions API isn't supported).
      if (permissionState === 'granted' || permissionState === 'unknown') {
        addLog(`Permission is ${permissionState.toUpperCase()}. Acquiring stream.`);
        const stream = await requestMicrophoneStream();
        if (stream && !isDestroyedRef.current) {
          setStatus('speaking');
          const greeting = 'Hello, I am JARVIS. I am connected to Creativals OS. How can I assist you today?';
          setAiText(greeting);
          speakText(greeting);
        }
      } else if (permissionState === 'denied') {
        addLog('Permission is BLOCKED (denied). Showing diagnostic screen.');
        hasFatalErrorRef.current = true;
        setErrorMessage('Microphone access is blocked in your browser settings.');
        runDiagnostics();
      } else {
        addLog("Permission is PENDING (prompt). Please click 'Grant Microphone Access'.");
        hasFatalErrorRef.current = true;
        setErrorMessage('Microphone access is required to connect the call.');
        runDiagnostics();
      }
    };

    checkPermissionsAndStart();

    return () => {
      cleanupVoiceSession();
    };
  }, [isOpen]);

  // Handle system recovery observers (Permission state & Device changes)
  useEffect(() => {
    if (!isOpen) return;

    let permissionStatus: PermissionStatus | null = null;
    
    const handlePermissionChange = () => {
      addLog(`Observed permission state change to: ${permissionStatus?.state}`);
      if (permissionStatus?.state === 'granted') {
        handleRetry();
      } else if (permissionStatus?.state === 'denied') {
        hasFatalErrorRef.current = true;
        setErrorMessage('Microphone access is blocked in your browser settings.');
        runDiagnostics();
      }
    };

    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as any })
        .then((status) => {
          permissionStatus = status;
          status.addEventListener('change', handlePermissionChange);
        })
        .catch(err => console.warn('[Voice UI] Permission listener error:', err));
    }

    const handleDeviceChange = () => {
      addLog('Observed hardware audio device changes.');
      // A denied permission is NOT resolved by a device change, and every
      // getUserMedia attempt itself emits `devicechange` — auto-retrying here
      // would spin forever. Only retry for genuine hardware changes.
      if (permissionStatus?.state === 'denied') return;
      if (!hasFatalErrorRef.current) return;
      if (deviceChangeDebounceRef.current) clearTimeout(deviceChangeDebounceRef.current);
      deviceChangeDebounceRef.current = setTimeout(() => {
        if (hasFatalErrorRef.current && !isAcquiringRef.current && !isDestroyedRef.current) {
          handleRetry();
        }
      }, 800);
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (deviceChangeDebounceRef.current) {
        clearTimeout(deviceChangeDebounceRef.current);
        deviceChangeDebounceRef.current = null;
      }
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', handlePermissionChange);
      }
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [isOpen]);

  const startListeningSafe = () => {
    if (isDestroyedRef.current) return; // FIX 8
    try {
      if (
        recognitionRef.current &&
        (statusRef.current === 'listening' || statusRef.current === 'speaking') &&
        !isMutedRef.current &&
        !hasFatalErrorRef.current &&
        !isListeningActiveRef.current &&
        !isStartingRef.current
      ) {
        addLog('Starting SpeechRecognition engine...');
        isStartingRef.current = true;
        recognitionRef.current.start();
      }
    } catch (e) {
      addLog(`SpeechRecognition start exception: ${e}`);
      isStartingRef.current = false;
    }
  };

  const handleRetry = () => {
    cleanupVoiceSession();
    isDestroyedRef.current = false; // re-open session for the retry
    hasFatalErrorRef.current = false;
    setErrorMessage(null);
    setDiagnostics(null);
    setStatus('connecting');
    requestMicrophoneStream();
  };

  // ─── FIX 7: Text-To-Speech (utterance queue protection) ──────────────────
  // Before speaking, we always cancel any currently-playing utterance first.
  // This prevents overlapping speech when a fast API response arrives while
  // a previous utterance is still playing.
  const speakText = (text: string) => {
    if (isDestroyedRef.current) return;

    // Cancel any existing speech first (queue protection)
    try {
      if (synthesisUtteranceRef.current) {
        synthesisUtteranceRef.current.onend = null;
        synthesisUtteranceRef.current.onerror = null;
      }
    } catch (e) {}
    synthesisUtteranceRef.current = null;

    try { window.speechSynthesis.pause(); } catch (e) {}
    try { window.speechSynthesis.cancel(); } catch (e) {}

    // Stop STT while JARVIS is speaking — prevents self-echo triggering recognition
    try {
      if (recognitionRef.current) {
        isListeningActiveRef.current = false;
        recognitionRef.current.abort();
      }
    } catch (e) {}

    aiTextRef.current = text;
    setStatus('speaking');

    if (!isSpeakerOnRef.current) {
      safeTimeout(() => {
        if (isDestroyedRef.current) return;
        aiTextRef.current = '';
        setStatus('listening');
        startListeningSafe();
      }, 800);
      return;
    }

    const cleanText = text.replace(/[*#`_\-|[\]()]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    synthesisUtteranceRef.current = utterance;

    utterance.onend = () => {
      if (isDestroyedRef.current) return; // FIX 1
      synthesisUtteranceRef.current = null;
      aiTextRef.current = '';
      setStatus('listening');
      safeTimeout(() => {
        if (isDestroyedRef.current) return;
        if (!isMutedRef.current && isOpenRef.current && statusRef.current === 'listening') {
          startListeningSafe();
        }
      }, 500);
    };

    utterance.onerror = (e) => {
      if (isDestroyedRef.current) return; // FIX 1
      synthesisUtteranceRef.current = null;
      aiTextRef.current = '';

      // 'canceled' / 'interrupted' means handleInterrupt already took over state
      if (e.error === 'canceled' || e.error === 'interrupted') return;

      addLog(`[TTS Error] Speech synthesis failed: ${e.error}`);
      setStatus('listening');
      safeTimeout(() => {
        if (isDestroyedRef.current) return;
        if (!isMutedRef.current && isOpenRef.current && statusRef.current === 'listening') {
          startListeningSafe();
        }
      }, 500);
    };

    window.speechSynthesis.speak(utterance);

    // Start listening for barge-in after a short delay — this gives the TTS
    // engine time to begin playing so the echo guard has content to compare.
    safeTimeout(() => {
      if (isDestroyedRef.current) return;
      if (statusRef.current === 'speaking' && !isMutedRef.current) {
        startListeningSafe();
      }
    }, 400);
  };

  const handleInterrupt = () => {
    if (isDestroyedRef.current) return;

    // Detach the active utterance's handlers first so onerror='canceled'
    // can't fight the state transition we're about to make
    try {
      if (synthesisUtteranceRef.current) {
        synthesisUtteranceRef.current.onend = null;
        synthesisUtteranceRef.current.onerror = null;
      }
    } catch (e) {}
    synthesisUtteranceRef.current = null;
    aiTextRef.current = '';

    // ── FIX 9: Triple-cancel for Chrome reliability ───────────────────────
    // Chrome frequently ignores a single cancel() call mid-utterance.
    // pause() + cancel() + two deferred cancel()s is the reliable pattern.
    try { window.speechSynthesis.pause(); } catch (e) {}
    try { window.speechSynthesis.cancel(); } catch (e) {}
    setTimeout(() => { try { window.speechSynthesis.cancel(); } catch (e) {} }, 50);
    setTimeout(() => { try { window.speechSynthesis.cancel(); } catch (e) {} }, 150);

    addLog('User interrupted JARVIS. Returning to listening.');

    // Cancel the in-flight API call — the user's new speech will trigger a fresh one
    cancelApiCall();

    // Reset STT to a clean listening state
    try {
      if (recognitionRef.current) {
        isListeningActiveRef.current = false;
        recognitionRef.current.abort();
      }
    } catch (e) {}

    setStatus('listening');
    safeTimeout(() => {
      if (isDestroyedRef.current) return;
      startListeningSafe();
    }, 300);
  };

  const toggleMute = () => {
    if (isDestroyedRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    isMutedRef.current = nextMute;

    if (nextMute) {
      try {
        if (recognitionRef.current) {
          isListeningActiveRef.current = false;
          recognitionRef.current.abort();
        }
      } catch (e) {}
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      setStatus('listening');
    } else {
      startListeningSafe();
    }
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
  };

  // ─── Full session cleanup ─────────────────────────────────────────────────
  // Called on End Call, on retry, and by the useEffect cleanup.
  // Order matters: API cancellation must happen before TTS cancel so the
  // response doesn't arrive and restart audio during cleanup.
  const cleanupVoiceSession = () => {
    // 1. Bulk-cancel all tracked safeTimeout calls
    pendingTimeoutsRef.current.forEach(id => clearTimeout(id));
    pendingTimeoutsRef.current.clear();

    // 2. Cancel any in-flight voiceTalk API call
    cancelApiCall();

    // 3. Stop TTS — triple-cancel for Chrome + nullify handlers
    try {
      if (synthesisUtteranceRef.current) {
        synthesisUtteranceRef.current.onend = null;
        synthesisUtteranceRef.current.onerror = null;
      }
    } catch (e) {}
    synthesisUtteranceRef.current = null;
    aiTextRef.current = '';
    try { window.speechSynthesis.pause(); } catch (e) {}
    try { window.speechSynthesis.cancel(); } catch (e) {}
    // These use raw setTimeout (not safeTimeout) because the session is
    // already being destroyed — we don't want them tracked.
    setTimeout(() => { try { window.speechSynthesis.cancel(); } catch (e) {} }, 50);
    setTimeout(() => { try { window.speechSynthesis.cancel(); } catch (e) {} }, 150);
    setTimeout(() => { try { window.speechSynthesis.cancel(); } catch (e) {} }, 300);

    // 4. Invalidate the current recognition session and abort STT.
    //    All callbacks from the now-stale session will self-drop when they
    //    see recognitionSessionRef.current !== sessionVersion.
    recognitionSessionRef.current++;
    try {
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        isListeningActiveRef.current = false;
        isStartingRef.current = false;
        recognitionRef.current.abort();
      }
    } catch (e) {}
    recognitionRef.current = null;

    // 5. Stop VAD loop
    stopVadLoop();

    // 6. Cancel visualizer animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // 7. Clear call timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    // 8. Release all mic tracks — stops the browser from keeping the mic indicator lit
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // 9. Close AudioContext
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
  };

  // ─── FIX 1: End Call — set isDestroyed FIRST ─────────────────────────────
  // By flipping the destruction flag before cleanup, we guarantee that any
  // async callback already in-flight (utterance onend timer, API response,
  // STT onend timeout) will self-abort when it eventually fires.
  const handleEndCall = () => {
    isDestroyedRef.current = true; // ← must be FIRST
    cleanupVoiceSession();
    onClose();
  };

  // Re-run diagnostic suite
  const runDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    addLog('Running diagnostics suite calibration...');
    const isSecure = typeof window !== 'undefined' && window.isSecureContext;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const SpeechRecognition = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    const hasSpeechSupport = !!SpeechRecognition;
    const hasMediaDevicesSupport = !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    
    let permissionState: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';
    let devices: MediaDeviceInfo[] = [];
    let devicesCount = 0;
    let getUserMediaError: { name: string; message: string } | null = null;

    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      try {
        const pStatus = await navigator.permissions.query({ name: 'microphone' as any });
        permissionState = pStatus.state as any;
      } catch (e) {}
    }

    if (hasMediaDevicesSupport) {
      try {
        devices = await navigator.mediaDevices.enumerateDevices();
        devicesCount = devices.filter(d => d.kind === 'audioinput').length;
      } catch (e) {}
    }

    let possibleCause: 'permission_denied' | 'no_devices' | 'device_locked' | 'insecure_context' | 'offline' | 'unsupported_browser' | 'unknown' = 'unknown';
    let friendlyExplanation = 'An unknown error occurred while initializing the microphone.';
    let recommendedAction = 'Please try reloading the page or restarting your browser.';

    if (!isSecure) {
      possibleCause = 'insecure_context';
      friendlyExplanation = 'The application is running in an insecure context (HTTP instead of HTTPS). Browsers block all media access (microphone) unless the site is served securely.';
      recommendedAction = "Access the app via 'http://localhost:3000' (which Chrome treats as secure) or use a secure HTTPS connection.";
    } else if (!hasSpeechSupport) {
      possibleCause = 'unsupported_browser';
      friendlyExplanation = 'Your browser does not support the webkitSpeechRecognition API required for voice calling.';
      recommendedAction = 'Please switch to Google Chrome, Microsoft Edge, or Apple Safari.';
    } else if (!isOnline) {
      possibleCause = 'offline';
      friendlyExplanation = "You are currently offline. Chrome's Speech Recognition API requires an active internet connection to transcribe speech.";
      recommendedAction = 'Check your internet connection and try again.';
    } else if (devicesCount === 0) {
      possibleCause = 'no_devices';
      friendlyExplanation = 'No microphone hardware was detected by your system.';
      recommendedAction = 'Please plug in a microphone, webcam, or headset and ensure it is enabled in your OS sound settings.';
    } else {
      possibleCause = 'permission_denied';
      friendlyExplanation = "Microphone access is denied. This can happen if Chrome's site permission is blocked, or if your operating system's privacy settings are blocking browser access.";
      recommendedAction = "1. Click the lock/info icon next to the URL in the address bar.\n2. Ensure 'Microphone' is set to 'Allow'.\n3. Check OS Settings -> Privacy -> Microphone to ensure Chrome has OS-level microphone access.";
    }

    setDiagnostics({
      isSecure,
      isOnline,
      hasSpeechSupport,
      hasMediaDevicesSupport,
      permissionState,
      devicesCount,
      devices,
      getUserMediaError,
      possibleCause,
      friendlyExplanation,
      recommendedAction
    });
    setIsRunningDiagnostics(false);
    addLog(`Diagnostics completed: permission=${permissionState}, devicesCount=${devicesCount}`);
  };

  if (!isOpen) return null;

  const isStark = theme === 'stark';

  // Styling maps based on theme
  const styles = {
    backdrop: {
      position: 'fixed' as const,
      inset: 0,
      background: isStark 
        ? 'radial-gradient(circle, #fbfcfd 0%, #e2e8f0 100%)' 
        : 'radial-gradient(circle, #0e0d1e 0%, #06050b 100%)',
      backdropFilter: 'blur(16px)',
      zIndex: 100,
      display: 'flex',
      fontFamily: '"Outfit", "Inter", sans-serif',
      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      color: isStark ? '#1e293b' : '#f8fafc',
    },
    mainColumn: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'space-between',
      padding: '2.5rem',
      position: 'relative' as const,
    },
    sidebarColumn: {
      width: '380px',
      background: isStark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(9, 8, 18, 0.5)',
      borderLeft: `1px solid ${isStark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(124, 58, 237, 0.15)'}`,
      padding: '2.5rem',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '1.5rem',
      overflowY: 'auto' as const,
    },
    textPrimary: {
      color: isStark ? '#0f172a' : '#f8fafc',
    },
    textSecondary: {
      color: isStark ? '#475569' : '#94a3b8',
    },
    textMuted: {
      color: isStark ? '#94a3b8' : '#475569',
    },
    accentText: {
      color: isStark ? '#0891b2' : '#a78bfa',
    },
    glassCard: {
      background: isStark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(15, 14, 28, 0.4)',
      border: `1px solid ${isStark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(124, 58, 237, 0.15)'}`,
      borderRadius: '20px',
      padding: '1.5rem',
      boxShadow: isStark ? '0 10px 30px -10px rgba(148, 163, 184, 0.2)' : '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
      position: 'relative' as const,
      transition: 'all 0.3s ease',
    },
    pillConsole: {
      background: isStark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(13, 12, 22, 0.75)',
      border: `1px solid ${isStark ? 'rgba(6, 182, 212, 0.2)' : 'rgba(124, 58, 237, 0.2)'}`,
      borderRadius: '999px',
      padding: '0.75rem 2rem',
      display: 'flex',
      alignItems: 'center',
      gap: '2.5rem',
      boxShadow: isStark ? '0 20px 40px -15px rgba(6, 182, 212, 0.15)' : '0 20px 40px -15px rgba(124, 58, 237, 0.15)',
    }
  };

  return (
    <div style={styles.backdrop}>
      {/* ── LEFT COLUMN: Visualizer Stage & Main Controls ── */}
      <div style={styles.mainColumn}>
        {/* Header Area */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={handleEndCall}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem', 
              background: 'none', border: 'none', 
              color: isStark ? '#475569' : '#94a3b8', fontSize: '0.9375rem', fontWeight: 600, 
              cursor: 'pointer', transition: 'color 0.2s' 
            }}
            className="hover-cyan"
          >
            <ArrowLeft size={16} /> Back to Quotes
          </button>

          {/* Assistant Info & Theme Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: isStark ? '#0891b2' : '#f43f5e', background: isStark ? 'linear-gradient(135deg, #0891b2, #06b6d4)' : 'linear-gradient(135deg, #ec4899, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                JARVIS
              </span>
              <span style={{ fontSize: '0.8125rem', color: isStark ? '#64748b' : '#64748b', fontWeight: 500 }}>
                Your AI Operations Assistant
              </span>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', marginLeft: '4px', boxShadow: '0 0 8px #10b981' }} />
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Online</span>
            </div>

            {/* Theme switcher */}
            <button
              onClick={() => setTheme(theme === 'stark' ? 'dark' : 'stark')}
              title={isStark ? "Switch to Dark HUD" : "Switch to Stark White Theme"}
              style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: isStark ? 'rgba(6, 182, 212, 0.08)' : 'rgba(124, 58, 237, 0.08)',
                border: `1px solid ${isStark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(124, 58, 237, 0.15)'}`,
                color: isStark ? '#0891b2' : '#a78bfa',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.3s ease'
              }}
              className="theme-toggle-btn"
            >
              {isStark ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>

          {/* End Call top corner */}
          <button
            onClick={handleEndCall}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '999px',
              background: isStark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
              border: `1px solid ${isStark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.15)'}`,
              color: '#ef4444', fontSize: '0.8125rem', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s ease'
            }}
            className="hover-red-bg"
          >
            <PhoneOff size={13} /> End Call
          </button>
        </div>

        {/* Dynamic Center Stage Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          {/* 1. If Error: Render the detailed connections diagnostics panel */}
          {errorMessage ? (
            <div style={{ ...styles.glassCard, maxWidth: '540px', width: '100%', border: isStark ? '2px solid rgba(6,182,212,0.3)' : '2px solid rgba(239, 68, 68, 0.25)' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={24} color="#ef4444" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    CONNECTION ERROR
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: isStark ? '#475569' : '#cbd5e1', fontWeight: 600 }}>
                    {errorMessage}
                  </p>
                </div>
              </div>

              {isRunningDiagnostics ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '1.5rem', background: isStark ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(64,64,64,0.1)' }}>
                  <span className="spinner-glow" />
                  <span style={{ fontSize: '0.875rem', color: isStark ? '#64748b' : '#64748b' }}>Diagnosing hardware devices...</span>
                </div>
              ) : diagnostics ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Status Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: diagnostics.isSecure ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: diagnostics.isSecure ? '#10b981' : '#ef4444', border: '1px solid currentColor' }}>
                      {diagnostics.isSecure ? "Secure Origin" : "Insecure HTTP"}
                    </span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: diagnostics.isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: diagnostics.isOnline ? '#10b981' : '#ef4444', border: '1px solid currentColor' }}>
                      {diagnostics.isOnline ? "Online" : "Offline"}
                    </span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: diagnostics.permissionState === 'granted' ? 'rgba(16, 185, 129, 0.1)' : (diagnostics.permissionState === 'denied' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)'), color: diagnostics.permissionState === 'granted' ? '#10b981' : (diagnostics.permissionState === 'denied' ? '#ef4444' : '#f59e0b'), border: '1px solid currentColor' }}>
                      Permission: {diagnostics.permissionState.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: diagnostics.devicesCount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: diagnostics.devicesCount > 0 ? '#10b981' : '#ef4444', border: '1px solid currentColor' }}>
                      Mics: {diagnostics.devicesCount}
                    </span>
                  </div>

                  {/* Microphones detected */}
                  <div style={{ textAlign: 'left' }}>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: 800, color: isStark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Detected Audio Input Devices
                    </h4>
                    {diagnostics.devices.filter(d => d.kind === 'audioinput').length === 0 ? (
                      <span style={{ fontSize: '0.8125rem', color: '#ef4444' }}>No microphones detected. Please connect a device.</span>
                    ) : (
                      diagnostics.devices.filter(d => d.kind === 'audioinput').map((device, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: isStark ? '#475569' : '#94a3b8', marginTop: '4px' }}>
                          <span style={{ color: isStark ? '#0891b2' : '#a78bfa' }}>🎤</span>
                          <span>{device.label || `Microphone ${idx + 1} (Name blocked - grant permission to unlock)`}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ textAlign: 'left' }}>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: 800, color: isStark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Root Cause
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: isStark ? '#475569' : '#94a3b8', lineHeight: 1.4 }}>
                      {diagnostics.friendlyExplanation}
                    </p>
                  </div>

                  <div style={{ textAlign: 'left', padding: '0.875rem 1.125rem', borderRadius: '12px', background: isStark ? 'rgba(6, 182, 212, 0.05)' : 'rgba(124, 58, 237, 0.05)', borderLeft: `4px solid ${isStark ? '#0891b2' : '#7c3aed'}` }}>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.75rem', fontWeight: 800, color: isStark ? '#0891b2' : '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      How to Fix
                    </h4>
                    <div style={{ fontSize: '0.8125rem', color: isStark ? '#475569' : '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {diagnostics.recommendedAction}
                    </div>
                  </div>

                  {/* Calibration terminal log */}
                  <div style={{ textAlign: 'left' }}>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', fontWeight: 800, color: isStark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      System Calibration Log
                    </h4>
                    <div style={{ 
                      height: '80px', overflowY: 'auto', 
                      background: isStark ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.3)', 
                      border: `1px solid ${isStark ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'}`,
                      borderRadius: '10px', padding: '0.5rem 0.75rem', 
                      fontFamily: 'monospace', fontSize: '0.75rem', 
                      color: isStark ? '#0f172a' : '#10b981',
                      display: 'flex', flexDirection: 'column-reverse' as any
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {logs.slice().reverse().map((log, idx) => (
                          <div key={idx}>{log}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Retry Controls */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                    <button 
                      onClick={handleRetry} 
                      style={{ 
                        flex: 2, padding: '0.75rem 1.25rem', borderRadius: '10px', 
                        background: isStark ? '#0891b2' : '#7c3aed', color: '#fff', 
                        fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer', 
                        boxShadow: isStark ? '0 4px 12px rgba(6, 182, 212, 0.3)' : '0 4px 12px rgba(124, 58, 237, 0.3)', 
                        transition: 'all 0.2s' 
                      }} 
                      className="btn-hover-bright"
                    >
                      Retry Microphone Access
                    </button>
                    <button onClick={runDiagnostics} style={{ flex: 1, padding: '0.75rem 1.25rem', borderRadius: '10px', background: 'transparent', color: isStark ? '#1e293b' : '#f8fafc', fontSize: '0.8125rem', fontWeight: 700, border: `1px solid ${isStark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer' }}>
                      Test Again
                    </button>
                    <button onClick={() => window.location.reload()} style={{ flex: 1, padding: '0.75rem 1.25rem', borderRadius: '10px', background: 'transparent', color: isStark ? '#475569' : '#94a3b8', fontSize: '0.8125rem', fontWeight: 700, border: `1px solid ${isStark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer' }}>
                      Reload Page
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                  <button onClick={runDiagnostics} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', background: isStark ? '#0891b2' : '#7c3aed', color: '#fff', fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                    Run Diagnostics
                  </button>
                </div>
              )}
            </div>
          ) : (
            
            // 2. Normal State: Render the glowing concentric visualizer HUD
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '320px', height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                
                <svg width="320" height="320" style={{ position: 'absolute', transform: 'rotate(0deg)' }}>
                  <circle cx="160" cy="160" r="148" fill="none" stroke={isStark ? 'rgba(6, 182, 212, 0.1)' : 'rgba(124, 58, 237, 0.1)'} strokeWidth="1" />
                  <circle cx="160" cy="160" r="138" fill="none" stroke={isStark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(124, 58, 237, 0.15)'} strokeWidth="2" strokeDasharray="4 8" className="spin-slow" />
                  <circle cx="160" cy="160" r="118" fill="none" stroke={isStark ? 'rgba(6, 182, 212, 0.2)' : 'rgba(124, 58, 237, 0.2)'} strokeWidth="1" strokeDasharray="1 3" className="spin-reverse-slow" />
                  
                  <defs>
                    <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={isStark ? '#06b6d4' : '#ec4899'} stopOpacity="0.4" />
                      <stop offset="100%" stopColor={isStark ? '#eab308' : '#7c3aed'} stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                  <circle cx="160" cy="160" r="108" fill="none" stroke="url(#circleGrad)" strokeWidth="4" />
                </svg>

                <div style={{
                  width: '180px', height: '180px', borderRadius: '50%',
                  background: isStark 
                    ? 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, rgba(255,255,255,0.9) 70%)'
                    : 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, rgba(13,12,22,0.9) 70%)',
                  border: `2px solid ${isStark ? 'rgba(6, 182, 212, 0.25)' : 'rgba(124, 58, 237, 0.25)'}`,
                  boxShadow: isStark 
                    ? '0 0 35px rgba(6, 182, 212, 0.15), inset 0 0 25px rgba(6, 182, 212, 0.1)'
                    : '0 0 35px rgba(124, 58, 237, 0.25), inset 0 0 25px rgba(124, 58, 237, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: status === 'speaking' ? 'pointer' : 'default',
                  transition: 'all 0.3s ease'
                }}
                onClick={status === 'speaking' ? handleInterrupt : undefined}
                title={status === 'speaking' ? "Click to interrupt speaking" : undefined}
                className="hover-core-glow"
                >
                  <canvas 
                    ref={canvasRef} 
                    width={140} 
                    height={70} 
                    style={{ width: '140px', height: '70px' }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
                <span style={{ 
                  fontSize: '0.875rem', fontWeight: 800, 
                  color: isStark ? '#0891b2' : '#a78bfa',
                  textTransform: 'uppercase', letterSpacing: '0.15em', display: 'block',
                  textShadow: isStark ? 'none' : '0 0 10px rgba(167, 139, 250, 0.3)'
                }}>
                  {status === 'connecting' && "JARVIS CONNECTING…"}
                  {status === 'listening' && (isMuted ? "JARVIS MUTED" : "JARVIS LISTENING…")}
                  {status === 'thinking' && "JARVIS THINKING…"}
                  {status === 'speaking' && "JARVIS SPEAKING"}
                </span>

                <span style={{ 
                  fontSize: '1.5rem', fontWeight: 700, 
                  color: isStark ? '#1e293b' : '#f8fafc',
                  display: 'block', marginTop: '0.5rem',
                  fontFamily: 'monospace'
                }}>
                  {formatTime(secondsElapsed)}
                </span>

                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '1rem' }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span 
                      key={i} 
                      style={{ 
                        width: '6px', height: '6px', borderRadius: '50%', 
                        background: i === 2 
                          ? (isStark ? '#0891b2' : '#f8fafc') 
                          : (isStark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)'),
                        transition: 'background 0.3s ease' 
                      }} 
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Floating Controls pill panel */}
        <div style={{ display: 'flex', justifyContent: 'center', zIndex: 10 }}>
          <div style={styles.pillConsole}>
            {/* Mute Button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={toggleMute}
                title={isMuted ? "Unmute Mic" : "Mute Mic"}
                style={{
                  width: '46px', height: '46px', borderRadius: '50%',
                  background: isMuted 
                    ? 'rgba(239, 68, 68, 0.1)' 
                    : (isStark ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.04)'),
                  border: `1px solid ${isMuted ? '#ef4444' : (isStark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.08)')}`,
                  color: isMuted ? '#ef4444' : (isStark ? '#0891b2' : '#94a3b8'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all 0.15s ease'
                }}
                className="control-btn"
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: isStark ? '#64748b' : '#64748b' }}>
                Mute
              </span>
            </div>

            {/* Interrupt / Stop-speaking Button (active while JARVIS is speaking) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={handleInterrupt}
                title="Stop JARVIS speaking"
                style={{
                  width: '46px', height: '46px', borderRadius: '50%',
                  background: status === 'speaking'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : (isStark ? 'rgba(6, 182, 212, 0.06)' : 'rgba(255, 255, 255, 0.04)'),
                  border: `1px solid ${status === 'speaking' ? '#ef4444' : (isStark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.08)')}`,
                  color: status === 'speaking' ? '#ef4444' : (isStark ? '#0891b2' : '#94a3b8'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: status === 'speaking' ? 1 : 0.7,
                  transition: 'all 0.15s ease'
                }}
                className="control-btn"
              >
                <StopCircle size={18} />
              </button>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: isStark ? '#64748b' : '#64748b' }}>
                Stop
              </span>
            </div>

            {/* Red End Call Core Button */}
            <button
              onClick={handleEndCall}
              title="Hang Up"
              style={{
                width: '68px', height: '68px', borderRadius: '50%',
                background: '#ef4444',
                border: 'none',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(239, 68, 68, 0.45)',
                cursor: 'pointer', transition: 'transform 0.15s ease'
              }}
              className="hangup-btn"
            >
              <PhoneOff size={24} />
            </button>

            {/* Speaker Toggle Button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={toggleSpeaker}
                title={isSpeakerOn ? "Speaker Off" : "Speaker On"}
                style={{
                  width: '46px', height: '46px', borderRadius: '50%',
                  background: isSpeakerOn 
                    ? (isStark ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.04)')
                    : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${isSpeakerOn ? (isStark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.08)') : '#ef4444'}`,
                  color: isSpeakerOn ? (isStark ? '#0891b2' : '#94a3b8') : '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all 0.15s ease'
                }}
                className="control-btn"
              >
                {isSpeakerOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: isStark ? '#64748b' : '#64748b' }}>
                Speaker
              </span>
            </div>
          </div>
        </div>

        {/* Tip Box Footer */}
        <div style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          borderTop: `1px solid ${isStark ? 'rgba(6, 182, 212, 0.1)' : 'rgba(255, 255, 255, 0.05)'}`, 
          paddingTop: '1.25rem', marginTop: '1rem' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: isStark ? '#475569' : '#94a3b8' }}>
            <Sparkles size={14} style={{ color: isStark ? '#0891b2' : '#a78bfa' }} />
            <span>
              <strong>Tip:</strong> You can speak naturally. JARVIS understands business context, data and actions.
            </span>
          </div>

          <a 
            href="https://creaticals.com/docs/voice-assistant"
            target="_blank"
            rel="noreferrer"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.375rem', 
              fontSize: '0.8125rem', color: isStark ? '#0891b2' : '#a78bfa', fontWeight: 600, 
              textDecoration: 'none', transition: 'opacity 0.2s' 
            }}
            className="hover-opacity"
          >
            Learn how to use JARVIS <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* ── RIGHT COLUMN: Sidebar Cards ── */}
      <aside style={styles.sidebarColumn}>
        
        {/* Card 1: LIVE ASSISTANT Box */}
        <div style={styles.glassCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: isStark ? '#64748b' : '#94a3b8' }}>
              Live Assistant
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span className="pulsing-green-dot" />
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div style={{
              width: '84px', height: '84px', borderRadius: '50%',
              border: `2px solid ${isStark ? 'rgba(6, 182, 212, 0.4)' : 'rgba(124, 58, 237, 0.4)'}`,
              padding: '4px',
              boxShadow: isStark ? '0 0 15px rgba(6, 182, 212, 0.15)' : '0 0 15px rgba(124, 58, 237, 0.25)',
              background: isStark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.2)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <img 
                src="/jarvis-avatar.jpg" 
                alt="JARVIS Robot Avatar" 
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: isStark ? '#0f172a' : '#f8fafc' }}>
                JARVIS
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: isStark ? '#64748b' : '#94a3b8', fontWeight: 500 }}>
                AI Operations Assistant
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: JARVIS CAN HELP YOU Box */}
        <div style={styles.glassCard}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: isStark ? '#64748b' : '#94a3b8' }}>
            JARVIS Can Help You
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              "Show today's summary",
              "Create a new quote",
              "Which invoices are overdue?",
              "Show my active projects",
              "How is my team performance?",
              "Generate a report"
            ].map((text, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem' }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '4px',
                  background: isStark ? 'rgba(6, 182, 212, 0.08)' : 'rgba(124, 58, 237, 0.08)',
                  border: `1px solid ${isStark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(124, 58, 237, 0.15)'}`,
                  color: isStark ? '#0891b2' : '#a78bfa',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <CheckCircle size={11} fill="currentColor" fillOpacity="0.1" />
                </div>
                <span style={{ color: isStark ? '#334155' : '#e2e8f0' }}>{text}</span>
              </div>
            ))}
          </div>

          <a
            href="/ai"
            onClick={onClose}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '0.8125rem', color: isStark ? '#0891b2' : '#a78bfa', fontWeight: 700, 
              textDecoration: 'none', marginTop: '1.25rem', justifyContent: 'flex-start',
              transition: 'opacity 0.2s' 
            }}
            className="hover-opacity"
          >
            Try in AI Chat <ArrowRight size={12} />
          </a>
        </div>

        {/* Card 3: TODAY'S SUMMARY Box */}
        <div style={styles.glassCard}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: isStark ? '#64748b' : '#94a3b8' }}>
            Today's Summary
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { label: "Quotes Created", count: displayQuotesCreated },
              { label: "Converted",      count: displayConverted },
              { label: "Draft",          count: displayDraft },
              { label: "Expired",        count: displayExpired },
            ].map((metric, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Calendar size={13} style={{ color: isStark ? '#0891b2' : '#a78bfa' }} />
                  <span style={{ color: isStark ? '#475569' : '#cbd5e1' }}>{metric.label}</span>
                </div>
                <span style={{ fontWeight: 700, color: isStark ? '#0f172a' : '#f8fafc', fontSize: '0.875rem' }}>
                  {metric.count}
                </span>
              </div>
            ))}
          </div>

          <a
            href="/quotes"
            onClick={onClose}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '0.8125rem', color: isStark ? '#0891b2' : '#a78bfa', fontWeight: 700, 
              textDecoration: 'none', marginTop: '1.25rem', justifyContent: 'flex-start',
              transition: 'opacity 0.2s' 
            }}
            className="hover-opacity"
          >
            View all quotes <ArrowRight size={12} />
          </a>
        </div>
      </aside>

      {/* ── CSS Style Injection for UI Pulsing & Transitions ── */}
      <style jsx global>{`
        .spin-slow {
          animation: rotateClockwise 28s linear infinite;
          transform-origin: center;
        }
        .spin-reverse-slow {
          animation: rotateCounterClockwise 18s linear infinite;
          transform-origin: center;
        }
        .pulsing-green-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          display: inline-block;
          animation: pulseShadow 2s infinite ease-in-out;
        }
        .spinner-glow {
          width: 14px;
          height: 14px;
          border: 2px solid #ef4444;
          border-top-color: transparent;
          border-radius: 50%;
          animation: rotateClockwise 0.8s linear infinite;
          display: inline-block;
        }
        
        .hover-cyan:hover {
          color: #0891b2 !important;
        }
        .hover-core-glow:hover {
          transform: scale(1.02);
          box-shadow: 0 0 45px rgba(6, 182, 212, 0.25) !important;
        }
        .theme-toggle-btn:hover {
          transform: rotate(15deg) scale(1.05);
          background: rgba(6, 182, 212, 0.15) !important;
        }
        .control-btn:hover {
          transform: scale(1.05);
          border-color: rgba(6, 182, 212, 0.4) !important;
        }
        .hangup-btn:hover {
          transform: scale(1.06);
          background: #dc2626 !important;
        }
        .hover-opacity:hover {
          opacity: 0.8;
        }
        .hover-red-bg:hover {
          background: rgba(239, 68, 68, 0.15) !important;
        }
        .btn-hover-bright:hover {
          filter: brightness(1.1);
        }
        
        @keyframes rotateClockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes rotateCounterClockwise {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes pulseShadow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
        }
      `}</style>
    </div>
  );
}
