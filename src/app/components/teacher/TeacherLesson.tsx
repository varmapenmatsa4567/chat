"use client";

// The lesson player: holds step/playback state, runs TTS narration, and wires
// up the transport controls. Playback is session-token-guarded so pause, next,
// prev, restart, mute, or unmount can never race with an in-flight speech.

import { useEffect, useRef, useState } from "react";
import TeacherStep from "./TeacherStep";
import TeacherControls from "./TeacherControls";
import type { TeacherLesson as TeacherLessonData } from "../../../lib/teacher";

// Speak a string and resolve when speech finishes (or errors/cancels). Never
// rejects — callers treat it as "done narrating".
function speak(text: string, isSpeaking: (v: boolean) => void): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const pick =
      voices.find((v) => /^en[-_]/i.test(v.lang) && /google us english|samantha|natural/i.test(v.name)) ??
      voices.find((v) => /^en/i.test(v.lang));
    if (pick) u.voice = pick;
    u.rate = 1;
    u.pitch = 1;
    u.onstart = () => isSpeaking(true);
    const done = () => {
      isSpeaking(false);
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  });
}

export default function TeacherLesson({
  lesson,
}: {
  lesson: TeacherLessonData;
}) {
  const steps = lesson.steps;
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Refs mirror state so async loops never read stale closures.
  const sessionRef = useRef(0); // bumped to invalidate any running session
  const pausedRef = useRef(false); // a session is suspended via speech pause
  const stepRef = useRef(0);
  const mutedRef = useRef(false);
  const mountedRef = useRef(true);

  const cancelSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  // Stop everything: cancel speech and invalidate the active session.
  const stopAll = () => {
    sessionRef.current += 1;
    pausedRef.current = false;
    cancelSpeech();
    setIsPlaying(false);
  };

  const runSession = async (from: number) => {
    const session = ++sessionRef.current;
    pausedRef.current = false;
    setIsPlaying(true);
    for (let i = from; i < steps.length; i++) {
      if (sessionRef.current !== session) return; // cancelled (next/prev/restart/unmount)
      stepRef.current = i;
      setStep(i);
      if (!mutedRef.current) {
        await speak(steps[i].narration, (v) => {
          if (sessionRef.current === session) setIsSpeaking(v);
        });
      }
      if (sessionRef.current !== session) return;
    }
    if (sessionRef.current === session) {
      pausedRef.current = false;
      setIsPlaying(false);
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      // Pause: suspend audio but keep the current SVG visible.
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.pause();
      }
      pausedRef.current = true;
      setIsPlaying(false);
      return;
    }
    if (pausedRef.current) {
      // Resume the suspended narration (same step, don't restart).
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.resume();
      }
      pausedRef.current = false;
      setIsPlaying(true);
      return;
    }
    // Fresh play from the current step (default = autoplay/teacher mode).
    void runSession(stepRef.current);
  };

  const goNext = () => {
    stopAll();
    const next = Math.min(stepRef.current + 1, steps.length - 1);
    stepRef.current = next;
    setStep(next);
  };

  const goPrev = () => {
    stopAll();
    const prev = Math.max(stepRef.current - 1, 0);
    stepRef.current = prev;
    setStep(prev);
  };

  const restart = () => {
    stopAll();
    stepRef.current = 0;
    setStep(0);
    void runSession(0);
  };

  const toggleMute = () => {
    mutedRef.current = !mutedRef.current;
    setIsMuted(mutedRef.current);
    if (mutedRef.current) {
      // Stop the current narration immediately.
      sessionRef.current += 1;
      pausedRef.current = false;
      cancelSpeech();
      setIsPlaying(false);
    }
  };

  // Rehear just this step (cancels any running autoplay).
  const hearStep = () => {
    stopAll();
    if (mutedRef.current) return;
    const s = sessionRef.current; // capture a fresh session for this speak
    void speak(steps[stepRef.current].narration, (v) => {
      if (sessionRef.current === s) setIsSpeaking(v);
    });
  };

  // Cleanup on unmount: cancel speech and invalidate any running session.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = steps[stepRef.current] ?? steps[0];

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/60 overflow-hidden mt-2 max-w-full">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
            👨‍🏫 {lesson.title}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{current.title}</p>
        </div>
      </div>

      <div className="px-3 sm:px-4 pt-2">
        <TeacherStep step={current} onHear={hearStep} isSpeaking={isSpeaking} />
      </div>

      <div className="px-3 sm:px-4 pt-3 pb-4">
        <TeacherControls
          current={stepRef.current}
          total={steps.length}
          isPlaying={isPlaying}
          isMuted={isMuted}
          onPlayPause={handlePlayPause}
          onPrev={goPrev}
          onNext={goNext}
          onRestart={restart}
          onToggleMute={toggleMute}
        />
      </div>
    </div>
  );
}
