'use client';

import React, { useEffect, useState, useRef } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { aiApi } from '@/lib/api';

interface VoiceAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: number;
  onNewMessage?: (msg: any) => void;
}

export default function VoiceAgentModal({ isOpen, onClose, conversationId, onNewMessage }: VoiceAgentModalProps) {
  const [status, setStatusState] = useState<'connecting' | 'listening' | 'thinking' | 'speaking'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiText, setAiText] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const synthesisUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const statusRef = useRef<'connecting' | 'listening' | 'thinking' | 'speaking'>('connecting');
  const isMutedRef = useRef(isMuted);
  const isOpenRef = useRef(isOpen);
  const conversationIdRef = useRef(conversationId);
  const onNewMessageRef = useRef(onNewMessage);

  const setStatus = (newStatus: 'connecting' | 'listening' | 'thinking' | 'speaking') => {
    statusRef.current = newStatus;
    setStatusState(newStatus);
  };

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  // Audio wave visualizer loop
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let amplitude = 10;
      let frequency = 0.05;
      
      if (status === 'listening') {
        amplitude = 25;
        frequency = 0.08;
      } else if (status === 'speaking') {
        amplitude = 40;
        frequency = 0.12;
      } else if (status === 'thinking') {
        amplitude = 15;
        frequency = 0.2;
      }

      ctx.beginPath();
      ctx.lineWidth = 3;
      
      // Gradient for waves
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      grad.addColorStop(0, '#7c3aed');
      grad.addColorStop(0.5, '#ec4899');
      grad.addColorStop(1, '#4f46e5');
      ctx.strokeStyle = grad;

      for (let x = 0; x < canvas.width; x++) {
        const y = canvas.height / 2 + Math.sin(x * frequency + phase) * amplitude * Math.sin(x / 100);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Additional background waves
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(124, 58, 237, 0.3)';
      for (let x = 0; x < canvas.width; x++) {
        const y = canvas.height / 2 + Math.cos(x * (frequency * 0.7) - phase) * (amplitude * 0.5) * Math.sin(x / 100);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      phase += 0.15;
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, status]);

  // Speech Recognition & Synthesis Init
  useEffect(() => {
    if (!isOpen) return;

    // 1. Check browser compatibility
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Browser does not support Speech Recognition. Please use Chrome or Safari.");
      onClose();
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    recognitionRef.current = rec;

    // On start
    rec.onstart = () => {
      setStatus('listening');
      setTranscript('');
    };

    // On result
    rec.onresult = async (event: any) => {
      const speechToText = event.results[0][0].transcript;
      setTranscript(speechToText);
      setStatus('thinking');

      try {
        const res = await aiApi.voiceTalk(speechToText, conversationIdRef.current);
        const reply = res.data.response_text;
        setAiText(reply);
        
        if (onNewMessageRef.current) {
          // Trigger parent chat refetch
          onNewMessageRef.current(res.data);
        }

        speakText(reply);
      } catch (error) {
        console.error("Voice talk backend error", error);
        setStatus('listening');
      }
    };

    rec.onerror = (e: any) => {
      // 'aborted' fires whenever rec.abort() is called (cleanup/interruption) — ignore silently
      // 'no-speech' is normal browser timeout when user is quiet — restart listening gracefully
      if (e.error === 'aborted') return;
      if (e.error === 'no-speech') {
        if (isOpenRef.current && !isMutedRef.current) startListeningSafe();
        return;
      }
      console.error("Speech recognition error", e);
      setStatus('listening');
    };

    rec.onend = () => {
      // Loop back to listen unless speaking or thinking
      setTimeout(() => {
        if (isOpenRef.current && statusRef.current !== 'speaking' && statusRef.current !== 'thinking' && !isMutedRef.current) {
          startListeningSafe();
        }
      }, 500);
    };

    // Initialize greeting
    setStatus('speaking');
    const greeting = "Hello, I am Antigravity. I am connected to Creativals OS. How can I assist you today?";
    setAiText(greeting);
    speakText(greeting);

    return () => {
      cleanupAudioContext();
    };
  }, [isOpen]);

  const startListeningSafe = () => {
    try {
      if (recognitionRef.current && statusRef.current !== 'speaking' && statusRef.current !== 'thinking' && !isMutedRef.current) {
        recognitionRef.current.start();
      }
    } catch (e) {
      // recognition already active
    }
  };

  const speakText = (text: string) => {
    // Stop recognition during speaking to avoid self-echoing
    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    } catch (e) {}

    setStatus('speaking');
    const cleanText = text.replace(/[*#`_\-|[\]()]/g, ''); // strip markdown formatting

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    synthesisUtteranceRef.current = utterance;

    // Handle interrupt or end
    utterance.onend = () => {
      setStatus('listening');
      setTimeout(() => {
        if (!isMutedRef.current && isOpenRef.current && statusRef.current === 'listening') {
          startListeningSafe();
        }
      }, 600); // 600ms delay to let speaker audio clear
    };

    utterance.onerror = (e) => {
      // 'canceled' and 'interrupted' fire naturally during cleanup — safely ignore them
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      console.error("Speech synthesis error", e);
      setStatus('listening');
      setTimeout(() => {
        if (!isMutedRef.current && isOpenRef.current && statusRef.current === 'listening') {
          startListeningSafe();
        }
      }, 600);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleInterrupt = () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setStatus('listening');
      startListeningSafe();
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    isMutedRef.current = nextMute;
    if (nextMute) {
      setStatus('listening');
      try {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      } catch (e) {}
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    } else {
      startListeningSafe();
    }
  };

  const cleanupAudioContext = () => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    } catch (e) {}
    window.speechSynthesis.cancel();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const handleEndCall = () => {
    cleanupAudioContext();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 15, 20, 0.85)',
      backdropFilter: 'blur(16px)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'fadeIn 0.25s ease',
    }}>
      {/* Wave Blob / Pulse Animation */}
      <div style={{
        position: 'relative',
        width: 260,
        height: 260,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.2) 0%, rgba(0,0,0,0) 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '2rem',
      }}>
        {/* Pulsing Outer Rings */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '1px solid rgba(124, 58, 237, 0.4)',
          animation: status === 'speaking' ? 'pulseGlow 2s infinite ease-in-out' : 'pulseGlow 4s infinite ease-in-out',
        }} />
        <div style={{
          position: 'absolute',
          inset: 30,
          borderRadius: '50%',
          border: '1px solid rgba(236, 72, 153, 0.25)',
          animation: status === 'listening' ? 'pulseGlow 1.5s 0.5s infinite ease-in-out' : 'pulseGlow 3s 0.5s infinite ease-in-out',
        }} />

        {/* Central Core */}
        <div 
          onClick={handleInterrupt}
          style={{
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 40px rgba(124, 58, 237, 0.6)',
            cursor: status === 'speaking' ? 'pointer' : 'default',
            transition: 'transform 0.3s ease',
          }}
          className="hover:scale-105"
          title={status === 'speaking' ? "Click to interrupt AI speaking" : undefined}
        >
          {isMuted ? (
            <MicOff size={45} color="#fff" style={{ opacity: 0.8 }} />
          ) : (
            <Mic size={45} color="#fff" className={status === 'listening' ? 'animate-bounce' : ''} />
          )}
        </div>
      </div>

      {/* Visualizer Canvas */}
      <canvas 
        ref={canvasRef} 
        width={400} 
        height={80} 
        style={{ width: '400px', height: '80px', marginBottom: '2rem' }}
      />

      {/* Spoken Feedback & Subtitles */}
      <div style={{
        maxWidth: '500px',
        textAlign: 'center',
        padding: '0 1.5rem',
        marginBottom: '3rem',
        minHeight: '80px',
      }}>
        {/* Status text */}
        <div style={{
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: 'var(--accent)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: '0.75rem',
        }}>
          {status === 'connecting' && "Connecting to Antigravity…"}
          {status === 'listening' && "Listening…"}
          {status === 'thinking' && "Analyzing response…"}
          {status === 'speaking' && "Antigravity speaking"}
        </div>

        {/* Dynamic Speech Texts */}
        {status === 'listening' && transcript && (
          <p style={{ fontSize: '1rem', color: 'var(--text-primary)', fontStyle: 'italic', opacity: 0.9 }}>
            &ldquo;{transcript}&rdquo;
          </p>
        )}
        {status === 'speaking' && aiText && (
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {aiText.length > 150 ? aiText.substring(0, 150) + "..." : aiText}
          </p>
        )}
        {status === 'thinking' && (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', height: '24px' }}>
            <span className="dot" style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', animation: 'bounceDot 0.6s 0s infinite alternate' }} />
            <span className="dot" style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', animation: 'bounceDot 0.6s 0.2s infinite alternate' }} />
            <span className="dot" style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', animation: 'bounceDot 0.6s 0.4s infinite alternate' }} />
          </div>
        )}
      </div>

      {/* Control Buttons Bar */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        {/* Mute button */}
        <button
          onClick={toggleMute}
          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: isMuted ? 'var(--danger-subtle)' : 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            color: isMuted ? 'var(--danger)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        {/* End call button */}
        <button
          onClick={handleEndCall}
          title="End Assistant Call"
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--danger)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)',
            transition: 'transform 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <PhoneOff size={28} />
        </button>

        {/* Volume feedback indicator */}
        <button
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'default',
          }}
        >
          {status === 'speaking' ? <Volume2 size={22} className="animate-pulse" /> : <VolumeX size={22} />}
        </button>
      </div>

      {/* CSS Styles injection for key animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulseGlow {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.6; box-shadow: 0 0 20px rgba(124, 58, 237, 0.2); }
          100% { transform: scale(1); opacity: 0.3; }
        }
        @keyframes bounceDot {
          from { transform: translateY(0); }
          to { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
