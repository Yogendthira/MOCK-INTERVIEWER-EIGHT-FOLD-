import { useState } from 'react';
import styles from './ProfileUploader.module.css';

import JobDescription from './JobDescription.jsx';

function ProfileUploader() {
  const [selectedFile, setSelectedFile] = useState(null);

  function handleFileChange(e) {
    setSelectedFile(e.target.files[0]);
  }

  function handleUpload() {
    if (!selectedFile) {
      alert("Please select a file first.");
      return;
    }
    // Placeholder: You can add API upload logic here
    alert(`Uploaded: ${selectedFile.name}`);
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.profileSection}>
          <div className={styles.profilePic}></div>
          <div className={styles.profileInfo}>
            <h2>Your Profile</h2>
            <p>Basic information and resume upload</p>
          </div>
        </div>

        <div className={styles.uploadSection}>
          <label className={styles.label}>Resume</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            className={styles.fileInput}
            onChange={handleFileChange}
          />

          <button className={styles.uploadButton} onClick={handleUpload}>
            Upload
          </button>

          {selectedFile && (
            <p className={styles.fileName}>Selected: {selectedFile.name}</p>
          )}      
        </div>
      </div>
      <JobDescription />
    </>
  );
}

export default ProfileUploader;
