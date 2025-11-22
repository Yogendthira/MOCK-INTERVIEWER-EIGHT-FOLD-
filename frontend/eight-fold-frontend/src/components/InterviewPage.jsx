import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './InterviewPage.module.css';

export default function InterviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const interviewId = location.state?.interviewId;

  // --- State ---
  const [aiQuestion, setAiQuestion] = useState('Press Start to begin...');
  const [isProcessing, setIsProcessing] = useState(false); 
  const [recording, setRecording] = useState(false); // Master switch for the interview session
  const [isListening, setIsListening] = useState(false); // Status of the microphone specifically
  const [timeLeft, setTimeLeft] = useState(900); 
  const [transcriptDisplay, setTranscriptDisplay] = useState(''); 
  
  // --- Refs ---
  const recognitionRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Data Refs (to access inside closures)
  const currentTranscriptRef = useRef(''); 
  const currentQuestionRef = useRef('');
  const nextIndexRef = useRef(0);
  const shouldBeListeningRef = useRef(false); // Helps prevent auto-stop

  // --- 1. Timer ---
  useEffect(() => {
    let interval = null;
    if (recording && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            finishInterview();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recording, timeLeft]);

  // --- 2. Speech Recognition Engine ---
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition. Please use Chrome.");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // IMPORTANT: Allows speaking for long periods
    recognition.interimResults = true; // Shows text while speaking
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += transcript + ' ';
        } else {
          interim += transcript;
        }
      }

      if (finalChunk) {
        currentTranscriptRef.current += finalChunk;
      }
      setTranscriptDisplay(currentTranscriptRef.current + interim);
    };

    recognition.onerror = (event) => {
      console.error("Speech Error:", event.error);
      setIsListening(false);
    };

    // CRITICAL FIX: If it stops unexpectedly, restart it immediately if we should be listening
    recognition.onend = () => {
      setIsListening(false);
      if (shouldBeListeningRef.current) {
        console.log("Restarting recognition...");
        try {
          recognition.start();
          setIsListening(true);
        } catch (e) {
          console.error("Restart failed:", e);
        }
      }
    };

    return recognition;
  }, []);

  const startListening = () => {
    if (!recognitionRef.current) recognitionRef.current = initSpeechRecognition();
    
    shouldBeListeningRef.current = true;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      // Sometimes it throws if already started, just ignore
      console.log("Already started or error:", e);
    }
  };

  const stopListening = () => {
    shouldBeListeningRef.current = false;
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
  };

  // --- 3. Text to Speech ---
  const speakQuestion = (text) => {
    if (!text) return;
    
    // Stop listening while AI speaks (so AI doesn't hear itself)
    stopListening();
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onend = () => {
      // Resume listening automatically after AI finishes
      if (recording) startListening();
    };
    
    window.speechSynthesis.speak(utterance);
  };

  // --- 4. Submit Button Logic ---
  const handleSubmitAnswer = async () => {
    // 1. Grab text
    const answerText = currentTranscriptRef.current + transcriptDisplay.replace(currentTranscriptRef.current, '');
    
    if (!answerText.trim()) {
      alert("Transcript is empty. Please speak before submitting.");
      return;
    }

    // 2. Stop listening temporarily while processing
    stopListening();
    setIsProcessing(true);

    const questionAsked = currentQuestionRef.current;

    try {
      // 3. Send requests
      const updatePromise = axios.patch('http://localhost:5000/update-interview-questions', {
        interview_id: interviewId,
        questions: [[questionAsked, answerText, '']] 
      });

      const aiPromise = axios.post('http://localhost:5000/ai-aspect', {
        interview_id: interviewId,
        answer: answerText,
        question_index: nextIndexRef.current
      });

      const [_, aiRes] = await Promise.all([updatePromise, aiPromise]);

      // 4. Reset Text Buffers
      currentTranscriptRef.current = '';
      setTranscriptDisplay('');

      // 5. Handle Next Step
      if (aiRes.data.finished) {
        setAiQuestion("Interview finished. Thank you.");
        finishInterview();
      } else {
        const newQuestion = aiRes.data.question;
        setAiQuestion(newQuestion);
        currentQuestionRef.current = newQuestion;
        nextIndexRef.current = aiRes.data.next_index;
        
        setIsProcessing(false);
        // This will speak, then restart listening automatically
        speakQuestion(newQuestion);
      }

    } catch (error) {
      console.error("Error submitting:", error);
      setIsProcessing(false);
      startListening(); // Resume if error
    }
  };

  // --- 5. Start / Finish Interview ---
  const startInterview = async () => {
    try {
      setRecording(true);

      // Camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Video Recorder
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      // Fetch First Question
      const initRes = await axios.post('http://localhost:5000/ai-aspect-init', { interview_id: interviewId });
      const firstQuestion = initRes.data.questions?.[0]?.question || "Tell me about yourself.";
      
      setAiQuestion(firstQuestion);
      currentQuestionRef.current = firstQuestion;
      nextIndexRef.current = initRes.data.next_index || 1;

      // Speak & Start Listen Loop
      speakQuestion(firstQuestion);

    } catch (err) {
      console.error("Start Error:", err);
      alert("Could not access Camera/Microphone.");
      setRecording(false);
    }
  };

  const finishInterview = useCallback(async () => {
    setRecording(false);
    stopListening();
    window.speechSynthesis.cancel();

    // Stop Recorder & Save
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'video/webm' });
        const file = new File([blob], 'interview.webm', { type: 'video/webm' });
        const formData = new FormData();
        formData.append('interview_id', interviewId);
        formData.append('video', file);

        try {
          await axios.post('http://localhost:5000/store-video', formData);
          await axios.post('http://localhost:5000/generate-summary', { interview_id: interviewId });
          alert("Interview Saved Successfully!");
          navigate('/dashboard');
        } catch(e) { console.error(e); }
      };
    }
    
    // Kill Stream
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, [interviewId, navigate]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

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
                {isProcessing ? <span className={styles.typing}>Evaluating answer...</span> : aiQuestion}
              </p>
            </div>
          </div>

          <div className={`${styles.transcriptBox} ${isListening ? styles.activeBorder : ''}`}>
            <div className={styles.transcriptHeader}>
              <h4>Your Transcript</h4>
              {isListening && <span className={styles.listeningBadge}>🔴 Listening...</span>}
            </div>
            <div className={styles.transcriptText}>
              {transcriptDisplay || <span className={styles.placeholder}>Waiting for your voice...</span>}
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
              <button className={styles.btnStart} onClick={startInterview}>
                Start Interview
              </button>
            ) : (
              <div className={styles.actionButtons}>
                {/* SUBMIT BUTTON */}
                <button 
                  className={styles.btnSubmit} 
                  onClick={handleSubmitAnswer}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Processing...' : 'Submit Answer'}
                </button>
                
                <button className={styles.btnTerminate} onClick={finishInterview}>
                  Finish
                </button>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}