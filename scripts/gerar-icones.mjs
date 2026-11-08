// Gera os ícones (app e bandeja) a partir de SVG. Rodar com: npm run icones
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

mkdirSync('resources', { recursive: true })

// Placa de grafite com um visor redondo e um arco âmbar de progresso (o timer contando para cima).
const icone = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="placa" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3f47"/>
      <stop offset="1" stop-color="#202328"/>
    </linearGradient>
    <radialGradient id="poco" cx="0.5" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#16181b"/>
      <stop offset="1" stop-color="#08090a"/>
    </radialGradient>
    <filter id="brilho" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="108" fill="url(#placa)"/>
  <rect x="24.5" y="24.5" width="463" height="463" rx="107.5" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/>
  <circle cx="256" cy="262" r="168" fill="url(#poco)"/>
  <circle cx="256" cy="262" r="168" fill="none" stroke="#000" stroke-opacity=".8" stroke-width="6"/>
  <circle cx="256" cy="262" r="122" fill="none" stroke="#ffb13d" stroke-opacity=".1" stroke-width="30"/>
  <path d="M256 140 A122 122 0 1 1 134 262" fill="none" stroke="#ffb13d" stroke-width="30" stroke-linecap="round" filter="url(#brilho)"/>
  <circle cx="256" cy="262" r="20" fill="#ffb13d" filter="url(#brilho)"/>
</svg>`

// Bandeja: só o arco, legível em 16 px sobre a barra escura do Windows.
const bandeja = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="22" fill="none" stroke="#ffb13d" stroke-opacity=".28" stroke-width="9"/>
  <path d="M32 10 A22 22 0 1 1 10 32" fill="none" stroke="#ffb13d" stroke-width="9" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="6" fill="#ffb13d"/>
</svg>`

await sharp(Buffer.from(icone)).resize(512, 512).png().toFile('resources/icone.png')
await sharp(Buffer.from(bandeja)).resize(32, 32).png().toFile('resources/bandeja.png')
console.log('Ícones gerados em resources/')
