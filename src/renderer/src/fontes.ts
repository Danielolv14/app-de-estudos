// Fontes locais (o app não depende de internet para abrir).
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import dseg from 'dseg/fonts/DSEG7-Classic/DSEG7Classic-Bold.woff2?url'
import dsegMini from 'dseg/fonts/DSEG7-Classic-MINI/DSEG7ClassicMini-Bold.woff2?url'

for (const [nome, url] of [
  ['Segmentos', dseg],
  ['SegmentosMini', dsegMini]
] as const) {
  const f = new FontFace(nome, `url(${url})`)
  document.fonts.add(f)
  void f.load()
}
