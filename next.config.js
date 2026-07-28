/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.facebook.com" },
      { protocol: "https", hostname: "*.cdnfacebook.com" },
      { protocol: "https", hostname: "fbcdn.net" },
      { protocol: "https", hostname: "scontent.*.fbcdn.net" },
      { protocol: "https", hostname: "*.gstatic.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
};
