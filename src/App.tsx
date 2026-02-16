import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Dashboard } from "./components/Dashboard.tsx"
import { CanvasPage } from "./components/CanvasPage.tsx"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/board/:boardId" element={<CanvasPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
