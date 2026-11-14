'use client';

import { useState, useRef, useEffect } from 'react';
import type { AxiosError } from 'axios';
import { Send, Loader2, Sparkles, X, Mic, MicOff, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '@/config/axios';
import { toast } from 'sonner';
import { cn } from '@/config/utils';
import { AGENT_STATE_META, type AgentSessionState } from '@/config/state-machines';
import { Badge } from '@/components/ui/badge';

type SpeechRecognitionErrorEventLike = {
    error: string;
};

type SpeechRecognitionAlternativeLike = {
    transcript: string;
};

type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike>;

type SpeechRecognitionEventLike = {
    results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    start: () => void;
    stop: () => void;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructorLike;
        webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    }
}

export function FloatingAgentInput() {
    const [prompt, setPrompt] = useState('');
    const [agentState, setAgentState] = useState<AgentSessionState>('idle');
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [isOpen, setIsOpen] = useState(true);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

    const isLoading = agentState === 'processing';
    const isListening = agentState === 'listening';

    useEffect(() => {
        return () => {
            if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };
    }, []);

    const handleSubmit = async (e?: React.FormEvent, overridePrompt?: string) => {
        if (e) e.preventDefault();
        const activePrompt = overridePrompt ?? prompt;

        if (!activePrompt.trim() || agentState === 'processing') {
            return;
        }

        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        setAgentState('processing');
        setStatusMessage('');

        try {
            const response = await api.post('/campaigns/ai/agent/contacts/', { prompt: activePrompt });
            const msg = response.data.message || 'Action completed successfully';
            toast.success(msg);
            setPrompt('');
            setAgentState('success');
            setStatusMessage(msg);
            window.dispatchEvent(new CustomEvent('agent-action-completed', { detail: response.data }));
            resetTimerRef.current = setTimeout(() => {
                setAgentState('idle');
                setStatusMessage('');
            }, 3000);
        } catch (error: unknown) {
            const axiosError = error as AxiosError<{ error?: string }>;
            const errMsg = axiosError.response?.data?.error || 'Something went wrong with the agent';
            toast.error(errMsg);
            setAgentState('error');
            setStatusMessage(errMsg);
            resetTimerRef.current = setTimeout(() => {
                setAgentState('idle');
                setStatusMessage('');
            }, 4000);
        }
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    const startListening = () => {
        if (!window.webkitSpeechRecognition && !window.SpeechRecognition) {
            toast.error('Speech recognition is not supported in this browser.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error('Speech recognition is not supported in this browser.');
            return;
        }

        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setAgentState('listening');
            toast.info('Listening...');
        };

        recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
            setAgentState((prev) => (prev === 'listening' ? 'idle' : prev));
            if (event.error !== 'no-speech') {
                toast.error(`Speech error: ${event.error}`);
            }
        };

        recognition.onend = () => {
            setAgentState((prev) => (prev === 'listening' ? 'idle' : prev));
        };

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
            let fullTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
                fullTranscript += event.results[i][0].transcript;
            }

            if (fullTranscript) {
                setPrompt(fullTranscript);

                // Clear existing timer
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                }

                // Set new timer for 5 seconds of silence
                silenceTimerRef.current = setTimeout(() => {
                    stopListening();
                    if (fullTranscript.trim()) {
                        handleSubmit(undefined, fullTranscript);
                    }
                }, 5000);
            }
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
        } catch (err) {
            console.error('Failed to start recognition:', err);
            toast.error('Could not start microphone. Please check permissions.');
            setAgentState('idle');
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
        }
        setAgentState((prev) => (prev === 'listening' ? 'idle' : prev));
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (recognitionRef.current) recognitionRef.current.stop();
        };
    }, []);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
            className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-600 text-white shadow-xl transition-all duration-300 hover:scale-110 hover:shadow-primary/30 group cursor-pointer lg:bottom-6 lg:right-6"
                title="Open AI Agent"
                aria-label="Open AI Agent"
            >
                <Sparkles className="h-6 w-6 group-hover:rotate-12 transition-transform" aria-hidden="true" />
            </button>
        );
    }

    return (
        <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-40 w-full max-w-xl -translate-x-1/2 px-4 lg:bottom-6">
            <div className={cn(
                "relative group rounded-2xl border border-border/50 bg-background/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-2xl p-1.5 transition-all duration-300",
                "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-primary/10"
            )}>
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 text-white shrink-0">
                        <Sparkles className={cn("h-5 w-5", isLoading && "animate-pulse")} />
                    </div>

                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Ask AI agent to manage contacts... (e.g. 'Add john@gmail.com to vip list')"
                        aria-label="AI agent prompt"
                        className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground/70 py-3 pr-2"
                        disabled={isLoading}
                    />

                    <div className="flex items-center gap-1 pr-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                toggleListening();
                            }}
                            disabled={isLoading}
                            className={cn(
                                "h-9 w-9 flex items-center justify-center rounded-xl transition-all cursor-pointer relative z-10",
                                isListening
                                    ? "bg-red-500 text-white animate-pulse shadow-lg"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                            title={isListening ? "Stop listening" : "Start voice input"}
                            aria-label={isListening ? "Stop listening" : "Start voice input"}
                            aria-pressed={isListening}
                        >
                            {isListening ? (
                                <MicOff className="h-4 w-4" />
                            ) : (
                                <Mic className="h-4 w-4" />
                            )}
                        </button>

                        <button
                            type="submit"
                            disabled={isLoading || !prompt.trim()}
                            className={cn(
                                "h-9 w-9 flex items-center justify-center rounded-xl transition-all cursor-pointer",
                                prompt.trim() ? "bg-primary text-primary-foreground shadow-lg hover:opacity-90" : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                            )}
                            aria-label="Send prompt"
                        >
                            {isLoading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-white/10 text-muted-foreground/50 hover:text-foreground transition-all cursor-pointer"
                            aria-label="Close AI Agent"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </form>

                {/* Subtle glow effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-purple-500/20 to-indigo-500/20 rounded-3xl blur-lg opacity-0 group-focus-within:opacity-100 transition duration-500 -z-10"></div>
            </div>
            
            {/* Agent state indicator & hint */}
            <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {agentState !== 'idle' ? (
                    <Badge variant={AGENT_STATE_META[agentState].variant} className="gap-1.5 shadow-sm">
                        {agentState === 'success' && <CheckCircle2 className="h-3 w-3" />}
                        {agentState === 'error' && <AlertCircle className="h-3 w-3" />}
                        {agentState === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
                        <span>{statusMessage || AGENT_STATE_META[agentState].label}</span>
                    </Badge>
                ) : (
                    <span className="text-muted-foreground/70">
                        Press Enter to send • Voice input supported • Supports contacts &amp; lists
                    </span>
                )}
            </div>
        </div>
    );
}
