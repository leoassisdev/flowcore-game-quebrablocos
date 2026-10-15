# Quebra-blocos

> Raquete, bola e muro de tijolos no estilo do clássico de fliperama, com tijolos resistentes, raquete larga e multibola. Um passatempo certeiro pra páginas 404.

**Ver ao vivo, com preview e manual:** https://flowcoresolucoes.com.br/codigos/game-quebrablocos

Criado por **FlowCore Soluções LTDA**.

## Como jogar

- `←` `→` mover a raquete (ou mouse)
- `Espaço` lançar a bola / atirar
- `P` pausar
- **No celular:** Arraste o dedo sobre o campo; toque lança a bola.

## Arquivos

- [`src/Quebrablocos.tsx`](src/Quebrablocos.tsx)

## Como instalar

1. **Tenha um projeto React com Tailwind** Já tem (Vite, Next.js, Remix)? Pule este passo. Se não, crie um em 1 minuto e adicione ./src/**/*.{ts,tsx} ao content do tailwind.config.

   ```bash
   npm create vite@latest minha-app -- --template react-ts
   cd minha-app
   npm install -D tailwindcss@3 postcss autoprefixer
   npx tailwindcss init -p
   ```

2. **Crie o arquivo src/components/Quebrablocos.tsx** Copie o conteúdo de `src/Quebrablocos.tsx` deste repositório. Ele é um arquivo só, sem dependência além de React.
3. **Use na sua página**

   ```tsx
   import Quebrablocos from "./components/Quebrablocos";
   
   <Quebrablocos accent="#0057FF" velocidade={420} tipoTiro="duplo" />
   ```

4. **Personalize** Textos, dados e a cor de destaque (prop accent) são props com valor padrão. Troque pelos da sua marca ou ligue na sua API.

## Tema e cor

Abre em tema claro. Use `tema="escuro"` para o escuro e `accent` para a cor de destaque:

```tsx
<Quebrablocos accent="#0057FF" velocidade={420} tipoTiro="duplo" />
```

## Licença

MIT. Pode usar em projeto pessoal ou comercial, de graça. A única condição é manter a linha **“Criado por FlowCore Soluções LTDA”** (ou o crédito de adaptação) onde ela está.

---

Precisa disso integrado no seu sistema? A [FlowCore](https://flowcoresolucoes.com.br) desenvolve sob medida.
