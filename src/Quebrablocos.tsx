// Quebrablocos · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
// Quebra-tijolos arcade: rebata a bola com a raquete, destrua todos os blocos
// da fase e pegue as cápsulas de poder (L raquete larga, M multibola, S lenta,
// +1 vida, T canhão). Blocos de metal não quebram. Depois da fase 6 o ciclo
// recomeça mais rápido.
// Controles: setas ou A/D movem · mouse ou dedo arrastando sobre o campo move
// a raquete · Espaço ou clique lança a bola (e atira com o canhão) · P pausa ·
// no celular, botões na tela.
// Props:
//   tema?: "claro" | "escuro"   tema inicial (padrão "claro"); o botão sol/lua do HUD alterna
//   onTemaChange?: (tema) => void   avisa quando o jogador troca o tema
//   accent?: string            cor de destaque (padrão "#0057FF")
//   variacao?: "Clássico" | "Turbo" | "Caos"   preset inicial
//   velocidade?: number        velocidade da bola em px/s no campo de 480x600 (padrão 330)
//   vidas?: number             vidas no início (padrão 3)
//   chancePoder?: number       chance (0..1) de um bloco quebrado soltar cápsula (padrão 0.14)
//   tipoTiro?: "nenhum" | "simples" | "duplo"   canhão da cápsula T ("nenhum" desliga a cápsula)
//   obstaculosExtras?: number  blocos de metal extras sorteados em cada fase
// O seletor "Variações" troca o preset ao vivo. Recorde salvo no localStorage.
// Requisitos: React 18+ e Tailwind CSS 3+. Zero dependências.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/* ----------------------------- lógica pura ----------------------------- */

/**
 * Ângulo de saída (radianos, medido a partir da vertical) conforme o ponto onde a
 * bola toca a raquete. xRaquete é o CENTRO da raquete. 0 no centro, -maxAngulo na
 * borda esquerda, +maxAngulo na borda direita, linear entre elas e limitado fora.
 */
export function anguloRebatida(xBola: number, xRaquete: number, larguraRaquete: number, maxAngulo: number = Math.PI / 3): number {
  const meia = larguraRaquete / 2;
  if (meia <= 0) return 0;
  const rel = Math.max(-1, Math.min(1, (xBola - xRaquete) / meia));
  return rel * maxAngulo;
}

type Contato = { nx: number; ny: number; pen: number };

function contatoCirculoRet(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number): Contato | null {
  const px = Math.max(rx, Math.min(cx, rx + rw));
  const py = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - px;
  const dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, pen: r - d };
  }
  // Centro dentro do retângulo: sai pelo lado mais próximo.
  const esq = cx - rx;
  const dir = rx + rw - cx;
  const cima = cy - ry;
  const baixo = ry + rh - cy;
  const m = Math.min(esq, dir, cima, baixo);
  if (m === esq) return { nx: -1, ny: 0, pen: esq + r };
  if (m === dir) return { nx: 1, ny: 0, pen: dir + r };
  if (m === cima) return { nx: 0, ny: -1, pen: cima + r };
  return { nx: 0, ny: 1, pen: baixo + r };
}

/** Normal de colisão (do retângulo para o círculo) ou null se não encostam. */
export function colisaoCirculoRet(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number): { nx: number; ny: number } | null {
  const c = contatoCirculoRet(cx, cy, r, rx, ry, rw, rh);
  return c ? { nx: c.nx, ny: c.ny } : null;
}

/* ------------------------------ variações ------------------------------ */

type NomeVariacao = "Clássico" | "Turbo" | "Caos";
type TipoTiro = "nenhum" | "simples" | "duplo";
type Config = { velocidade: number; vidas: number; chancePoder: number; tipoTiro: TipoTiro; obstaculosExtras: number };

const VARIACOES: Record<NomeVariacao, Config> = {
  Clássico: { velocidade: 330, vidas: 3, chancePoder: 0.14, tipoTiro: "simples", obstaculosExtras: 0 },
  Turbo: { velocidade: 450, vidas: 3, chancePoder: 0.18, tipoTiro: "simples", obstaculosExtras: 0 },
  Caos: { velocidade: 380, vidas: 5, chancePoder: 0.35, tipoTiro: "duplo", obstaculosExtras: 6 },
};

/* --------------------------------- tema --------------------------------- */

export type Tema = "claro" | "escuro";
// Paleta do tema: vira CSS vars na raiz (classes) e é lida pelo canvas.
const TEMAS: Record<Tema, Record<string, string>> = {
  claro: {
    "--fc-bg": "#F7F8FB", "--fc-surface": "#FFFFFF", "--fc-surface-2": "#F1F4F9",
    "--fc-border": "#E3E8F0", "--fc-border-strong": "#CBD3E1",
    "--fc-text": "#0B1220", "--fc-muted": "#4B5565", "--fc-subtle": "#8A94A6",
    "--fc-pos": "#059669", "--fc-neg": "#E11D48", "--fc-warn": "#D97706",
    "--fc-shadow": "0 1px 2px rgba(16,24,40,.06), 0 12px 32px -16px rgba(16,24,40,.18)",
  },
  escuro: {
    "--fc-bg": "#0B0F17", "--fc-surface": "rgba(255,255,255,0.03)", "--fc-surface-2": "rgba(255,255,255,0.06)",
    "--fc-border": "rgba(255,255,255,0.10)", "--fc-border-strong": "rgba(255,255,255,0.25)",
    "--fc-text": "#FFFFFF", "--fc-muted": "rgba(255,255,255,0.60)", "--fc-subtle": "rgba(255,255,255,0.40)",
    "--fc-pos": "#34D399", "--fc-neg": "#FB7185", "--fc-warn": "#FBBF24",
    "--fc-shadow": "0 24px 48px -24px rgba(0,0,0,.6)",
  },
};

function BotaoTema({ tema, onClick }: { tema: Tema; onClick: () => void }) {
  const escuro = tema === "escuro";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={escuro ? "Ativar modo claro" : "Ativar modo escuro"}
      title={escuro ? "Modo claro" : "Modo escuro"}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)] transition-colors hover:border-[var(--fc-border-strong)] hover:text-[var(--fc-text)]"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        {escuro ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

