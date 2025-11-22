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
  const [silenceLeft, setSilenceLeft] = useState(5); // 5 seconds until auto-submit

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

      // measure speech length for silence detection
      const spokenLength = currentTranscriptRef.current.trim().length + interim.trim().length;
      if (spokenLength > 2) {
        setSilenceLeft(5); // reset silence countdown if speaking
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

  // ---------------------- RECORDING FUNCTIONS ----------------------
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
    setRecording(false);
    stop_listening();
    window.speechSynthesis.cancel();

    // Stop all media tracks immediately
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

            navigate("/ReviewPage", { state: { interviewId } });
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
      try {
        recognitionRef.current.stop();
      } catch {}
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
          submit_answer(true); // true = send "no response" if empty
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(silenceInterval);
  }, [recording, isListening]);

  const submit_answer = async (sendNoResponse = false) => {
    let finalText = currentTranscriptRef.current.trim();
    if (!finalText && sendNoResponse) finalText = "no response";

    stop_listening();
    setIsProcessing(true);

    try {
      if (finalText) {
        const questionAsked = currentQuestionRef.current;
        await updateQuestions(questionAsked, finalText);

        const aiRes = await axios.post("http://localhost:5000/ai-aspect", {
          interview_id: interviewId,
          answer: finalText,
          question_index: nextIndexRef.current,
        });

        currentTranscriptRef.current = "";
        setTranscriptDisplay("");

        if (aiRes.data.finished) {
          setAiQuestion("Interview finished.");
          await stop_recording();
          return;
        }

        const nextQ = aiRes.data.question;
        setAiQuestion(nextQ);
        currentQuestionRef.current = nextQ;
        nextIndexRef.current = aiRes.data.next_index;

        setIsProcessing(false);
        speakQuestion(nextQ);
      } else {
        setIsProcessing(false);
      }
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
    utter.onend = () => {
      // start recording automatically after speech finishes
      start_recording();
    };
    window.speechSynthesis.speak(utter);
  };

  // ---------------------- PATCH ANSWER TO BACKEND ----------------------
  const updateQuestions = async (question, answer) => {
    if (!interviewId) return;

    try {
      const res = await axios.patch(
        "http://localhost:5000/update-interview-questions",
        { interview_id: interviewId, question, answer }
      );

      if (res.status === 200) console.log("Questions updated successfully");
    } catch (err) {
      console.error("Error updating questions:", err);
    }
  };

  // ---------------------- TIME FORMAT ----------------------
  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

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
        {/* LEFT PANEL */}
        <section className={styles.leftPanel}>
          <div className={styles.aiBubble}>
            <div className={styles.aiAvatar}>🤖</div>
            <div className={styles.aiContent}>
              <span className={styles.speakerLabel}>AI Interviewer</span>
              <p className={styles.aiText}>
                {isProcessing ? (
                  <span className={styles.typing}>Evaluating answer...</span>
                ) : (
                  aiQuestion
                )}
              </p>
            </div>
          </div>

          <div
            className={`${styles.transcriptBox} ${
              isListening ? styles.activeBorder : ""
            }`}
          >
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

        {/* RIGHT PANEL */}
        <section className={styles.rightPanel}>
          <div className={styles.videoWrapper}>
            <video ref={videoRef} className={styles.videoFeed} muted playsInline />
          </div>

          <div className={styles.controls}>
            {!recording ? (
              <button
                className={styles.btnStart}
                onClick={async () => {
                  // Initialize AI interview and play first question
                  const initRes = await axios.post("http://localhost:5000/ai-aspect-init", {
                    interview_id: interviewId,
                  });
                  const firstQ =
                    initRes.data.questions?.[0]?.question || "Tell me about yourself.";
                  setAiQuestion(firstQ);
                  currentQuestionRef.current = firstQ;
                  nextIndexRef.current = initRes.data.next_index || 1;

                  speakQuestion(firstQ);
                }}
              >
                Start Interview
              </button>
            ) : (
              <div className={styles.actionButtons}>
                <button className={styles.btnTerminate} onClick={stop_recording}>
                  Finish Interview
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
