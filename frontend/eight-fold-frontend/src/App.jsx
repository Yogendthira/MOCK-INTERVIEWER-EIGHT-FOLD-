import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProfileUploader from './components/InterviewForm.jsx';
import InterviewPage from './components/InterviewPage.jsx';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<ProfileUploader/>} />
        <Route path="/profile" element={<ProfileUploader/>} />
        <Route path="/InterviewPage" element={<InterviewPage/>} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
