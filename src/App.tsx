import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from '@/pages/Home';
import Editor from '@/pages/Editor';
import DinoClipboard from '@/pages/DinoClipboard';
import FileDownload from '@/pages/FileDownload';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/e/:code" element={<Editor />} />
        <Route path="/c/:code" element={<DinoClipboard />} />
        <Route path="/f" element={<FileDownload />} />
        <Route path="/f/:code" element={<FileDownload />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
