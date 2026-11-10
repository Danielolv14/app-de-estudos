import { createRoot } from 'react-dom/client'
import './fontes'
import './estilos.css'
import { App } from './App'

// Arquivo solto fora da área de fotos não pode abrir na janela (o Electron navegaria para ele).
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('raiz')!).render(<App />)
