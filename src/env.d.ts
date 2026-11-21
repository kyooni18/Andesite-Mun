/// <reference types="vite/client" />

// `.mun` modules export a View description (or, for helpers, plain values).
declare module '*.mun' {
  const view: any
  export default view
}
