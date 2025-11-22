import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProfileUploader from './components/ProfileUploader.jsx';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<ProfileUploader/>} />
        <Route path="/profile" element={<ProfileUploader/>} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
