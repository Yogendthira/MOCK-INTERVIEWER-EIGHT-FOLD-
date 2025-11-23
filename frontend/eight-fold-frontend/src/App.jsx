import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProfileUploader from './components/InterviewForm.jsx';
import InterviewPage from './components/InterviewPage.jsx';
import './App.css';
import ReviewPage from './components/ReviewPage.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<ProfileUploader/>} />
        <Route path="/profile" element={<ProfileUploader/>} />
        <Route path="/InterviewPage" element={<InterviewPage/>} />
        <Route path="/ReviewPage" element={<ReviewPage/>} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
