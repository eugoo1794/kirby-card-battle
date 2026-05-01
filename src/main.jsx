import React from 'react'
import ReactDOM from 'react-dom/client'
import KirbyCardGame from './App.jsx'

const outerStyle = {
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  justifyContent: 'center',
}

const innerStyle = {
  width: '100%',
  maxWidth: '480px',
  minHeight: '100vh',
  position: 'relative',
  overflow: 'hidden',
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={outerStyle}>
      <div style={innerStyle}>
        <KirbyCardGame />
      </div>
    </div>
  </React.StrictMode>
)
