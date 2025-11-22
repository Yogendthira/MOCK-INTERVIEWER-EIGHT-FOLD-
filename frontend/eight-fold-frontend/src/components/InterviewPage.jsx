import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import styles from "./InterviewPage.module.css";

export default function InterviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const interviewId = location.state?.interviewId;

  // -----------------------------------------------------
  // STATE
  // -----------------------------------------------------
  const [aiQuestion, setAiQuestion] = useState("Press Start to begin...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [transcriptDisplay, setTranscriptDisplay] = useState("");

  // -----------------------------------------------------
  // REFS
  // -----------------------------------------------------
  const recognitionRef = useRef(null);
  const shouldBeListeningRef = useRef(false);

  const currentTranscriptRef = useRef("");
  const currentQuestionRef = useRef("");
  const nextIndexRef = useRef(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);

  // -----------------------------------------------------
  // TIMER
  // -----------------------------------------------------
  useEffect(() => {
    if (!recording) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          finishInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [recording]);

  // -----------------------------------------------------
  // SPEECH RECOGNITION
  // -----------------------------------------------------
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

        if (event.results[i].isFinal) {
          final += text + " ";
        } else {
          interim += text;
        }
      }

      if (final) {
        currentTranscriptRef.current += final;
      }

      setTranscriptDisplay(currentTranscriptRef.current + interim);
    };

    recognition.onerror = (e) => {
      console.warn("SpeechRecognition error:", e.error);
      setIsListening(false);
    };

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

  const startListening = () => {
    if (!recognitionRef.current)
      recognitionRef.current = initSpeechRecognition();

    if (!recognitionRef.current) return;

    shouldBeListeningRef.current = true;
    currentTranscriptRef.current = "";
    setTranscriptDisplay("");

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {}
  };

  const stopListening = () => {
    shouldBeListeningRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    setTranscriptDisplay(currentTranscriptRef.current);
    setIsListening(false);
  };

  // -----------------------------------------------------
  // TEXT TO SPEECH
  // -----------------------------------------------------
  const speakQuestion = (text) => {
    if (!text) return;

    stopListening();
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);

    // Do NOT auto-resume listening
    utter.onend = () => {};

    window.speechSynthesis.speak(utter);
  };

  // -----------------------------------------------------
  // SUBMIT ANSWER
  // -----------------------------------------------------
  const handleSubmitAnswer = async () => {
    const finalText = currentTranscriptRef.current.trim();

    if (!finalText) {
      alert("Please speak before submitting.");
      return;
    }

    stopListening();
    setIsProcessing(true);

    try {
      const questionAsked = currentQuestionRef.current;

      const updatePromise = axios.patch(
        "http://localhost:5000/update-interview-questions",
        {
          interview_id: interviewId,
          questions: [[questionAsked, finalText, ""]],
        }
      );

      const aiPromise = axios.post("http://localhost:5000/ai-aspect", {
        interview_id: interviewId,
        answer: finalText,
        question_index: nextIndexRef.current,
      });

      const [, aiRes] = await Promise.all([updatePromise, aiPromise]);

      currentTranscriptRef.current = "";
      setTranscriptDisplay("");

      if (aiRes.data.finished) {
        setAiQuestion("Interview finished. Thank you.");
        finishInterview();
        return;
      }

      const nextQ = aiRes.data.question;
      setAiQuestion(nextQ);
      currentQuestionRef.current = nextQ;
      nextIndexRef.current = aiRes.data.next_index;

      setIsProcessing(false);
      speakQuestion(nextQ);
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
    }
  };

  // -----------------------------------------------------
  // START INTERVIEW
  // -----------------------------------------------------
  const startInterview = async () => {
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

      const initRes = await axios.post(
        "http://localhost:5000/ai-aspect-init",
        { interview_id: interviewId }
      );

      const firstQ =
        initRes.data.questions?.[0]?.question || "Tell me about yourself.";

      setAiQuestion(firstQ);
      currentQuestionRef.current = firstQ;
      nextIndexRef.current = initRes.data.next_index || 1;

      speakQuestion(firstQ);
    } catch (err) {
      console.error(err);
      alert("Unable to access camera/mic");
      setRecording(false);
    }
  };

  // -----------------------------------------------------
  // FINISH INTERVIEW
  // -----------------------------------------------------
  const finishInterview = useCallback(async () => {
    setRecording(false);
    stopListening();
    window.speechSynthesis.cancel();

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();

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

          alert("Interview saved!");
          navigate("/dashboard");
        } catch (e) {
          console.error(e);
        }
      };
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [interviewId, navigate]);

  // -----------------------------------------------------
  // UI + LAYOUT
  // -----------------------------------------------------
  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <h2>Technical Interview</h2>
        <div className={styles.timerBadge}>⏱ {formatTime(timeLeft)}</div>
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

              {isListening && (
                <span className={styles.listeningBadge}>🎙 Listening...</span>
              )}
            </div>

            <div className={styles.transcriptText}>
              {transcriptDisplay ? (
                transcriptDisplay
              ) : (
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
            <video
              ref={videoRef}
              className={styles.videoFeed}
              muted
              playsInline
            />
          </div>

          <div className={styles.controls}>
            {!recording ? (
              <button className={styles.btnStart} onClick={startInterview}>
                Start Interview
              </button>
            ) : (
              <div className={styles.actionButtons}>
                {/* Start Recording */}
                <button className={styles.btnStart} onClick={startListening}>
                  🎙 Start Recording
                </button>

                {/* Stop Recording */}
                <button className={styles.btnTerminate} onClick={stopListening}>
                  🛑 Stop Recording
                </button>

                {/* Submit Answer */}
                <button
                  className={styles.btnSubmit}
                  onClick={handleSubmitAnswer}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Submit Answer"}
                </button>

                {/* Finish Interview */}
                <button
                  className={styles.btnTerminate}
                  onClick={finishInterview}
                >
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
