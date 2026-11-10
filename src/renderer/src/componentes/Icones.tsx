// Ícones desenhados à mão em SVG (traço fino, sem biblioteca).
type P = { tamanho?: number }

const base = (tamanho = 18) => ({
  width: tamanho,
  height: tamanho,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
})

export const IconeFoco = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 13.5V9.5M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5" />
  </svg>
)

export const IconePlano = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 5.5l1 1 2-2M4 11.5l1 1 2-2" />
    <circle cx="5" cy="18" r="1.2" />
  </svg>
)

export const IconeCalendario = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M8 14h2M14 14h2M8 17h2" />
  </svg>
)

/** Um medidor com ponteiro: quanto falta para chegar a 60. */
export const IconeNotas = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <path d="M3.5 16.5a8.5 8.5 0 0 1 17 0" />
    <path d="M12 16.5l4.2-5.2" />
    <circle cx="12" cy="16.5" r="1.3" />
    <path d="M5 20h14" />
  </svg>
)

export const IconeAjustes = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
)

export const IconeMais = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconeEditar = ({ tamanho = 16 }: P) => (
  <svg {...base(tamanho)}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
)

export const IconeLixeira = ({ tamanho = 16 }: P) => (
  <svg {...base(tamanho)}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </svg>
)

export const IconeTocar = ({ tamanho }: P) => (
  <svg {...base(tamanho)} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </svg>
)

export const IconePausa = ({ tamanho }: P) => (
  <svg {...base(tamanho)} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="4" height="14" rx="1" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" />
  </svg>
)

export const IconeParar = ({ tamanho }: P) => (
  <svg {...base(tamanho)} fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

export const IconeCadeado = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
)

export const IconeSeta = ({ tamanho, esquerda }: P & { esquerda?: boolean }) => (
  <svg {...base(tamanho)}>
    <path d={esquerda ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
)

export const IconeJanela = ({ tamanho = 16 }: P) => (
  <svg {...base(tamanho)}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M4 9h16" />
  </svg>
)

export const IconeFechar = ({ tamanho = 16 }: P) => (
  <svg {...base(tamanho)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

/** Folha de prova com o lápis. */
export const IconeSimulado = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h4" />
    <path d="M8.5 8h6M8.5 11.5h4" />
    <path d="M18.5 12.5l2 2-6 6h-2v-2z" />
  </svg>
)

/** Grade do mapa de calor. */
export const IconeConstancia = ({ tamanho }: P) => (
  <svg {...base(tamanho)}>
    <rect x="4" y="4" width="4" height="4" rx="1" />
    <rect x="10" y="4" width="4" height="4" rx="1" />
    <rect x="16" y="4" width="4" height="4" rx="1" />
    <rect x="4" y="10" width="4" height="4" rx="1" />
    <rect x="10" y="10" width="4" height="4" rx="1" />
    <rect x="4" y="16" width="4" height="4" rx="1" />
  </svg>
)

export const IconeFoto = ({ tamanho = 16 }: P) => (
  <svg {...base(tamanho)}>
    <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
    <path d="M8.5 6l1.5-2.5h4L15.5 6" />
    <circle cx="12" cy="12.5" r="3.3" />
  </svg>
)
