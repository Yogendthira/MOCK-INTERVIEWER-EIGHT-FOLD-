import { useState } from 'react';
import styles from './JobDescription.module.css';

function JobDescription() {
  const [jobInput, setJobInput] = useState('');
  const [category, setCategory] = useState('technical');

  function handleSubmit() {
    if (!jobInput.trim()) {
      alert("Please enter a job description.");
      return;
    }
    alert(`Category: ${category}\nJob submitted: ${jobInput}`);
  }

  return (
    <div className={styles.container}>

      <label className={styles.label}>Category</label>
      <select
        className={styles.select}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="technical">Technical</option>
        <option value="advanced">Advanced</option>
        <option value="personal">Personal</option>
      </select>

      <label className={styles.label}>Job Description</label>
      <textarea
        className={styles.textarea}
        placeholder="Enter the job you want to practice for..."
        value={jobInput}
        onChange={(e) => setJobInput(e.target.value)}
      />

      <button className={styles.submitButton} onClick={handleSubmit}>
        Submit
      </button>

    </div>
  );
}

export default JobDescription;
