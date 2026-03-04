/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/report-builder",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;