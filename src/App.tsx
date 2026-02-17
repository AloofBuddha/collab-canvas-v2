import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth'
import { auth } from './utils/firebase'
import { Dashboard } from './components/Dashboard'
import { CanvasPage } from './components/CanvasPage'
import AuthPage from './components/AuthPage'
import type { AuthStatus, User } from './types'
import { getUserColorFromId } from './utils/userColors'

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const displayName = firebaseUser.displayName
          || firebaseUser.email?.split('@')[0]
          || 'Anonymous'
        setUser({
          userId: firebaseUser.uid,
          displayName,
          color: getUserColorFromId(firebaseUser.uid),
        })
        setAuthStatus('authenticated')
      } else {
        setUser(null)
        setAuthStatus('unauthenticated')
      }
    })
    return unsubscribe
  }, [])

  if (authStatus === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        Loading...
      </div>
    )
  }

  if (authStatus === 'unauthenticated') {
    return <AuthPage />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard user={user!} />} />
        <Route path="/board/:boardId" element={<CanvasPage user={user!} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
