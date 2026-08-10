"use client";

// The lesson player: holds step/playback state, runs TTS narration, and wires
// up the transport controls. Playback is session-token-guarded so pause, next,
// prev, restart, mute, or unmount can never race with an in-flight speech.
//
// Streaming: `lesson` grows as the agent emits steps, so steps are read through
// a ref. During playback the loop waits for a step that hasn't arrived yet, so
// step 1 can render/speak while later steps are still being generated. The
// `complete` prop signals that no more steps are coming.

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function TeacherLesson({
  lesson,
  complete = true,
}: {
  lesson: TeacherLessonData;
  complete?: boolean;
}) {
  const steps = lesson.steps;
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Refs mirror state so async loops never read stale closures.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const completeRef = useRef(complete);
  completeRef.current = complete;
  const sessionRef = useRef(0); // bumped to invalidate any running session
  const pausedRef = useRef(false); // a session is suspended via speech pause
  const stepRef = useRef(0);
  const mutedRef = useRef(false);

  const cancelSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const stopAll = () => {
    sessionRef.current += 1;
    pausedRef.current = false;
    cancelSpeech();
    setIsPlaying(false);
  };

  // Wait (bounded) until step i exists. Returns false if it never does.
  const waitForStep = async (i: number, session: number): Promise<boolean> => {
    let tries = 0;
    while (i >= stepsRef.current.length) {
      if (sessionRef.current !== session) return false;
      if (completeRef.current && i >= stepsRef.current.length) return false;
      if (++tries > 60) return false; // ~9s safety net
      await sleep(150);
      if (sessionRef.current !== session) return false;
    }
    return true;
  };

  const runSession = async (from: number) => {
    const session = ++sessionRef.current;
    pausedRef.current = false;
    setIsPlaying(true);
    // Optional spoken introduction before step 1.
    if (from === 0 && lesson.introduction && !mutedRef.current) {
      await speak(lesson.introduction, (v) => {
        if (sessionRef.current === session) setIsSpeaking(v);
      });
      if (sessionRef.current !== session) return;
    }
    for (let i = from; i < stepsRef.current.length || !completeRef.current; i++) {
      if (sessionRef.current !== session) return;
      if (!(await waitForStep(i, session))) {
        // No step i (and none coming) → stop cleanly.
        break;
      }
      if (sessionRef.current !== session) return;
      stepRef.current = i;
      setStep(i);
      if (!mutedRef.current) {
        await speak(stepsRef.current[i].narration, (v) => {
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
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.pause();
      }
      pausedRef.current = true;
      setIsPlaying(false);
      return;
    }
    if (pausedRef.current) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.resume();
      }
      pausedRef.current = false;
      setIsPlaying(true);
      return;
    }
    void runSession(stepRef.current);
  };

  const goNext = () => {
    stopAll();
    const next = Math.min(stepRef.current + 1, stepsRef.current.length - 1);
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
      sessionRef.current += 1;
      pausedRef.current = false;
      cancelSpeech();
      setIsPlaying(false);
    }
  };

  const hearStep = () => {
    stopAll();
    if (mutedRef.current) return;
    const s = sessionRef.current;
    void speak(stepsRef.current[stepRef.current]?.narration ?? "", (v) => {
      if (sessionRef.current === s) setIsSpeaking(v);
    });
  };

  useEffect(() => {
    return () => {
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = stepsRef.current[stepRef.current] ?? stepsRef.current[0];

  return (
    <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/60 overflow-hidden mt-2 max-w-full">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
            👨‍🏫 {lesson.title}
          </p>
          {current && (
            <p className="text-xs text-zinc-500 mt-0.5">{current.title}</p>
          )}
        </div>
      </div>

      <div className="px-3 sm:px-4 pt-2">
        {current ? (
          <TeacherStep
            step={current}
            onHear={hearStep}
            isSpeaking={isSpeaking}
          />
        ) : (
          <div className="flex items-center justify-center h-40 text-xs text-zinc-400 animate-pulse">
            Preparing first step…
          </div>
        )}
      </div>

      <div className="px-3 sm:px-4 pt-3 pb-4">
        <TeacherControls
          current={stepRef.current}
          total={stepsRef.current.length}
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