type Props = {
  tema?: Tema;
  onTemaChange?: (tema: Tema) => void;
  accent?: string;
  variacao?: NomeVariacao;
  velocidade?: number;
  vidas?: number;
  chancePoder?: number;
  tipoTiro?: TipoTiro;
  obstaculosExtras?: number;
};

type Status = "inicio" | "jogando" | "pausado" | "fim";

/* ------------------------------- fases --------------------------------- */

// 12 colunas. "." vazio, "1".."3" resistência, "M" metal indestrutível.
const FASES: string[][] = [
  ["............", "222222222222", "111111111111", "111111111111", "111111111111", "111111111111"],
  [".....33.....", "....2222....", "...111111...", "..22222222..", ".1111111111.", "111111111111"],
  ["3.3.3..3.3.3", "222222222222", "M1111MM1111M", "111111111111", "..22222222..", "111111111111"],
  [".....22.....", "....2332....", "...233332...", "..23333332..", "...233332...", "....2332....", ".....22....."],
  ["333333333333", "M2222222222M", "M1........1M", "M1.333333.1M", "M1........1M", "MMMM1111MMMM"],
  ["3..3..3..3..", "222222222222", ".M..M..M..M.", "111111111111", "2.2.2.2.2.2.", "111111111111"],
];

const W = 480;
const H = 600;
const COLS = 12;
const BW = 38;
const BH = 18;
const BX0 = (W - COLS * BW) / 2;
const BY0 = 64;
const PAD_Y = H - 44;
const PAD_H = 12;
const PAD_W = 80;
const PAD_W_LARGA = 124;
const R = 6;
const PASSO = 1 / 120;
const DURACAO_PODER = 12;

const COR_HP = ["", "", "#8B5CF6", "#FF4D8D"];
const COR_CAPSULA: Record<TipoCapsula, string> = { L: "#22D3EE", M: "#A78BFA", S: "#34D399", V: "#FF4D8D", T: "#F59E0B" };
const ROTULO_CAPSULA: Record<TipoCapsula, string> = { L: "L", M: "M", S: "S", V: "+1", T: "T" };

// Paleta de desenho do canvas por tema. Escuro = visual original; claro = campo
// off-white, blocos multicor por linha, sombras suaves no lugar do neon.
type CoresCanvas = {
  fundoTopo: string; fundoBase: string; grade: string;
  metal: string; metalLuz: string; metalSombra: string; metalRebite: string; metalBorda: string;
  linhas: string[] | null; hp: string[]; brilho: string; sombraBloco: string; trinca: string; borda: string;
  capsula: Record<TipoCapsula, string>; capsulaTexto: string; capsulaLuz: string;
  tiro: string; padPonta: string; padLuz: string;
  bola: string; rastro: string; barraFundo: string; texto: string; dica: string;
  neon: boolean; sombraSuave: string;
};
const CORES = {
  escuro: {
    fundoTopo: "#111827", fundoBase: "#0B0F17", grade: "rgba(255,255,255,0.035)",
    metal: "#4B5466", metalLuz: "#8A94A6", metalSombra: "#2A303C", metalRebite: "#AEB6C4", metalBorda: "",
    linhas: null, hp: COR_HP, brilho: "rgba(255,255,255,0.22)", sombraBloco: "rgba(0,0,0,0.22)", trinca: "rgba(10,12,20,0.75)", borda: "",
    capsula: COR_CAPSULA, capsulaTexto: "#0B0F17", capsulaLuz: "rgba(255,255,255,0.3)",
    tiro: "#FFD166", padPonta: "#1F2937", padLuz: "rgba(255,255,255,0.35)",
    bola: "#fff", rastro: "255,255,255", barraFundo: "rgba(255,255,255,0.08)", texto: "#fff", dica: "rgba(255,255,255,0.45)",
    neon: true, sombraSuave: "",
  },
  claro: {
    fundoTopo: "#FFFFFF", fundoBase: "#EEF2F8", grade: "rgba(15,23,42,0.07)",
    metal: "#8792A5", metalLuz: "#C3CBD8", metalSombra: "#5B6578", metalRebite: "#EEF2F7", metalBorda: "rgba(15,23,42,0.35)",
    linhas: ["", "#7C3AED", "#10B981", "#F59E0B", "#EC4899", "#06B6D4"], hp: ["", "", "#6D28D9", "#E11D48"],
    brilho: "rgba(255,255,255,0.38)", sombraBloco: "rgba(15,23,42,0.14)", trinca: "rgba(11,18,32,0.6)", borda: "rgba(11,18,32,0.55)",
    capsula: { L: "#0891B2", M: "#7C3AED", S: "#059669", V: "#DB2777", T: "#D97706" }, capsulaTexto: "#FFFFFF", capsulaLuz: "rgba(255,255,255,0.35)",
    tiro: "#D97706", padPonta: "#1E293B", padLuz: "rgba(255,255,255,0.4)",
    bola: "#0B1220", rastro: "11,18,32", barraFundo: "rgba(15,23,42,0.08)", texto: "#0B1220", dica: "rgba(75,85,101,0.85)",
    neon: false, sombraSuave: "rgba(15,23,42,0.22)",
  },
} satisfies Record<Tema, CoresCanvas>;

/** Cor de um tijolo comum: no claro cada linha ganha uma cor da paleta (linha 0 = accent). */
function corTijolo(t: { y: number; max: number }, ac: string, c: CoresCanvas) {
  if (t.max > 1) return c.hp[t.max];
  if (!c.linhas) return ac;
  const i = Math.round((t.y - BY0) / BH) % c.linhas.length;
  return i === 0 ? ac : c.linhas[i];
}

type TipoCapsula = "L" | "M" | "S" | "V" | "T";
type Bola = { x: number; y: number; vx: number; vy: number; presa: boolean; off: number; rastro: number[] };
type Tijolo = { x: number; y: number; hp: number; max: number; metal: boolean; flash: number };
type Capsula = { x: number; y: number; tipo: TipoCapsula };
type Tiro = { x: number; y: number };
type Particula = { x: number; y: number; vx: number; vy: number; vida: number; max: number; cor: string; tam: number };

