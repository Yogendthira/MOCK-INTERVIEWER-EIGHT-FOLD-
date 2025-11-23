import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import styles from "./InterviewPage.module.css";

export default function InterviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const interviewId = location.state?.interviewId;

  // ---------------------- STATE ----------------------
  const [aiQuestion, setAiQuestion] = useState("Press Start to begin...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [transcriptDisplay, setTranscriptDisplay] = useState("");
  const [silenceLeft, setSilenceLeft] = useState(5);

  // ---------------------- REFS ----------------------
  const recognitionRef = useRef(null);
  const shouldBeListeningRef = useRef(false);
  const currentTranscriptRef = useRef("");
  const currentQuestionRef = useRef("");
  const nextIndexRef = useRef(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);

  const wsRef = useRef(null);

  // ---------------------- TIMER ----------------------
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stop_recording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [recording]);

  // ---------------------- SPEECH RECOGNITION ----------------------
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Browser does not support Speech Recognition. Use Chrome.");
      return null;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += text + " ";
        else interim += text;
      }

      if (final) currentTranscriptRef.current += final;
      setTranscriptDisplay(currentTranscriptRef.current + interim);

      if ((currentTranscriptRef.current + interim).trim().length > 2) {
        setSilenceLeft(5);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => {
      setIsListening(false);
      if (shouldBeListeningRef.current) {
        try {
          recognition.start();
          setIsListening(true);
        } catch {}
      }
    };
    return recognition;
  }, []);

  // ---------------------- RECORDING ----------------------
  const start_recording = async () => {
    try {
      setRecording(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      const recorder = new MediaRecorder(stream);
      videoChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      start_listening();
    } catch (err) {
      alert("Unable to access camera/mic");
      setRecording(false);
    }
  };

  const stop_recording = async () => {
    if (!recording) return;
    setRecording(false);
    stop_listening();
    window.speechSynthesis.cancel();

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (mediaRecorderRef.current) {
      return new Promise((resolve) => {
        mediaRecorderRef.current.onstop = async () => {
          const blob = new Blob(videoChunksRef.current, { type: "video/webm" });
          const file = new File([blob], "interview.webm", { type: "video/webm" });

          const formData = new FormData();
          formData.append("interview_id", interviewId);
          formData.append("video", file);

          try {
            await axios.post("http://localhost:5000/store-video", formData);
            await axios.post("http://localhost:5000/generate-summary", {
              interview_id: interviewId,
            });
            navigate(`/ReviewPage`, { state: { interviewId } });
          } catch (e) {
            console.error(e);
          }
          resolve();
        };
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      });
    }
  };

  const start_listening = () => {
    if (!recognitionRef.current) recognitionRef.current = initSpeechRecognition();
    shouldBeListeningRef.current = true;
    currentTranscriptRef.current = "";
    setTranscriptDisplay("");
    setSilenceLeft(5);

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {}
  };

  const stop_listening = () => {
    shouldBeListeningRef.current = false;
    setSilenceLeft(5);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setTranscriptDisplay(currentTranscriptRef.current);
    setIsListening(false);
  };

  // ---------------------- AUTO SUBMIT ON SILENCE ----------------------
  useEffect(() => {
    if (!recording || !isListening) return;
    const silenceInterval = setInterval(() => {
      setSilenceLeft((prev) => {
        if (prev <= 1) {
          submit_answer(true);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(silenceInterval);
  }, [recording, isListening]);

  // ---------------------- SUBMIT ANSWER ----------------------
  const submit_answer = async (sendNoResponse = false) => {
    let finalText = currentTranscriptRef.current.trim();
    if (!finalText && sendNoResponse) finalText = "no response";

    stop_listening();
    setIsProcessing(true);

    try {
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        wsRef.current = new WebSocket("ws://localhost:8000/ws/ai-aspect");
        wsRef.current.onopen = () => {
          wsRef.current.send(
            JSON.stringify({
              interview_id: interviewId,
              answer: finalText,
              question_index: nextIndexRef.current,
            })
          );
        };
        wsRef.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === "chunk") {
            setTranscriptDisplay((prev) => prev + data.data);
          } else if (data.type === "end") {
            const nextQ = data.question;
            setAiQuestion(nextQ);
            currentQuestionRef.current = nextQ;
            nextIndexRef.current = data.next_index;
            setIsProcessing(false);

            if (data.finished) {
              setAiQuestion("Interview finished.");
              stop_recording();
            } else {
              speakQuestion(nextQ);
            }
          }
        };
      } else if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            interview_id: interviewId,
            answer: finalText,
            question_index: nextIndexRef.current,
          })
        );
      }

      await axios.patch("http://localhost:5000/update-interview-questions", {
        interview_id: interviewId,
        question: currentQuestionRef.current,
        answer: finalText,
      });

      currentTranscriptRef.current = "";
      setTranscriptDisplay("");
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
    }
  };

  // ---------------------- TEXT TO SPEECH ----------------------
  const speakQuestion = (text) => {
    if (!text) return;
    stop_listening();
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.onend = () => { start_recording(); };
    window.speechSynthesis.speak(utter);
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // ---------------------- RENDER ----------------------
  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <h2>Technical Interview</h2>
        <div className={styles.timerBadge}>⏱ {formatTime(timeLeft)}</div>
        {recording && isListening && (
          <div className={styles.silenceBadge}>
            Silence countdown: {silenceLeft}s
          </div>
        )}
      </header>

      <main className={styles.mainContent}>
        <section className={styles.leftPanel}>
          <div className={styles.aiBubble}>
            <div className={styles.aiAvatar}>🤖</div>
            <div className={styles.aiContent}>
              <span className={styles.speakerLabel}>AI Interviewer</span>
              <p className={styles.aiText}>
                {isProcessing ? "Evaluating answer..." : aiQuestion}
              </p>
            </div>
          </div>

          <div className={`${styles.transcriptBox} ${isListening ? styles.activeBorder : ""}`}>
            <div className={styles.transcriptHeader}>
              <h4>Your Transcript</h4>
              {isListening && <span className={styles.listeningBadge}>🎙 Listening...</span>}
            </div>
            <div className={styles.transcriptText}>
              {transcriptDisplay || (
                <span className={styles.placeholder}>
                  Press Start Recording and begin speaking...
                </span>
              )}
            </div>
          </div>
        </section>

        <section className={styles.rightPanel}>
          <div className={styles.videoWrapper}>
            <video ref={videoRef} className={styles.videoFeed} muted playsInline />
          </div>

          <div className={styles.controls}>
            <button
              className={recording ? styles.btnTerminate : styles.btnStart}
              onClick={async () => {
                if (!recording) {
                  const initRes = await axios.post("http://localhost:8000/ai-aspect-init", {
                    interview_id: interviewId,
                  });
                  const firstQ = initRes.data.questions?.[0]?.question || "Tell me about yourself.";
                  setAiQuestion(firstQ);
                  currentQuestionRef.current = firstQ;
                  nextIndexRef.current = initRes.data.next_index || 1;

                  speakQuestion(firstQ);
                  start_recording();
                } else {
                  await stop_recording();
                }
              }}
            >
              {recording ? "Stop Interview" : "Start Interview"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
