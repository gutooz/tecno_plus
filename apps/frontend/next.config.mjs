/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // permite consumir os tipos do pacote compartilhado direto do TS
  transpilePackages: ['@tecnoplus/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