type Estado = {
  padX: number;
  padW: number;
  bolas: Bola[];
  tijolos: Tijolo[];
  capsulas: Capsula[];
  tiros: Tiro[];
  parts: Particula[];
  vidas: number;
  pontos: number;
  fase: number;
  volta: number;
  batidas: number;
  acc: number;
  larga: number;
  lenta: number;
  canhao: number;
  recarga: number;
  tremor: number;
  aviso: { texto: string; t: number } | null;
};

const CHAVE = "flowcore-quebrablocos-recorde";
const LINK = "https://flowcoresolucoes.com.br/codigos";

function lerRecorde(): number {
  try {
    return Number(localStorage.getItem(CHAVE)) || 0;
  } catch {
    return 0;
  }
}

function salvarRecorde(v: number) {
  try {
    localStorage.setItem(CHAVE, String(v));
  } catch {
    /* localStorage indisponível (modo privado, iframe sandbox) */
  }
}

function montarFase(indice: number, extras: number): Tijolo[] {
  const mapa = FASES[indice % FASES.length];
  const tijolos: Tijolo[] = [];
  const ocupadas = new Set<string>();
  mapa.forEach((linha, l) => {
    for (let c = 0; c < COLS; c++) {
      const ch = linha[c];
      if (!ch || ch === ".") continue;
      const metal = ch === "M";
      const hp = metal ? 1 : Number(ch);
      tijolos.push({ x: BX0 + c * BW, y: BY0 + l * BH, hp, max: hp, metal, flash: 0 });
      ocupadas.add(`${l},${c}`);
    }
  });
  const n = Math.max(0, Math.min(14, Math.round(extras)));
  const linhas = mapa.length + 2;
  for (let k = 0, tentativas = 0; k < n && tentativas < 200; tentativas++) {
    const l = Math.floor(Math.random() * linhas);
    const c = Math.floor(Math.random() * COLS);
    if (ocupadas.has(`${l},${c}`)) {
      const t = tijolos.find((b) => b.x === BX0 + c * BW && b.y === BY0 + l * BH);
      if (!t || t.metal || Math.random() < 0.6) continue;
      t.metal = true;
      t.hp = 1;
      t.max = 1;
    } else {
      ocupadas.add(`${l},${c}`);
      tijolos.push({ x: BX0 + c * BW, y: BY0 + l * BH, hp: 1, max: 1, metal: true, flash: 0 });
    }
    k++;
  }
  return tijolos;
}

function bolaPresa(padX: number): Bola {
  return { x: padX, y: PAD_Y - R - 1, vx: 0, vy: 0, presa: true, off: (Math.random() - 0.5) * 20, rastro: [] };
}

function novoEstado(cfg: Config): Estado {
  return {
    padX: W / 2,
    padW: PAD_W,
    bolas: [bolaPresa(W / 2)],
    tijolos: montarFase(0, cfg.obstaculosExtras),
    capsulas: [],
    tiros: [],
    parts: [],
    vidas: Math.max(1, Math.round(cfg.vidas)),
    pontos: 0,
    fase: 0,
    volta: 0,
    batidas: 0,
    acc: 0,
    larga: 0,
    lenta: 0,
    canhao: 0,
    recarga: 0,
    tremor: 0,
    aviso: { texto: "Fase 1", t: 1.6 },
  };
}

function explodir(e: Estado, x: number, y: number, cor: string, n: number) {
  for (let i = 0; i < n && e.parts.length < 320; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 180;
    const max = 0.35 + Math.random() * 0.45;
    e.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, vida: max, max, cor, tam: 1.5 + Math.random() * 2.5 });
  }
}

function soltarCapsula(e: Estado, c: Config, x: number, y: number) {
  if (Math.random() >= c.chancePoder) return;
  const tipos: TipoCapsula[] = ["L", "L", "M", "M", "S", "S", "V"];
  if (c.tipoTiro !== "nenhum") tipos.push("T", "T");
  e.capsulas.push({ x, y, tipo: tipos[Math.floor(Math.random() * tipos.length)] });
}

/* ------------------------------ componente ----------------------------- */

/* ------------------------------ como jogar ------------------------------ */

// Teclas mostradas na tela inicial e na pausa ("ou" vira separador).
const TECLAS: [string[], string][] = [
  [["←", "→", "ou", "A", "D"], "mover a raquete"],
  [["Mouse"], "também move a raquete"],
  [["Espaço", "ou", "Clique"], "lançar a bola (e atirar)"],
  [["P"], "pausar"],
];
// Versão de toque, mostrada no celular (abaixo do jogo, onde sempre cabe).
const TOQUE = [
  "Arraste o dedo sobre o campo para mover",
  "ou segure ◀ ▶ abaixo do jogo",
  "O botão do meio lança a bola",
];
const RESUMO_TECLADO = "Setas, A/D ou mouse movem · Espaço ou clique lança · P pausa";
const RESUMO_TOQUE = "Arraste no campo · botão do meio lança";

