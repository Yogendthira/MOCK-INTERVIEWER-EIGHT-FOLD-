import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "./ReviewPage.module.css";
import { useLocation } from "react-router-dom";

const ReviewPage = () => {
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const location = useLocation();
  const { interviewId } = location.state || {}; 

  useEffect(() => {
    if (!interviewId) {
      setError("Interview ID is missing");
      setLoading(false);
      return;
    }

    const fetchInterview = async () => {
      try {
        const response = await axios.get("/api/get_interview", {
          params: { interview_id: interviewId },
        });
        setInterview(response.data);
      } catch (err) {
        console.error("Failed to fetch interview:", err);
        setError(err.response?.data?.error || "Failed to fetch interview");
      } finally {
        setLoading(false);
      }
    };

    fetchInterview();
  }, [interviewId]);

  if (loading) return <div className={styles.loading}>Loading...</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  if (!interview) return <div className={styles.loading}>No data found</div>;

  const {
    name,
    resume_filename,
    skills,
    job_description,
    interview_type,
    duration,
    questions_asked,
    video_filename,
    video_file_id
  } = interview;

  return (
    <div className={styles.dashboard}>
      {/* Left Container: Video + Sharing */}
      <div className={styles.leftContainer}>
        <h2 className={styles.sectionTitle}>Interview Video</h2>
        {video_file_id ? (
          <video
            className={styles.videoPlayer}
            controls
            src={`/api/videos/${video_file_id}`}
          />
        ) : (
          <p>No video available</p>
        )}
        <div className={styles.shareSection}>
          <h3>Share this interview</h3>
          <button className={styles.shareBtn}>Copy Link</button>
          <button className={styles.shareBtn}>Download Video</button>
        </div>
      </div>

      {/* Right Container: Details */}
      <div className={styles.rightContainer}>
        <h1 className={styles.candidateName}>{name}</h1>
        <p><strong>Resume:</strong> {resume_filename}</p>

        <p>
          <strong>Skills:</strong>{" "}
          {skills && skills.length > 0 ? (
            <ul className={styles.skillsList}>
              {skills.map((skill, idx) => (
                <li key={idx} className={styles.skillItem}>{skill}</li>
              ))}
            </ul>
          ) : (
            "No skills listed"
          )}
        </p>

        <p><strong>Job Description:</strong> {job_description}</p>
        <p><strong>Interview Type:</strong> {interview_type}</p>
        <p><strong>Duration:</strong> {duration}</p>

        <div className={styles.questionsSection}>
          <h2>Questions & Answers</h2>
          {questions_asked && questions_asked.length > 0 ? (
            questions_asked.map((q, index) => (
              <div key={index} className={styles.questionBlock}>
                <p className={styles.question}><strong>Q:</strong> {q[0]}</p>
                <p className={styles.answer}><strong>A:</strong> {q[1] || "No answer provided"}</p>
              </div>
            ))
          ) : (
            <p>No questions recorded</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewPage;
