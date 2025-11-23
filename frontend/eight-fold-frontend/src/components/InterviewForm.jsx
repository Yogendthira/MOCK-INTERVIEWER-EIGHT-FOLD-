import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './InterviewForm.module.css';

export default function InterviewForm() {
  const navigate = useNavigate();

  const [resume, setResume] = useState(null);
  const [jobDesc, setJobDesc] = useState('');
  const [interviewType, setInterviewType] = useState('');
  const [duration, setDuration] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => setResume(e.target.files[0]);

  const handleSubmit = async () => {
    if (!resume || !jobDesc.trim() || !interviewType || !duration) {
      alert('Please fill in all fields.');
      return;
    }

    const formData = new FormData();
    formData.append('resume', resume);
    formData.append('job_description', jobDesc);
    formData.append('interview_type', interviewType);
    formData.append('duration', duration);

    try {
      setLoading(true);
      const response = await axios.post('http://localhost:5000/init_interview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const insertedId = response.data.inserted_id;
      console.log('DEBUG: Interview created with ID:', insertedId); // 🔹 debug

      // Redirect to InterviewPage with interviewId in state
      navigate('/InterviewPage', { state: { interviewId: insertedId } });
    } catch (err) {
      console.error('DEBUG Axios Error:', err);
      alert(err?.response?.data?.error || err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Start Interview</h2>

      <div className={styles.field}>
        <label className={styles.label}>Upload Resume (PDF)</label>
        <input type="file" accept=".pdf" onChange={handleFileChange} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Job Description</label>
        <textarea
          placeholder="Enter job description here..."
          value={jobDesc}
          onChange={(e) => setJobDesc(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Interview Type</label>
        <select value={interviewType} onChange={(e) => setInterviewType(e.target.value)}>
          <option value="">Select type</option>
          <option value="technical">Technical</option>
          <option value="technical advanced">Technical Advanced</option>
          <option value="managerial">Managerial</option>
          <option value="personal">Personal</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Duration</label>
        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
          <option value="">Select duration</option>
          <option value="15 minutes">15 minutes</option>
          <option value="30 minutes">30 minutes</option>
          <option value="45 minutes">45 minutes</option>
          <option value="60 minutes">60 minutes</option>
        </select>
      </div>

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Starting...' : 'Start Interview'}
      </button>
    </div>
  );
}