function ComoJogar({ className = "" }: { className?: string }) {
  return (
    <div className={`w-fit max-w-full text-xs text-[var(--fc-muted)] ${className}`}>
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fc-subtle)]">Como jogar</p>
      <div className="hidden grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 sm:grid">
        {TECLAS.map(([teclas, acao]) => (
          <div key={acao} className="contents">
            <span className="flex flex-wrap items-center justify-end gap-1">
              {teclas.map((t, i) =>
                t === "ou" ? (
                  <span key={i} className="text-[10px] text-[var(--fc-subtle)]">
                    ou
                  </span>
                ) : (
                  <kbd key={i} className="rounded-md border border-[var(--fc-border)] bg-[var(--fc-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fc-text)]">
                    {t}
                  </kbd>
                ),
              )}
            </span>
            <span className="text-left">{acao}</span>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-center sm:hidden">
        {TOQUE.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Quebrablocos({
  accent = "#0057FF",
  tema = "claro",
  onTemaChange,
  variacao = "Clássico",
  velocidade,
  vidas,
  chancePoder,
  tipoTiro,
  obstaculosExtras,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [temaAtual, setTemaAtual] = useState<Tema>(tema);
  useEffect(() => setTemaAtual(tema), [tema]);
  const temaRef = useRef<Tema>(tema);
  temaRef.current = temaAtual;
  const alternarTema = () => {
    const novo: Tema = temaAtual === "claro" ? "escuro" : "claro";
    setTemaAtual(novo);
    onTemaChange?.(novo);
    rootRef.current?.focus();
  };
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const inicial: Config = {
    ...VARIACOES[variacao],
    ...(velocidade !== undefined && { velocidade }),
    ...(vidas !== undefined && { vidas }),
    ...(chancePoder !== undefined && { chancePoder }),
    ...(tipoTiro !== undefined && { tipoTiro }),
    ...(obstaculosExtras !== undefined && { obstaculosExtras }),
  };

  const [nomeVar, setNomeVar] = useState<NomeVariacao>(variacao);
  const [cfg, setCfg] = useState<Config>(inicial);
  const [status, setStatus] = useState<Status>("inicio");
  const [hud, setHud] = useState({ pontos: 0, nivel: 1, vidas: inicial.vidas });
  const [recorde, setRecorde] = useState(0);
  const [largura, setLargura] = useState(480);

  const cfgRef = useRef(cfg);
  const statusRef = useRef<Status>("inicio");
  const estRef = useRef<Estado>(novoEstado(cfg));
  const accentRef = useRef(accent);
  const visivelRef = useRef(true);
  const teclasRef = useRef({ esq: false, dir: false });
  const hudRef = useRef(hud);

  cfgRef.current = cfg;
  accentRef.current = accent;

  useEffect(() => setRecorde(lerRecorde()), []);

  const mudarStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const sincronizarHud = useCallback(() => {
    const e = estRef.current;
    const nivel = e.volta * FASES.length + e.fase + 1;
    const h = hudRef.current;
    if (h.pontos !== e.pontos || h.nivel !== nivel || h.vidas !== e.vidas) {
      const novo = { pontos: e.pontos, nivel, vidas: e.vidas };
      hudRef.current = novo;
      setHud(novo);
    }
  }, []);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setLargura(w);
    });
    ro.observe(el);
    if (el.clientWidth) setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const escala = Math.max(0.4, Math.min(largura / W, 560 / H));
  const cssW = Math.round(W * escala);
  const cssH = Math.round(H * escala);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      visivelRef.current = e.isIntersecting;
      if (!e.isIntersecting && statusRef.current === "jogando") mudarStatus("pausado");
    });
    io.observe(el);
    return () => io.disconnect();
  }, [mudarStatus]);

  const iniciar = useCallback(
    (c: Config = cfgRef.current) => {
      estRef.current = novoEstado(c);
      sincronizarHud();
      mudarStatus("jogando");
      rootRef.current?.focus();
    },
    [mudarStatus, sincronizarHud],
  );

  const fim = useCallback(() => {
    const p = estRef.current.pontos;
    mudarStatus("fim");
    setRecorde((r) => {
      if (p > r) {
        salvarRecorde(p);
        return p;
      }
      return r;
    });
  }, [mudarStatus]);

  /* ------------------------------ simulação ------------------------------ */

  const velocidadeBola = useCallback(() => {
    const e = estRef.current;
    const base = cfgRef.current.velocidade * (1 + e.fase * 0.06 + e.volta * 0.18);
    const ritmo = Math.min(1.3, 1 + e.batidas * 0.004);
    return base * ritmo * (e.lenta > 0 ? 0.68 : 1);
  }, []);

  const atingir = useCallback((e: Estado, t: Tijolo) => {
    t.flash = 1;
    if (t.metal) return;
    t.hp--;
    e.batidas++;
    const cor = corTijolo(t, accentRef.current, CORES[temaRef.current]);
    if (t.hp <= 0) {
      const i = e.tijolos.indexOf(t);
      if (i >= 0) e.tijolos.splice(i, 1);
      e.pontos += 10 * t.max * (1 + e.volta);
      explodir(e, t.x + BW / 2, t.y + BH / 2, cor, 14);
      soltarCapsula(e, cfgRef.current, t.x + BW / 2, t.y + BH / 2);
    } else {
      e.pontos += 5;
      explodir(e, t.x + BW / 2, t.y + BH / 2, cor, 4);
    }
  }, []);

  const pegarCapsula = useCallback(
    (e: Estado, tipo: TipoCapsula) => {
      e.pontos += 25;
      if (tipo === "L") e.larga = DURACAO_PODER;
      else if (tipo === "S") e.lenta = DURACAO_PODER;
      else if (tipo === "V") e.vidas = Math.min(9, e.vidas + 1);
      else if (tipo === "T") e.canhao = DURACAO_PODER;
      else {
        const s = velocidadeBola();
        const soltas = e.bolas.filter((b) => !b.presa);
        if (!soltas.length) {
          const b = e.bolas[0];
          if (b) {
            b.presa = false;
            b.vx = 0;
            b.vy = -s;
            soltas.push(b);
          }
        }
        for (const b of soltas.slice(0, 3)) {
          for (const g of [-0.4, 0.4]) {
            if (e.bolas.length >= 9) break;
            const cs = Math.cos(g);
            const sn = Math.sin(g);
            e.bolas.push({ x: b.x, y: b.y, vx: b.vx * cs - b.vy * sn, vy: b.vx * sn + b.vy * cs, presa: false, off: 0, rastro: [] });
          }
        }
      }
      e.aviso = {
        texto: { L: "Raquete larga", M: "Multibola", S: "Bola lenta", V: "Vida extra", T: "Canhão" }[tipo],
        t: 1.1,
      };
    },
    [velocidadeBola],
  );

  const acionar = useCallback(() => {
    const e = estRef.current;
    const presas = e.bolas.filter((b) => b.presa);
    if (presas.length) {
      const s = velocidadeBola();
      for (const b of presas) {
        const a = anguloRebatida(b.x, e.padX, e.padW) * 0.6 + (Math.random() - 0.5) * 0.2;
        b.presa = false;
        b.vx = Math.sin(a) * s;
        b.vy = -Math.cos(a) * s;
      }
      return;
    }
    const tipo = cfgRef.current.tipoTiro;
    if (e.canhao > 0 && tipo !== "nenhum" && e.recarga <= 0) {
      e.recarga = 0.32;
      if (tipo === "duplo") {
        e.tiros.push({ x: e.padX - e.padW / 2 + 6, y: PAD_Y - 4 }, { x: e.padX + e.padW / 2 - 6, y: PAD_Y - 4 });
      } else e.tiros.push({ x: e.padX, y: PAD_Y - 4 });
    }
  }, [velocidadeBola]);

  const passo = useCallback(() => {
    const e = estRef.current;
    const dt = PASSO;
    const k = teclasRef.current;

    // Raquete
    const dirTecla = (k.dir ? 1 : 0) - (k.esq ? 1 : 0);
    e.padX += dirTecla * 560 * dt;
    const alvoW = e.larga > 0 ? PAD_W_LARGA : PAD_W;
    e.padW += (alvoW - e.padW) * Math.min(1, dt * 10);
    e.padX = Math.max(e.padW / 2, Math.min(W - e.padW / 2, e.padX));

    // Temporizadores
    e.larga = Math.max(0, e.larga - dt);
    e.lenta = Math.max(0, e.lenta - dt);
    e.canhao = Math.max(0, e.canhao - dt);
    e.recarga = Math.max(0, e.recarga - dt);
    e.tremor = Math.max(0, e.tremor - dt * 3);
    for (const t of e.tijolos) t.flash = Math.max(0, t.flash - dt * 6);

    // Bolas, com sub-passos para não atravessar blocos
    const s = velocidadeBola();
    const padX0 = e.padX - e.padW / 2;
    for (const b of e.bolas) {
      if (b.presa) {
        b.x = Math.max(R, Math.min(W - R, e.padX + b.off));
        b.y = PAD_Y - R - 1;
        continue;
      }
      const v = Math.hypot(b.vx, b.vy) || 1;
      b.vx = (b.vx / v) * s;
      b.vy = (b.vy / v) * s;
      const n = Math.max(1, Math.ceil((s * dt) / (R * 0.5)));
      const sub = dt / n;
      for (let i = 0; i < n; i++) {
        b.x += b.vx * sub;
        b.y += b.vy * sub;
        if (b.x < R) {
          b.x = R;
          b.vx = Math.abs(b.vx);
        } else if (b.x > W - R) {
          b.x = W - R;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y < R) {
          b.y = R;
          b.vy = Math.abs(b.vy);
        }
        if (b.vy > 0 && contatoCirculoRet(b.x, b.y, R, padX0, PAD_Y, e.padW, PAD_H)) {
          const a = anguloRebatida(b.x, e.padX, e.padW);
          b.vx = Math.sin(a) * s;
          b.vy = -Math.cos(a) * s;
          b.y = PAD_Y - R;
          continue;
        }
        // Bloco com maior penetração
        let alvo: Tijolo | null = null;
        let melhor: Contato | null = null;
        for (const t of e.tijolos) {
          if (Math.abs(t.x + BW / 2 - b.x) > BW / 2 + R || Math.abs(t.y + BH / 2 - b.y) > BH / 2 + R) continue;
          const c = contatoCirculoRet(b.x, b.y, R, t.x + 1, t.y + 1, BW - 2, BH - 2);
          if (c && (!melhor || c.pen > melhor.pen)) {
            melhor = c;
            alvo = t;
          }
        }
        if (alvo && melhor) {
          b.x += melhor.nx * melhor.pen;
          b.y += melhor.ny * melhor.pen;
          const dot = b.vx * melhor.nx + b.vy * melhor.ny;
          if (dot < 0) {
            b.vx -= 2 * dot * melhor.nx;
            b.vy -= 2 * dot * melhor.ny;
          }
          // Evita trajetórias quase horizontais intermináveis
          if (Math.abs(b.vy) < s * 0.25) {
            b.vy = (b.vy < 0 ? -1 : 1) * s * 0.25;
            const vv = Math.hypot(b.vx, b.vy);
            b.vx = (b.vx / vv) * s;
            b.vy = (b.vy / vv) * s;
          }
          atingir(e, alvo);
        }
      }
      b.rastro.push(b.x, b.y);
      if (b.rastro.length > 12) b.rastro.splice(0, 2);
    }

    // Bolas perdidas
    const antes = e.bolas.length;
    e.bolas = e.bolas.filter((b) => b.y < H + R * 2);
    if (antes && !e.bolas.length) {
      e.vidas--;
      e.tremor = 1;
      explodir(e, e.padX, PAD_Y, "#FF4D8D", 24);
      if (e.vidas <= 0) {
        sincronizarHud();
        fim();
        return;
      }
      e.larga = 0;
      e.lenta = 0;
      e.canhao = 0;
      e.capsulas = [];
      e.tiros = [];
      e.bolas = [bolaPresa(e.padX)];
      e.aviso = { texto: "Bola perdida", t: 1.2 };
    }

    // Cápsulas
    for (const c of e.capsulas) c.y += 130 * dt;
    e.capsulas = e.capsulas.filter((c) => {
      if (c.y + 7 >= PAD_Y && c.y - 7 <= PAD_Y + PAD_H && Math.abs(c.x - e.padX) <= e.padW / 2 + 15) {
        pegarCapsula(e, c.tipo);
        explodir(e, c.x, PAD_Y, CORES[temaRef.current].capsula[c.tipo], 10);
        return false;
      }
      return c.y < H + 10;
    });

    // Tiros do canhão
    e.tiros = e.tiros.filter((t) => {
      t.y -= 640 * dt;
      if (t.y < 0) return false;
      const alvo = e.tijolos.find((b) => t.x >= b.x && t.x <= b.x + BW && t.y >= b.y && t.y <= b.y + BH);
      if (alvo) {
        atingir(e, alvo);
        return false;
      }
      return true;
    });

    // Partículas
    for (const p of e.parts) {
      p.vida -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
    }
    e.parts = e.parts.filter((p) => p.vida > 0);
    if (e.aviso) {
      e.aviso.t -= dt;
      if (e.aviso.t <= 0) e.aviso = null;
    }

    // Fase concluída
    if (!e.tijolos.some((t) => !t.metal)) {
      e.pontos += 250 * (e.fase + 1) * (1 + e.volta);
      e.fase++;
      if (e.fase >= FASES.length) {
        e.fase = 0;
        e.volta++;
      }
      e.tijolos = montarFase(e.fase, cfgRef.current.obstaculosExtras);
      e.bolas = [bolaPresa(e.padX)];
      e.capsulas = [];
      e.tiros = [];
      e.batidas = 0;
      e.aviso = { texto: `Fase ${e.volta * FASES.length + e.fase + 1}`, t: 1.6 };
    }
  }, [velocidadeBola, atingir, pegarCapsula, sincronizarHud, fim]);

  /* ------------------------------ loop + desenho ------------------------------ */

  useEffect(() => {
    let raf = 0;
    let ultimo = performance.now();
    const loop = (agora: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (agora - ultimo) / 1000));
      ultimo = agora;
      const e = estRef.current;
      if (statusRef.current === "jogando") {
        e.acc += dt;
        while (e.acc >= PASSO && statusRef.current === "jogando") {
          e.acc -= PASSO;
          passo();
        }
        sincronizarHud();
      }
      if (visivelRef.current) desenhar(agora / 1000);
    };

    const desenhar = (t: number) => {
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth || cssW;
      const h = cv.clientHeight || cssH;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const k = (w / W) * dpr;
      const e = estRef.current;
      const ac = accentRef.current;
      const c = CORES[temaRef.current];
      const sombra = (cor: string, blur: number) => {
        if (c.neon) {
          ctx.shadowColor = cor;
          ctx.shadowBlur = blur;
        } else {
          ctx.shadowColor = c.sombraSuave;
          ctx.shadowBlur = Math.min(6, blur * 0.5);
          ctx.shadowOffsetY = 2;
        }
      };
      const tx = e.tremor > 0 ? (Math.random() - 0.5) * e.tremor * 6 : 0;
      const ty = e.tremor > 0 ? (Math.random() - 0.5) * e.tremor * 6 : 0;
      ctx.setTransform(k, 0, 0, k, tx * k, ty * k);

      // Fundo
      const fundo = ctx.createLinearGradient(0, 0, 0, H);
      fundo.addColorStop(0, c.fundoTopo);
      fundo.addColorStop(1, c.fundoBase);
      ctx.fillStyle = fundo;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.fillStyle = c.grade;
      for (let y = 12; y < H; y += 24) for (let x = 12; x < W; x += 24) ctx.fillRect(x, y, 1.5, 1.5);

      // Blocos
      for (const b of e.tijolos) {
        const x = b.x + 1.5;
        const y = b.y + 1.5;
        const bw = BW - 3;
        const bh = BH - 3;
        if (b.metal) {
          ctx.save();
          if (!c.neon) sombra("", 4);
          ctx.fillStyle = c.metal;
          retangulo(ctx, x, y, bw, bh, 3);
          ctx.fill();
          ctx.restore();
          if (c.metalBorda) {
            ctx.strokeStyle = c.metalBorda;
            ctx.lineWidth = 1;
            retangulo(ctx, x + 0.5, y + 0.5, bw - 1, bh - 1, 3);
            ctx.stroke();
          }
          ctx.fillStyle = c.metalLuz;
          ctx.fillRect(x + 2, y + 1.5, bw - 4, 3);
          ctx.fillStyle = c.metalSombra;
          ctx.fillRect(x + 2, y + bh - 3, bw - 4, 2);
          ctx.fillStyle = c.metalRebite;
          for (const px of [x + 4, x + bw - 4]) {
            ctx.beginPath();
            ctx.arc(px, y + bh / 2 + 1, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          const cor = corTijolo(b, ac, c);
          ctx.save();
          if (b.max === 3 || !c.neon) sombra(cor, 8);
          ctx.globalAlpha = 0.55 + 0.45 * (b.hp / b.max);
          ctx.fillStyle = cor;
          retangulo(ctx, x, y, bw, bh, 3);
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = c.brilho;
          ctx.fillRect(x + 2, y + 1.5, bw - 4, 4);
          ctx.fillStyle = c.sombraBloco;
          ctx.fillRect(x + 2, y + bh - 3.5, bw - 4, 2);
          if (c.borda && b.max > 1) {
            // No claro, blocos resistentes ganham contorno e pontinhos de vida.
            ctx.strokeStyle = c.borda;
            ctx.lineWidth = 1.4;
            retangulo(ctx, x + 0.7, y + 0.7, bw - 1.4, bh - 1.4, 3);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            for (let i = 0; i < b.hp; i++) {
              ctx.beginPath();
              ctx.arc(x + bw / 2 + (i - (b.hp - 1) / 2) * 5, y + bh / 2 + 0.5, 1.4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (b.hp < b.max) {
            ctx.strokeStyle = c.trinca;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x + bw * 0.3, y);
            ctx.lineTo(x + bw * 0.42, y + bh * 0.45);
            ctx.lineTo(x + bw * 0.34, y + bh);
            if (b.max - b.hp >= 2) {
              ctx.moveTo(x + bw * 0.42, y + bh * 0.45);
              ctx.lineTo(x + bw * 0.72, y + bh * 0.3);
              ctx.lineTo(x + bw, y + bh * 0.55);
            }
            ctx.stroke();
          }
        }
        if (b.flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.7})`;
          retangulo(ctx, x, y, bw, bh, 3);
          ctx.fill();
        }
      }

      // Cápsulas
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const cap of e.capsulas) {
        const cor = c.capsula[cap.tipo];
        ctx.save();
        sombra(cor, 10);
        ctx.fillStyle = cor;
        retangulo(ctx, cap.x - 15, cap.y - 7, 30, 14, 7);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = c.capsulaLuz;
        ctx.fillRect(cap.x - 11, cap.y - 5, 22, 3);
        ctx.fillStyle = c.capsulaTexto;
        ctx.fillText(ROTULO_CAPSULA[cap.tipo], cap.x, cap.y + 1);
      }

      // Tiros
      ctx.fillStyle = c.tiro;
      for (const tr of e.tiros) ctx.fillRect(tr.x - 1.5, tr.y - 8, 3, 10);

      // Raquete
      const px = e.padX - e.padW / 2;
      ctx.save();
      sombra(ac, 16);
      ctx.fillStyle = ac;
      retangulo(ctx, px, PAD_Y, e.padW, PAD_H, 6);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = c.padLuz;
      retangulo(ctx, px + 6, PAD_Y + 2, e.padW - 12, 3, 1.5);
      ctx.fill();
      ctx.fillStyle = c.padPonta;
      retangulo(ctx, px, PAD_Y, 10, PAD_H, 5);
      ctx.fill();
      retangulo(ctx, px + e.padW - 10, PAD_Y, 10, PAD_H, 5);
      ctx.fill();
      if (e.canhao > 0 && cfgRef.current.tipoTiro !== "nenhum") {
        ctx.fillStyle = c.tiro;
        const pisca = e.canhao < 2 && Math.sin(t * 20) > 0 ? 0.4 : 1;
        ctx.globalAlpha = pisca;
        ctx.fillRect(px + 3, PAD_Y - 5, 4, 6);
        ctx.fillRect(px + e.padW - 7, PAD_Y - 5, 4, 6);
        ctx.globalAlpha = 1;
      }

      // Bolas
      for (const b of e.bolas) {
        for (let i = 0; i < b.rastro.length; i += 2) {
          const a = (i / b.rastro.length) * 0.35;
          ctx.fillStyle = `rgba(${c.rastro},${a})`;
          ctx.beginPath();
          ctx.arc(b.rastro[i], b.rastro[i + 1], R * (0.4 + (i / b.rastro.length) * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        sombra(e.lenta > 0 ? "#34D399" : ac, 14);
        ctx.fillStyle = e.lenta > 0 && !c.neon ? c.capsula.S : c.bola;
        ctx.beginPath();
        ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Partículas
      for (const p of e.parts) {
        ctx.globalAlpha = Math.max(0, p.vida / p.max);
        ctx.fillStyle = p.cor;
        ctx.fillRect(p.x - p.tam / 2, p.y - p.tam / 2, p.tam, p.tam);
      }
      ctx.globalAlpha = 1;

      // Poderes ativos
      const barras: [number, string][] = [];
      if (e.larga > 0) barras.push([e.larga, c.capsula.L]);
      if (e.lenta > 0) barras.push([e.lenta, c.capsula.S]);
      if (e.canhao > 0) barras.push([e.canhao, c.capsula.T]);
      barras.forEach(([v, cor], i) => {
        ctx.fillStyle = c.barraFundo;
        ctx.fillRect(W - 76, H - 14 - i * 6, 64, 3);
        ctx.fillStyle = cor;
        ctx.fillRect(W - 76, H - 14 - i * 6, (64 * v) / DURACAO_PODER, 3);
      });

      // Vidas
      for (let i = 0; i < Math.min(e.vidas, 9); i++) {
        ctx.fillStyle = ac;
        ctx.globalAlpha = 0.8;
        retangulo(ctx, 12 + i * 20, H - 16, 16, 5, 2.5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Aviso central
      if (e.aviso) {
        ctx.globalAlpha = Math.min(1, e.aviso.t * 2);
        ctx.fillStyle = c.texto;
        ctx.font = "600 22px system-ui, sans-serif";
        ctx.fillText(e.aviso.texto, W / 2, H * 0.62);
        ctx.globalAlpha = 1;
      }
      if (statusRef.current === "jogando" && e.bolas.some((b) => b.presa) && Math.sin(t * 4) > -0.2) {
        ctx.fillStyle = c.dica;
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText("Espaço ou clique para lançar", W / 2, PAD_Y - 40);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cssW, cssH, passo, sincronizarHud]);

  /* ------------------------------ entrada ------------------------------ */

  const trocarVariacao = (n: NomeVariacao) => {
    setNomeVar(n);
    setCfg(VARIACOES[n]);
    cfgRef.current = VARIACOES[n];
    estRef.current = novoEstado(VARIACOES[n]);
    sincronizarHud();
    mudarStatus("inicio");
    rootRef.current?.focus();
  };

  const alternarPausa = () => {
    const s = statusRef.current;
    if (s === "jogando") mudarStatus("pausado");
    else if (s === "pausado") mudarStatus("jogando");
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    const k = ev.key;
    if (k.startsWith("Arrow") || k === " ") ev.preventDefault();
    const s = statusRef.current;
    if (k === "ArrowLeft" || k === "a" || k === "A") teclasRef.current.esq = true;
    if (k === "ArrowRight" || k === "d" || k === "D") teclasRef.current.dir = true;
    if (k === " " || k === "Enter" || k === "ArrowUp") {
      if (s === "inicio" || s === "fim") {
        if (k !== "ArrowUp") iniciar();
      } else if (s === "pausado") {
        if (k !== "ArrowUp") mudarStatus("jogando");
      } else acionar();
      return;
    }
    if (k === "p" || k === "P") alternarPausa();
  };

  const onKeyUp = (ev: KeyboardEvent<HTMLDivElement>) => {
    const k = ev.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") teclasRef.current.esq = false;
    if (k === "ArrowRight" || k === "d" || k === "D") teclasRef.current.dir = false;
  };

  const onBlur = (ev: FocusEvent<HTMLDivElement>) => {
    if (rootRef.current?.contains(ev.relatedTarget as Node)) return;
    teclasRef.current = { esq: false, dir: false };
    if (statusRef.current === "jogando") mudarStatus("pausado");
  };

  const moverPorPonteiro = (ev: PointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    const x = ((ev.clientX - r.left) / r.width) * W;
    const e = estRef.current;
    e.padX = Math.max(e.padW / 2, Math.min(W - e.padW / 2, x));
  };

  const onPointerMove = (ev: PointerEvent<HTMLCanvasElement>) => {
    if (statusRef.current !== "jogando") return;
    if (ev.pointerType !== "mouse" && ev.buttons === 0) return;
    moverPorPonteiro(ev);
  };

  const onPointerDown = (ev: PointerEvent<HTMLCanvasElement>) => {
    rootRef.current?.focus();
    if (statusRef.current !== "jogando") return;
    moverPorPonteiro(ev);
    acionar();
  };

  const botaoSegurar = (lado: "esq" | "dir", rotulo: string) => (
    <button
      type="button"
      aria-label={rotulo}
      onPointerDown={(ev) => {
        ev.preventDefault();
        if (statusRef.current === "inicio" || statusRef.current === "fim") iniciar();
        teclasRef.current[lado] = true;
      }}
      onPointerUp={(ev) => {
        ev.preventDefault();
        teclasRef.current[lado] = false;
      }}
      onPointerLeave={() => (teclasRef.current[lado] = false)}
      onPointerCancel={() => (teclasRef.current[lado] = false)}
      className="flex h-14 w-16 touch-none select-none items-center justify-center rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface-2)] text-[var(--fc-text)] active:bg-[var(--fc-border)]"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
        <path d={lado === "esq" ? "M6 12l9-7v14z" : "M18 12L9 19V5z"} />
      </svg>
    </button>
  );

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
      style={{ ...TEMAS[temaAtual], "--accent": accent } as CSSProperties}
      className="relative mx-auto w-full max-w-5xl select-none overflow-hidden rounded-3xl border border-[var(--fc-border)] bg-[var(--fc-bg)] p-3 shadow-[var(--fc-shadow)] text-[var(--fc-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:p-5"
    >
      {/* HUD */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
          <span className="text-sm font-semibold tracking-tight">Quebrablocos</span>
          <BotaoTema tema={temaAtual} onClick={alternarTema} />
        </div>
        <div className="flex gap-4 text-xs text-[var(--fc-muted)]">
          <span>
            Pontos <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{hud.pontos}</b>
          </span>
          <span>
            Recorde <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{recorde}</b>
          </span>
          <span>
            Nível <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{hud.nivel}</b>
          </span>
          <span>
            Vidas <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{hud.vidas}</b>
          </span>
        </div>
      </div>

      {/* Variações */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wider text-[var(--fc-subtle)]">Variações</span>
        {(Object.keys(VARIACOES) as NomeVariacao[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => trocarVariacao(n)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              nomeVar === n
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)] hover:border-[var(--fc-border-strong)] hover:text-[var(--fc-text)]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Campo */}
      <div ref={areaRef} className="flex w-full justify-center">
        <div className="relative" style={{ width: cssW, height: cssH }}>
          <canvas
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            className="block h-full w-full touch-none rounded-2xl"
            style={{ width: cssW, height: cssH }}
          />
          {status !== "jogando" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--fc-bg)_75%,transparent)] text-center backdrop-blur-[2px]">
              {status === "fim" && (
                <>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--fc-subtle)]">Fim de jogo</p>
                  <p className="text-4xl font-semibold tabular-nums">{hud.pontos}</p>
                  <p className="text-xs text-[var(--fc-muted)]">
                    Recorde <span className="tabular-nums text-[var(--fc-text)]">{recorde}</span>
                  </p>
                </>
              )}
              {status === "pausado" && <p className="text-lg font-semibold">Pausado</p>}
              {status === "inicio" && <p className="text-lg font-semibold">Quebrablocos</p>}
              <button
                type="button"
                onClick={() => (status === "pausado" ? (mudarStatus("jogando"), rootRef.current?.focus()) : iniciar())}
                className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_var(--accent)] transition hover:brightness-110"
              >
                {status === "fim" ? "Jogar de novo" : status === "pausado" ? "Continuar" : "Clique para jogar"}
              </button>
              {status === "inicio" || status === "pausado" ? (
                <ComoJogar className="hidden sm:block" />
              ) : (
                <p className="hidden text-[11px] text-[var(--fc-subtle)] sm:block">Clique ou aperte Espaço · P pausa</p>
              )}
              <p className="text-[11px] text-[var(--fc-muted)] sm:hidden">{RESUMO_TOQUE}</p>
              <a href={LINK} target="_blank" rel="noopener" className="text-[10px] text-[var(--fc-subtle)] hover:text-[var(--fc-muted)]">
                Criado por FlowCore Soluções LTDA
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Controles de toque */}
      <div className="mt-4 flex items-center justify-center gap-2 sm:hidden">
        {botaoSegurar("esq", "Esquerda")}
        <button
          type="button"
          aria-label="Lançar"
          onPointerDown={(ev) => {
            ev.preventDefault();
            const s = statusRef.current;
            if (s === "jogando") acionar();
            else if (s === "pausado") mudarStatus("jogando");
            else iniciar();
          }}
          className="flex h-14 w-20 touch-none select-none items-center justify-center rounded-2xl border border-[var(--accent)] bg-[var(--fc-surface-2)] text-[var(--fc-text)] active:bg-[var(--fc-border)]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M12 4l7 9h-4v7H9v-7H5z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Pausar"
          onPointerDown={(ev) => {
            ev.preventDefault();
            const s = statusRef.current;
            if (s === "jogando" || s === "pausado") alternarPausa();
            else iniciar();
          }}
          className="flex h-14 w-14 touch-none items-center justify-center rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d={status === "jogando" ? "M7 5h3v14H7zM14 5h3v14h-3z" : "M8 5l11 7-11 7z"} />
          </svg>
        </button>
        {botaoSegurar("dir", "Direita")}
      </div>

      {/* Como jogar no celular: fica fora do canvas, que é pequeno na tela estreita */}
      {status !== "jogando" && <ComoJogar className="mx-auto mt-4 rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface)] px-4 py-3 sm:hidden" />}

      {/* Rodapé com assinatura */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[var(--fc-border)] pt-3 text-center sm:justify-between sm:text-left">
        <span className="hidden text-[11px] text-[var(--fc-muted)] sm:inline">{RESUMO_TECLADO}</span>
        <span className="text-[11px] text-[var(--fc-muted)] sm:hidden">{RESUMO_TOQUE}</span>
        <a href={LINK} target="_blank" rel="noopener" className="text-[11px] text-[var(--fc-subtle)] transition-colors hover:text-[var(--fc-muted)]">
          Criado por FlowCore Soluções LTDA
        </a>
      </div>
    </div>
  );
}

function retangulo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
