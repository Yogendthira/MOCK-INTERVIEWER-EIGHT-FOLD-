import { useRef, useEffect, useState } from 'react';
import styles from './Camera.module.css';

function Camera() {
  const videoRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
      }
    }

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  function toggleRecording() {
    setIsRecording(!isRecording);
  }

  return (
    <div className={styles.container}>
      <div className={styles.cameraBox}>
        {/* AI Side */}
        <div className={styles.aiSide}>
          <div className={styles.aiImageBox}>
            <img 
              src="https://via.placeholder.com/300x200/4A90E2/FFFFFF?text=AI+Interviewer" 
              alt="AI Interviewer"
              className={styles.aiImage}
            />
          </div>
          <p className={styles.label}>AI Interviewer</p>
        </div>

        {/* User Camera Side */}
        <div className={styles.userSide}>
          <div className={styles.videoContainer}>
            <video
              ref={videoRef}
              autoPlay
              muted
              className={styles.video}
            />
            <div className={`${styles.recordingIndicator} ${isRecording ? styles.recording : ''}`}>
              {isRecording ? '● REC' : '○'}
            </div>
          </div>
          <p className={styles.label}>You</p>
          <button 
            className={`${styles.recordButton} ${isRecording ? styles.stop : styles.start}`}
            onClick={toggleRecording}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Camera;