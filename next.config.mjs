/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No ESLint setup is included, so don't block deploys on linting.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
