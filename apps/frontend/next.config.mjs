/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  // permite consumir os tipos do pacote compartilhado direto do TS
  transpilePackages: ['@tecnoplus/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // evita que o Next suba workers em processos filhos separados: no Windows,
  // com o projeto dentro de uma pasta sincronizada pelo OneDrive, o OneDrive
  // pode travar/renomear arquivos do .next durante a compilação e derrubar
  // esses processos filhos (erro "Jest worker encountered N child process
  // exceptions"). Rodar single-threaded evita o crash.
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
