/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    // Interceptar se veio por URL com hash do PocketBase (ex: /_/#/auth/confirm-password-reset/TOKEN)
    const fullHash = window.location.hash || ''
    const fullPath = location.pathname || ''

    if (
      fullPath.includes('confirm-password-reset') ||
      fullHash.includes('confirm-password-reset')
    ) {
      const matchToken = (fullPath + fullHash).match(/confirm-password-reset\/([a-zA-Z0-9_\-.]+)/)
      const token = matchToken ? matchToken[1] : ''
      navigate(token ? `/redefinir-senha?token=${token}` : '/redefinir-senha', { replace: true })
      return
    }

    if (fullPath.includes('confirm-verification') || fullHash.includes('confirm-verification')) {
      const matchToken = (fullPath + fullHash).match(/confirm-verification\/([a-zA-Z0-9_\-.]+)/)
      const token = matchToken ? matchToken[1] : ''
      navigate(token ? `/verificar-email?token=${token}` : '/verificar-email', { replace: true })
      return
    }

    if (fullPath.includes('confirm-email-change') || fullHash.includes('confirm-email-change')) {
      const matchToken = (fullPath + fullHash).match(/confirm-email-change\/([a-zA-Z0-9_\-.]+)/)
      const token = matchToken ? matchToken[1] : ''
      navigate(token ? `/confirmar-email?token=${token}` : '/confirmar-email', { replace: true })
      return
    }

    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-4">Oops! Page not found</p>
        <a href="/" className="text-blue-500 hover:text-blue-700 underline">
          Return to Home
        </a>
      </div>
    </div>
  )
}

export default NotFound
