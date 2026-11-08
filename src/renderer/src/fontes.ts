// Fontes locais (o app não depende de internet para abrir).
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import dsegMini from 'dseg/fonts/DSEG7-Classic-MINI/DSEG7ClassicMini-Bold.woff2?url'

// "Lacuna": só o "!" da DSEG7, que é um dígito em branco. O mostrador da tela Notas completa a
// porcentagem com "!" para ter sempre 3 casas (ex.: "!42"); os outros caracteres caem na Geist Mono.
const lacuna = new FontFace('Lacuna', `url(${dsegMini})`, { unicodeRange: 'U+0021' })
document.fonts.add(lacuna)
void lacuna.load()
